/**
 * Vercel Cron endpoint for EvoSkill skill generation
 *
 * Runs daily at 07:00 UTC. Processes pending failure patterns
 * using Gemini Flash to generate skill drafts or improvement suggestions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateFromPatterns } from '@/lib/analytics'
import { notifySlackEvoAction } from '@gpters/lib/notifications'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await generateFromPatterns()

    await notifySlackEvoAction({
      skillsCreated: result.skillsCreated,
      suggestionsCreated: result.suggestionsCreated,
      processed: result.processed,
      errors: result.errors,
    })

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
