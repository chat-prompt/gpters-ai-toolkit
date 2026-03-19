/**
 * Vercel Cron endpoint for syncing AI model documentation (EDU-6875)
 *
 * Runs daily at 17:00 UTC (02:00 KST). Fetches latest model info from
 * Anthropic, Google, and OpenAI official pages and updates ai_model_docs table.
 *
 * SDK docs sync is handled separately by GitHub Actions + chub CLI (EDU-6880).
 */

import { NextRequest, NextResponse } from 'next/server'
import { syncModelDocs } from '@gpters/lib/mcp'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET handler for model docs sync cron job
 *
 * Validates CRON_SECRET header, then runs sync against official provider pages.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await syncModelDocs()

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
