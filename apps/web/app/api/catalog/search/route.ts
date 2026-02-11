/**
 * Catalog Search API
 *
 * GET /api/catalog/search
 *
 * Query Parameters:
 * - q: Search query string
 * - type: Filter by item type (skill, agent, command, guide, hook, all)
 * - status: Filter by status (published, draft, all) - default: published
 * - limit: Number of results (default: 20, max: 100)
 * - offset: Pagination offset (default: 0)
 * - sortBy: Sort order (relevance, newest, popular, name) - default: relevance
 * - teamTag: Filter by team tag
 * - tags: Comma-separated list of tags to filter by
 */

import { NextRequest, NextResponse } from 'next/server'
import { searchCatalogItems, getFTSSearchSuggestions } from '@/lib/search/full-text-search'
import { auth } from '@/lib/core/auth'
import { isSuperAdmin, type UserRole } from '@/lib/security/rbac'
import type { ItemType } from '@/lib/core/types'

export const dynamic = 'force-dynamic'

// Valid types for filtering
const VALID_TYPES = ['skill', 'agent', 'command', 'guide', 'hook', 'all'] as const
const VALID_STATUSES = ['published', 'draft', 'all'] as const
const VALID_SORT_OPTIONS = ['relevance', 'newest', 'popular', 'name'] as const

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Get session for org access control
    const session = await auth()
    const currentOrgId = session?.user?.currentOrgId
    const userRole = session?.user?.role

    // Parse query parameters
    const query = searchParams.get('q') || ''
    const typeParam = searchParams.get('type') || 'all'
    const statusParam = searchParams.get('status') || 'published'
    const limitParam = parseInt(searchParams.get('limit') || '20', 10)
    const offsetParam = parseInt(searchParams.get('offset') || '0', 10)
    const sortByParam = searchParams.get('sortBy') || 'relevance'
    const teamTag = searchParams.get('teamTag') || undefined
    const tagsParam = searchParams.get('tags')
    const suggestionsOnly = searchParams.get('suggestions') === 'true'

    // Validate type
    const type = VALID_TYPES.includes(typeParam as typeof VALID_TYPES[number])
      ? (typeParam as ItemType | 'all')
      : 'all'

    // Validate status
    const status = VALID_STATUSES.includes(statusParam as typeof VALID_STATUSES[number])
      ? (statusParam as 'published' | 'draft' | 'all')
      : 'published'

    // Validate limit (1-100)
    const limit = Math.min(Math.max(1, limitParam), 100)

    // Validate offset (>= 0)
    const offset = Math.max(0, offsetParam)

    // Validate sortBy
    const sortBy = VALID_SORT_OPTIONS.includes(sortByParam as typeof VALID_SORT_OPTIONS[number])
      ? (sortByParam as 'relevance' | 'newest' | 'popular' | 'name')
      : 'relevance'

    // Parse tags
    const tags = tagsParam ? tagsParam.split(',').map(t => t.trim()).filter(Boolean) : undefined

    // If only suggestions are requested
    if (suggestionsOnly) {
      const suggestions = await getFTSSearchSuggestions(query, limit, currentOrgId, userRole)
      return NextResponse.json({
        suggestions,
        query,
      })
    }

    // Perform search
    const result = await searchCatalogItems({
      query,
      type,
      status,
      limit,
      offset,
      sortBy,
      teamTag,
      tags,
      currentOrgId,
      userRole,
    })

    // Return response with cache headers
    const response = NextResponse.json({
      items: result.items,
      total: result.total,
      hasMore: result.hasMore,
      searchTime: result.searchTime,
      query,
      filters: {
        type,
        status,
        sortBy,
        teamTag,
        tags,
      },
      pagination: {
        limit,
        offset,
        page: Math.floor(offset / limit) + 1,
        totalPages: Math.ceil(result.total / limit),
      },
    })

    // Add cache headers for GET requests
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')

    return response
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json(
      { error: 'Search failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
