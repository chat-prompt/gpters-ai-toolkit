/**
 * Like button component for catalog items
 *
 * Allows users to like catalog items with animated
 * feedback and optimistic UI updates.
 */
'use client'

import { useState, useTransition } from 'react'

/** Props for LikeButton component */
interface LikeButtonProps {
  /** Catalog item ID to like */
  itemId: string
  /** Initial like count to display */
  initialLikes: number
  /** Button size variant */
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Catalog item like button
 *
 * Displays current like count and allows one-time liking
 * with animation feedback and API integration.
 */
export function LikeButton({ itemId, initialLikes, size = 'md' }: LikeButtonProps) {
  const [likes, setLikes] = useState(initialLikes)
  const [hasLiked, setHasLiked] = useState(false)
  const [isPending, startTransition] = useTransition()

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs gap-1',
    md: 'px-3 py-1.5 text-sm gap-1.5',
    lg: 'px-4 py-2 text-base gap-2',
  }

  const iconSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  }

  const handleLike = () => {
    if (hasLiked || isPending) return

    startTransition(async () => {
      try {
        const response = await fetch(`/api/likes/${itemId}`, {
          method: 'POST',
        })

        if (response.ok) {
          const data = await response.json()
          setLikes(data.likes)
          setHasLiked(true)
        }
      } catch (error) {
        console.error('Failed to like:', error)
      }
    })
  }

  return (
    <button
      onClick={handleLike}
      disabled={hasLiked || isPending}
      className={`inline-flex items-center ${sizeClasses[size]} rounded-full transition-all duration-200 ${
        hasLiked
          ? 'bg-rose-500/20 text-rose-400 cursor-default'
          : isPending
          ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-wait'
          : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:bg-rose-500/10 hover:text-rose-400 cursor-pointer'
      }`}
      title={hasLiked ? '좋아요를 눌렀습니다' : '좋아요'}
    >
      <span className={`${iconSizes[size]} ${hasLiked ? 'animate-bounce-once' : ''}`}>
        {hasLiked ? '❤️' : '🤍'}
      </span>
      <span className="font-medium">{likes}</span>
    </button>
  )
}
