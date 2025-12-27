import { NextRequest, NextResponse } from 'next/server'
import { db, tags, mcpServers, authors } from '@/lib/db'
import { TAGS, MCP_SERVERS } from '@/lib/types'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

function checkAdminAuth(request: NextRequest): boolean {
  const password = request.headers.get('x-admin-password')
  return password === ADMIN_PASSWORD
}

/**
 * POST /api/admin/seed
 * Seeds the database with initial data from hardcoded constants
 */
export async function POST(request: NextRequest) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = {
      tags: { created: 0, skipped: 0 },
      mcpServers: { created: 0, skipped: 0 },
      authors: { created: 0, skipped: 0 },
    }

    // Seed Tags from TAGS constant
    for (const [id, tag] of Object.entries(TAGS)) {
      try {
        await db.insert(tags).values({
          id,
          label: tag.label,
          color: tag.color,
          description: null,
        }).onConflictDoNothing()
        results.tags.created++
      } catch {
        results.tags.skipped++
      }
    }

    // Seed MCP Servers from MCP_SERVERS constant
    for (const [id, server] of Object.entries(MCP_SERVERS)) {
      try {
        await db.insert(mcpServers).values({
          id,
          label: server.label,
          description: server.description,
          documentationUrl: null,
        }).onConflictDoNothing()
        results.mcpServers.created++
      } catch {
        results.mcpServers.skipped++
      }
    }

    // Seed default authors (extract from existing catalog items)
    const defaultAuthors = [
      { id: 'platform-team', name: '플랫폼팀' },
      { id: 'ai-team', name: 'AI팀' },
      { id: 'anonymous', name: 'Anonymous' },
    ]

    for (const author of defaultAuthors) {
      try {
        await db.insert(authors).values({
          id: author.id,
          name: author.name,
          email: null,
          avatarUrl: null,
          bio: null,
        }).onConflictDoNothing()
        results.authors.created++
      } catch {
        results.authors.skipped++
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Database seeded successfully',
      results,
    })
  } catch (error) {
    console.error('Failed to seed database:', error)
    return NextResponse.json(
      { error: 'Failed to seed database', details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/seed
 * Returns the current seed status (counts)
 */
export async function GET(request: NextRequest) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [tagCount, authorCount, mcpCount] = await Promise.all([
      db.select().from(tags),
      db.select().from(authors),
      db.select().from(mcpServers),
    ])

    return NextResponse.json({
      tags: tagCount.length,
      authors: authorCount.length,
      mcpServers: mcpCount.length,
      hardcodedTags: Object.keys(TAGS).length,
      hardcodedMcpServers: Object.keys(MCP_SERVERS).length,
    })
  } catch (error) {
    console.error('Failed to get seed status:', error)
    return NextResponse.json(
      { error: 'Failed to get seed status', details: String(error) },
      { status: 500 }
    )
  }
}
