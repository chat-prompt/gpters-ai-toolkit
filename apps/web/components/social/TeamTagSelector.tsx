/**
 * Team tag selector and badge components
 *
 * Provides team tag selection UI and display badge
 * for categorizing items by team ownership.
 */
'use client'

import { memo } from 'react'
import type { TeamTag } from '@/lib/core/types'
import { TEAM_TAGS } from '@/lib/core/types'

/** Props for TeamTagSelector component */
interface TeamTagSelectorProps {
  /** Currently selected team tag */
  value: TeamTag
  /** Handler for tag selection change */
  onChange: (value: TeamTag) => void
  /** Additional CSS classes */
  className?: string
}

/**
 * Team tag selection buttons
 *
 * Displays available team tags as selectable buttons
 * with emoji icons and labels.
 */
export function TeamTagSelector({ value, onChange, className = '' }: TeamTagSelectorProps) {
  const teamTags = Object.keys(TEAM_TAGS) as TeamTag[]

  return (
    <div className={className}>
      <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
        Team
      </label>
      <div className="flex flex-wrap gap-2">
        {teamTags.map((tag) => {
          const tagInfo = TEAM_TAGS[tag]
          const isSelected = value === tag
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onChange(tag)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 border ${
                isSelected
                  ? `${tagInfo.color}`
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]'
              }`}
            >
              <span>{tagInfo.emoji}</span>
              <span>{tagInfo.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Props for TeamTagBadge component */
interface TeamTagBadgeProps {
  /** Team tag to display */
  tag: TeamTag
  /** Badge size variant */
  size?: 'sm' | 'md'
}

/**
 * Team tag display badge
 *
 * Memoized badge showing team tag with emoji and label.
 */
export const TeamTagBadge = memo(function TeamTagBadge({ tag, size = 'md' }: TeamTagBadgeProps) {
  const tagInfo = TEAM_TAGS[tag]
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border ${tagInfo.color} ${sizeClasses}`}>
      <span>{tagInfo.emoji}</span>
      <span>{tagInfo.label}</span>
    </span>
  )
})
