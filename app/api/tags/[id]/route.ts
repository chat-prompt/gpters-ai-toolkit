import { NextRequest, NextResponse } from 'next/server'
import { db, tags } from '@/lib/db'
import { eq } from 'drizzle-orm'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

function checkAdminAuth(request: NextRequest): boolean {
  const password = request.headers.get('x-admin-password')
  return password === ADMIN_PASSWORD
}

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/tags/[id] - Get a single tag
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const [tag] = await db.select().from(tags).where(eq(tags.id, id))

    if (!tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }

    return NextResponse.json(tag)
  } catch (error) {
    console.error('Failed to fetch tag:', error)
    return NextResponse.json({ error: 'Failed to fetch tag' }, { status: 500 })
  }
}

// PUT /api/tags/[id] - Update a tag
export async function PUT(request: NextRequest, { params }: RouteParams) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { label, color, description } = body

    const [existing] = await db.select().from(tags).where(eq(tags.id, id))
    if (!existing) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }

    const [updated] = await db.update(tags)
      .set({
        label: label ?? existing.label,
        color: color ?? existing.color,
        description: description !== undefined ? description : existing.description,
        updatedAt: new Date(),
      })
      .where(eq(tags.id, id))
      .returning()

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Failed to update tag:', error)
    return NextResponse.json({ error: 'Failed to update tag' }, { status: 500 })
  }
}

// DELETE /api/tags/[id] - Delete a tag
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const [existing] = await db.select().from(tags).where(eq(tags.id, id))
    if (!existing) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }

    await db.delete(tags).where(eq(tags.id, id))
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete tag:', error)
    return NextResponse.json({ error: 'Failed to delete tag' }, { status: 500 })
  }
}
