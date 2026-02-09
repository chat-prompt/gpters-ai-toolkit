/**
 * Welfare Engine Metrics Tracking
 *
 * Provides analytics and reporting for the "복리 엔진" (Welfare Engine) -
 * tracking skill accumulation, utilization, and quality metrics.
 */

import { db, catalogItems, itemVersions, mcpAuditLogs, users } from '@gpters/db'
import { eq, and, gte, lte, count, sql, desc } from 'drizzle-orm'
import { createLogger } from '../core/logger'

const log = createLogger('welfare-engine')

/**
 * Core metrics for welfare engine tracking
 */
export interface WelfareEngineMetrics {
  /** Accumulation metrics (축적) */
  accumulation: {
    /** Total published skills */
    totalSkills: number
    /** New skills in period */
    newSkills: number
    /** Total version updates */
    totalUpdates: number
    /** New updates in period */
    newUpdates: number
  }
  /** Utilization metrics (활용) */
  utilization: {
    /** Total skill views (get_plugin_content calls) */
    totalViews: number
    /** Total searches (search_plugins + semantic_search) */
    totalSearches: number
    /** Top 3 viewed skills */
    topSkills: Array<{ id: string; name: string; views: number }>
  }
  /** Quality metrics (품질) */
  quality: {
    /** MCP success rate percentage */
    successRate: number
    /** Average response time in ms */
    avgResponseTime: number
  }
  /** Secondary metrics */
  secondary: {
    /** Contributors who published skills in period */
    contributors: Array<{ name: string; skillCount: number }>
  }
}

/**
 * Weekly comparison data
 */
export interface WeeklyComparison {
  current: WelfareEngineMetrics
  previous: WelfareEngineMetrics
  changes: {
    skills: number
    updates: number
    views: number
    searches: number
  }
}

/**
 * Skill view ranking entry
 */
export interface SkillViewRanking {
  id: string
  name: string
  type: string
  views: number
  authorName?: string
}



/**
 * Get welfare engine statistics for a date range
 *
 * @param startDate - Start of the period
 * @param endDate - End of the period (defaults to now)
 * @returns Complete welfare engine metrics
 */
export async function getWelfareEngineStats(
  startDate: Date,
  endDate: Date = new Date()
): Promise<WelfareEngineMetrics> {
  try {
    // Get accumulation metrics
    const [totalSkillsResult] = await db
      .select({ count: count() })
      .from(catalogItems)
      .where(
        and(
          eq(catalogItems.status, 'published'),
          eq(catalogItems.type, 'skill')
        )
      )

    const [newSkillsResult] = await db
      .select({ count: count() })
      .from(catalogItems)
      .where(
        and(
          eq(catalogItems.status, 'published'),
          eq(catalogItems.type, 'skill'),
          gte(catalogItems.createdAt, startDate),
          lte(catalogItems.createdAt, endDate)
        )
      )

    const [totalUpdatesResult] = await db
      .select({ count: count() })
      .from(itemVersions)

    const [newUpdatesResult] = await db
      .select({ count: count() })
      .from(itemVersions)
      .where(
        and(
          gte(itemVersions.createdAt, startDate),
          lte(itemVersions.createdAt, endDate)
        )
      )

    // Get utilization metrics - skill views
    const [totalViewsResult] = await db
      .select({ count: count() })
      .from(mcpAuditLogs)
      .where(
        and(
          eq(mcpAuditLogs.tool, 'get_plugin_content'),
          eq(mcpAuditLogs.responseStatus, 'success'),
          gte(mcpAuditLogs.createdAt, startDate),
          lte(mcpAuditLogs.createdAt, endDate)
        )
      )

    // Get utilization metrics - searches
    const [totalSearchesResult] = await db
      .select({ count: count() })
      .from(mcpAuditLogs)
      .where(
        and(
          sql`${mcpAuditLogs.tool} IN ('search_plugins', 'semantic_search')`,
          eq(mcpAuditLogs.responseStatus, 'success'),
          gte(mcpAuditLogs.createdAt, startDate),
          lte(mcpAuditLogs.createdAt, endDate)
        )
      )

    // Get top 3 viewed skills
    const topSkillViews = await db
      .select({
        pluginId: sql<string>`${mcpAuditLogs.requestParams}->'params'->'arguments'->>'pluginId'`,
        count: count(),
      })
      .from(mcpAuditLogs)
      .where(
        and(
          eq(mcpAuditLogs.tool, 'get_plugin_content'),
          eq(mcpAuditLogs.responseStatus, 'success'),
          gte(mcpAuditLogs.createdAt, startDate),
          lte(mcpAuditLogs.createdAt, endDate),
          sql`${mcpAuditLogs.requestParams}->'params'->'arguments'->>'pluginId' IS NOT NULL`
        )
      )
      .groupBy(sql`${mcpAuditLogs.requestParams}->'params'->'arguments'->>'pluginId'`)
      .orderBy(desc(count()))
      .limit(3)

    // Fetch skill details for top skills
    const topSkillsRaw = await Promise.all(
      topSkillViews.map(async (view) => {
        const [item] = await db
          .select({
            id: catalogItems.id,
            name: catalogItems.name,
          })
          .from(catalogItems)
          .where(eq(catalogItems.id, view.pluginId))
          .limit(1)

        return {
          id: view.pluginId,
          name: item?.name,
          views: view.count,
        }
      })
    )
    const topSkills = topSkillsRaw.filter((s): s is { id: string; name: string; views: number } => !!s.name)

    // Get quality metrics
    const [qualityResult] = await db
      .select({
        total: count(),
        success: sql<number>`COUNT(*) FILTER (WHERE ${mcpAuditLogs.responseStatus} = 'success')`,
        avgTime: sql<number>`AVG(${mcpAuditLogs.responseTime})`,
      })
      .from(mcpAuditLogs)
      .where(
        and(
          gte(mcpAuditLogs.createdAt, startDate),
          lte(mcpAuditLogs.createdAt, endDate),
          sql`${mcpAuditLogs.responseTime} IS NOT NULL`
        )
      )

    const successRate =
      qualityResult && qualityResult.total > 0
        ? (Number(qualityResult.success) / qualityResult.total) * 100
        : 0

    const contributorsData = await db
      .select({
        authorId: catalogItems.authorId,
        skillCount: count(),
      })
      .from(catalogItems)
      .where(
        and(
          gte(catalogItems.createdAt, startDate),
          lte(catalogItems.createdAt, endDate),
          sql`${catalogItems.authorId} IS NOT NULL`
        )
      )
      .groupBy(catalogItems.authorId)
      .orderBy(desc(count()))
      .limit(10)

    const contributors = await Promise.all(
      contributorsData.map(async (c) => {
        const [user] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, c.authorId!))
          .limit(1)
        return {
          name: user?.name || 'Unknown',
          skillCount: c.skillCount,
        }
      })
    )

    return {
      accumulation: {
        totalSkills: totalSkillsResult?.count || 0,
        newSkills: newSkillsResult?.count || 0,
        totalUpdates: totalUpdatesResult?.count || 0,
        newUpdates: newUpdatesResult?.count || 0,
      },
      utilization: {
        totalViews: totalViewsResult?.count || 0,
        totalSearches: totalSearchesResult?.count || 0,
        topSkills,
      },
      quality: {
        successRate: Math.round(successRate * 10) / 10,
        avgResponseTime: Math.round(qualityResult?.avgTime || 0),
      },
      secondary: {
        contributors: contributors.filter((c) => c.name !== 'Unknown'),
      },
    }
  } catch (error) {
    log.error('Failed to get welfare engine stats', error)
    throw error
  }
}

/**
 * Get skill view ranking
 *
 * @param limit - Maximum number of results (default: 10)
 * @param startDate - Start of the period (optional)
 * @param endDate - End of the period (optional)
 * @returns Array of skills ranked by view count
 */
export async function getSkillViewRanking(
  limit = 10,
  startDate?: Date,
  endDate?: Date
): Promise<SkillViewRanking[]> {
  try {
    const conditions = [
      eq(mcpAuditLogs.tool, 'get_plugin_content'),
      eq(mcpAuditLogs.responseStatus, 'success'),
      sql`${mcpAuditLogs.requestParams}->'params'->'arguments'->>'pluginId' IS NOT NULL`,
    ]

    if (startDate) {
      conditions.push(gte(mcpAuditLogs.createdAt, startDate))
    }
    if (endDate) {
      conditions.push(lte(mcpAuditLogs.createdAt, endDate))
    }

    const skillViews = await db
      .select({
        pluginId: sql<string>`${mcpAuditLogs.requestParams}->'params'->'arguments'->>'pluginId'`,
        count: count(),
      })
      .from(mcpAuditLogs)
      .where(and(...conditions))
      .groupBy(sql`${mcpAuditLogs.requestParams}->'params'->'arguments'->>'pluginId'`)
      .orderBy(desc(count()))
      .limit(limit)

    const rankingsRaw = await Promise.all(
      skillViews.map(async (view) => {
        const [item] = await db
          .select({
            id: catalogItems.id,
            name: catalogItems.name,
            type: catalogItems.type,
            authorId: catalogItems.authorId,
          })
          .from(catalogItems)
          .where(eq(catalogItems.id, view.pluginId))
          .limit(1)

        if (!item) return null

        let authorName: string | undefined
        if (item.authorId) {
          const [author] = await db
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, item.authorId))
            .limit(1)
          authorName = author?.name || undefined
        }

        return {
          id: view.pluginId,
          name: item.name,
          type: item.type,
          views: view.count,
          authorName,
        }
      })
    )

    return rankingsRaw.filter((r) => r !== null) as SkillViewRanking[]
  } catch (error) {
    log.error('Failed to get skill view ranking', error)
    throw error
  }
}

/**
 * Generate formatted weekly report text
 *
 * @param weekStart - Start date of the week (Monday)
 * @returns Formatted report text in Korean
 */
export async function generateWeeklyReport(weekStart: Date): Promise<string> {
  try {
    // Calculate week end (Sunday)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    // Get current week stats
    const currentStats = await getWelfareEngineStats(weekStart, weekEnd)

    // Get previous week stats for comparison
    const prevWeekStart = new Date(weekStart)
    prevWeekStart.setDate(prevWeekStart.getDate() - 7)
    const prevWeekEnd = new Date(weekEnd)
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 7)
    const prevStats = await getWelfareEngineStats(prevWeekStart, prevWeekEnd)

    // Calculate changes
    const skillChange = currentStats.accumulation.newSkills - prevStats.accumulation.newSkills
    const updateChange = currentStats.accumulation.newUpdates - prevStats.accumulation.newUpdates

    // Format dates
    const formatDate = (date: Date) => {
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${month}/${day}`
    }

    // Build report
    const lines: string[] = []
    lines.push(`📊 복리 엔진 주간 리포트 (${formatDate(weekStart)} ~ ${formatDate(weekEnd)})`)
    lines.push('')
    lines.push('[축적]')
    lines.push(
      `• 등록된 스킬: ${currentStats.accumulation.totalSkills}개 (${skillChange >= 0 ? '+' : ''}${skillChange})`
    )
    lines.push(`• 업데이트: ${currentStats.accumulation.newUpdates}건`)
    lines.push('')
    lines.push('[활용]')
    lines.push(`• 스킬 조회: ${currentStats.utilization.totalViews}회`)
    lines.push(`• 검색: ${currentStats.utilization.totalSearches}회`)

    // Top 3 skills
    const top3 = currentStats.utilization.topSkills.slice(0, 3)
    if (top3.length > 0) {
      const topText = top3.map((s, i) => `${['①', '②', '③'][i]}${s.name}`).join(' ')
      lines.push(`• TOP 3: ${topText}`)
    }

    lines.push('')
    lines.push('[품질]')
    lines.push(`• 성공률: ${currentStats.quality.successRate.toFixed(1)}%`)

    return lines.join('\n')
  } catch (error) {
    log.error('Failed to generate weekly report', error)
    throw error
  }
}

/**
 * Weekly stats entry for multi-week trend
 */
export interface WeeklyStats {
  weekStart: string
  weekEnd: string
  weekLabel: string
  newSkills: number
  newUpdates: number
  views: number
  searches: number
  successRate: number
}

/**
 * Get statistics for multiple weeks
 *
 * @param numWeeks - Number of weeks to retrieve (default: 8)
 * @returns Array of weekly statistics, most recent first
 */
export async function getMultiWeekStats(numWeeks = 8): Promise<WeeklyStats[]> {
  try {
    const results: WeeklyStats[] = []
    const now = new Date()
    
    for (let i = 0; i < numWeeks; i++) {
      const weekEnd = new Date(now)
      weekEnd.setDate(weekEnd.getDate() - (i * 7))
      const dayOfWeek = weekEnd.getDay()
      weekEnd.setDate(weekEnd.getDate() - dayOfWeek + (dayOfWeek === 0 ? 0 : 7))
      weekEnd.setHours(23, 59, 59, 999)
      
      const weekStart = new Date(weekEnd)
      weekStart.setDate(weekStart.getDate() - 6)
      weekStart.setHours(0, 0, 0, 0)
      
      const stats = await getWelfareEngineStats(weekStart, weekEnd)
      
      const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
      
      results.push({
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        weekLabel: `${formatDate(weekStart)} - ${formatDate(weekEnd)}`,
        newSkills: stats.accumulation.newSkills,
        newUpdates: stats.accumulation.newUpdates,
        views: stats.utilization.totalViews,
        searches: stats.utilization.totalSearches,
        successRate: stats.quality.successRate,
      })
    }
    
    return results
  } catch (error) {
    log.error('Failed to get multi-week stats', error)
    throw error
  }
}

/**
 * Get weekly comparison data
 *
 * @param weekStart - Start date of the current week
 * @returns Comparison between current and previous week
 */
export async function getWeeklyComparison(weekStart: Date): Promise<WeeklyComparison> {
  try {
    // Calculate week end (Sunday)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    // Get current week stats
    const current = await getWelfareEngineStats(weekStart, weekEnd)

    // Get previous week stats
    const prevWeekStart = new Date(weekStart)
    prevWeekStart.setDate(prevWeekStart.getDate() - 7)
    const prevWeekEnd = new Date(weekEnd)
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 7)
    const previous = await getWelfareEngineStats(prevWeekStart, prevWeekEnd)

    return {
      current,
      previous,
      changes: {
        skills: current.accumulation.newSkills - previous.accumulation.newSkills,
        updates: current.accumulation.newUpdates - previous.accumulation.newUpdates,
        views: current.utilization.totalViews - previous.utilization.totalViews,
        searches: current.utilization.totalSearches - previous.utilization.totalSearches,
      },
    }
  } catch (error) {
    log.error('Failed to get weekly comparison', error)
    throw error
  }
}
