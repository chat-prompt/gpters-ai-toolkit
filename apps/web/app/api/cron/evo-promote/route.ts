/**
 * Vercel Cron endpoint for EvoSkill Pareto selection
 *
 * Runs weekly on Monday at 08:00 UTC. Evaluates evo-generated
 * draft skills and auto-promotes or retires based on funnel metrics.
 */

import { NextRequest, NextResponse } from 'next/server'
import { evaluateEvoDrafts } from '@/lib/analytics'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await evaluateEvoDrafts()

    return NextResponse.json({
      success: true,
      promoted: result.promoted,
      retired: result.retired,
      held: result.held,
      decisions: result.decisions,
      errors: result.errors,
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
