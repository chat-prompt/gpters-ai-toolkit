/**
 * SDK Documentation API endpoint (EDU-6880, Phase 2)
 *
 * Returns AI SDK coding guidelines (install, API patterns, error handling)
 * for specified providers. Sourced from Context7 documentation.
 *
 * Authentication: Service token (RONA_SERVICE_TOKEN)
 * Rate limit: search preset (30 req/min)
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateServiceToken } from '@gpters/lib/security'
import { withRateLimit, RateLimitPresets } from '@gpters/lib/utils'
import { getSdkDocs, getAllSdkDocs } from '@gpters/lib/mcp'

export const dynamic = 'force-dynamic'

/**
 * GET /api/sdk-docs — Return SDK documentation
 *
 * Query params:
 * - provider: "anthropic" | "google" | "openai" (optional, returns all if omitted)
 * - section: filter to specific section (reserved, not yet implemented)
 *
 * Response:
 * Single provider: { provider, sdkDocs, updatedOn, lastSyncedAt }
 * All providers: { providers: [{ provider, sdkDocs, updatedOn, lastSyncedAt }] }
 */
export async function GET(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.search)
  if (rateLimitError) return rateLimitError

  const auth = validateServiceToken(request)
  if (!auth.authenticated) {
    return auth.error!
  }

  const provider = request.nextUrl.searchParams.get('provider')
  const section = request.nextUrl.searchParams.get('section') ?? undefined

  try {
    if (provider) {
      const data = await getSdkDocs(provider, section)
      if (!data) {
        return NextResponse.json(
          { error: `No SDK docs found for provider: ${provider}` },
          { status: 404 }
        )
      }
      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      })
    }

    // Return all providers
    const allDocs = await getAllSdkDocs()
    return NextResponse.json({ providers: allDocs }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to fetch SDK docs', details: message },
      { status: 500 }
    )
  }
}
