import { NextRequest, NextResponse } from 'next/server'
import { db, mcpServers } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { ApiErrors, requireAdminAuth, validateRequired, apiSuccess } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'

const log = createLogger('api:mcp-servers')

// GET /api/mcp-servers - List all MCP servers
export async function GET() {
  try {
    const allServers = await db.select().from(mcpServers).orderBy(mcpServers.label)
    return NextResponse.json(allServers)
  } catch (error) {
    log.error('Failed to fetch MCP servers', error)
    return ApiErrors.internalError('Failed to fetch MCP servers')
  }
}

// POST /api/mcp-servers - Create a new MCP server
export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    const body = await request.json()
    const { id, label, description, documentationUrl } = body

    const validation = validateRequired(body, ['id', 'label'])
    if (!validation.valid) {
      return ApiErrors.badRequest(`Missing required fields: ${validation.missing.join(', ')}`)
    }

    // Check if MCP server already exists
    const existing = await db.select().from(mcpServers).where(eq(mcpServers.id, id))
    if (existing.length > 0) {
      return ApiErrors.conflict('MCP server with this ID already exists')
    }

    const [newServer] = await db.insert(mcpServers).values({
      id,
      label,
      description: description || '',
      documentationUrl: documentationUrl || null,
    }).returning()

    return apiSuccess(newServer, 201)
  } catch (error) {
    log.error('Failed to create MCP server', error)
    return ApiErrors.internalError('Failed to create MCP server')
  }
}
