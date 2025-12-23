'use client'

import { useState, useTransition } from 'react'

interface LikeButtonProps {
  itemId: string
  initialLikes: number
  size?: 'sm' | 'md' | 'lg'
}

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
