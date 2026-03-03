/**
 * Catalog item card component
 *
 * Displays a single catalog item with type icon, title, description,
 * tags, author, and metadata badges.
 */
import { memo } from 'react'
import Link from 'next/link'
import { TAGS, DIFFICULTY_LABELS } from '@/lib/core/types'
import { TeamTagBadge } from '../../social/TeamTagSelector'
import { OrgBadge } from '../../ui/OrgBadge'
import { VisibilityBadge } from '../../ui/VisibilityBadge'
import { TYPE_CONFIG } from './constants'
import type { ItemCardProps } from './types'

/**
 * Animated catalog item card with hover effects
 *
 * Features:
 * - Type-specific gradient glow on hover
 * - Draft status indicator
 * - Team tag badge
 * - Difficulty badge
 * - CLI ready indicator
 * - Plugin link indicator
 * - Likes count
 *
 * @example
 * ```tsx
 * <ItemCard item={catalogItem} index={0} />
 * ```
 */
export const ItemCard = memo(function ItemCard({ item, index }: ItemCardProps) {
  const config = TYPE_CONFIG[item.type]
  const isDraft = item.status === 'draft'

  return (
    <Link href={`/${item.type}/${item.id}`}>
      <div
        className={`group glass rounded-2xl p-6 h-full flex flex-col transition-all duration-300 hover:translate-y-[-4px] ${config.glow} animate-fade-up relative ${isDraft ? 'border border-yellow-500/30' : ''}`}
        style={{ animationDelay: `${index * 80}ms` }}
      >
        {/* Draft Indicator */}
        {isDraft && (
          <div className="absolute top-0 right-0 px-2.5 py-1 rounded-bl-xl rounded-tr-2xl bg-yellow-500/20 border-l border-b border-yellow-500/30">
            <span className="text-[10px] font-medium text-yellow-400 uppercase tracking-wider">
              Draft
            </span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span
              className={`text-lg bg-gradient-to-r ${config.gradient} bg-clip-text text-transparent`}
            >
              {config.icon}
            </span>
            <span className="text-[10px] font-semibold tracking-[0.2em] text-[var(--text-muted)] uppercase">
              {config.label}
            </span>
            {item.teamTag && item.teamTag !== 'general' && (
              <TeamTagBadge tag={item.teamTag} size="sm" />
            )}
          </div>
          {item.difficulty && (
            <span
              className={`text-[10px] px-2 py-1 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] ${isDraft ? 'mr-12' : ''}`}
            >
              {DIFFICULTY_LABELS[item.difficulty].label}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2 tracking-tight">
          {item.name}
        </h3>

        {/* Description */}
        <p className="text-sm text-[var(--text-secondary)] mb-6 flex-grow line-clamp-2 leading-relaxed">
          {item.description}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-4">
          {item.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-2 py-1 rounded-md bg-[var(--bg-tertiary)] text-[var(--text-muted)] uppercase tracking-wider"
            >
              {TAGS[tag]?.label || tag}
            </span>
          ))}
        </div>

        {/* Org & Visibility Badges */}
        <div className="flex items-center gap-2 mb-4">
          <OrgBadge orgName={item.orgName ?? null} size="sm" />
          {item.visibility && item.visibility !== 'private' && (
            <VisibilityBadge visibility={item.visibility} size="sm" />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--text-muted)]">@{item.authorName}</span>
          </div>
          <div className="flex items-center gap-2">
            {item.type === 'skill' && item.pluginId && (
              <span className="text-[10px] text-[var(--accent-purple)] font-medium tracking-wide">
                PLUGIN →
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
})
