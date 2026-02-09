/**
 * Catalog data access layer
 *
 * Provides optimized database queries for catalog items including
 * list views, detail views, filtering, and package management.
 */
import { eq, ne, and, or, isNull, asc } from 'drizzle-orm'
import { db, catalogItems, packageItems, users, organizations, isDatabaseAvailable } from '@gpters/db'
import { CatalogItem, CatalogItemSummary, CatalogItemWithPackageContents, ItemType } from './types'

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
  authorId: catalogItems.authorId,
  tags: catalogItems.tags,
  teamTag: catalogItems.teamTag,
  difficulty: catalogItems.difficulty,
  pluginId: catalogItems.pluginId,
  estimatedTime: catalogItems.estimatedTime,
  dependencies: catalogItems.dependencies,
  likes: catalogItems.likes,
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
  orgId: catalogItems.orgId,
  visibility: catalogItems.visibility,
  forkedFrom: catalogItems.forkedFrom,
  forkCount: catalogItems.forkCount,
  sharedWithOrgs: catalogItems.sharedWithOrgs,
  createdAt: catalogItems.createdAt,
  updatedAt: catalogItems.updatedAt,
} as const

type SummaryRecord = {
  id: string
  type: 'skill' | 'agent' | 'command' | 'guide' | 'hook' | 'package'
  name: string
  description: string
  authorId: string | null
  authorName: string | null
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
  mcpEnabled: boolean | null
  version: string | null
  status: string | null
  orgId: string | null
  visibility: 'private' | 'shared' | 'public' | null
  forkedFrom: string | null
  forkCount: number
  sharedWithOrgs: string[] | null
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
    authorId: record.authorId ?? undefined,
    authorName: record.authorName ?? undefined,
    tags: record.tags || [],
    teamTag: (record.teamTag as CatalogItemSummary['teamTag']) ?? undefined,
    difficulty: record.difficulty ?? undefined,
    pluginId: record.pluginId ?? undefined,
    estimatedTime: record.estimatedTime ?? undefined,
    dependencies: record.dependencies || [],
    likes: record.likes,
    allowedTools: record.allowedTools ?? undefined,
    agentModel: (record.agentModel as CatalogItemSummary['agentModel']) ?? undefined,
    agentPermissionMode: (record.agentPermissionMode as CatalogItemSummary['agentPermissionMode']) ?? undefined,
    agentSkills: record.agentSkills ?? undefined,
    commandArgumentHint: record.commandArgumentHint ?? undefined,
    commandDisableModelInvocation: record.commandDisableModelInvocation ?? undefined,
    hookEvent: (record.hookEvent as CatalogItemSummary['hookEvent']) ?? undefined,
    hookMatcher: record.hookMatcher ?? undefined,
    hookCommand: record.hookCommand ?? undefined,
    hookTimeout: record.hookTimeout ?? undefined,
    hookBlocking: record.hookBlocking ?? undefined,
    mcpEnabled: record.mcpEnabled ?? false,
    version: record.version ?? undefined,
    status: (record.status as CatalogItemSummary['status']) ?? 'published',
    orgId: record.orgId ?? undefined,
    visibility: (record.visibility as CatalogItemSummary['visibility']) ?? undefined,
    forkedFrom: record.forkedFrom ?? undefined,
    forkCount: record.forkCount,
    sharedWithOrgs: record.sharedWithOrgs ?? undefined,
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
    authorId: record.authorId ?? undefined,
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
    allowedTools: record.allowedTools ?? undefined,
    agentModel: (record.agentModel as CatalogItem['agentModel']) ?? undefined,
    agentPermissionMode: (record.agentPermissionMode as CatalogItem['agentPermissionMode']) ?? undefined,
    agentSkills: record.agentSkills ?? undefined,
    commandArgumentHint: record.commandArgumentHint ?? undefined,
    commandDisableModelInvocation: record.commandDisableModelInvocation ?? undefined,
    hookEvent: (record.hookEvent as CatalogItem['hookEvent']) ?? undefined,
    hookMatcher: record.hookMatcher ?? undefined,
    hookCommand: record.hookCommand ?? undefined,
    hookTimeout: record.hookTimeout ?? undefined,
    hookBlocking: record.hookBlocking ?? undefined,
    mcpEnabled: record.mcpEnabled ?? false,
    version: record.version ?? undefined,
    status: (record.status as CatalogItem['status']) ?? 'published',
    changelog: record.changelog ?? undefined,
    orgId: record.orgId ?? undefined,
    visibility: (record.visibility as CatalogItem['visibility']) ?? undefined,
    forkedFrom: record.forkedFrom ?? undefined,
    forkCount: record.forkCount,
    sharedWithOrgs: record.sharedWithOrgs ?? undefined,
    createdAt: record.createdAt?.toISOString(),
    updatedAt: record.updatedAt?.toISOString(),
  }
}

// ============================================================================
// List Queries (Optimized with Summary Columns)
// ============================================================================

export async function getCatalog(): Promise<CatalogItemSummary[]> {
  if (!isDatabaseAvailable()) {
    return []
  }

  const records = await db
    .select({
      ...summaryColumns,
      authorName: users.name,
    })
    .from(catalogItems)
    .leftJoin(users, eq(catalogItems.authorId, users.id))
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
  const [result] = await db
    .select({
      item: catalogItems,
      orgName: organizations.name,
    })
    .from(catalogItems)
    .leftJoin(organizations, eq(catalogItems.orgId, organizations.id))
    .where(eq(catalogItems.id, id))

  if (!result) return undefined
  
  const item = toPlainObject(result.item)
  return {
    ...item,
    orgName: result.orgName ?? undefined,
  }
}

/**
 * Get published items of a specific type.
 * Uses composite index: catalog_items_type_status_idx
 */
export async function getItemsByType(type: ItemType): Promise<CatalogItemSummary[]> {
  const records = await db
    .select({
      ...summaryColumns,
      authorName: users.name,
    })
    .from(catalogItems)
    .leftJoin(users, eq(catalogItems.authorId, users.id))
    .where(
      and(
        eq(catalogItems.type, type),
        or(eq(catalogItems.status, 'published'), isNull(catalogItems.status))
      )
    )
  return records.map(toSummaryObject)
}

export async function getGuides(): Promise<CatalogItemSummary[]> {
  if (!isDatabaseAvailable()) {
    return []
  }

  const records = await db
    .select({
      ...summaryColumns,
      authorName: users.name,
    })
    .from(catalogItems)
    .leftJoin(users, eq(catalogItems.authorId, users.id))
    .where(
      and(
        eq(catalogItems.type, 'guide'),
        or(eq(catalogItems.status, 'published'), isNull(catalogItems.status))
      )
    )
  return records.map(toSummaryObject)
}

export async function getGuideById(idOrPluginId: string): Promise<CatalogItem | undefined> {
  const [result] = await db
    .select({
      item: catalogItems,
      orgName: organizations.name,
    })
    .from(catalogItems)
    .leftJoin(organizations, eq(catalogItems.orgId, organizations.id))
    .where(
      and(
        eq(catalogItems.type, 'guide'),
        or(eq(catalogItems.id, idOrPluginId), eq(catalogItems.pluginId, idOrPluginId))
      )
    )

  if (!result) return undefined
  
  const item = toPlainObject(result.item)
  return {
    ...item,
    orgName: result.orgName ?? undefined,
  }
}

/**
 * Get published items suitable for beginners (easy difficulty or beginner tag).
 */
export async function getBeginnerItems(): Promise<CatalogItemSummary[]> {
  const records = await db
    .select({
      ...summaryColumns,
      authorName: users.name,
    })
    .from(catalogItems)
    .leftJoin(users, eq(catalogItems.authorId, users.id))
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
 * Get all items by a specific user ID (including drafts for profile view).
 * Returns full records since profile views may need content preview.
 * Uses index: catalog_items_author_id_idx
 */
export async function getItemsByAuthorId(authorId: string): Promise<CatalogItem[]> {
  const records = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.authorId, authorId))
  return records.map(toPlainObject)
}

/**
 * Get related items based on matching tags and same author.
 * Excludes the current item and returns only published items.
 *
 * Scoring algorithm:
 * - Each matching tag: +1 point
 * - Same author: +2 points
 *
 * Results are sorted by score (descending), then by updatedAt (descending).
 */
export async function getRelatedItems(
  itemId: string,
  tags: string[],
  authorId: string | null,
  limit: number = 6
): Promise<CatalogItemSummary[]> {
  // Get all published items except the current one
  const records = await db
    .select({
      ...summaryColumns,
      authorName: users.name,
    })
    .from(catalogItems)
    .leftJoin(users, eq(catalogItems.authorId, users.id))
    .where(
      and(
        ne(catalogItems.id, itemId),
        or(eq(catalogItems.status, 'published'), isNull(catalogItems.status))
      )
    )

  const items = records.map(toSummaryObject)

  // Score and filter items
  const scoredItems = items
    .map(item => {
      let score = 0

      // Count matching tags
      const matchingTags = item.tags.filter(tag => tags.includes(tag))
      score += matchingTags.length

      // Bonus for same author
      if (authorId && item.authorId === authorId) {
        score += 2
      }

      return { item, score, matchingTags: matchingTags.length }
    })
    .filter(({ score }) => score > 0) // Only items with at least one match
    .sort((a, b) => {
      // Sort by score first
      if (b.score !== a.score) {
        return b.score - a.score
      }
      // Then by updated date
      const aDate = a.item.updatedAt || ''
      const bDate = b.item.updatedAt || ''
      return bDate.localeCompare(aDate)
    })
    .slice(0, limit)
    .map(({ item }) => item)

  return scoredItems
}

// ============================================================================
// Package-Related Queries
// ============================================================================

/**
 * Get items contained in a package.
 * Returns items sorted by displayOrder.
 */
export async function getPackageContents(packageId: string): Promise<CatalogItemSummary[]> {
  // Get package-item relations ordered by displayOrder
  const relations = await db
    .select()
    .from(packageItems)
    .where(eq(packageItems.packageId, packageId))
    .orderBy(asc(packageItems.displayOrder))

  if (relations.length === 0) return []

  // Get the items
  const itemIds = relations.map(r => r.itemId)
  const records = await db
    .select(summaryColumns)
    .from(catalogItems)
    .where(
      and(
        or(...itemIds.map(id => eq(catalogItems.id, id))),
        or(eq(catalogItems.status, 'published'), isNull(catalogItems.status))
      )
    )

  // Sort by displayOrder
  const itemMap = new Map(records.map(r => [r.id, r]))
  return relations
    .map(r => itemMap.get(r.itemId))
    .filter((r): r is SummaryRecord => r !== undefined)
    .map(toSummaryObject)
}

/**
 * Get a package with its contained items.
 */
export async function getPackageWithContents(id: string): Promise<CatalogItemWithPackageContents | null> {
  const item = await getItemById(id)
  if (!item || item.type !== 'package') return null

  const contents = await getPackageContents(id)

  return {
    ...item,
    packageContents: contents,
  }
}

/**
 * Set items in a package (replaces existing items).
 * @param packageId - The package ID
 * @param itemIds - Array of item IDs to include in the package (order preserved)
 */
export async function setPackageItems(packageId: string, itemIds: string[]): Promise<void> {
  // Delete existing items
  await db.delete(packageItems).where(eq(packageItems.packageId, packageId))

  // Insert new items with display order
  if (itemIds.length > 0) {
    const values = itemIds.map((itemId, index) => ({
      packageId,
      itemId,
      displayOrder: index,
    }))
    await db.insert(packageItems).values(values)
  }
}

/**
 * Add an item to a package at the end.
 */
export async function addItemToPackage(packageId: string, itemId: string): Promise<void> {
  // Get current max displayOrder
  const existing = await db
    .select({ displayOrder: packageItems.displayOrder })
    .from(packageItems)
    .where(eq(packageItems.packageId, packageId))
    .orderBy(asc(packageItems.displayOrder))

  const maxOrder = existing.length > 0 ? Math.max(...existing.map(e => e.displayOrder)) : -1

  await db.insert(packageItems).values({
    packageId,
    itemId,
    displayOrder: maxOrder + 1,
  }).onConflictDoNothing()
}

/**
 * Remove an item from a package.
 */
export async function removeItemFromPackage(packageId: string, itemId: string): Promise<void> {
  await db
    .delete(packageItems)
    .where(
      and(
        eq(packageItems.packageId, packageId),
        eq(packageItems.itemId, itemId)
      )
    )
}

/**
 * Get all published packages.
 */
export async function getPackages(): Promise<CatalogItemSummary[]> {
  return getItemsByType('package')
}
