import { NextRequest, NextResponse } from 'next/server'
import { db, catalogItems, installations, tags, catalogItemTags } from '@/lib/db'
import { ApiErrors } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { gte } from 'drizzle-orm'

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
  // Rate limit: 100 requests per minute
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  try {
    const { searchParams } = new URL(request.url)
    const period = (searchParams.get('period') || '30d') as Period
    const periodStart = getPeriodDate(period)

    // Get all catalog items for type distribution
    const items = await db.select().from(catalogItems)
    const publishedItems = items.filter(i => i.status === 'published')

    // Get all installations for the period
    const allInstallations = await db
      .select()
      .from(installations)
      .where(gte(installations.createdAt, periodStart))

    // Calculate total installations
    const totalInstallations = allInstallations.length

    // Calculate installations by method
    const installationsByMethod: Record<string, number> = {}
    allInstallations.forEach(inst => {
      installationsByMethod[inst.method] = (installationsByMethod[inst.method] || 0) + 1
    })

    // Calculate daily trend data
    const dailyTrend: { date: string; count: number }[] = []
    const dayMap = new Map<string, number>()

    allInstallations.forEach(inst => {
      if (inst.createdAt) {
        const dateKey = inst.createdAt.toISOString().split('T')[0]
        dayMap.set(dateKey, (dayMap.get(dateKey) || 0) + 1)
      }
    })

    // Fill in missing days with 0
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateKey = date.toISOString().split('T')[0]
      dailyTrend.push({
        date: dateKey,
        count: dayMap.get(dateKey) || 0
      })
    }

    // Calculate weekly trend
    const weeklyTrend: { week: string; count: number }[] = []
    const weekMap = new Map<string, number>()

    allInstallations.forEach(inst => {
      if (inst.createdAt) {
        const weekStart = new Date(inst.createdAt)
        weekStart.setDate(weekStart.getDate() - weekStart.getDay())
        const weekKey = weekStart.toISOString().split('T')[0]
        weekMap.set(weekKey, (weekMap.get(weekKey) || 0) + 1)
      }
    })

    Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([week, count]) => {
        weeklyTrend.push({ week, count })
      })

    // Calculate monthly trend
    const monthlyTrend: { month: string; count: number }[] = []
    const monthMap = new Map<string, number>()

    allInstallations.forEach(inst => {
      if (inst.createdAt) {
        const monthKey = inst.createdAt.toISOString().slice(0, 7) // YYYY-MM
        monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + 1)
      }
    })

    Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([month, count]) => {
        monthlyTrend.push({ month, count })
      })

    // Top 10 popular items by installation count
    const installCountByItem = new Map<string, number>()
    allInstallations.forEach(inst => {
      installCountByItem.set(inst.itemId, (installCountByItem.get(inst.itemId) || 0) + 1)
    })

    const topItems = Array.from(installCountByItem.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([itemId, installCount]) => {
        const item = items.find(i => i.id === itemId)
        return {
          id: itemId,
          name: item?.name || 'Unknown',
          type: item?.type || 'unknown',
          author: item?.author || 'Unknown',
          installCount
        }
      })

    // Get type distribution for published items
    const typeDistribution = {
      skill: publishedItems.filter(i => i.type === 'skill').length,
      agent: publishedItems.filter(i => i.type === 'agent').length,
      command: publishedItems.filter(i => i.type === 'command').length,
      guide: publishedItems.filter(i => i.type === 'guide').length,
      hook: publishedItems.filter(i => i.type === 'hook').length,
    }

    // Get recent installations with item details
    const recentInstallations = allInstallations
      .sort((a, b) => {
        const dateA = a.createdAt?.getTime() || 0
        const dateB = b.createdAt?.getTime() || 0
        return dateB - dateA
      })
      .slice(0, 10)
      .map(inst => {
        const item = items.find(i => i.id === inst.itemId)
        return {
          id: inst.id,
          itemId: inst.itemId,
          itemName: item?.name || 'Unknown',
          itemType: item?.type || 'unknown',
          method: inst.method,
          createdAt: inst.createdAt?.toISOString()
        }
      })

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
        author: i.author,
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
      totalInstallations,
      avgInstallationsPerDay: Math.round(totalInstallations / days * 10) / 10,
      topMethod: Object.entries(installationsByMethod)
        .sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A'
    }

    return NextResponse.json({
      period,
      summary,
      trends: {
        daily: dailyTrend,
        weekly: weeklyTrend,
        monthly: monthlyTrend
      },
      topItems,
      typeDistribution,
      installationsByMethod,
      categoryDistribution,
      recentActivity: {
        installations: recentInstallations,
        newItems: recentlyAdded
      }
    })
  } catch (error) {
    log.error('Failed to fetch stats', error)
    return ApiErrors.internalError('Failed to fetch statistics')
  }
}
