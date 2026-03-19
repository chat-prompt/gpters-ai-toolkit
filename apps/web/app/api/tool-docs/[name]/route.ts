/**
 * Tool Documentation API endpoint (EDU-6881, Phase 3)
 *
 * Returns SDK/API documentation for a specific tool from cli_tools.rawDocs.
 * Sourced from chub CLI documentation.
 *
 * Authentication: Service token (RONA_SERVICE_TOKEN)
 * Rate limit: search preset (30 req/min)
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateServiceToken } from '@gpters/lib/security'
import { withRateLimit, RateLimitPresets } from '@gpters/lib/utils'
import { db, cliTools } from '@gpters/db'
import { eq, or, sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

/**
 * GET /api/tool-docs/:name — Return tool documentation by name
 *
 * Looks up cli_tools by id or name, returns rawDocs + metadata.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.search)
  if (rateLimitError) return rateLimitError

  const auth = validateServiceToken(request)
  if (!auth.authenticated) {
    return auth.error!
  }

  const { name } = await params
  const normalized = name.toLowerCase().trim()

  const rows = await db
    .select({
      id: cliTools.id,
      name: cliTools.name,
      installCommand: cliTools.installCommand,
      latestVersion: cliTools.latestVersion,
      rawDocs: cliTools.rawDocs,
      relatedTags: cliTools.relatedTags,
    })
    .from(cliTools)
    .where(
      or(
        eq(cliTools.id, normalized),
        sql`lower(${cliTools.name}) = ${normalized}`,
      ),
    )
    .limit(1)

  if (rows.length === 0 || !rows[0].rawDocs) {
    return NextResponse.json(
      { error: `No docs found for tool: ${name}` },
      { status: 404 },
    )
  }

  const tool = rows[0]

  return NextResponse.json({
    name: tool.name,
    installCommand: tool.installCommand,
    latestVersion: tool.latestVersion,
    rawDocs: tool.rawDocs,
    relatedTags: tool.relatedTags,
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
