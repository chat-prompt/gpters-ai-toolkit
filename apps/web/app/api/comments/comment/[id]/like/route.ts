/**
 * Comment Like API
 *
 * POST /api/comments/comment/[id]/like - Toggle like on a comment
 */

import { NextRequest, NextResponse } from 'next/server'
import { eq, and, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { comments, commentLikes } from '@/lib/db/schema'
import { auth } from '@/lib/core/auth'
import { ApiErrors } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'

const log = createLogger('api:comment-likes')

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.search)
  if (rateLimitError) return rateLimitError

  try {
    const session = await auth()
    if (!session?.user?.id) {
      return ApiErrors.unauthorized()
    }

    const { id: commentId } = await params

    // Check if comment exists
    const [comment] = await db
      .select({ id: comments.id, likes: comments.likes })
      .from(comments)
      .where(eq(comments.id, commentId))

    if (!comment) {
      return ApiErrors.notFound('Comment')
    }

    // Check if user already liked
    const [existingLike] = await db
      .select()
      .from(commentLikes)
      .where(
        and(
          eq(commentLikes.commentId, commentId),
          eq(commentLikes.userId, session.user.id)
        )
      )

    let liked: boolean
    let newLikes: number

    if (existingLike) {
      // Unlike: remove the like
      await db
        .delete(commentLikes)
        .where(
          and(
            eq(commentLikes.commentId, commentId),
            eq(commentLikes.userId, session.user.id)
          )
        )

      // Decrement likes count
      const [updated] = await db
        .update(comments)
        .set({ likes: sql`GREATEST(${comments.likes} - 1, 0)` })
        .where(eq(comments.id, commentId))
        .returning({ likes: comments.likes })

      liked = false
      newLikes = updated?.likes || 0

      log.info('Comment unliked', { commentId, userId: session.user.id })
    } else {
      // Like: add the like
      await db.insert(commentLikes).values({
        commentId,
        userId: session.user.id,
      })

      // Increment likes count
      const [updated] = await db
        .update(comments)
        .set({ likes: sql`${comments.likes} + 1` })
        .where(eq(comments.id, commentId))
        .returning({ likes: comments.likes })

      liked = true
      newLikes = updated?.likes || 0

      log.info('Comment liked', { commentId, userId: session.user.id })
    }

    return NextResponse.json({ liked, likes: newLikes })
  } catch (error) {
    log.error('Failed to toggle comment like', error)
    return ApiErrors.internalError('Failed to toggle like')
  }
}
