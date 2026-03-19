/**
 * AI Models API endpoint (EDU-6875)
 *
 * Returns latest AI model mapping table for all providers.
 * Consumed by Rona and other services for model name normalization.
 *
 * Authentication: Service token (RONA_SERVICE_TOKEN via validateServiceToken)
 * Rate limit: search preset (30 req/min)
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateServiceToken } from '@gpters/lib/security'
import { withRateLimit, RateLimitPresets } from '@gpters/lib/utils'
import { getLatestModels } from '@gpters/lib/mcp'

export const dynamic = 'force-dynamic'

/**
 * GET /api/models — Return latest AI model mapping table
 *
 * Response format:
 * {
 *   providers: [{ name, latestModels, apiIds, deprecated, updatedOn }],
 *   lastSyncedAt: ISO string
 * }
 */
export async function GET(request: NextRequest) {
  // Rate limit check
  const rateLimitError = withRateLimit(request, RateLimitPresets.search)
  if (rateLimitError) return rateLimitError

  // Service token authentication
  const auth = validateServiceToken(request)
  if (!auth.authenticated) {
    return auth.error!
  }

  try {
    const data = await getLatestModels()

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to fetch model data', details: message },
      { status: 500 }
    )
  }
}
