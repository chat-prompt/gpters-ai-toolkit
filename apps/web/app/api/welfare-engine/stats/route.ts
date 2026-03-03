import { NextRequest, NextResponse } from 'next/server'
import { ApiErrors, requirePermissionAsync } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { Permissions } from '@/lib/security/rbac'
import {
  getWelfareEngineStats,
  getSkillViewRanking,
  generateWeeklyReport,
  getWeeklyComparison,
  getMultiWeekStats,
} from '@/lib/features/welfare-engine'

const log = createLogger('api:welfare-engine:stats')

type Period = '7d' | '30d' | '90d' | 'custom'

function getPeriodDates(period: Period, customStart?: string, customEnd?: string) {
  const now = new Date()
  let startDate: Date
  let endDate = now

  switch (period) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      break
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      break
    case 'custom':
      if (!customStart) {
        throw new Error('customStart is required for custom period')
      }
      startDate = new Date(customStart)
      if (customEnd) {
        endDate = new Date(customEnd)
      }
      break
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  }

  return { startDate, endDate }
}

function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  // Check RBAC permission
  const permissionError = await requirePermissionAsync(Permissions.CATALOG_VIEW, request)
  if (permissionError) return permissionError

  try {
    const { searchParams } = new URL(request.url)
    const period = (searchParams.get('period') || '30d') as Period
    const format = searchParams.get('format') || 'json'
    const customStart = searchParams.get('startDate') || undefined
    const customEnd = searchParams.get('endDate') || undefined
    const weeklyReport = searchParams.get('weeklyReport') === 'true'

    const weeklyTrend = searchParams.get('weeklyTrend') === 'true'
    const numWeeks = parseInt(searchParams.get('numWeeks') || '8', 10)

    if (weeklyTrend) {
      const weeks = await getMultiWeekStats(Math.min(numWeeks, 12))
      return NextResponse.json({ weeks })
    }

    if (weeklyReport) {
      const weekStartParam = searchParams.get('weekStart')
      const weekStart = weekStartParam ? new Date(weekStartParam) : getWeekStart()

      if (format === 'text') {
        const reportText = await generateWeeklyReport(weekStart)
        return new NextResponse(reportText, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
          },
        })
      }

      const comparison = await getWeeklyComparison(weekStart)
      return NextResponse.json({
        weekStart: weekStart.toISOString(),
        ...comparison,
      })
    }

    const { startDate, endDate } = getPeriodDates(period, customStart, customEnd)

    const [stats, skillRanking] = await Promise.all([
      getWelfareEngineStats(startDate, endDate),
      getSkillViewRanking(10, startDate, endDate),
    ])

    const response = {
      period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      metrics: stats,
      rankings: {
        skills: skillRanking,
        contributors: stats.secondary.contributors,
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    log.error('Failed to fetch welfare engine stats', error)
    return ApiErrors.internalError('Failed to fetch welfare engine statistics')
  }
}
