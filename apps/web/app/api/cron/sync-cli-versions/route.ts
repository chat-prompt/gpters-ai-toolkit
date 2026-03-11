/**
 * Vercel Cron endpoint for syncing CLI tool versions via Context7 API
 *
 * Runs daily at 04:00 UTC. Checks latest versions of CLI tools
 * that have a context7_library_id and updates cli_tools.latest_version.
 *
 * DEV-3070
 */

import { NextRequest, NextResponse } from 'next/server'
import { syncCliToolVersions } from '@gpters/lib/mcp'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET handler for CLI tool version sync cron job
 *
 * Validates CRON_SECRET header, then runs version sync against Context7 API.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await syncCliToolVersions()

    return NextResponse.json({
      success: true,
      ...summary,
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
