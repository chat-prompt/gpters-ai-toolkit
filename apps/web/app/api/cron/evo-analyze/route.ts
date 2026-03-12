/**
 * Vercel Cron endpoint for EvoSkill failure pattern analysis
 *
 * Runs daily at 06:00 UTC. Detects zero-result clusters,
 * low-conversion skills, and repeatedly skipped skills.
 */

import { NextRequest, NextResponse } from 'next/server'
import { analyzeFailurePatterns } from '@/lib/analytics'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await analyzeFailurePatterns()

    return NextResponse.json({
      success: true,
      ...result,
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
