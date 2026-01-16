/**
 * Admin performance metrics API route
 *
 * Provides performance monitoring data including response times,
 * aggregated metrics, and raw metric records for admin dashboard.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPerformanceSummary, getAggregatedMetrics, getMetrics, formatDuration } from '@/lib/utils/performance'
import { requirePermissionAsync } from '@/lib/utils/api-utils'
import { Permissions } from '@/lib/security/rbac'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'

/**
 * GET /api/admin/performance
 *
 * Returns performance metrics and summary.
 * Requires viewer permission or higher.
 */
export async function GET(request: NextRequest) {
  // Rate limit
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  // Check permission (viewer can access)
  const permissionError = await requirePermissionAsync(Permissions.ADMIN_VIEW, request)
  if (permissionError) return permissionError

  try {
    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') || 'summary'
    const type = searchParams.get('type') || undefined
    const name = searchParams.get('name') || undefined
    const since = searchParams.get('since')
      ? parseInt(searchParams.get('since')!, 10)
      : undefined
    const limit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!, 10)
      : 100

    switch (view) {
      case 'summary': {
        const summary = getPerformanceSummary()
        return NextResponse.json({
          success: true,
          data: {
            ...summary,
            avgResponseTimeFormatted: formatDuration(summary.avgResponseTime),
            byType: Object.fromEntries(
              Object.entries(summary.byType).map(([key, value]) => [
                key,
                {
                  ...value,
                  avgDurationFormatted: formatDuration(value.avgDuration),
                },
              ])
            ),
          },
        })
      }

      case 'aggregated': {
        const aggregated = getAggregatedMetrics({ type, name, since })
        return NextResponse.json({
          success: true,
          data: aggregated.map((m) => ({
            ...m,
            avgDurationFormatted: formatDuration(m.avgDuration),
            minDurationFormatted: formatDuration(m.minDuration),
            maxDurationFormatted: formatDuration(m.maxDuration),
            p50DurationFormatted: formatDuration(m.p50Duration),
            p95DurationFormatted: formatDuration(m.p95Duration),
            p99DurationFormatted: formatDuration(m.p99Duration),
            successRate: ((m.successCount / m.count) * 100).toFixed(1) + '%',
          })),
        })
      }

      case 'raw': {
        const metrics = getMetrics({ type, name, since, limit })
        return NextResponse.json({
          success: true,
          data: metrics.map((m) => ({
            ...m,
            durationFormatted: formatDuration(m.duration),
          })),
        })
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid view parameter' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Failed to fetch performance metrics', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch performance metrics' },
      { status: 500 }
    )
  }
}
