/**
 * Skills search for exercise integration (DEV-3055)
 *
 * Provides semantic search across skills, MCP servers, and CLI tools
 * for the Rona exercise generation platform. Returns a simplified
 * response optimized for server-to-server consumption.
 */

import { db, catalogItems, mcpServers, cliTools } from '@gpters/db'
import { sql, desc } from 'drizzle-orm'
import { semanticSearch } from '../search/vector-search'
import { createLogger } from '../core/logger'

const log = createLogger('skills-search')

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

  // Build search context from techStack for better embedding relevance
  const userContext = techStack.length > 0
    ? `기술 스택: ${techStack.join(', ')}`
    : undefined

  // Parallel: skill search + MCP server lookup + CLI tools
  const [skillResult, mcpResult, cliResult] = await Promise.all([
    searchSkills(topic, userContext, platform, effectiveLimit),
    searchMcpServers(techStack),
    searchCliTools(techStack, level),
  ])

  // Detect stale models in skill content
  const skills: SkillSearchResultItem[] = skillResult.items.map(item => ({
    id: item.id,
    name: item.name,
    description: item.description || '',
    type: item.type,
    score: Math.round(item.similarity * 1000) / 1000,
    staleWarning: detectStaleModels(item.content),
  }))

  // Filter MCP servers for beginners
  const mcpServersResult = level === 'beginner' ? [] : mcpResult

  const searchDurationMs = Date.now() - startTime

  log.info('Exercise skill search completed', {
    topic: topic.slice(0, 80),
    techStack,
    level,
    platform,
    skillCount: skills.length,
    mcpCount: mcpServersResult.length,
    cliCount: cliResult.length,
    durationMs: searchDurationMs,
  })

  return {
    skills,
    mcpServers: mcpServersResult,
    cliTools: cliResult,
    meta: {
      searchDurationMs,
      totalSkillsSearched: skillResult.total,
      catalogVersion: new Date().toISOString().slice(0, 10),
    },
  }
}

/**
 * Semantic search across published skills
 */
async function searchSkills(
  query: string,
  userContext: string | undefined,
  platform: string | undefined,
  limit: number
) {
  return semanticSearch({
    query,
    type: 'all',
    limit,
    minSimilarity: 0.15,
    userContext,
    clientType: platform,
  })
}

/**
 * Find MCP servers matching the given tech stack
 *
 * Uses simple text matching against server labels and descriptions.
 * Phase 1b will enrich with install commands, use cases, and fallback approaches.
 */
async function searchMcpServers(
  techStack: string[]
): Promise<McpServerResultItem[]> {
  if (techStack.length === 0) return []

  // Escape regex special characters to prevent injection
  const escaped = techStack.map(t =>
    t.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  )
  const pattern = escaped.join('|')

  const servers = await db
    .select({
      id: mcpServers.id,
      label: mcpServers.label,
      description: mcpServers.description,
      installCommand: mcpServers.installCommand,
      fallbackApproach: mcpServers.fallbackApproach,
    })
    .from(mcpServers)
    .where(
      sql`(
        LOWER(${mcpServers.id}) ~ ${pattern}
        OR LOWER(${mcpServers.label}) ~ ${pattern}
        OR LOWER(${mcpServers.description}) ~ ${pattern}
      )`
    )
    .orderBy(desc(mcpServers.updatedAt))
    .limit(3)

  return servers.map(s => ({
    id: s.id,
    label: s.label,
    description: s.description,
    installCommand: s.installCommand ?? undefined,
    fallbackApproach: s.fallbackApproach ?? undefined,
  }))
}

/**
 * Find CLI tools matching the given tech stack
 *
 * Uses ARRAY overlap operator (&&) against related_tags.
 * Beginner level gets only tier 1 (essential) tools.
 */
async function searchCliTools(
  techStack: string[],
  level: string
): Promise<CliToolResultItem[]> {
  if (techStack.length === 0) return []

  const tags = techStack.map(t => t.toLowerCase())

  // Beginner: tier 1 only. Intermediate: tier 1-2. Advanced: all tiers.
  const maxTier = level === 'beginner' ? 1 : level === 'intermediate' ? 2 : 3

  const tools = await db
    .select({
      name: cliTools.name,
      installCommand: cliTools.installCommand,
      latestVersion: cliTools.latestVersion,
      tier: cliTools.tier,
    })
    .from(cliTools)
    .where(
      sql`${cliTools.relatedTags} && ${tags}::text[] AND ${cliTools.tier} <= ${maxTier}`
    )
    .orderBy(cliTools.tier)
    .limit(5)

  return tools.map(t => ({
    name: t.name,
    installCommand: t.installCommand,
    latestVersion: t.latestVersion ?? undefined,
  }))
}
