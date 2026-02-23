/**
 * MCP Session Finalizer
 *
 * Finalizes stale sessions by computing derived metrics
 * (duration, conversion flags, avg response time) and
 * cleans up old session records.
 */

import { db, mcpSessions, mcpAuditLogs } from '@gpters/db'
import { eq, and, lt, lte, sql } from 'drizzle-orm'
import { createLogger } from '../core/logger'

const log = createLogger('session-finalizer')

/**
 * Finalize a single session by computing derived metrics
 *
 * @param sessionId - Session to finalize
 */
export async function finalizeSession(sessionId: string): Promise<void> {
  try {
    // Compute avg response time from audit logs for this session
    const [avgResult] = await db
      .select({
        avg: sql<number>`AVG(${mcpAuditLogs.responseTime})`,
      })
      .from(mcpAuditLogs)
      .where(
        and(
          eq(mcpAuditLogs.sessionId, sessionId),
          sql`${mcpAuditLogs.responseTime} IS NOT NULL`
        )
      )

    const avgResponseTime = avgResult?.avg ? Math.round(avgResult.avg) : null

    // Update session with derived metrics and set status to finalized
    await db.execute(sql`
      UPDATE mcp_sessions SET
        duration_seconds = EXTRACT(EPOCH FROM (last_activity_at - started_at))::int,
        search_to_view_conversion = (had_search AND had_view),
        view_to_deploy_conversion = (had_view AND had_deployment),
        avg_response_time = ${avgResponseTime},
        status = 'finalized',
        updated_at = NOW()
      WHERE session_id = ${sessionId}
        AND status = 'active'
    `)

    log.debug('Session finalized', { sessionId })
  } catch (error) {
    log.error('Failed to finalize session', error, { sessionId })
  }
}

/**
 * Finalize all sessions that have been inactive beyond the timeout
 *
 * @param timeoutMinutes - Inactivity threshold in minutes (default: 30)
 * @returns Number of sessions finalized
 */
export async function finalizeStaleSessions(timeoutMinutes = 30): Promise<number> {
  const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000)

  try {
    // Find stale active sessions
    const staleSessions = await db
      .select({ sessionId: mcpSessions.sessionId })
      .from(mcpSessions)
      .where(
        and(
          eq(mcpSessions.status, 'active'),
          lte(mcpSessions.lastActivityAt, cutoff)
        )
      )
      .limit(500) // Process in batches

    if (staleSessions.length === 0) {
      log.info('No stale sessions to finalize')
      return 0
    }

    // Batch finalize using a single UPDATE with subquery for avg response time
    await db.execute(sql`
      UPDATE mcp_sessions SET
        duration_seconds = EXTRACT(EPOCH FROM (last_activity_at - started_at))::int,
        search_to_view_conversion = (had_search AND had_view),
        view_to_deploy_conversion = (had_view AND had_deployment),
        avg_response_time = sub.avg_rt,
        status = 'finalized',
        updated_at = NOW()
      FROM (
        SELECT
          s.session_id,
          COALESCE(AVG(a.response_time)::int, NULL) AS avg_rt
        FROM mcp_sessions s
        LEFT JOIN mcp_audit_logs a ON a.session_id = s.session_id AND a.response_time IS NOT NULL
        WHERE s.status = 'active'
          AND s.last_activity_at <= ${cutoff.toISOString()}::timestamptz
        GROUP BY s.session_id
        LIMIT 500
      ) sub
      WHERE mcp_sessions.session_id = sub.session_id
    `)

    log.info('Stale sessions finalized', { count: staleSessions.length })
    return staleSessions.length
  } catch (error) {
    log.error('Failed to finalize stale sessions', error)
    return 0
  }
}

/**
 * Delete session records older than the retention period
 *
 * @param retentionDays - Number of days to retain sessions (default: 90)
 * @returns Number of sessions deleted
 */
export async function cleanupOldSessions(retentionDays = 90): Promise<number> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retentionDays)

  try {
    const result = await db
      .delete(mcpSessions)
      .where(lt(mcpSessions.startedAt, cutoff))

    const deleted = (result as unknown as { rowCount?: number })?.rowCount ?? 0
    log.info('Old sessions cleaned up', { retentionDays, cutoffDate: cutoff.toISOString(), deleted })
    return deleted
  } catch (error) {
    log.error('Failed to cleanup old sessions', error)
    return 0
  }
}
