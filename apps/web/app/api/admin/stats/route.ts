/**
 * Admin statistics API route
 *
 * GET: Retrieve dashboard statistics including counts and trends
 * Requires CATALOG_VIEW permission
 */
import { NextRequest, NextResponse } from 'next/server'
import { db, catalogItems, users } from '@/lib/db'
import { ApiErrors, requirePermissionAsync } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { Permissions } from '@/lib/security/rbac'
import { eq } from 'drizzle-orm'

const log = createLogger('api:admin:stats')

export async function GET(request: NextRequest) {
  // Rate limit: 60 requests per minute for admin operations
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  // Check RBAC permission
  const permissionError = await requirePermissionAsync(Permissions.CATALOG_VIEW, request)
  if (permissionError) return permissionError

  try {
    // Get all items for calculations (with author names)
    const items = await db
      .select({
        id: catalogItems.id,
        name: catalogItems.name,
        type: catalogItems.type,
        status: catalogItems.status,
        authorName: users.name,
        tags: catalogItems.tags,
        likes: catalogItems.likes,
        createdAt: catalogItems.createdAt,
        updatedAt: catalogItems.updatedAt,
      })
      .from(catalogItems)
      .leftJoin(users, eq(catalogItems.authorId, users.id))

    // Calculate today's start (midnight UTC)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    // Count items by type
    const total = items.length
    const byType = {
      skill: items.filter(i => i.type === 'skill').length,
      agent: items.filter(i => i.type === 'agent').length,
      command: items.filter(i => i.type === 'command').length,
      guide: items.filter(i => i.type === 'guide').length,
      hook: items.filter(i => i.type === 'hook').length,
    }

    // Count by status
    const drafts = items.filter(i => i.status === 'draft').length
    const published = items.filter(i => i.status === 'published').length

    // Count items added today
    const addedToday = items.filter(i => {
      if (!i.createdAt) return false
      return new Date(i.createdAt) >= today
    }).length

    // Get recent activity (items modified in last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const recentActivity = items
      .filter(i => i.updatedAt && new Date(i.updatedAt) >= sevenDaysAgo)
      .sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        return dateB - dateA
      })
      .slice(0, 10)
      .map(i => ({
        id: i.id,
        name: i.name,
        type: i.type,
        status: i.status,
        author: i.authorName || 'Unknown',
        updatedAt: i.updatedAt,
      }))

    // Get top 10 popular items by likes
    const popularItems = [...items]
      .sort((a, b) => (b.likes || 0) - (a.likes || 0))
      .slice(0, 10)
      .map(i => ({
        id: i.id,
        name: i.name,
        type: i.type,
        likes: i.likes || 0,
        author: i.authorName || 'Unknown',
      }))

    // Get draft items for quick publish
    const draftItems = items
      .filter(i => i.status === 'draft')
      .sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        return dateB - dateA
      })
      .slice(0, 10)
      .map(i => ({
        id: i.id,
        name: i.name,
        type: i.type,
        author: i.authorName || 'Unknown',
        updatedAt: i.updatedAt,
      }))

    return NextResponse.json({
      stats: {
        total,
        byType,
        drafts,
        published,
        addedToday,
      },
      recentActivity,
      popularItems,
      draftItems,
    })
  } catch (error) {
    log.error('Failed to fetch admin stats', error)
    return ApiErrors.internalError('Failed to fetch admin stats')
  }
}
