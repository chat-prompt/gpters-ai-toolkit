/**
 * Admin API - MCP Audit Logs
 *
 * GET /api/admin/mcp-audit - Get audit summary
 * POST /api/admin/mcp-audit/cleanup - Trigger log cleanup
 */

import { NextRequest, NextResponse } from 'next/server'
import { ApiErrors, requirePermissionAsync } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { Permissions } from '@/lib/security/rbac'
import { getAuditSummary, cleanupOldAuditLogs } from '@/lib/security/mcp-audit'

const log = createLogger('api:admin:mcp-audit')

/**
 * GET - Get MCP audit summary
 * Query params:
 *   - days: Number of days to include (default: 7)
 */
export async function GET(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  const permissionError = await requirePermissionAsync(Permissions.CATALOG_VIEW, request)
  if (permissionError) return permissionError

  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '7', 10)

    // Validate days parameter
    if (isNaN(days) || days < 1 || days > 90) {
      return ApiErrors.badRequest('Days must be between 1 and 90')
    }

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const summary = await getAuditSummary(startDate)

    log.info('Audit summary requested', { days, totalRequests: summary.totalRequests })

    return NextResponse.json({
      success: true,
      period: {
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
        days,
      },
      summary,
    })
  } catch (error) {
    log.error('Failed to get audit summary', error)
    return ApiErrors.internalError('Failed to get audit summary')
  }
}

/**
 * POST - Trigger audit log cleanup
 * Removes logs older than 30 days (retention policy)
 */
export async function POST(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  const permissionError = await requirePermissionAsync(Permissions.CATALOG_EDIT, request)
  if (permissionError) return permissionError

  try {
    const result = await cleanupOldAuditLogs()

    log.info('Audit log cleanup completed', result)

    return NextResponse.json({
      success: true,
      message: 'Audit log cleanup completed',
      retentionDays: 30,
    })
  } catch (error) {
    log.error('Failed to cleanup audit logs', error)
    return ApiErrors.internalError('Failed to cleanup audit logs')
  }
}
