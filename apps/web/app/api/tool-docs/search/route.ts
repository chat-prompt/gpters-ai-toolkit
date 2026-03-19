/**
 * Tool Documentation Search API (EDU-6881, Phase 3)
 *
 * Searches cli_tools by name/tags for tool documentation.
 * Used by Rona's chat research phase (replaces Context7 search).
 *
 * Authentication: Service token (RONA_SERVICE_TOKEN)
 * Rate limit: search preset (30 req/min)
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateServiceToken } from '@gpters/lib/security'
import { withRateLimit, RateLimitPresets } from '@gpters/lib/utils'
import { db, cliTools } from '@gpters/db'
import { sql, isNotNull } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

/**
 * GET /api/tool-docs/search?q=nextjs — Search tools by name
 *
 * Returns matching tools with name, description, installCommand, hasRawDocs.
 */
export async function GET(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.search)
  if (rateLimitError) return rateLimitError

  const auth = validateServiceToken(request)
  if (!auth.authenticated) {
    return auth.error!
  }

  const query = request.nextUrl.searchParams.get('q')
  if (!query || query.length < 2) {
    return NextResponse.json(
      { error: 'Query parameter "q" is required (min 2 chars)' },
      { status: 400 },
    )
  }

  const normalized = query.toLowerCase().trim()

  const rows = await db
    .select({
      id: cliTools.id,
      name: cliTools.name,
      installCommand: cliTools.installCommand,
      latestVersion: cliTools.latestVersion,
      relatedTags: cliTools.relatedTags,
      hasRawDocs: sql<boolean>`${cliTools.rawDocs} IS NOT NULL`.as('has_raw_docs'),
    })
    .from(cliTools)
    .where(
      sql`lower(${cliTools.name}) LIKE ${'%' + normalized + '%'}
        OR ${cliTools.id} LIKE ${'%' + normalized + '%'}
        OR EXISTS (
          SELECT 1 FROM unnest(${cliTools.relatedTags}) AS tag
          WHERE lower(tag) LIKE ${'%' + normalized + '%'}
        )`,
    )
    .limit(5)

  return NextResponse.json({
    results: rows.map((r) => ({
      id: r.id,
      name: r.name,
      installCommand: r.installCommand,
      latestVersion: r.latestVersion,
      relatedTags: r.relatedTags,
      hasRawDocs: r.hasRawDocs,
    })),
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
