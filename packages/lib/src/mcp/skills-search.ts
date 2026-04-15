/**
 * Skills search for exercise integration (DEV-3055)
 *
 * Provides semantic search across skills, MCP servers, and CLI tools
 * for the Rona exercise generation platform. All three categories
 * use embedding-based cosine similarity search for relevance.
 */

import { db, mcpServers, cliTools } from '@gpters/db'
import { sql, desc, isNotNull } from 'drizzle-orm'
import { cosineDistance } from 'drizzle-orm'
import { semanticSearch } from '../search/vector-search'
import { generateEmbedding } from '../search/embedding'
import { detectStaleLibraryVersions } from './version-sync'
import { createLogger } from '../core/logger'

const log = createLogger('skills-search')

/** Minimum cosine similarity for MCP/CLI results */
const MCP_CLI_MIN_SIMILARITY = 0.25

/**
 * Confidence threshold for skill results.
 *
 * Skills with a final score below this value are flagged with
 * `lowConfidence: true` so downstream consumers (e.g. Rona exercise
 * pipeline) can choose to ignore them. Results are NOT dropped from
 * the response to keep the API contract stable.
 */
const SKILL_CONFIDENCE_THRESHOLD = 0.40

/** Cached CLI tool version map for stale library detection */
let cachedVersionMap: Map<string, string> | null = null

/** Expiry timestamp for the cached version map */
let cacheExpiry = 0

/** Cache TTL: 5 minutes */
const VERSION_MAP_CACHE_TTL_MS = 5 * 60 * 1000

/**
 * Fetch CLI tool name → latestVersion map from the database
 *
 * Results are cached in-memory for 5 minutes to avoid repeated DB queries
 * during bursts of search requests. Returns an empty map on failure
 * so that search results are never blocked by version-check errors.
 *
 * @returns Map of lowercase tool name to latest version string
 */
async function getCliToolVersionMap(): Promise<Map<string, string>> {
  if (cachedVersionMap && Date.now() < cacheExpiry) return cachedVersionMap

  try {
    const tools = await db
      .select({ name: cliTools.name, latestVersion: cliTools.latestVersion })
      .from(cliTools)
      .where(isNotNull(cliTools.latestVersion))

    cachedVersionMap = new Map(
      tools.map(t => [t.name.toLowerCase(), t.latestVersion!])
    )
    cacheExpiry = Date.now() + VERSION_MAP_CACHE_TTL_MS
    return cachedVersionMap
  } catch (err) {
    log.warn('Failed to fetch CLI tool version map', {
      error: (err as Error).message,
    })
    return new Map()
  }
}

/**
 * Reset the in-memory version map cache (for testing only)
 */
export function _resetVersionMapCache(): void {
  cachedVersionMap = null
  cacheExpiry = 0
}

/** Request parameters for exercise skill search */
export interface SkillSearchRequest {
  /** Exercise topic (e.g., "Stripe 결제 연동") */
  topic: string
  /** Technology stack keywords */
  techStack?: string[]
  /** Learner level */
  level?: 'beginner' | 'intermediate' | 'advanced'
  /** Target platform */
  platform?: string
  /** Maximum number of skills to return (default: 5, max: 10) */
  limit?: number
}

/** Skill entry in search response */
export interface SkillSearchResultItem {
  id: string
  name: string
  description: string
  type: 'skill' | 'agent' | 'command' | 'guide' | 'hook' | 'package'
  score: number
  /**
   * True when `score` is below {@link SKILL_CONFIDENCE_THRESHOLD}.
   * Downstream consumers should treat low-confidence results as
   * optional hints, not authoritative matches.
   */
  lowConfidence?: boolean
  staleWarning?: string
}

/** MCP server entry in search response */
export interface McpServerResultItem {
  id: string
  label: string
  description: string
  installCommand?: string
  fallbackApproach?: string
}

/** CLI tool entry in search response */
export interface CliToolResultItem {
  name: string
  installCommand: string
  latestVersion?: string
}

/** Complete search response */
export interface SkillSearchResponse {
  skills: SkillSearchResultItem[]
  mcpServers: McpServerResultItem[]
  cliTools: CliToolResultItem[]
  meta: {
    searchDurationMs: number
    totalSkillsSearched: number
    catalogVersion: string
    /** Confidence threshold used to set {@link SkillSearchResultItem.lowConfidence} */
    confidenceThreshold: number
    /** Count of returned skills with score >= confidenceThreshold */
    confidentSkillCount: number
  }
}

/** Deprecated model patterns for stale detection */
const DEPRECATED_MODEL_PATTERNS = [
  /claude-3-opus/i,
  /claude-3-sonnet/i,
  /claude-3-haiku/i,
  /claude-3\.5/i,
  /gpt-4o/i,
  /gpt-4-turbo/i,
  /gpt-4-/i,
  /gemini-1\.5/i,
  /gemini-2\.5/i,
]

/**
 * Detect stale model references in skill content
 *
 * @param content - Skill content to check
 * @returns Warning message if stale models found, undefined otherwise
 */
function detectStaleModels(content: string | null): string | undefined {
  if (!content) return undefined

  const found: string[] = []
  for (const pattern of DEPRECATED_MODEL_PATTERNS) {
    const match = content.match(pattern)
    if (match) {
      found.push(match[0])
    }
  }

  if (found.length === 0) return undefined
  const unique = [...new Set(found)]
  return `⚠️ 이 스킬은 구버전 모델(${unique.join(', ')})을 참조합니다`
}

/**
 * Search skills, MCP servers, and CLI tools for exercise generation
 *
 * @param params - Search parameters from Rona
 * @returns Categorized search results with metadata
 */
export async function searchSkillsForExercise(
  params: SkillSearchRequest
): Promise<SkillSearchResponse> {
  const startTime = Date.now()
  const { topic, techStack = [], level = 'intermediate', platform, limit = 5 } = params

  const effectiveLimit = Math.min(Math.max(limit, 1), 10)

  // Build search context from techStack for better skill embedding relevance
  const userContext = techStack.length > 0
    ? `기술 스택: ${techStack.join(', ')}`
    : undefined

  // Generate a single embedding for (topic + userContext) and reuse it for
  // skill semantic search, MCP vector search, and CLI vector search. This
  // eliminates the duplicate OpenAI embeddings.create call that previously
  // dominated the P50 response time (~500ms per request).
  const embeddingInput = userContext ? `${topic} ${userContext}` : topic
  const queryEmbedding = await generateEmbedding(embeddingInput)

  // Parallel: skill search + MCP vector search + CLI vector search + version map
  const [skillResult, mcpResult, cliResult, versionMap] = await Promise.all([
    searchSkills(topic, userContext, platform, effectiveLimit, queryEmbedding),
    searchMcpServersByVector(queryEmbedding, level === 'beginner' ? 2 : 3),
    searchCliToolsByVector(queryEmbedding, level),
    getCliToolVersionMap(),
  ])

  // Detect stale models and library versions in skill content
  const skills: SkillSearchResultItem[] = skillResult.items.map(item => {
    const score = Math.round(item.similarity * 1000) / 1000
    return {
      id: item.id,
      name: item.name,
      description: item.description || '',
      type: item.type,
      score,
      lowConfidence: score < SKILL_CONFIDENCE_THRESHOLD ? true : undefined,
      staleWarning: [
        detectStaleModels(item.content),
        detectStaleLibraryVersions(item.content, versionMap),
      ].filter(Boolean).join(' | ') || undefined,
    }
  })

  const confidentSkillCount = skills.filter(s => !s.lowConfidence).length
  const searchDurationMs = Date.now() - startTime

  log.info('Exercise skill search completed', {
    topic: topic.slice(0, 80),
    techStack,
    level,
    platform,
    skillCount: skills.length,
    confidentSkillCount,
    mcpCount: mcpResult.length,
    cliCount: cliResult.length,
    durationMs: searchDurationMs,
  })

  return {
    skills,
    mcpServers: mcpResult,
    cliTools: cliResult,
    meta: {
      searchDurationMs,
      totalSkillsSearched: skillResult.total,
      catalogVersion: new Date().toISOString().slice(0, 10),
      confidenceThreshold: SKILL_CONFIDENCE_THRESHOLD,
      confidentSkillCount,
    },
  }
}

/**
 * Semantic search across published skills
 *
 * @param queryEmbedding - Pre-computed embedding to avoid duplicate OpenAI call
 */
async function searchSkills(
  query: string,
  userContext: string | undefined,
  platform: string | undefined,
  limit: number,
  queryEmbedding?: number[]
) {
  return semanticSearch({
    query,
    type: 'all',
    limit,
    minSimilarity: 0.15,
    userContext,
    clientType: platform,
    queryEmbedding,
  })
}

/**
 * Find MCP servers by vector similarity against the topic embedding
 *
 * @param topicEmbedding - Pre-computed embedding of the exercise topic
 * @param limit - Maximum number of results
 */
async function searchMcpServersByVector(
  topicEmbedding: number[],
  limit: number
): Promise<McpServerResultItem[]> {
  const similarity = sql<number>`1 - (${cosineDistance(mcpServers.embedding, topicEmbedding)})`

  const servers = await db
    .select({
      id: mcpServers.id,
      label: mcpServers.label,
      description: mcpServers.description,
      installCommand: mcpServers.installCommand,
      fallbackApproach: mcpServers.fallbackApproach,
      similarity,
    })
    .from(mcpServers)
    .where(sql`${mcpServers.embedding} IS NOT NULL`)
    .orderBy(desc(similarity))
    .limit(limit)

  return servers
    .filter(s => (s.similarity ?? 0) >= MCP_CLI_MIN_SIMILARITY)
    .map(s => ({
      id: s.id,
      label: s.label,
      description: s.description,
      installCommand: s.installCommand ?? undefined,
      fallbackApproach: s.fallbackApproach ?? undefined,
    }))
}

/**
 * Find CLI tools by vector similarity against the topic embedding
 *
 * @param topicEmbedding - Pre-computed embedding of the exercise topic
 * @param level - Learner level (affects tier filtering)
 */
async function searchCliToolsByVector(
  topicEmbedding: number[],
  level: string
): Promise<CliToolResultItem[]> {
  const maxTier = level === 'beginner' ? 1 : level === 'intermediate' ? 2 : 3
  const similarity = sql<number>`1 - (${cosineDistance(cliTools.embedding, topicEmbedding)})`

  const tools = await db
    .select({
      name: cliTools.name,
      installCommand: cliTools.installCommand,
      latestVersion: cliTools.latestVersion,
      similarity,
    })
    .from(cliTools)
    .where(sql`${cliTools.embedding} IS NOT NULL AND ${cliTools.tier} <= ${maxTier}`)
    .orderBy(desc(similarity))
    .limit(5)

  return tools
    .filter(t => (t.similarity ?? 0) >= MCP_CLI_MIN_SIMILARITY)
    .map(t => ({
      name: t.name,
      installCommand: t.installCommand,
      latestVersion: t.latestVersion ?? undefined,
    }))
}
