import { NextRequest, NextResponse } from 'next/server'
import { db, authors } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { ApiErrors, requireAdminAuth, validateRequired, apiSuccess } from '@/lib/api-utils'
import { createLogger } from '@/lib/logger'

const log = createLogger('api:authors')

// GET /api/authors - List all authors
export async function GET() {
  try {
    const allAuthors = await db.select().from(authors).orderBy(authors.name)
    return NextResponse.json(allAuthors)
  } catch (error) {
    log.error('Failed to fetch authors', error)
    return ApiErrors.internalError('Failed to fetch authors')
  }
}

// POST /api/authors - Create a new author
export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    const body = await request.json()
    const { id, name, email, avatarUrl, bio } = body

    const validation = validateRequired(body, ['id', 'name'])
    if (!validation.valid) {
      return ApiErrors.badRequest(`Missing required fields: ${validation.missing.join(', ')}`)
    }

    // Check if author already exists
    const existing = await db.select().from(authors).where(eq(authors.id, id))
    if (existing.length > 0) {
      return ApiErrors.conflict('Author with this ID already exists')
    }

    const [newAuthor] = await db.insert(authors).values({
      id,
      name,
      email: email || null,
      avatarUrl: avatarUrl || null,
      bio: bio || null,
    }).returning()

    return apiSuccess(newAuthor, 201)
  } catch (error) {
    log.error('Failed to create author', error)
    return ApiErrors.internalError('Failed to create author')
  }
}
