import { db, catalogItems, type CatalogItemRecord } from '@gpters/db'
import { sql, eq, and, or, gt, desc } from 'drizzle-orm'
import { cosineDistance } from 'drizzle-orm'
import { generateEmbedding } from './embedding'
import { createLogger } from '../core/logger'
import { isSuperAdmin } from '../security/rbac'
import type { ItemType } from '../core/types'
import { getPopularityMap, computePopularityScore, blendScore } from './popularity'

const log = createLogger('vector-search')

export interface SemanticSearchOptions {
  query: string
  type?: ItemType | 'all'
  limit?: number
  minSimilarity?: number
  userId?: string
  userRole?: string
  orgId?: string
  /** Optional user context combined with query for improved embedding relevance */
  userContext?: string
}

export interface SemanticSearchResult {
  items: Array<CatalogItemRecord & { similarity: number }>
  total: number
  searchTime: number
}

export async function semanticSearch(options: SemanticSearchOptions): Promise<SemanticSearchResult> {
  const startTime = Date.now()
  const {
    query,
    type = 'all',
    limit = 10,
    minSimilarity = 0.2,
    userId,
    userRole,
    orgId,
    userContext,
  } = options

  const cleanedQuery = cleanQuery(query)
  if (!cleanedQuery) {
    log.info('Noise query filtered', { query: query.trim().slice(0, 80) })
    return { items: [], total: 0, searchTime: 0 }
  }

  // Combine query with userContext for improved embedding relevance
  const embeddingText = userContext
    ? `${cleanedQuery} ${userContext.trim()}`
    : cleanedQuery

  const embeddingStart = Date.now()
  const queryEmbedding = await generateEmbedding(embeddingText)
  const embeddingMs = Date.now() - embeddingStart

  const similarity = sql<number>`1 - (${cosineDistance(catalogItems.embedding, queryEmbedding)})`

  const conditions = [
    gt(similarity, minSimilarity),
    eq(catalogItems.status, 'published'),
    sql`${catalogItems.embedding} IS NOT NULL`,
  ]

  if (type && type !== 'all') {
    conditions.push(eq(catalogItems.type, type))
  }

  // Org-based visibility filtering
  if (userId && orgId && !isSuperAdmin(userRole as Parameters<typeof isSuperAdmin>[0])) {
    conditions.push(
      or(
        eq(catalogItems.orgId, orgId),
        eq(catalogItems.visibility, 'public'),
        sql`${catalogItems.orgId} IS NULL`
      )!
    )
  } else if (!userId) {
    conditions.push(
      or(
        eq(catalogItems.visibility, 'public'),
        sql`${catalogItems.orgId} IS NULL`
      )!
    )
  }

  const dbStart = Date.now()
  const results = await db
    .select({
      id: catalogItems.id,
      type: catalogItems.type,
      name: catalogItems.name,
      description: catalogItems.description,
      authorId: catalogItems.authorId,
      tags: catalogItems.tags,
      difficulty: catalogItems.difficulty,
      pluginId: catalogItems.pluginId,
      estimatedTime: catalogItems.estimatedTime,
      dependencies: catalogItems.dependencies,
      likes: catalogItems.likes,
      content: catalogItems.content,
      readme: catalogItems.readme,
      files: catalogItems.files,
      allowedTools: catalogItems.allowedTools,
      agentModel: catalogItems.agentModel,
      agentPermissionMode: catalogItems.agentPermissionMode,
      agentSkills: catalogItems.agentSkills,
      commandArgumentHint: catalogItems.commandArgumentHint,
      commandDisableModelInvocation: catalogItems.commandDisableModelInvocation,
      hookEvent: catalogItems.hookEvent,
      hookMatcher: catalogItems.hookMatcher,
      hookCommand: catalogItems.hookCommand,
      hookTimeout: catalogItems.hookTimeout,
      hookBlocking: catalogItems.hookBlocking,
      mcpEnabled: catalogItems.mcpEnabled,
      version: catalogItems.version,
      status: catalogItems.status,
      changelog: catalogItems.changelog,
      createdAt: catalogItems.createdAt,
      updatedAt: catalogItems.updatedAt,
      similarity,
    })
    .from(catalogItems)
    .where(and(...conditions))
    .orderBy(desc(similarity))
    .limit(limit)
  const dbMs = Date.now() - dbStart

  // Apply popularity-based ranking boost
  const popularityMap = await getPopularityMap()
  const boostedResults = results.map((row) => {
    const pop = popularityMap.get(row.id)
    const popScore = computePopularityScore(pop)
    const finalScore = blendScore(row.similarity, popScore)
    return { ...row, similarity: finalScore }
  })

  // Re-sort by blended score (descending)
  boostedResults.sort((a, b) => b.similarity - a.similarity)

  const searchTime = Date.now() - startTime

  log.info('Semantic search completed', {
    embeddingMs,
    dbMs,
    totalMs: searchTime,
    resultCount: boostedResults.length,
    popularityBoostApplied: popularityMap.size > 0,
  })

  return {
    items: boostedResults as Array<CatalogItemRecord & { similarity: number }>,
    total: boostedResults.length,
    searchTime,
  }
}

export async function findSimilarItems(
  itemId: string,
  limit = 5
): Promise<Array<CatalogItemRecord & { similarity: number }>> {
  const [item] = await db
    .select({ embedding: catalogItems.embedding })
    .from(catalogItems)
    .where(eq(catalogItems.id, itemId))
    .limit(1)

  if (!item?.embedding) {
    return []
  }

  const similarity = sql<number>`1 - (${cosineDistance(catalogItems.embedding, item.embedding)})`

  const results = await db
    .select({
      id: catalogItems.id,
      type: catalogItems.type,
      name: catalogItems.name,
      description: catalogItems.description,
      authorId: catalogItems.authorId,
      tags: catalogItems.tags,
      difficulty: catalogItems.difficulty,
      pluginId: catalogItems.pluginId,
      estimatedTime: catalogItems.estimatedTime,
      dependencies: catalogItems.dependencies,
      likes: catalogItems.likes,
      content: catalogItems.content,
      readme: catalogItems.readme,
      files: catalogItems.files,
      allowedTools: catalogItems.allowedTools,
      agentModel: catalogItems.agentModel,
      agentPermissionMode: catalogItems.agentPermissionMode,
      agentSkills: catalogItems.agentSkills,
      commandArgumentHint: catalogItems.commandArgumentHint,
      commandDisableModelInvocation: catalogItems.commandDisableModelInvocation,
      hookEvent: catalogItems.hookEvent,
      hookMatcher: catalogItems.hookMatcher,
      hookCommand: catalogItems.hookCommand,
      hookTimeout: catalogItems.hookTimeout,
      hookBlocking: catalogItems.hookBlocking,
      mcpEnabled: catalogItems.mcpEnabled,
      version: catalogItems.version,
      status: catalogItems.status,
      changelog: catalogItems.changelog,
      createdAt: catalogItems.createdAt,
      updatedAt: catalogItems.updatedAt,
      similarity,
    })
    .from(catalogItems)
    .where(and(
      sql`${catalogItems.id} != ${itemId}`,
      eq(catalogItems.status, 'published'),
      sql`${catalogItems.embedding} IS NOT NULL`,
    ))
    .orderBy(desc(similarity))
    .limit(limit)

  return results as Array<CatalogItemRecord & { similarity: number }>
}

/** Maximum query length for meaningful semantic search */
const MAX_QUERY_LENGTH = 500

/** Minimum query length for meaningful semantic search */
const MIN_QUERY_LENGTH = 3

/**
 * Strips noise prefixes from a query and validates the remainder.
 *
 * Phase 1: Strips removable noise (image placeholders like `[Image 1]`).
 * Phase 2: Rejects structural noise that cannot be cleaned — mode prompt
 * injections (`[analyze-mode]`), XML mode tags (`<ultrawork-mode>`),
 * and queries that are too short or too long after stripping.
 *
 * @returns Cleaned query string, or `null` if the query is pure noise.
 */
export function cleanQuery(query: string): string | null {
  // Phase 1: Strip removable noise prefixes
  let cleaned = query.trim()

  // Strip image placeholders: [Image 1], [image 2], etc. (may appear multiple times)
  cleaned = cleaned.replace(/\[image\s+\d+\]\s*/gi, '').trim()

  // Phase 2: Reject structural noise that can't be cleaned
  if (!cleaned) return null

  // Mode prompt injections: [analyze-mode], [search-mode], etc.
  if (/^\[[\w-]+-mode\]/i.test(cleaned)) return null

  // XML-like mode tags: <ultrawork-mode>, <deep-research>, etc.
  if (/<[\w-]+-mode>/i.test(cleaned)) return null

  // Too short to be a meaningful search
  if (cleaned.length < MIN_QUERY_LENGTH) return null

  // Too long — likely pasted error logs, code, or system prompts
  if (cleaned.length > MAX_QUERY_LENGTH) return null

  return cleaned
}

/**
 * Checks whether a query is structural noise.
 *
 * Convenience wrapper around {@link cleanQuery} for boolean checks.
 */
export function isNoiseQuery(query: string): boolean {
  return cleanQuery(query) === null
}
