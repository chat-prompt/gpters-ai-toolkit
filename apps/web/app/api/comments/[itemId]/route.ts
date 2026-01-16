/**
 * Comments API - List and Create
 *
 * GET /api/comments/[itemId] - Get all comments for an item
 * POST /api/comments/[itemId] - Create a new comment
 */

import { NextRequest, NextResponse } from 'next/server'
import { eq, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { comments, users, commentLikes } from '@/lib/db/schema'
import { auth } from '@/lib/core/auth'
import { ApiErrors } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'

const log = createLogger('api:comments')

interface CommentWithUser {
  id: string
  content: string
  likes: number
  isEdited: boolean
  createdAt: Date | null
  updatedAt: Date | null
  parentId: string | null
  user: {
    id: string
    name: string | null
    image: string | null
  }
  replies?: CommentWithUser[]
  hasLiked?: boolean
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  try {
    const { itemId } = await params
    const session = await auth()
    const currentUserId = session?.user?.id

    // Get all top-level comments (no parent) with user info
    const allComments = await db
      .select({
        id: comments.id,
        content: comments.content,
        likes: comments.likes,
        isEdited: comments.isEdited,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        parentId: comments.parentId,
        userId: comments.userId,
        userName: users.name,
        userImage: users.image,
      })
      .from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.itemId, itemId))
      .orderBy(desc(comments.createdAt))

    // Get likes for current user if logged in
    let userLikes = new Set<string>()
    if (currentUserId) {
      const likes = await db
        .select({ commentId: commentLikes.commentId })
        .from(commentLikes)
        .where(eq(commentLikes.userId, currentUserId))

      userLikes = new Set(likes.map(l => l.commentId))
    }

    // Build nested structure
    const commentMap = new Map<string, CommentWithUser>()
    const topLevel: CommentWithUser[] = []

    // First pass: create all comment objects
    for (const c of allComments) {
      const comment: CommentWithUser = {
        id: c.id,
        content: c.content,
        likes: c.likes,
        isEdited: c.isEdited,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        parentId: c.parentId,
        user: {
          id: c.userId,
          name: c.userName,
          image: c.userImage,
        },
        replies: [],
        hasLiked: userLikes.has(c.id),
      }
      commentMap.set(c.id, comment)
    }

    // Second pass: build tree structure
    for (const c of allComments) {
      const comment = commentMap.get(c.id)!
      if (c.parentId && commentMap.has(c.parentId)) {
        commentMap.get(c.parentId)!.replies!.push(comment)
      } else if (!c.parentId) {
        topLevel.push(comment)
      }
    }

    // Sort replies by date (oldest first for conversation flow)
    for (const comment of commentMap.values()) {
      comment.replies?.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateA - dateB
      })
    }

    return NextResponse.json({
      comments: topLevel,
      total: allComments.length,
    })
  } catch (error) {
    log.error('Failed to fetch comments', error)
    return ApiErrors.internalError('Failed to fetch comments')
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.auth)
  if (rateLimitError) return rateLimitError

  try {
    const session = await auth()
    if (!session?.user?.id) {
      return ApiErrors.unauthorized()
    }

    const { itemId } = await params
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

    // Validate parentId if provided
    if (body.parentId) {
      const [parentComment] = await db
        .select({ id: comments.id })
        .from(comments)
        .where(eq(comments.id, body.parentId))

      if (!parentComment) {
        return ApiErrors.badRequest('Parent comment not found')
      }
    }

    // Create comment
    const [newComment] = await db
      .insert(comments)
      .values({
        itemId,
        userId: session.user.id,
        parentId: body.parentId || null,
        content,
      })
      .returning()

    // Get user info for response
    const [user] = await db
      .select({ name: users.name, image: users.image })
      .from(users)
      .where(eq(users.id, session.user.id))

    log.info('Comment created', { commentId: newComment.id, itemId, userId: session.user.id })

    return NextResponse.json({
      comment: {
        id: newComment.id,
        content: newComment.content,
        likes: newComment.likes,
        isEdited: newComment.isEdited,
        createdAt: newComment.createdAt,
        updatedAt: newComment.updatedAt,
        parentId: newComment.parentId,
        user: {
          id: session.user.id,
          name: user?.name || null,
          image: user?.image || null,
        },
        replies: [],
        hasLiked: false,
      },
    }, { status: 201 })
  } catch (error) {
    log.error('Failed to create comment', error)
    return ApiErrors.internalError('Failed to create comment')
  }
}
