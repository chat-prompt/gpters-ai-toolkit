import { db, catalogItems, type CatalogItemRecord } from '@gpters/db'
import { sql, eq, and, gt, desc } from 'drizzle-orm'
import { cosineDistance } from 'drizzle-orm'
import { generateEmbedding } from './embedding'
import type { ItemType } from '../core/types'

export interface SemanticSearchOptions {
  query: string
  type?: ItemType | 'all'
  limit?: number
  minSimilarity?: number
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
    minSimilarity = 0.3,
  } = options

  const trimmedQuery = query.trim()
  if (!trimmedQuery) {
    return { items: [], total: 0, searchTime: 0 }
  }

  const queryEmbedding = await generateEmbedding(trimmedQuery)

  const similarity = sql<number>`1 - (${cosineDistance(catalogItems.embedding, queryEmbedding)})`

  const conditions = [
    gt(similarity, minSimilarity),
    eq(catalogItems.status, 'published'),
    sql`${catalogItems.embedding} IS NOT NULL`,
  ]

  if (type && type !== 'all') {
    conditions.push(eq(catalogItems.type, type))
  }

  const results = await db
    .select({
      id: catalogItems.id,
      type: catalogItems.type,
      name: catalogItems.name,
      description: catalogItems.description,
      authorId: catalogItems.authorId,
      tags: catalogItems.tags,
      teamTag: catalogItems.teamTag,
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
      embedding: catalogItems.embedding,
      createdAt: catalogItems.createdAt,
      updatedAt: catalogItems.updatedAt,
      similarity,
    })
    .from(catalogItems)
    .where(and(...conditions))
    .orderBy(desc(similarity))
    .limit(limit)

  const searchTime = Date.now() - startTime

  return {
    items: results as Array<CatalogItemRecord & { similarity: number }>,
    total: results.length,
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
      teamTag: catalogItems.teamTag,
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
      embedding: catalogItems.embedding,
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
