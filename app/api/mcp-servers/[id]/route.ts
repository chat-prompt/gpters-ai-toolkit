import { NextRequest, NextResponse } from 'next/server'
import { db, mcpServers } from '@/lib/db'
import { eq } from 'drizzle-orm'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

function checkAdminAuth(request: NextRequest): boolean {
  const password = request.headers.get('x-admin-password')
  return password === ADMIN_PASSWORD
}

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/mcp-servers/[id] - Get a single MCP server
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const [server] = await db.select().from(mcpServers).where(eq(mcpServers.id, id))

    if (!server) {
      return NextResponse.json({ error: 'MCP server not found' }, { status: 404 })
    }

    return NextResponse.json(server)
  } catch (error) {
    console.error('Failed to fetch MCP server:', error)
    return NextResponse.json({ error: 'Failed to fetch MCP server' }, { status: 500 })
  }
}

// PUT /api/mcp-servers/[id] - Update an MCP server
export async function PUT(request: NextRequest, { params }: RouteParams) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { label, description, documentationUrl } = body

    const [existing] = await db.select().from(mcpServers).where(eq(mcpServers.id, id))
    if (!existing) {
      return NextResponse.json({ error: 'MCP server not found' }, { status: 404 })
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
    console.error('Failed to update MCP server:', error)
    return NextResponse.json({ error: 'Failed to update MCP server' }, { status: 500 })
  }
}

// DELETE /api/mcp-servers/[id] - Delete an MCP server
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const [existing] = await db.select().from(mcpServers).where(eq(mcpServers.id, id))
    if (!existing) {
      return NextResponse.json({ error: 'MCP server not found' }, { status: 404 })
    }

    await db.delete(mcpServers).where(eq(mcpServers.id, id))
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete MCP server:', error)
    return NextResponse.json({ error: 'Failed to delete MCP server' }, { status: 500 })
  }
}
