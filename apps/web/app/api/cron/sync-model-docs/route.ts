/**
 * Vercel Cron endpoint for syncing AI model + SDK documentation (EDU-6875, EDU-6880)
 *
 * Runs daily at 17:00 UTC (02:00 KST).
 * 1. Model sync: Fetches latest model info from official provider pages
 * 2. SDK sync: Fetches SDK documentation from Context7 API
 */

import { NextRequest, NextResponse } from 'next/server'
import { syncModelDocs, syncSdkDocs } from '@gpters/lib/mcp'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET handler for model + SDK docs sync cron job
 *
 * Validates CRON_SECRET header, then runs both syncs sequentially.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Phase 1: Model mapping table sync
    const modelSummary = await syncModelDocs()

    // Phase 2: SDK documentation sync (Context7)
    const sdkSummary = await syncSdkDocs()

    return NextResponse.json({
      success: true,
      models: modelSummary,
      sdk: sdkSummary,
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
