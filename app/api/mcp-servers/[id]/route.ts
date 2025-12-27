import { NextRequest, NextResponse } from 'next/server'
import { db, mcpServers } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { ApiErrors, requireAdminAuth, apiSuccess } from '@/lib/api-utils'
import { createLogger } from '@/lib/logger'

const log = createLogger('api:mcp-servers')

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/mcp-servers/[id] - Get a single MCP server
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const [server] = await db.select().from(mcpServers).where(eq(mcpServers.id, id))

    if (!server) {
      return ApiErrors.notFound('MCP server')
    }

    return NextResponse.json(server)
  } catch (error) {
    log.error('Failed to fetch MCP server', error)
    return ApiErrors.internalError('Failed to fetch MCP server')
  }
}

// PUT /api/mcp-servers/[id] - Update an MCP server
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    const { id } = await params
    const body = await request.json()
    const { label, description, documentationUrl } = body

    const [existing] = await db.select().from(mcpServers).where(eq(mcpServers.id, id))
    if (!existing) {
      return ApiErrors.notFound('MCP server')
    }

    const [updated] = await db.update(mcpServers)
      .set({
        label: label ?? existing.label,
        description: description !== undefined ? description : existing.description,
        documentationUrl: documentationUrl !== undefined ? documentationUrl : existing.documentationUrl,
        updatedAt: new Date(),
      })
      .where(eq(mcpServers.id, id))
      .returning()

    return NextResponse.json(updated)
  } catch (error) {
    log.error('Failed to update MCP server', error)
    return ApiErrors.internalError('Failed to update MCP server')
  }
}

// DELETE /api/mcp-servers/[id] - Delete an MCP server
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    const { id } = await params
    const [existing] = await db.select().from(mcpServers).where(eq(mcpServers.id, id))
    if (!existing) {
      return ApiErrors.notFound('MCP server')
    }

    await db.delete(mcpServers).where(eq(mcpServers.id, id))
    return apiSuccess({ success: true })
  } catch (error) {
    log.error('Failed to delete MCP server', error)
    return ApiErrors.internalError('Failed to delete MCP server')
  }
}
