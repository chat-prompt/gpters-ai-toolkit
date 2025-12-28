import { eq, ne, and, or, isNull } from 'drizzle-orm'
import { db, catalogItems } from './db'
import { CatalogItem, CatalogItemSummary, ItemType } from './types'

// ============================================================================
// Field Selection for Query Optimization
// ============================================================================

/**
 * Columns to select for list/summary views.
 * Excludes heavy fields: content, readme, files, changelog
 * to reduce data transfer (~50-80% reduction for items with large content).
 */
const summaryColumns = {
  id: catalogItems.id,
  type: catalogItems.type,
  name: catalogItems.name,
  description: catalogItems.description,
  author: catalogItems.author,
  tags: catalogItems.tags,
  teamTag: catalogItems.teamTag,
  difficulty: catalogItems.difficulty,
  pluginId: catalogItems.pluginId,
  estimatedTime: catalogItems.estimatedTime,
  dependencies: catalogItems.dependencies,
  likes: catalogItems.likes,
  // Type-specific fields
  allowedTools: catalogItems.allowedTools,
  agentModel: catalogItems.agentModel,
  agentPermissionMode: catalogItems.agentPermissionMode,
  agentSkills: catalogItems.agentSkills,
  commandArgumentHint: catalogItems.commandArgumentHint,
  commandDisableModelInvocation: catalogItems.commandDisableModelInvocation,
  // Hook-specific fields
  hookEvent: catalogItems.hookEvent,
  hookMatcher: catalogItems.hookMatcher,
  hookCommand: catalogItems.hookCommand,
  hookTimeout: catalogItems.hookTimeout,
  hookBlocking: catalogItems.hookBlocking,
  // Marketplace fields
  marketplaceEnabled: catalogItems.marketplaceEnabled,
  marketplaceSyncedAt: catalogItems.marketplaceSyncedAt,
  marketplaceVersion: catalogItems.marketplaceVersion,
  // Status
  status: catalogItems.status,
  createdAt: catalogItems.createdAt,
  updatedAt: catalogItems.updatedAt,
} as const

type SummaryRecord = {
  id: string
  type: 'skill' | 'agent' | 'command' | 'guide' | 'hook'
  name: string
  description: string
  author: string
  tags: string[] | null
  teamTag: 'platform' | 'ai' | 'data' | 'product' | 'infra' | 'general' | null
  difficulty: 'easy' | 'medium' | 'hard' | null
  pluginId: string | null
  estimatedTime: string | null
  dependencies: string[] | null
  likes: number
  allowedTools: string | null
  agentModel: string | null
  agentPermissionMode: string | null
  agentSkills: string | null
  commandArgumentHint: string | null
  commandDisableModelInvocation: boolean | null
  hookEvent: string | null
  hookMatcher: string | null
  hookCommand: string | null
  hookTimeout: number | null
  hookBlocking: boolean | null
  marketplaceEnabled: boolean | null
  marketplaceSyncedAt: Date | null
  marketplaceVersion: string | null
  status: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

// ============================================================================
// Type Conversion Functions
// ============================================================================

/**
 * Convert a summary record to CatalogItemSummary (for list views).
 */
function toSummaryObject(record: SummaryRecord): CatalogItemSummary {
  return {
    id: record.id,
    type: record.type,
    name: record.name,
    description: record.description,
    author: record.author,
    tags: record.tags || [],
    teamTag: (record.teamTag as CatalogItemSummary['teamTag']) ?? undefined,
    difficulty: record.difficulty ?? undefined,
    pluginId: record.pluginId ?? undefined,
    estimatedTime: record.estimatedTime ?? undefined,
    dependencies: record.dependencies || [],
    likes: record.likes,
    // Type-specific fields
    allowedTools: record.allowedTools ?? undefined,
    agentModel: (record.agentModel as CatalogItemSummary['agentModel']) ?? undefined,
    agentPermissionMode: (record.agentPermissionMode as CatalogItemSummary['agentPermissionMode']) ?? undefined,
    agentSkills: record.agentSkills ?? undefined,
    commandArgumentHint: record.commandArgumentHint ?? undefined,
    commandDisableModelInvocation: record.commandDisableModelInvocation ?? undefined,
    // Hook-specific fields
    hookEvent: (record.hookEvent as CatalogItemSummary['hookEvent']) ?? undefined,
    hookMatcher: record.hookMatcher ?? undefined,
    hookCommand: record.hookCommand ?? undefined,
    hookTimeout: record.hookTimeout ?? undefined,
    hookBlocking: record.hookBlocking ?? undefined,
    // Marketplace fields
    marketplaceEnabled: record.marketplaceEnabled ?? false,
    marketplaceSyncedAt: record.marketplaceSyncedAt?.toISOString(),
    marketplaceVersion: record.marketplaceVersion ?? undefined,
    // V2: Status
    status: (record.status as CatalogItemSummary['status']) ?? 'published',
    createdAt: record.createdAt?.toISOString(),
    updatedAt: record.updatedAt?.toISOString(),
  }
}

/**
 * Convert a full record to CatalogItem (for detail views).
 */
function toPlainObject(record: typeof catalogItems.$inferSelect): CatalogItem {
  return {
    id: record.id,
    type: record.type,
    name: record.name,
    description: record.description,
    author: record.author,
    tags: record.tags || [],
    teamTag: (record.teamTag as CatalogItem['teamTag']) ?? undefined,
    difficulty: record.difficulty ?? undefined,
    pluginId: record.pluginId ?? undefined,
    estimatedTime: record.estimatedTime ?? undefined,
    dependencies: record.dependencies || [],
    likes: record.likes,
    content: record.content,
    readme: record.readme ?? undefined,
    files: record.files ?? undefined,
    // Type-specific fields
    allowedTools: record.allowedTools ?? undefined,
    agentModel: (record.agentModel as CatalogItem['agentModel']) ?? undefined,
    agentPermissionMode: (record.agentPermissionMode as CatalogItem['agentPermissionMode']) ?? undefined,
    agentSkills: record.agentSkills ?? undefined,
    commandArgumentHint: record.commandArgumentHint ?? undefined,
    commandDisableModelInvocation: record.commandDisableModelInvocation ?? undefined,
    // Hook-specific fields
    hookEvent: (record.hookEvent as CatalogItem['hookEvent']) ?? undefined,
    hookMatcher: record.hookMatcher ?? undefined,
    hookCommand: record.hookCommand ?? undefined,
    hookTimeout: record.hookTimeout ?? undefined,
    hookBlocking: record.hookBlocking ?? undefined,
    // Marketplace fields
    marketplaceEnabled: record.marketplaceEnabled ?? false,
    marketplaceSyncedAt: record.marketplaceSyncedAt?.toISOString(),
    marketplaceVersion: record.marketplaceVersion ?? undefined,
    // V2: Status and version management
    status: (record.status as CatalogItem['status']) ?? 'published',
    changelog: record.changelog ?? undefined,
    createdAt: record.createdAt?.toISOString(),
    updatedAt: record.updatedAt?.toISOString(),
  }
}

// ============================================================================
// List Queries (Optimized with Summary Columns)
// ============================================================================

/**
 * Get all published catalog items except guides.
 * Uses optimized column selection to reduce data transfer.
 */
export async function getCatalog(): Promise<CatalogItemSummary[]> {
  // Get all published items except guides (they have their own page)
  // Filter: type != 'guide' AND (status = 'published' OR status IS NULL)
  // Uses composite index: catalog_items_type_status_idx
  const records = await db
    .select(summaryColumns)
    .from(catalogItems)
    .where(
      and(
        ne(catalogItems.type, 'guide'),
        or(eq(catalogItems.status, 'published'), isNull(catalogItems.status))
      )
    )

  return records.map(toSummaryObject)
}

// ============================================================================
// Detail Queries (Full Record with All Fields)
// ============================================================================

export async function getItemById(id: string): Promise<CatalogItem | undefined> {
  const [record] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

  if (!record) return undefined
  return toPlainObject(record)
}

/**
 * Get published items of a specific type.
 * Uses composite index: catalog_items_type_status_idx
 */
export async function getItemsByType(type: ItemType): Promise<CatalogItemSummary[]> {
  const records = await db
    .select(summaryColumns)
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.type, type),
        or(eq(catalogItems.status, 'published'), isNull(catalogItems.status))
      )
    )
  return records.map(toSummaryObject)
}

/**
 * Get all published guides.
 * Uses composite index: catalog_items_type_status_idx
 */
export async function getGuides(): Promise<CatalogItemSummary[]> {
  const records = await db
    .select(summaryColumns)
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.type, 'guide'),
        or(eq(catalogItems.status, 'published'), isNull(catalogItems.status))
      )
    )
  return records.map(toSummaryObject)
}

export async function getGuideById(id: string): Promise<CatalogItem | undefined> {
  const [record] = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.id, id))

  if (!record || record.type !== 'guide') return undefined
  return toPlainObject(record)
}

/**
 * Get published items suitable for beginners (easy difficulty or beginner tag).
 */
export async function getBeginnerItems(): Promise<CatalogItemSummary[]> {
  const records = await db
    .select(summaryColumns)
    .from(catalogItems)
    .where(or(eq(catalogItems.status, 'published'), isNull(catalogItems.status)))

  return records
    .map(toSummaryObject)
    .filter(
      (item) =>
        item.difficulty === 'easy' ||
        item.tags.includes('beginner') ||
        item.tags.includes('입문')
    )
}

/**
 * Get all items by a specific author (including drafts for profile view).
 * Returns full records since profile views may need content preview.
 * Uses index: catalog_items_author_idx
 */
export async function getItemsByAuthor(author: string): Promise<CatalogItem[]> {
  const records = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.author, author))
  return records.map(toPlainObject)
}
