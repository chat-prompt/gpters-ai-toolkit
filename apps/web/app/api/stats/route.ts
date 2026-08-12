/**
 * Admin statistics API route
 *
 * GET: Retrieve platform-wide statistics including item counts
 * and content for the stats dashboard.
 * Requires CATALOG_VIEW permission (admin only).
 */
import { NextRequest, NextResponse } from 'next/server'
import { db, catalogItems, tags, catalogItemTags, users } from '@/lib/db'
import { ApiErrors, requirePermissionAsync } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { Permissions } from '@/lib/security/rbac'
import { eq } from 'drizzle-orm'

const log = createLogger('api:stats')

// Period options for filtering
type Period = '7d' | '30d' | '90d'

function getPeriodDate(period: Period): Date {
  const now = new Date()
  switch (period) {
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  }
}

export async function GET(request: NextRequest) {
  // Rate limit: 60 requests per minute for admin operations
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  // Check RBAC permission
  const permissionError = await requirePermissionAsync(Permissions.CATALOG_VIEW, request)
  if (permissionError) return permissionError

  try {
    const { searchParams } = new URL(request.url)
    const period = (searchParams.get('period') || '30d') as Period
    const periodStart = getPeriodDate(period)

    // Get all catalog items for type distribution (with author names)
    const items = await db
      .select({
        id: catalogItems.id,
        name: catalogItems.name,
        type: catalogItems.type,
        status: catalogItems.status,
        authorId: catalogItems.authorId,
        authorName: users.name,
        createdAt: catalogItems.createdAt,
      })
      .from(catalogItems)
      .leftJoin(users, eq(catalogItems.authorId, users.id))
    const publishedItems = items.filter(i => i.status === 'published')

    // Get type distribution for published items
    const typeDistribution = {
      skill: publishedItems.filter(i => i.type === 'skill').length,
      agent: publishedItems.filter(i => i.type === 'agent').length,
      command: publishedItems.filter(i => i.type === 'command').length,
      guide: publishedItems.filter(i => i.type === 'guide').length,
      hook: publishedItems.filter(i => i.type === 'hook').length,
    }

    // Get recently added items
    const recentlyAdded = items
      .filter(i => i.createdAt && i.createdAt >= periodStart && i.status === 'published')
      .sort((a, b) => {
        const dateA = a.createdAt?.getTime() || 0
        const dateB = b.createdAt?.getTime() || 0
        return dateB - dateA
      })
      .slice(0, 10)
      .map(i => ({
        id: i.id,
        name: i.name,
        type: i.type,
        authorName: i.authorName || 'Unknown',
        createdAt: i.createdAt?.toISOString()
      }))

    // Get category/tag distribution
    const allItemTags = await db
      .select({
        tagId: catalogItemTags.tagId,
        itemId: catalogItemTags.itemId
      })
      .from(catalogItemTags)

    const tagCountMap = new Map<string, number>()
    allItemTags.forEach(it => {
      // Only count tags for published items
      const item = publishedItems.find(i => i.id === it.itemId)
      if (item) {
        tagCountMap.set(it.tagId, (tagCountMap.get(it.tagId) || 0) + 1)
      }
    })

    const allTags = await db.select().from(tags)
    const categoryDistribution = Array.from(tagCountMap.entries())
      .map(([tagId, itemCount]) => {
        const tag = allTags.find(t => t.id === tagId)
        return {
          id: tagId,
          label: tag?.label || tagId,
          count: itemCount
        }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Summary stats
    const summary = {
      totalItems: publishedItems.length,
    }

    return NextResponse.json({
      period,
      summary,
      typeDistribution,
      categoryDistribution,
      recentActivity: {
        newItems: recentlyAdded
      }
    })
  } catch (error) {
    log.error('Failed to fetch stats', error)
    return ApiErrors.internalError('Failed to fetch statistics')
  }
}
