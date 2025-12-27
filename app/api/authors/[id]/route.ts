import { NextRequest, NextResponse } from 'next/server'
import { db, authors } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { ApiErrors, requireAdminAuth, apiSuccess } from '@/lib/api-utils'
import { createLogger } from '@/lib/logger'

const log = createLogger('api:authors')

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/authors/[id] - Get a single author
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const [author] = await db.select().from(authors).where(eq(authors.id, id))

    if (!author) {
      return ApiErrors.notFound('Author')
    }

    return NextResponse.json(author)
  } catch (error) {
    log.error('Failed to fetch author', error)
    return ApiErrors.internalError('Failed to fetch author')
  }
}

// PUT /api/authors/[id] - Update an author
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    const { id } = await params
    const body = await request.json()
    const { name, email, avatarUrl, bio } = body

    const [existing] = await db.select().from(authors).where(eq(authors.id, id))
    if (!existing) {
      return ApiErrors.notFound('Author')
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
    log.error('Failed to update author', error)
    return ApiErrors.internalError('Failed to update author')
  }
}

// DELETE /api/authors/[id] - Delete an author
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    const { id } = await params
    const [existing] = await db.select().from(authors).where(eq(authors.id, id))
    if (!existing) {
      return ApiErrors.notFound('Author')
    }

    await db.delete(authors).where(eq(authors.id, id))
    return apiSuccess({ success: true })
  } catch (error) {
    log.error('Failed to delete author', error)
    return ApiErrors.internalError('Failed to delete author')
  }
}
