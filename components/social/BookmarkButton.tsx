'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  isBookmarked,
  toggleBookmark,
  type BookmarkedItem,
  subscribeToBookmarks,
  TYPE_CONFIG,
} from '@/lib/features/bookmarks'

// ============================================================================
// Types
// ============================================================================

interface BookmarkButtonProps {
  item: {
    id: string
    type: 'skill' | 'agent' | 'command' | 'guide' | 'hook'
    name: string
  }
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'icon' | 'text'
  showLabel?: boolean
  className?: string
  onToggle?: (isBookmarked: boolean) => void
}

interface BookmarkBadgeProps {
  count: number
  className?: string
}

interface BookmarkedItemsListProps {
  items: BookmarkedItem[]
  onRemove?: (id: string) => void
  onItemClick?: (id: string) => void
  emptyMessage?: string
  className?: string
}

// ============================================================================
// BookmarkButton Component
// ============================================================================

/**
 * Toggle bookmark button for catalog items
 */
export function BookmarkButton({
  item,
  size = 'md',
  variant = 'default',
  showLabel = false,
  className = '',
  onToggle,
}: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(() => isBookmarked(item.id))
  const [isAnimating, setIsAnimating] = useState(false)

  // Subscribe to changes
  useEffect(() => {
    const unsubscribe = subscribeToBookmarks(() => {
      setBookmarked(isBookmarked(item.id))
    })
    return unsubscribe
  }, [item.id])

  const handleToggle = useCallback(() => {
    const result = toggleBookmark({
      id: item.id,
      type: item.type,
      name: item.name,
    })

    if (result.success) {
      setBookmarked(result.isBookmarked)
      setIsAnimating(true)
      setTimeout(() => setIsAnimating(false), 300)
      onToggle?.(result.isBookmarked)
    }
  }, [item, onToggle])

  const sizeClasses = {
    sm: 'p-1.5 text-sm',
    md: 'p-2 text-base',
    lg: 'p-2.5 text-lg',
  }

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }

  if (variant === 'icon') {
    return (
      <button
        onClick={handleToggle}
        className={`
          ${sizeClasses[size]}
          rounded-lg transition-all duration-200
          ${bookmarked
            ? 'text-amber-400 hover:text-amber-500'
            : 'text-[var(--text-muted)] hover:text-amber-400'
          }
          ${isAnimating ? 'scale-125' : 'scale-100'}
          ${className}
        `}
        title={bookmarked ? '북마크 제거' : '북마크 추가'}
        aria-label={bookmarked ? '북마크 제거' : '북마크 추가'}
      >
        <BookmarkIcon filled={bookmarked} className={iconSizes[size]} />
      </button>
    )
  }

  if (variant === 'text') {
    return (
      <button
        onClick={handleToggle}
        className={`
          inline-flex items-center gap-1.5 text-sm font-medium
          ${bookmarked
            ? 'text-amber-400 hover:text-amber-500'
            : 'text-[var(--text-muted)] hover:text-amber-400'
          }
          transition-colors
          ${className}
        `}
      >
        <BookmarkIcon filled={bookmarked} className={iconSizes[size]} />
        {showLabel && (
          <span>{bookmarked ? '북마크됨' : '북마크'}</span>
        )}
      </button>
    )
  }

  // Default variant
  return (
    <button
      onClick={handleToggle}
      className={`
        inline-flex items-center gap-2 rounded-xl transition-all duration-200
        ${sizeClasses[size]}
        ${bookmarked
          ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
          : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:bg-amber-500/10 hover:text-amber-400'
        }
        ${isAnimating ? 'scale-105' : 'scale-100'}
        ${className}
      `}
      title={bookmarked ? '북마크 제거' : '북마크 추가'}
    >
      <BookmarkIcon filled={bookmarked} className={iconSizes[size]} />
      {showLabel && (
        <span className="font-medium">
          {bookmarked ? '북마크됨' : '북마크'}
        </span>
      )}
    </button>
  )
}

// ============================================================================
// BookmarkIcon Component
// ============================================================================

interface BookmarkIconProps {
  filled?: boolean
  className?: string
}

export function BookmarkIcon({ filled = false, className = 'w-5 h-5' }: BookmarkIconProps) {
  if (filled) {
    return (
      <svg
        className={className}
        fill="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    )
  }

  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
      />
    </svg>
  )
}

// ============================================================================
// BookmarkBadge Component
// ============================================================================

/**
 * Badge showing bookmark count
 */
export function BookmarkBadge({ count, className = '' }: BookmarkBadgeProps) {
  if (count === 0) return null

  return (
    <span
      className={`
        inline-flex items-center justify-center
        min-w-[1.25rem] h-5 px-1.5
        text-xs font-medium
        bg-amber-500/20 text-amber-400
        rounded-full
        ${className}
      `}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

// ============================================================================
// BookmarkedItemsList Component
// ============================================================================

/**
 * List of bookmarked items
 */
export function BookmarkedItemsList({
  items,
  onRemove,
  onItemClick,
  emptyMessage = '북마크한 항목이 없습니다',
  className = '',
}: BookmarkedItemsListProps) {
  if (items.length === 0) {
    return (
      <div className={`text-center py-8 text-[var(--text-muted)] ${className}`}>
        <BookmarkIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {items.map((item) => {
        const config = TYPE_CONFIG[item.type]
        const addedDate = new Date(item.addedAt)
        const formattedDate = addedDate.toLocaleDateString('ko-KR', {
          month: 'short',
          day: 'numeric',
        })

        return (
          <div
            key={item.id}
            className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors group"
          >
            {/* Type icon */}
            <span
              className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-lg"
              style={{ backgroundColor: `${config.color}20` }}
            >
              {config.emoji}
            </span>

            {/* Content */}
            <div
              className="flex-1 min-w-0 cursor-pointer"
              onClick={() => onItemClick?.(item.id)}
            >
              <p className="font-medium text-[var(--text-primary)] truncate">
                {item.name}
              </p>
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <span
                  className="px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: `${config.color}15`,
                    color: config.color,
                  }}
                >
                  {item.type}
                </span>
                <span>{formattedDate}</span>
                {item.note && (
                  <span className="truncate max-w-[150px]" title={item.note}>
                    · {item.note}
                  </span>
                )}
              </div>
            </div>

            {/* Remove button */}
            {onRemove && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(item.id)
                }}
                className="flex-shrink-0 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                title="북마크 제거"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// BookmarkTypeFilter Component
// ============================================================================

interface BookmarkTypeFilterProps {
  selected: string | null
  counts: Record<string, number>
  onChange: (type: string | null) => void
  className?: string
}

export function BookmarkTypeFilter({
  selected,
  counts,
  onChange,
  className = '',
}: BookmarkTypeFilterProps) {
  const types = Object.keys(TYPE_CONFIG) as Array<keyof typeof TYPE_CONFIG>
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <button
        onClick={() => onChange(null)}
        className={`
          px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
          ${selected === null
            ? 'bg-[var(--accent-primary)] text-white'
            : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'
          }
        `}
      >
        전체 ({total})
      </button>
      {types.map((type) => {
        const config = TYPE_CONFIG[type]
        const count = counts[type] || 0
        if (count === 0) return null

        return (
          <button
            key={type}
            onClick={() => onChange(type)}
            className={`
              inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${selected === type
                ? 'text-white'
                : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'
              }
            `}
            style={selected === type ? { backgroundColor: config.color } : undefined}
          >
            <span>{config.emoji}</span>
            <span>{type}</span>
            <span className="opacity-70">({count})</span>
          </button>
        )
      })}
    </div>
  )
}

// ============================================================================
// useBookmarks Hook
// ============================================================================

/**
 * React hook for bookmark state management
 */
export function useBookmarks() {
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Load initial state
    const loadState = async () => {
      const { getBookmarkedIds } = await import('@/lib/features/bookmarks')
      setBookmarkedIds(getBookmarkedIds())
    }
    loadState()

    // Subscribe to changes
    const unsubscribe = subscribeToBookmarks(() => {
      import('@/lib/features/bookmarks').then(({ getBookmarkedIds }) => {
        setBookmarkedIds(getBookmarkedIds())
      })
    })

    return unsubscribe
  }, [])

  const isItemBookmarked = useCallback(
    (itemId: string) => bookmarkedIds.has(itemId),
    [bookmarkedIds]
  )

  return {
    bookmarkedIds,
    isItemBookmarked,
    count: bookmarkedIds.size,
  }
}
