/**
 * Admin seed data API route
 *
 * POST: Seed database with initial tags and MCP servers
 * Requires ADMIN_SETTINGS permission
 */
import { NextRequest, NextResponse } from 'next/server'
import { db, tags, mcpServers } from '@/lib/db'
import { TAGS, MCP_SERVERS } from '@/lib/core/types'
import { ApiErrors, requirePermissionAsync, apiSuccess } from '@/lib/utils/api-utils'
import { Permissions } from '@/lib/security/rbac'
import { createLogger } from '@/lib/core/logger'

const log = createLogger('api:admin:seed')

/**
 * POST /api/admin/seed
 * Seeds the database with initial data from hardcoded constants
 */
export async function POST(request: NextRequest) {
  const authError = await requirePermissionAsync(Permissions.ADMIN_SETTINGS, request)
  if (authError) return authError

  try {
    const results = {
      tags: { created: 0, skipped: 0 },
      mcpServers: { created: 0, skipped: 0 },
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

    return apiSuccess({
      success: true,
      message: 'Database seeded successfully',
      results,
    })
  } catch (error) {
    log.error('Failed to seed database', error)
    return ApiErrors.internalError('Failed to seed database')
  }
}

/**
 * GET /api/admin/seed
 * Returns the current seed status (counts)
 */
export async function GET(request: NextRequest) {
  const authError = await requirePermissionAsync(Permissions.ADMIN_SETTINGS, request)
  if (authError) return authError

  try {
    const [tagCount, mcpCount] = await Promise.all([
      db.select().from(tags),
      db.select().from(mcpServers),
    ])

    return NextResponse.json({
      tags: tagCount.length,
      mcpServers: mcpCount.length,
      hardcodedTags: Object.keys(TAGS).length,
      hardcodedMcpServers: Object.keys(MCP_SERVERS).length,
    })
  } catch (error) {
    log.error('Failed to get seed status', error)
    return ApiErrors.internalError('Failed to seed status')
  }
}
