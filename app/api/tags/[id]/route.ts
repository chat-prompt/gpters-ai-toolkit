import { NextRequest, NextResponse } from 'next/server'
import { db, tags } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { ApiErrors, requireAdminAuth, apiSuccess } from '@/lib/api-utils'
import { createLogger } from '@/lib/logger'

const log = createLogger('api:tags')

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/tags/[id] - Get a single tag
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const [tag] = await db.select().from(tags).where(eq(tags.id, id))

    if (!tag) {
      return ApiErrors.notFound('Tag')
    }

    return NextResponse.json(tag)
  } catch (error) {
    log.error('Failed to fetch tag', error)
    return ApiErrors.internalError('Failed to fetch tag')
  }
}

// PUT /api/tags/[id] - Update a tag
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    const { id } = await params
    const body = await request.json()
    const { label, color, description } = body

    const [existing] = await db.select().from(tags).where(eq(tags.id, id))
    if (!existing) {
      return ApiErrors.notFound('Tag')
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
    log.error('Failed to update tag', error)
    return ApiErrors.internalError('Failed to update tag')
  }
}

// DELETE /api/tags/[id] - Delete a tag
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    const { id } = await params
    const [existing] = await db.select().from(tags).where(eq(tags.id, id))
    if (!existing) {
      return ApiErrors.notFound('Tag')
    }

    await db.delete(tags).where(eq(tags.id, id))
    return apiSuccess({ success: true })
  } catch (error) {
    log.error('Failed to delete tag', error)
    return ApiErrors.internalError('Failed to delete tag')
  }
}
