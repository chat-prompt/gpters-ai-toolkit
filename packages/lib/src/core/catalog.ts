/**
 * Catalog data access layer
 *
 * Provides optimized database queries for catalog items including
 * list views, detail views, filtering, and package management.
 */
import { eq, ne, and, or, isNull, asc, sql, desc } from 'drizzle-orm'
import { db, catalogItems, catalogItemTranslations, packageItems, users, organizations, isDatabaseAvailable } from '@gpters/db'
import { CatalogItem, CatalogItemSummary, CatalogItemWithPackageContents, ItemType } from './types'
import { auth } from './auth'
import { isSuperAdmin, type UserRole } from '../security/rbac'

/**
 * Safely get the current session. Returns null when called outside
 * a request scope (e.g., during generateStaticParams at build time).
 */
async function safeAuth() {
  try {
    return await auth()
  } catch {
    return null
  }
}

/**
 * Build org-based visibility filter conditions.
 * Super admins see everything; others see only public items + their own org's items.
 */
function buildVisibilityFilter(userRole?: string | null, currentOrgId?: string | null) {
  if (userRole && isSuperAdmin(userRole as UserRole)) {
    return undefined
  }

  return currentOrgId
    ? or(
        eq(catalogItems.orgId, currentOrgId),
        eq(catalogItems.visibility, 'public'),
        isNull(catalogItems.orgId)
      )
    : or(
        eq(catalogItems.visibility, 'public'),
        isNull(catalogItems.orgId)
      )
}

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
  orgName: string | null
  tags: string[] | null
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
  visibility: 'private' | 'public' | null
  forkedFrom: string | null
  forkCount: number
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
    orgName: record.orgName ?? undefined,
    tags: record.tags || [],
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
    createdAt: record.createdAt?.toISOString(),
    updatedAt: record.updatedAt?.toISOString(),
  }
}

// ============================================================================
// List Queries (Optimized with Summary Columns)
// ============================================================================

export async function getCatalog(locale?: string): Promise<CatalogItemSummary[]> {
  if (!isDatabaseAvailable()) {
    return []
  }

  const useTranslation = locale && locale !== 'ko'
  const session = await safeAuth()
  const visFilter = buildVisibilityFilter(session?.user?.role, session?.user?.currentOrgId)

  const whereConditions = [
    ne(catalogItems.type, 'guide'),
    or(eq(catalogItems.status, 'published'), isNull(catalogItems.status)),
    ...(visFilter ? [visFilter] : []),
  ]

  if (useTranslation) {
    const records = await db
      .select({
        ...summaryColumns,
        authorName: users.name,
        orgName: organizations.name,
        translatedName: catalogItemTranslations.name,
        translatedDescription: catalogItemTranslations.description,
      })
      .from(catalogItems)
      .leftJoin(users, eq(catalogItems.authorId, users.id))
      .leftJoin(organizations, eq(catalogItems.orgId, organizations.id))
      .leftJoin(catalogItemTranslations, and(
        eq(catalogItems.id, catalogItemTranslations.itemId),
        eq(catalogItemTranslations.locale, locale),
      ))
      .where(and(...whereConditions))

    return records.map((r) => {
      const summary = toSummaryObject(r)
      if (r.translatedName) summary.name = r.translatedName
      if (r.translatedDescription) summary.description = r.translatedDescription
      return summary
    })
  }

  const records = await db
    .select({
      ...summaryColumns,
      authorName: users.name,
      orgName: organizations.name,
    })
    .from(catalogItems)
    .leftJoin(users, eq(catalogItems.authorId, users.id))
    .leftJoin(organizations, eq(catalogItems.orgId, organizations.id))
    .where(and(...whereConditions))

  return records.map(toSummaryObject)
}

// ============================================================================
// Detail Queries (Full Record with All Fields)
// ============================================================================

export async function getItemById(id: string, locale?: string): Promise<CatalogItem | undefined> {
  const useTranslation = locale && locale !== 'ko'

  if (useTranslation) {
    const [result] = await db
      .select({
        item: catalogItems,
        orgName: organizations.name,
        translatedName: catalogItemTranslations.name,
        translatedDescription: catalogItemTranslations.description,
        translatedContent: catalogItemTranslations.content,
        translatedReadme: catalogItemTranslations.readme,
      })
      .from(catalogItems)
      .leftJoin(organizations, eq(catalogItems.orgId, organizations.id))
      .leftJoin(catalogItemTranslations, and(
        eq(catalogItems.id, catalogItemTranslations.itemId),
        eq(catalogItemTranslations.locale, locale),
      ))
      .where(eq(catalogItems.id, id))

    if (!result) return undefined

    const session = await safeAuth()
    const currentOrgId = session?.user?.currentOrgId
    const userRole = session?.user?.role

    if (!userRole || !isSuperAdmin(userRole as UserRole)) {
      const raw = result.item
      if (raw.visibility === 'private' && raw.orgId !== currentOrgId) {
        return undefined
      }
    }

    const item = toPlainObject(result.item)
    return {
      ...item,
      name: result.translatedName ?? item.name,
      description: result.translatedDescription ?? item.description,
      content: result.translatedContent ?? item.content,
      readme: result.translatedReadme ?? item.readme,
      orgName: result.orgName ?? undefined,
    }
  }

  const [result] = await db
    .select({
      item: catalogItems,
      orgName: organizations.name,
    })
    .from(catalogItems)
    .leftJoin(organizations, eq(catalogItems.orgId, organizations.id))
    .where(eq(catalogItems.id, id))

  if (!result) return undefined

  // Enforce visibility: non-super-admins cannot access private items from other orgs
  const session = await safeAuth()
  const currentOrgId = session?.user?.currentOrgId
  const userRole = session?.user?.role

  if (!userRole || !isSuperAdmin(userRole as UserRole)) {
    const item = result.item
    if (item.visibility === 'private' && item.orgId !== currentOrgId) {
      return undefined
    }
  }

  const item = toPlainObject(result.item)
  return {
    ...item,
    orgName: result.orgName ?? undefined,
  }
}

/**
 * Get published items of a specific type with org-based visibility filtering.
 * Uses composite index: catalog_items_type_status_idx
 */
export async function getItemsByType(type: ItemType): Promise<CatalogItemSummary[]> {
  const session = await safeAuth()
  const visFilter = buildVisibilityFilter(session?.user?.role, session?.user?.currentOrgId)

  const whereConditions = [
    eq(catalogItems.type, type),
    or(eq(catalogItems.status, 'published'), isNull(catalogItems.status)),
    ...(visFilter ? [visFilter] : []),
  ]

  const records = await db
    .select({
      ...summaryColumns,
      authorName: users.name,
      orgName: organizations.name,
    })
    .from(catalogItems)
    .leftJoin(users, eq(catalogItems.authorId, users.id))
    .leftJoin(organizations, eq(catalogItems.orgId, organizations.id))
    .where(and(...whereConditions))
  return records.map(toSummaryObject)
}

export async function getGuides(locale?: string): Promise<CatalogItemSummary[]> {
  if (!isDatabaseAvailable()) {
    return []
  }

  const useTranslation = locale && locale !== 'ko'
  const session = await safeAuth()
  const visFilter = buildVisibilityFilter(session?.user?.role, session?.user?.currentOrgId)

  const whereConditions = [
    eq(catalogItems.type, 'guide'),
    or(eq(catalogItems.status, 'published'), isNull(catalogItems.status)),
    ...(visFilter ? [visFilter] : []),
  ]

  if (useTranslation) {
    const records = await db
      .select({
        ...summaryColumns,
        authorName: users.name,
        orgName: organizations.name,
        translatedName: catalogItemTranslations.name,
        translatedDescription: catalogItemTranslations.description,
      })
      .from(catalogItems)
      .leftJoin(users, eq(catalogItems.authorId, users.id))
      .leftJoin(organizations, eq(catalogItems.orgId, organizations.id))
      .leftJoin(catalogItemTranslations, and(
        eq(catalogItems.id, catalogItemTranslations.itemId),
        eq(catalogItemTranslations.locale, locale),
      ))
      .where(and(...whereConditions))

    return records.map((r) => {
      const summary = toSummaryObject(r)
      if (r.translatedName) summary.name = r.translatedName
      if (r.translatedDescription) summary.description = r.translatedDescription
      return summary
    })
  }

  const records = await db
    .select({
      ...summaryColumns,
      authorName: users.name,
      orgName: organizations.name,
    })
    .from(catalogItems)
    .leftJoin(users, eq(catalogItems.authorId, users.id))
    .leftJoin(organizations, eq(catalogItems.orgId, organizations.id))
    .where(and(...whereConditions))
  return records.map(toSummaryObject)
}

export async function getGuideById(idOrPluginId: string, locale?: string): Promise<CatalogItem | undefined> {
  const useTranslation = locale && locale !== 'ko'
  const whereClause = and(
    eq(catalogItems.type, 'guide'),
    or(eq(catalogItems.id, idOrPluginId), eq(catalogItems.pluginId, idOrPluginId))
  )

  if (useTranslation) {
    const [result] = await db
      .select({
        item: catalogItems,
        orgName: organizations.name,
        translatedName: catalogItemTranslations.name,
        translatedDescription: catalogItemTranslations.description,
        translatedContent: catalogItemTranslations.content,
        translatedReadme: catalogItemTranslations.readme,
      })
      .from(catalogItems)
      .leftJoin(organizations, eq(catalogItems.orgId, organizations.id))
      .leftJoin(catalogItemTranslations, and(
        eq(catalogItems.id, catalogItemTranslations.itemId),
        eq(catalogItemTranslations.locale, locale),
      ))
      .where(whereClause)

    if (!result) return undefined

    const session = await safeAuth()
    const currentOrgId = session?.user?.currentOrgId
    const userRole = session?.user?.role

    if (!userRole || !isSuperAdmin(userRole as UserRole)) {
      const raw = result.item
      if (raw.visibility === 'private' && raw.orgId !== currentOrgId) {
        return undefined
      }
    }

    const item = toPlainObject(result.item)
    return {
      ...item,
      name: result.translatedName ?? item.name,
      description: result.translatedDescription ?? item.description,
      content: result.translatedContent ?? item.content,
      readme: result.translatedReadme ?? item.readme,
      orgName: result.orgName ?? undefined,
    }
  }

  const [result] = await db
    .select({
      item: catalogItems,
      orgName: organizations.name,
    })
    .from(catalogItems)
    .leftJoin(organizations, eq(catalogItems.orgId, organizations.id))
    .where(whereClause)

  if (!result) return undefined

  const session = await safeAuth()
  const currentOrgId = session?.user?.currentOrgId
  const userRole = session?.user?.role

  if (!userRole || !isSuperAdmin(userRole as UserRole)) {
    const raw = result.item
    if (raw.visibility === 'private' && raw.orgId !== currentOrgId) {
      return undefined
    }
  }

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
  const session = await safeAuth()
  const visFilter = buildVisibilityFilter(session?.user?.role, session?.user?.currentOrgId)

  const whereConditions = [
    or(eq(catalogItems.status, 'published'), isNull(catalogItems.status)),
    ...(visFilter ? [visFilter] : []),
  ]

  const records = await db
    .select({
      ...summaryColumns,
      authorName: users.name,
      orgName: organizations.name,
    })
    .from(catalogItems)
    .leftJoin(users, eq(catalogItems.authorId, users.id))
    .leftJoin(organizations, eq(catalogItems.orgId, organizations.id))
    .where(and(...whereConditions))

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
  const session = await safeAuth()
  const visFilter = buildVisibilityFilter(session?.user?.role, session?.user?.currentOrgId)

  // Build tag array literal for SQL
  const tagArrayLiteral = tags.length > 0
    ? sql.raw(`ARRAY[${tags.map(t => `'${t.replace(/'/g, "''")}'`).join(',')}]::text[]`)
    : null

  // Score: count matching tags (via unnest subquery) + 2 for same author
  const tagScore = tagArrayLiteral
    ? sql<number>`coalesce((SELECT count(*)::int FROM unnest(${catalogItems.tags}) t WHERE t = ANY(${tagArrayLiteral})), 0)`
    : sql<number>`0`
  const authorScore = authorId
    ? sql<number>`CASE WHEN ${catalogItems.authorId} = ${authorId} THEN 2 ELSE 0 END`
    : sql<number>`0`
  const totalScore = sql<number>`(${tagScore} + ${authorScore})`

  const whereConditions = [
    ne(catalogItems.id, itemId),
    or(eq(catalogItems.status, 'published'), isNull(catalogItems.status)),
    or(
      tagArrayLiteral
        ? sql`${catalogItems.tags} && ${tagArrayLiteral}`
        : sql`false`,
      authorId ? eq(catalogItems.authorId, authorId) : sql`false`
    ),
    ...(visFilter ? [visFilter] : []),
  ]

  // Filter at DB level: only items with at least one matching tag or same author
  const records = await db
    .select({
      ...summaryColumns,
      authorName: users.name,
      orgName: organizations.name,
    })
    .from(catalogItems)
    .leftJoin(users, eq(catalogItems.authorId, users.id))
    .leftJoin(organizations, eq(catalogItems.orgId, organizations.id))
    .where(and(...whereConditions))
    .orderBy(desc(totalScore), desc(catalogItems.updatedAt))
    .limit(limit)

  return records.map(toSummaryObject)
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
    .select({
      ...summaryColumns,
      authorName: users.name,
      orgName: organizations.name,
    })
    .from(catalogItems)
    .leftJoin(users, eq(catalogItems.authorId, users.id))
    .leftJoin(organizations, eq(catalogItems.orgId, organizations.id))
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
