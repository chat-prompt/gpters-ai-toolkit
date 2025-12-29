/**
 * Comment API - Update and Delete
 *
 * PUT /api/comments/comment/[id] - Update a comment
 * DELETE /api/comments/comment/[id] - Delete a comment
 */

import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { comments } from '@/lib/db/schema'
import { auth } from '@/lib/core/auth'
import { ApiErrors } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'

const log = createLogger('api:comments')

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.auth)
  if (rateLimitError) return rateLimitError

  try {
    const session = await auth()
    if (!session?.user?.id) {
      return ApiErrors.unauthorized()
    }

    const { id } = await params
    const body = await request.json()

    if (!body.content || typeof body.content !== 'string') {
      return ApiErrors.badRequest('Content is required')
    }

    const content = body.content.trim()
    if (content.length === 0) {
      return ApiErrors.badRequest('Content cannot be empty')
    }

    if (content.length > 5000) {
      return ApiErrors.badRequest('Content is too long (max 5000 characters)')
    }

    // Check ownership
    const [existingComment] = await db
      .select({ userId: comments.userId })
      .from(comments)
      .where(eq(comments.id, id))

    if (!existingComment) {
      return ApiErrors.notFound('Comment')
    }

    if (existingComment.userId !== session.user.id) {
      return ApiErrors.forbidden('You can only edit your own comments')
    }

    // Update comment
    const [updated] = await db
      .update(comments)
      .set({
        content,
        isEdited: true,
        updatedAt: new Date(),
      })
      .where(eq(comments.id, id))
      .returning()

    log.info('Comment updated', { commentId: id, userId: session.user.id })

    return NextResponse.json({ comment: updated })
  } catch (error) {
    log.error('Failed to update comment', error)
    return ApiErrors.internalError('Failed to update comment')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.auth)
  if (rateLimitError) return rateLimitError

  try {
    const session = await auth()
    if (!session?.user?.id) {
      return ApiErrors.unauthorized()
    }

    const { id } = await params

    // Check ownership
    const [existingComment] = await db
      .select({ userId: comments.userId })
      .from(comments)
      .where(eq(comments.id, id))

    if (!existingComment) {
      return ApiErrors.notFound('Comment')
    }

    if (existingComment.userId !== session.user.id) {
      return ApiErrors.forbidden('You can only delete your own comments')
    }

    // Delete comment (cascades to likes and replies via FK)
    await db.delete(comments).where(eq(comments.id, id))

    log.info('Comment deleted', { commentId: id, userId: session.user.id })

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('Failed to delete comment', error)
    return ApiErrors.internalError('Failed to delete comment')
  }
}
