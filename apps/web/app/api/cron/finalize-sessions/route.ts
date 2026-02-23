/**
 * Vercel Cron endpoint for finalizing stale MCP sessions
 *
 * Runs daily at 03:00 UTC. Finalizes inactive sessions and
 * cleans up records older than the retention period.
 */

import { NextRequest, NextResponse } from 'next/server'
import { finalizeStaleSessions, cleanupOldSessions } from '@/lib/analytics'

export const dynamic = 'force-dynamic'

/**
 * GET handler for cron job execution
 *
 * Validates CRON_SECRET header, then runs session finalization and cleanup.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [finalized, deleted] = await Promise.all([
      finalizeStaleSessions(30),
      cleanupOldSessions(90),
    ])

    return NextResponse.json({
      success: true,
      finalized,
      deleted,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
