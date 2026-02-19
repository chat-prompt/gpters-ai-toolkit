/**
 * Discovery Analysis API endpoint
 *
 * Provides analytics reports on skill search/recommendation effectiveness.
 * Analyzes search behavior, recommendation accuracy, usage gaps, and funnel conversion.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db, mcpAuditLogs, catalogItems } from '@gpters/db'
import { sql, eq, and, gte, isNotNull, count } from 'drizzle-orm'
import { auth } from '@/lib/core/auth'

export const dynamic = 'force-dynamic'

/** Valid report types */
type ReportType = 'search-effectiveness' | 'recommendation-accuracy' | 'usage-gaps' | 'funnel' | 'full'

/**
 * Search effectiveness report: query-level click rates, zero-click searches, popular queries
 */
async function getSearchEffectiveness(since: Date) {
  // Top search queries with click-through analysis
  const searchLogs = await db
    .select({
      query: sql<string>`${mcpAuditLogs.requestParams}->>'query'`,
      searchCount: count(),
      withResults: sql<number>`COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(${mcpAuditLogs.searchResults}, '[]'::jsonb)) > 0)`,
    })
    .from(mcpAuditLogs)
    .where(
      and(
        eq(mcpAuditLogs.tool, 'semantic_search'),
        eq(mcpAuditLogs.responseStatus, 'success'),
        gte(mcpAuditLogs.createdAt, since)
      )
    )
    .groupBy(sql`${mcpAuditLogs.requestParams}->>'query'`)
    .orderBy(sql`count(*) DESC`)
    .limit(50)

  // Count get_plugin_content calls that followed searches (referralSource = 'search' or 'suggest')
  const clickThroughs = await db
    .select({
      total: count(),
      fromSearch: sql<number>`COUNT(*) FILTER (WHERE ${mcpAuditLogs.referralSource} = 'search')`,
      fromSuggest: sql<number>`COUNT(*) FILTER (WHERE ${mcpAuditLogs.referralSource} = 'suggest')`,
    })
    .from(mcpAuditLogs)
    .where(
      and(
        eq(mcpAuditLogs.tool, 'get_plugin_content'),
        eq(mcpAuditLogs.responseStatus, 'success'),
        gte(mcpAuditLogs.createdAt, since),
        isNotNull(mcpAuditLogs.referralSource)
      )
    )

  // Total searches for rate calculation
  const [totalSearches] = await db
    .select({ count: count() })
    .from(mcpAuditLogs)
    .where(
      and(
        eq(mcpAuditLogs.tool, 'semantic_search'),
        eq(mcpAuditLogs.responseStatus, 'success'),
        gte(mcpAuditLogs.createdAt, since)
      )
    )

  const totalViews = clickThroughs[0]?.total || 0
  const totalSearchCount = totalSearches?.count || 0

  return {
    reportType: 'search-effectiveness',
    period: { since: since.toISOString() },
    summary: {
      totalSearches: totalSearchCount,
      totalViewsFromSearch: totalViews,
      overallClickRate: totalSearchCount > 0 ? Math.round((totalViews / totalSearchCount) * 100) / 100 : 0,
      fromSearchCount: clickThroughs[0]?.fromSearch || 0,
      fromSuggestCount: clickThroughs[0]?.fromSuggest || 0,
    },
    topQueries: searchLogs.map((row) => ({
      query: row.query,
      searchCount: row.searchCount,
      withResults: Number(row.withResults),
      zeroResultRate: row.searchCount > 0
        ? Math.round(((row.searchCount - Number(row.withResults)) / row.searchCount) * 100) / 100
        : 0,
    })),
  }
}

/**
 * Recommendation accuracy report: skill-suggest conversion rates
 */
async function getRecommendationAccuracy(since: Date) {
  // Weekly suggest searches
  const weeklyStats = await db
    .select({
      week: sql<string>`date_trunc('week', ${mcpAuditLogs.createdAt})::text`,
      suggestSearches: count(),
    })
    .from(mcpAuditLogs)
    .where(
      and(
        eq(mcpAuditLogs.tool, 'semantic_search'),
        eq(mcpAuditLogs.referralSource, 'suggest'),
        eq(mcpAuditLogs.responseStatus, 'success'),
        gte(mcpAuditLogs.createdAt, since)
      )
    )
    .groupBy(sql`date_trunc('week', ${mcpAuditLogs.createdAt})`)
    .orderBy(sql`date_trunc('week', ${mcpAuditLogs.createdAt})`)

  // Weekly views from suggest
  const weeklyViews = await db
    .select({
      week: sql<string>`date_trunc('week', ${mcpAuditLogs.createdAt})::text`,
      views: count(),
    })
    .from(mcpAuditLogs)
    .where(
      and(
        eq(mcpAuditLogs.tool, 'get_plugin_content'),
        eq(mcpAuditLogs.referralSource, 'suggest'),
        eq(mcpAuditLogs.responseStatus, 'success'),
        gte(mcpAuditLogs.createdAt, since)
      )
    )
    .groupBy(sql`date_trunc('week', ${mcpAuditLogs.createdAt})`)
    .orderBy(sql`date_trunc('week', ${mcpAuditLogs.createdAt})`)

  const viewsByWeek = new Map(weeklyViews.map((v) => [v.week, v.views]))

  return {
    reportType: 'recommendation-accuracy',
    period: { since: since.toISOString() },
    weeklyTrends: weeklyStats.map((row) => {
      const views = viewsByWeek.get(row.week) || 0
      return {
        week: row.week,
        suggestSearches: row.suggestSearches,
        viewsFromSuggest: views,
        conversionRate: row.suggestSearches > 0
          ? Math.round((views / row.suggestSearches) * 100) / 100
          : 0,
      }
    }),
  }
}

/**
 * Usage gaps report: skills with low or zero search exposure
 */
async function getUsageGaps(since: Date) {
  // Get all published skills
  const allSkills = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      type: catalogItems.type,
    })
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.mcpEnabled, true),
        eq(catalogItems.status, 'published')
      )
    )

  // Get skills that appeared in search results
  const exposedSkills = await db
    .select({
      itemId: sql<string>`elem->>'itemId'`,
      exposureCount: count(),
    })
    .from(mcpAuditLogs)
    .where(
      and(
        eq(mcpAuditLogs.tool, 'semantic_search'),
        eq(mcpAuditLogs.responseStatus, 'success'),
        gte(mcpAuditLogs.createdAt, since),
        isNotNull(mcpAuditLogs.searchResults)
      )
    )
    .innerJoin(
      sql`jsonb_array_elements(${mcpAuditLogs.searchResults}) AS elem`,
      sql`true`
    )
    .groupBy(sql`elem->>'itemId'`)

  // Get skills that were viewed
  const viewedSkills = await db
    .select({
      pluginId: sql<string>`${mcpAuditLogs.requestParams}->'arguments'->>'pluginId'`,
      viewCount: count(),
    })
    .from(mcpAuditLogs)
    .where(
      and(
        eq(mcpAuditLogs.tool, 'get_plugin_content'),
        eq(mcpAuditLogs.responseStatus, 'success'),
        gte(mcpAuditLogs.createdAt, since)
      )
    )
    .groupBy(sql`${mcpAuditLogs.requestParams}->'arguments'->>'pluginId'`)

  const exposureMap = new Map(exposedSkills.map((s) => [s.itemId, s.exposureCount]))
  const viewMap = new Map(viewedSkills.map((s) => [s.pluginId, s.viewCount]))

  const skillStats = allSkills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    type: skill.type,
    searchExposures: exposureMap.get(skill.id) || 0,
    views: viewMap.get(skill.id) || 0,
  }))

  const neverExposed = skillStats.filter((s) => s.searchExposures === 0)
  const lowView = skillStats.filter((s) => s.searchExposures > 0 && s.views === 0)

  return {
    reportType: 'usage-gaps',
    period: { since: since.toISOString() },
    summary: {
      totalPublishedSkills: allSkills.length,
      neverExposedCount: neverExposed.length,
      exposedButNeverViewedCount: lowView.length,
    },
    neverExposed: neverExposed.map((s) => ({ id: s.id, name: s.name, type: s.type })),
    exposedButNeverViewed: lowView.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      searchExposures: s.searchExposures,
    })),
    allSkillStats: skillStats.sort((a, b) => b.views - a.views),
  }
}

/**
 * Funnel report: session-based search → view conversion
 */
async function getFunnelAnalysis(since: Date) {
  // Sessions with at least one search
  const [searchSessions] = await db
    .select({
      count: sql<number>`COUNT(DISTINCT ${mcpAuditLogs.sessionId})`,
    })
    .from(mcpAuditLogs)
    .where(
      and(
        eq(mcpAuditLogs.tool, 'semantic_search'),
        eq(mcpAuditLogs.responseStatus, 'success'),
        gte(mcpAuditLogs.createdAt, since),
        isNotNull(mcpAuditLogs.sessionId)
      )
    )

  // Sessions that also viewed a plugin
  const [viewSessions] = await db
    .select({
      count: sql<number>`COUNT(DISTINCT ${mcpAuditLogs.sessionId})`,
    })
    .from(mcpAuditLogs)
    .where(
      and(
        eq(mcpAuditLogs.tool, 'get_plugin_content'),
        eq(mcpAuditLogs.responseStatus, 'success'),
        gte(mcpAuditLogs.createdAt, since),
        isNotNull(mcpAuditLogs.sessionId),
        isNotNull(mcpAuditLogs.referralSource)
      )
    )

  const searchCount = Number(searchSessions?.count || 0)
  const viewCount = Number(viewSessions?.count || 0)

  return {
    reportType: 'funnel',
    period: { since: since.toISOString() },
    funnel: {
      searchSessions: searchCount,
      viewSessions: viewCount,
      searchToViewRate: searchCount > 0
        ? Math.round((viewCount / searchCount) * 100) / 100
        : 0,
    },
    note: 'Installation tracking is not yet active. Install step will be added when enabled.',
  }
}

/**
 * GET /api/discovery-analysis?reportType=full&days=30
 *
 * Requires admin authentication.
 */
export async function GET(request: NextRequest) {
  // Auth check
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const reportType = (searchParams.get('reportType') || 'full') as ReportType
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10), 1), 90)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const validTypes: ReportType[] = ['search-effectiveness', 'recommendation-accuracy', 'usage-gaps', 'funnel', 'full']
  if (!validTypes.includes(reportType)) {
    return NextResponse.json(
      { error: `Invalid reportType. Valid: ${validTypes.join(', ')}` },
      { status: 400 }
    )
  }

  try {
    if (reportType === 'full') {
      const [searchEff, recAcc, gaps, funnel] = await Promise.all([
        getSearchEffectiveness(since),
        getRecommendationAccuracy(since),
        getUsageGaps(since),
        getFunnelAnalysis(since),
      ])

      return NextResponse.json({
        reportType: 'full',
        generatedAt: new Date().toISOString(),
        period: { since: since.toISOString(), days },
        searchEffectiveness: searchEff,
        recommendationAccuracy: recAcc,
        usageGaps: gaps,
        funnel,
      })
    }

    let report
    switch (reportType) {
      case 'search-effectiveness':
        report = await getSearchEffectiveness(since)
        break
      case 'recommendation-accuracy':
        report = await getRecommendationAccuracy(since)
        break
      case 'usage-gaps':
        report = await getUsageGaps(since)
        break
      case 'funnel':
        report = await getFunnelAnalysis(since)
        break
    }

    return NextResponse.json({
      ...report,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
