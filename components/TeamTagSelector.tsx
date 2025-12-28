'use client'

import { memo } from 'react'
import type { TeamTag } from '@/lib/types'
import { TEAM_TAGS } from '@/lib/types'

interface TeamTagSelectorProps {
  value: TeamTag
  onChange: (value: TeamTag) => void
  className?: string
}

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

interface TeamTagBadgeProps {
  tag: TeamTag
  size?: 'sm' | 'md'
}

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
