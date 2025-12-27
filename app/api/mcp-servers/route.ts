import { NextRequest, NextResponse } from 'next/server'
import { db, mcpServers } from '@/lib/db'
import { eq } from 'drizzle-orm'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

function checkAdminAuth(request: NextRequest): boolean {
  const password = request.headers.get('x-admin-password')
  return password === ADMIN_PASSWORD
}

// GET /api/mcp-servers - List all MCP servers
export async function GET() {
  try {
    const allServers = await db.select().from(mcpServers).orderBy(mcpServers.label)
    return NextResponse.json(allServers)
  } catch (error) {
    console.error('Failed to fetch MCP servers:', error)
    return NextResponse.json({ error: 'Failed to fetch MCP servers' }, { status: 500 })
  }
}

// POST /api/mcp-servers - Create a new MCP server
export async function POST(request: NextRequest) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, label, description, documentationUrl } = body

    if (!id || !label) {
      return NextResponse.json(
        { error: 'Missing required fields: id, label' },
        { status: 400 }
      )
    }

    // Check if MCP server already exists
    const existing = await db.select().from(mcpServers).where(eq(mcpServers.id, id))
    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'MCP server with this ID already exists' },
        { status: 409 }
      )
    }

    const [newServer] = await db.insert(mcpServers).values({
      id,
      label,
      description: description || '',
      documentationUrl: documentationUrl || null,
    }).returning()

    return NextResponse.json(newServer, { status: 201 })
  } catch (error) {
    console.error('Failed to create MCP server:', error)
    return NextResponse.json({ error: 'Failed to create MCP server' }, { status: 500 })
  }
}
