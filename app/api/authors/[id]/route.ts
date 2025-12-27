import { NextRequest, NextResponse } from 'next/server'
import { db, authors } from '@/lib/db'
import { eq } from 'drizzle-orm'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

function checkAdminAuth(request: NextRequest): boolean {
  const password = request.headers.get('x-admin-password')
  return password === ADMIN_PASSWORD
}

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/authors/[id] - Get a single author
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const [author] = await db.select().from(authors).where(eq(authors.id, id))

    if (!author) {
      return NextResponse.json({ error: 'Author not found' }, { status: 404 })
    }

    return NextResponse.json(author)
  } catch (error) {
    console.error('Failed to fetch author:', error)
    return NextResponse.json({ error: 'Failed to fetch author' }, { status: 500 })
  }
}

// PUT /api/authors/[id] - Update an author
export async function PUT(request: NextRequest, { params }: RouteParams) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { name, email, avatarUrl, bio } = body

    const [existing] = await db.select().from(authors).where(eq(authors.id, id))
    if (!existing) {
      return NextResponse.json({ error: 'Author not found' }, { status: 404 })
    }

    const [updated] = await db.update(authors)
      .set({
        name: name ?? existing.name,
        email: email !== undefined ? email : existing.email,
        avatarUrl: avatarUrl !== undefined ? avatarUrl : existing.avatarUrl,
        bio: bio !== undefined ? bio : existing.bio,
        updatedAt: new Date(),
      })
      .where(eq(authors.id, id))
      .returning()

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Failed to update author:', error)
    return NextResponse.json({ error: 'Failed to update author' }, { status: 500 })
  }
}

// DELETE /api/authors/[id] - Delete an author
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const [existing] = await db.select().from(authors).where(eq(authors.id, id))
    if (!existing) {
      return NextResponse.json({ error: 'Author not found' }, { status: 404 })
    }

    await db.delete(authors).where(eq(authors.id, id))
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete author:', error)
    return NextResponse.json({ error: 'Failed to delete author' }, { status: 500 })
  }
}
