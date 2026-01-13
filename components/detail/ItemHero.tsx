/**
 * Hero section component for catalog item detail pages
 *
 * Displays item type, title, description, tags, and metadata
 * with type-specific styling and interactive like button.
 */
import { TAGS, DIFFICULTY_LABELS } from '@/lib/core/types'
import { LikeButton } from '../social/LikeButton'
import { StatusBadge } from '../ui/StatusBadge'
import { VersionPopover } from '../ui/VersionPopover'
import { ReactNode } from 'react'

/** Supported catalog item types */
export type ItemType = 'skill' | 'agent' | 'command' | 'hook' | 'guide' | 'package'

/**
 * Props for the ItemHero component
 */
interface ItemHeroProps {
  /** Type of catalog item */
  type: ItemType
  /** Item title */
  name: string
  /** Item description */
  description: string
  /** Author username */
  authorName?: string
  /** Tag keys for the item */
  tags: string[]
  /** Current like count */
  likes: number
  /** Unique item identifier */
  itemId: string
  /** Difficulty level */
  difficulty?: string
  /** Last update date string */
  updatedAt?: string
  /** Publication status */
  status?: 'draft' | 'published'
  /** Version string */
  version?: string
  /** Estimated completion time */
  estimatedTime?: string
  /** Additional badges to display */
  extraBadges?: ReactNode
  /** Whether to show like button */
  showLikes?: boolean
}

const TYPE_CONFIG: Record<ItemType, { icon: string; label: string; color: string }> = {
  skill: { icon: '⚡', label: 'Skill', color: 'text-[var(--accent-cyan)]' },
  agent: { icon: '◈', label: 'Agent', color: 'text-[var(--accent-purple)]' },
  command: { icon: '▸', label: 'Command', color: 'text-rose-400' },
  hook: { icon: '🪝', label: 'Hook', color: 'text-orange-400' },
  guide: { icon: '📚', label: 'Guide', color: 'text-emerald-400' },
  package: { icon: '📦', label: 'Package', color: 'text-indigo-400' },
}

/**
 * Hero section displaying item metadata and actions
 *
 * @example
 * ```tsx
 * <ItemHero
 *   type="skill"
 *   name="Code Reviewer"
 *   description="AI-powered code review assistant"
 *   tags={['automation', 'code-quality']}
 *   likes={42}
 *   itemId="code-reviewer"
 * />
 * ```
 */
export function ItemHero({
  type,
  name,
  description,
  authorName,
  tags,
  likes,
  itemId,
  difficulty,
  updatedAt,
  status,
  version,
  estimatedTime,
  extraBadges,
  showLikes = true,
}: ItemHeroProps) {
  const config = TYPE_CONFIG[type]

  return (
    <div className="mb-12">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">{config.icon}</span>
        <span className={`text-[10px] font-semibold tracking-[0.2em] ${config.color} uppercase`}>
          {config.label}
        </span>
        {difficulty && (
          <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
            {DIFFICULTY_LABELS[difficulty as keyof typeof DIFFICULTY_LABELS]?.label || difficulty}
          </span>
        )}
        {estimatedTime && (
          <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400">
            ⏱ {estimatedTime}
          </span>
        )}
        {extraBadges}
        {version && <VersionPopover version={version} itemId={itemId} size="sm" />}
        {status === 'draft' && <StatusBadge status={status} />}
      </div>

      <h1
        className="text-4xl font-light text-[var(--text-primary)] tracking-tight mb-4"
        style={{ fontFamily: 'var(--font-newsreader)' }}
      >
        {name}
      </h1>

      <p className="text-lg text-[var(--text-secondary)] leading-relaxed max-w-2xl mb-8">
        {description}
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        {tags.map((tag) => (
          <span
            key={tag}
            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
          >
            {TAGS[tag]?.label || tag}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-6 text-sm text-[var(--text-muted)]">
        {authorName && <span>@{authorName}</span>}
        {updatedAt && (
          <>
            <span className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
            <span>Updated {updatedAt}</span>
          </>
        )}
        {showLikes && (
          <>
            <span className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
            <LikeButton itemId={itemId} initialLikes={likes} />
          </>
        )}
      </div>
    </div>
  )
}
