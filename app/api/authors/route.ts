import { NextRequest, NextResponse } from 'next/server'
import { db, authors } from '@/lib/db'
import { eq } from 'drizzle-orm'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

function checkAdminAuth(request: NextRequest): boolean {
  const password = request.headers.get('x-admin-password')
  return password === ADMIN_PASSWORD
}

// GET /api/authors - List all authors
export async function GET() {
  try {
    const allAuthors = await db.select().from(authors).orderBy(authors.name)
    return NextResponse.json(allAuthors)
  } catch (error) {
    console.error('Failed to fetch authors:', error)
    return NextResponse.json({ error: 'Failed to fetch authors' }, { status: 500 })
  }
}

// POST /api/authors - Create a new author
export async function POST(request: NextRequest) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, name, email, avatarUrl, bio } = body

    if (!id || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: id, name' },
        { status: 400 }
      )
    }

    // Check if author already exists
    const existing = await db.select().from(authors).where(eq(authors.id, id))
    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Author with this ID already exists' },
        { status: 409 }
      )
    }

    const [newAuthor] = await db.insert(authors).values({
      id,
      name,
      email: email || null,
      avatarUrl: avatarUrl || null,
      bio: bio || null,
    }).returning()

    return NextResponse.json(newAuthor, { status: 201 })
  } catch (error) {
    console.error('Failed to create author:', error)
    return NextResponse.json({ error: 'Failed to create author' }, { status: 500 })
  }
}
