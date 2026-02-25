/**
 * PostgreSQL Full-Text Search utilities
 *
 * Provides server-side search using:
 * - tsvector for English content (stemming, ranking)
 * - pg_trgm for Korean/multilingual content (similarity matching)
 */

import { db, catalogItems, type CatalogItemRecord } from '@gpters/db'
import { sql, eq, and, or, desc, asc, isNull } from 'drizzle-orm'
import type { ItemType, TeamTag } from '../core/types'

/**
 * Search options for catalog item queries
 */
export interface SearchOptions {
  query: string
  type?: ItemType | 'all'
  status?: 'published' | 'draft' | 'all'
  limit?: number
  offset?: number
  sortBy?: 'relevance' | 'newest' | 'popular' | 'name'
  teamTag?: string
  tags?: string[]
  /** Current organization ID for access control filtering */
  currentOrgId?: string
  /** User role for super admin bypass */
  userRole?: string
}

export interface FTSSearchResult {
  items: CatalogItemRecord[]
  total: number
  hasMore: boolean
  searchTime: number
}

/**
 * Perform full-text search on catalog items
 *
 * Uses hybrid approach:
 * 1. PostgreSQL FTS for English (tsvector with ranking)
 * 2. Trigram similarity for Korean/mixed content
 *
 * @param options - Search options including org filtering params
 * @returns Search results with items, total count, and metadata
 */
export async function searchCatalogItems(options: SearchOptions): Promise<FTSSearchResult> {
  const startTime = Date.now()
  const {
    query,
    type = 'all',
    status = 'published',
    limit = 20,
    offset = 0,
    sortBy = 'relevance',
    teamTag,
    tags,
    currentOrgId,
    userRole,
  } = options

  // Sanitize query
  const sanitizedQuery = query.trim()

  if (!sanitizedQuery) {
    // Return all items if no query
    return getAllItems({ type, status, limit, offset, sortBy, teamTag, tags })
  }

  // Detect if query contains Korean characters
  const hasKorean = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(sanitizedQuery)

  // Build conditions
  const conditions = []

  // Status filter
  if (status !== 'all') {
    conditions.push(eq(catalogItems.status, status))
  }

  // Type filter
  if (type && type !== 'all') {
    conditions.push(eq(catalogItems.type, type))
  }

  // Team tag filter
  if (teamTag) {
    conditions.push(eq(catalogItems.teamTag, teamTag as TeamTag))
  }

  // Tag filter - check if any of the requested tags are in the item's tags array
  if (tags && tags.length > 0) {
    conditions.push(
      sql`${catalogItems.tags} && ARRAY[${sql.join(tags.map(t => sql`${t}`), sql`, `)}]::text[]`
    )
  }

  // Organization access control filtering
  // Super admins see everything; regular users get org-scoped results
  if (userRole && userRole === 'super_admin') {
    // Super admin bypass - no org filter
  } else {
    const orgAccessConditions = currentOrgId
      ? or(
          eq(catalogItems.orgId, currentOrgId),
          eq(catalogItems.visibility, 'public'),
          isNull(catalogItems.orgId)
        )
      : or(
          eq(catalogItems.visibility, 'public'),
          isNull(catalogItems.orgId)
        )
    conditions.push(orgAccessConditions)
  }

  // Search condition - hybrid FTS + trigram (searches name, description, readme, content, tags)
  if (hasKorean) {
    // Korean search using trigram similarity on search_text (includes readme)
    conditions.push(
      sql`(
        ${catalogItems.name} % ${sanitizedQuery} OR
        ${catalogItems.description} % ${sanitizedQuery} OR
        ${catalogItems.readme} % ${sanitizedQuery} OR
        search_text % ${sanitizedQuery}
      )`
    )
  } else {
    // English search using FTS with trigram fallback (search_vector includes readme)
    const tsQuery = sanitizedQuery
      .split(/\s+/)
      .filter(Boolean)
      .map(word => `${word}:*`)
      .join(' & ')

    conditions.push(
      or(
        sql`search_vector @@ to_tsquery('english', ${tsQuery})`,
        sql`${catalogItems.name} % ${sanitizedQuery}`,
        sql`${catalogItems.description} % ${sanitizedQuery}`,
        sql`${catalogItems.readme} % ${sanitizedQuery}`
      )
    )
  }

  // Build order by clause
  let orderByClause
  switch (sortBy) {
    case 'relevance':
      if (hasKorean) {
        orderByClause = sql`similarity(search_text, ${sanitizedQuery}) DESC`
      } else {
        const tsQuery = sanitizedQuery.split(/\s+/).filter(Boolean).map(word => `${word}:*`).join(' & ')
        orderByClause = sql`ts_rank(search_vector, to_tsquery('english', ${tsQuery})) DESC`
      }
      break
    case 'newest':
      orderByClause = desc(catalogItems.createdAt)
      break
    case 'popular':
      orderByClause = desc(catalogItems.likes)
      break
    case 'name':
      orderByClause = asc(catalogItems.name)
      break
    default:
      orderByClause = desc(catalogItems.createdAt)
  }

  // Execute search query
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(catalogItems)
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(catalogItems)
      .where(whereClause),
  ])

  const total = Number(countResult[0]?.count || 0)
  const searchTime = Date.now() - startTime

  return {
    items,
    total,
    hasMore: offset + items.length < total,
    searchTime,
  }
}

/**
 * Get all items without search query
 *
 * @param options - Search options including org filtering params
 * @returns Search results with items, total count, and metadata
 */
async function getAllItems(options: Omit<SearchOptions, 'query'>): Promise<FTSSearchResult> {
  const startTime = Date.now()
  const {
    type = 'all',
    status = 'published',
    limit = 20,
    offset = 0,
    sortBy = 'newest',
    teamTag,
    tags,
    currentOrgId,
    userRole,
  } = options

  const conditions = []

  if (status !== 'all') {
    conditions.push(eq(catalogItems.status, status))
  }

  if (type && type !== 'all') {
    conditions.push(eq(catalogItems.type, type))
  }

  if (teamTag) {
    conditions.push(eq(catalogItems.teamTag, teamTag as TeamTag))
  }

  if (tags && tags.length > 0) {
    conditions.push(
      sql`${catalogItems.tags} && ARRAY[${sql.join(tags.map(t => sql`${t}`), sql`, `)}]::text[]`
    )
  }

  // Organization access control filtering
  if (userRole && userRole === 'super_admin') {
    // Super admin bypass - no org filter
  } else {
    const orgAccessConditions = currentOrgId
      ? or(
          eq(catalogItems.orgId, currentOrgId),
          eq(catalogItems.visibility, 'public'),
          isNull(catalogItems.orgId)
        )
      : or(
          eq(catalogItems.visibility, 'public'),
          isNull(catalogItems.orgId)
        )
    conditions.push(orgAccessConditions)
  }

  let orderByClause
  switch (sortBy) {
    case 'newest':
      orderByClause = desc(catalogItems.createdAt)
      break
    case 'popular':
      orderByClause = desc(catalogItems.likes)
      break
    case 'name':
      orderByClause = asc(catalogItems.name)
      break
    default:
      orderByClause = desc(catalogItems.createdAt)
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(catalogItems)
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(catalogItems)
      .where(whereClause),
  ])

  const total = Number(countResult[0]?.count || 0)
  const searchTime = Date.now() - startTime

  return {
    items,
    total,
    hasMore: offset + items.length < total,
    searchTime,
  }
}

/**
 * Get search suggestions based on partial input (PostgreSQL-based)
 *
 * @param query - Partial search query
 * @param limit - Maximum number of suggestions (default: 5)
 * @param currentOrgId - Current organization ID for access control filtering
 * @param userRole - User role for super admin bypass
 * @returns Array of suggestion objects with name, type, and id
 */
export async function getFTSSearchSuggestions(
  query: string,
  limit = 5,
  currentOrgId?: string,
  userRole?: string
): Promise<{ name: string; type: ItemType; id: string }[]> {
  if (!query.trim()) return []

  const sanitizedQuery = query.trim()
  const hasKorean = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(sanitizedQuery)

  let condition
  if (hasKorean) {
    condition = sql`${catalogItems.name} % ${sanitizedQuery}`
  } else {
    condition = or(
      sql`${catalogItems.name} ILIKE ${`%${sanitizedQuery}%`}`,
      sql`${catalogItems.name} % ${sanitizedQuery}`
    )
  }

  const conditions = [condition, eq(catalogItems.status, 'published')]

  // Organization access control filtering
  if (userRole && userRole === 'super_admin') {
    // Super admin bypass - no org filter
  } else {
    const orgAccessConditions = currentOrgId
      ? or(
          eq(catalogItems.orgId, currentOrgId),
          eq(catalogItems.visibility, 'public'),
          isNull(catalogItems.orgId)
        )
      : or(
          eq(catalogItems.visibility, 'public'),
          isNull(catalogItems.orgId)
        )
    conditions.push(orgAccessConditions)
  }

  const results = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      type: catalogItems.type,
    })
    .from(catalogItems)
    .where(and(...conditions))
    .orderBy(hasKorean
      ? sql`similarity(${catalogItems.name}, ${sanitizedQuery}) DESC`
      : sql`CASE WHEN ${catalogItems.name} ILIKE ${`${sanitizedQuery}%`} THEN 0 ELSE 1 END, ${catalogItems.name}`
    )
    .limit(limit)

  return results
}

/**
 * Highlight matching terms in text
 */
export function highlightSearchTerms(text: string, query: string): string {
  if (!query.trim()) return text

  const terms = query.trim().split(/\s+/).filter(Boolean)
  let highlighted = text

  for (const term of terms) {
    const regex = new RegExp(`(${escapeRegex(term)})`, 'gi')
    highlighted = highlighted.replace(regex, '<mark>$1</mark>')
  }

  return highlighted
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
