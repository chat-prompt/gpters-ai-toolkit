import { NextRequest, NextResponse } from 'next/server'
import { db, tags } from '@/lib/db'
import { eq } from 'drizzle-orm'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

function checkAdminAuth(request: NextRequest): boolean {
  const password = request.headers.get('x-admin-password')
  return password === ADMIN_PASSWORD
}

// GET /api/tags - List all tags
export async function GET() {
  try {
    const allTags = await db.select().from(tags).orderBy(tags.label)
    return NextResponse.json(allTags)
  } catch (error) {
    console.error('Failed to fetch tags:', error)
    return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 })
  }
}

// POST /api/tags - Create a new tag
export async function POST(request: NextRequest) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, label, color, description } = body

    if (!id || !label) {
      return NextResponse.json(
        { error: 'Missing required fields: id, label' },
        { status: 400 }
      )
    }

    // Check if tag already exists
    const existing = await db.select().from(tags).where(eq(tags.id, id))
    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Tag with this ID already exists' },
        { status: 409 }
      )
    }

    const [newTag] = await db.insert(tags).values({
      id,
      label,
      color: color || 'bg-gray-100 text-gray-800',
      description: description || null,
    }).returning()

    return NextResponse.json(newTag, { status: 201 })
  } catch (error) {
    console.error('Failed to create tag:', error)
    return NextResponse.json({ error: 'Failed to create tag' }, { status: 500 })
  }
}
