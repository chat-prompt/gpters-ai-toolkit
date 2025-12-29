'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'
import Image from 'next/image'

interface CommentUser {
  id: string
  name: string | null
  image: string | null
}

interface Comment {
  id: string
  content: string
  likes: number
  isEdited: boolean
  createdAt: string | null
  updatedAt: string | null
  parentId: string | null
  user: CommentUser
  replies?: Comment[]
  hasLiked?: boolean
}

interface CommentSectionProps {
  itemId: string
  className?: string
}

export function CommentSection({ itemId, className = '' }: CommentSectionProps) {
  const { data: session, status } = useSession()
  const [comments, setComments] = useState<Comment[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newComment, setNewComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch(`/api/comments/${itemId}`)
      if (!res.ok) throw new Error('Failed to fetch comments')
      const data = await res.json()
      setComments(data.comments)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments')
    } finally {
      setIsLoading(false)
    }
  }, [itemId])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  // Submit new comment
  const handleSubmit = async (parentId?: string) => {
    if (!session?.user) return

    const content = parentId ? editContent : newComment
    if (!content.trim()) return

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/comments/${itemId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim(), parentId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Failed to post comment')
      }

      // Reset and refresh
      if (parentId) {
        setReplyingTo(null)
        setEditContent('')
      } else {
        setNewComment('')
      }
      await fetchComments()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post comment')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Update comment
  const handleUpdate = async (commentId: string) => {
    if (!editContent.trim()) return

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/comments/comment/${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Failed to update comment')
      }

      setEditingId(null)
      setEditContent('')
      await fetchComments()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update comment')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Delete comment
  const handleDelete = async (commentId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return

    try {
      const res = await fetch(`/api/comments/comment/${commentId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Failed to delete comment')
      }

      await fetchComments()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete comment')
    }
  }

  // Toggle like
  const handleLike = async (commentId: string) => {
    if (!session?.user) return

    try {
      const res = await fetch(`/api/comments/comment/${commentId}/like`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Failed to like comment')
      }

      const data = await res.json()

      // Update local state
      const updateCommentLike = (cmts: Comment[]): Comment[] => {
        return cmts.map(c => {
          if (c.id === commentId) {
            return { ...c, likes: data.likes, hasLiked: data.liked }
          }
          if (c.replies) {
            return { ...c, replies: updateCommentLike(c.replies) }
          }
          return c
        })
      }
      setComments(updateCommentLike(comments))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle like')
    }
  }

  // Start editing
  const startEditing = (comment: Comment) => {
    setEditingId(comment.id)
    setEditContent(comment.content)
    setReplyingTo(null)
  }

  // Start replying
  const startReplying = (commentId: string) => {
    setReplyingTo(commentId)
    setEditContent('')
    setEditingId(null)
  }

  // Render single comment
  const renderComment = (comment: Comment, depth = 0) => {
    const isOwner = session?.user?.id === comment.user.id
    const isEditing = editingId === comment.id
    const isReplying = replyingTo === comment.id
    const maxDepth = 3

    return (
      <div
        key={comment.id}
        className={`${depth > 0 ? 'ml-8 pl-4 border-l-2 border-[var(--border-subtle)]' : ''}`}
      >
        <div className="py-4">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            {comment.user.image ? (
              <Image
                src={comment.user.image}
                alt={comment.user.name || 'User'}
                width={32}
                height={32}
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-sm">
                {(comment.user.name || 'U')[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <span className="font-medium text-sm text-[var(--text-primary)]">
                {comment.user.name || 'Anonymous'}
              </span>
              <span className="text-xs text-[var(--text-muted)] ml-2">
                {comment.createdAt
                  ? formatDistanceToNow(new Date(comment.createdAt), {
                      addSuffix: true,
                      locale: ko,
                    })
                  : ''}
              </span>
              {comment.isEdited && (
                <span className="text-xs text-[var(--text-muted)] ml-2">(수정됨)</span>
              )}
            </div>
          </div>

          {/* Content */}
          {isEditing ? (
            <div className="ml-11">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-sm resize-none focus:border-[var(--accent-cyan)] transition-colors"
                rows={3}
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => handleUpdate(comment.id)}
                  disabled={isSubmitting || !editContent.trim()}
                  className="px-3 py-1 text-sm rounded-lg bg-[var(--accent-cyan)] text-white hover:opacity-90 disabled:opacity-50"
                >
                  {isSubmitting ? '저장 중...' : '저장'}
                </button>
                <button
                  onClick={() => {
                    setEditingId(null)
                    setEditContent('')
                  }}
                  className="px-3 py-1 text-sm rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <p className="ml-11 text-sm text-[var(--text-secondary)] whitespace-pre-wrap">
              {comment.content}
            </p>
          )}

          {/* Actions */}
          {!isEditing && (
            <div className="ml-11 mt-2 flex items-center gap-4 text-xs">
              <button
                onClick={() => handleLike(comment.id)}
                disabled={status !== 'authenticated'}
                className={`flex items-center gap-1 transition-colors ${
                  comment.hasLiked
                    ? 'text-red-400'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                } disabled:opacity-50`}
              >
                {comment.hasLiked ? '❤️' : '🤍'} {comment.likes}
              </button>

              {status === 'authenticated' && depth < maxDepth && (
                <button
                  onClick={() => startReplying(comment.id)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  답글
                </button>
              )}

              {isOwner && (
                <>
                  <button
                    onClick={() => startEditing(comment)}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(comment.id)}
                    className="text-[var(--text-muted)] hover:text-red-400 transition-colors"
                  >
                    삭제
                  </button>
                </>
              )}
            </div>
          )}

          {/* Reply form */}
          {isReplying && (
            <div className="ml-11 mt-3">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="답글을 작성하세요..."
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-sm resize-none focus:border-[var(--accent-cyan)] transition-colors"
                rows={2}
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => handleSubmit(comment.id)}
                  disabled={isSubmitting || !editContent.trim()}
                  className="px-3 py-1 text-sm rounded-lg bg-[var(--accent-cyan)] text-white hover:opacity-90 disabled:opacity-50"
                >
                  {isSubmitting ? '작성 중...' : '답글 작성'}
                </button>
                <button
                  onClick={() => {
                    setReplyingTo(null)
                    setEditContent('')
                  }}
                  className="px-3 py-1 text-sm rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Nested replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="space-y-0">
            {comment.replies.map((reply) => renderComment(reply, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">
          댓글
        </h3>
        <span className="text-sm text-[var(--text-muted)]">({total})</span>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 hover:text-red-300"
          >
            ✕
          </button>
        </div>
      )}

      {/* New comment form */}
      {status === 'authenticated' ? (
        <div className="mb-6">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="댓글을 작성하세요..."
            className="w-full px-4 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-sm resize-none focus:border-[var(--accent-cyan)] transition-colors"
            rows={3}
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={() => handleSubmit()}
              disabled={isSubmitting || !newComment.trim()}
              className="px-4 py-2 text-sm rounded-lg bg-[var(--accent-cyan)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isSubmitting ? '작성 중...' : '댓글 작성'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-6 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-center">
          <p className="text-sm text-[var(--text-muted)]">
            댓글을 작성하려면{' '}
            <a href="/auth/signin" className="text-[var(--accent-cyan)] hover:underline">
              로그인
            </a>
            이 필요합니다.
          </p>
        </div>
      )}

      {/* Comments list */}
      {isLoading ? (
        <div className="text-center py-8">
          <div className="animate-spin w-6 h-6 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-[var(--text-muted)] mt-2">댓글 로딩 중...</p>
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-[var(--text-muted)]">아직 댓글이 없습니다.</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            첫 번째 댓글을 남겨보세요!
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-subtle)]">
          {comments.map((comment) => renderComment(comment))}
        </div>
      )}
    </div>
  )
}
