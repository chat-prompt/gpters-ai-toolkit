import Link from 'next/link'
import { CatalogItemSummary, TAGS, DIFFICULTY_LABELS, ItemType } from '@/lib/core/types'

const TYPE_CONFIG: Record<ItemType, { label: string; icon: string; gradient: string; border: string }> = {
  skill: {
    label: 'SKILL',
    icon: '⚡',
    gradient: 'from-cyan-400 to-emerald-400',
    border: 'border-[var(--accent-cyan)]/20 hover:border-[var(--accent-cyan)]/40',
  },
  agent: {
    label: 'AGENT',
    icon: '◈',
    gradient: 'from-purple-400 to-pink-400',
    border: 'border-[var(--accent-purple)]/20 hover:border-[var(--accent-purple)]/40',
  },
  command: {
    label: 'COMMAND',
    icon: '▸',
    gradient: 'from-rose-400 to-red-400',
    border: 'border-rose-400/20 hover:border-rose-400/40',
  },
  guide: {
    label: 'GUIDE',
    icon: '📚',
    gradient: 'from-emerald-400 to-teal-400',
    border: 'border-emerald-400/20 hover:border-emerald-400/40',
  },
  hook: {
    label: 'HOOK',
    icon: '🪝',
    gradient: 'from-orange-400 to-amber-400',
    border: 'border-orange-400/20 hover:border-orange-400/40',
  },
  package: {
    label: 'PACKAGE',
    icon: '📦',
    gradient: 'from-indigo-400 to-violet-400',
    border: 'border-indigo-400/20 hover:border-indigo-400/40',
  },
}

interface RelatedItemsProps {
  items: CatalogItemSummary[]
  currentItemTags: string[]
  currentItemAuthorId?: string
}

export function RelatedItems({ items, currentItemTags, currentItemAuthorId }: RelatedItemsProps) {
  if (!items || items.length === 0) {
    return null
  }

  return (
    <div className="glass rounded-2xl p-6 mb-8">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xl">🔗</span>
        <h2 className="text-lg font-medium text-[var(--text-primary)]">관련 아이템</h2>
      </div>

      <p className="text-sm text-[var(--text-secondary)] mb-5">
        비슷한 태그를 가진 스킬, 에이전트, 커맨드를 확인해보세요.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => {
          const config = TYPE_CONFIG[item.type]
          const isSameAuthor = currentItemAuthorId && item.authorId === currentItemAuthorId
          const matchingTags = item.tags.filter(tag => currentItemTags.includes(tag))

          return (
            <Link key={item.id} href={`/${item.type}/${item.id}`}>
              <div
                className={`group p-4 rounded-xl border bg-[var(--bg-secondary)] transition-all duration-200 hover:bg-[var(--bg-tertiary)] hover:translate-y-[-2px] ${config.border}`}
              >
                {/* Header */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-sm bg-gradient-to-r ${config.gradient} bg-clip-text text-transparent`}>
                    {config.icon}
                  </span>
                  <span className="text-[9px] font-semibold tracking-[0.15em] text-[var(--text-muted)] uppercase">
                    {config.label}
                  </span>
                  {item.difficulty && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)] ml-auto">
                      {DIFFICULTY_LABELS[item.difficulty].label}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h4 className="text-sm font-medium text-[var(--text-primary)] mb-1 line-clamp-1 group-hover:text-[var(--accent-cyan)] transition-colors">
                  {item.name}
                </h4>

                {/* Description */}
                <p className="text-xs text-[var(--text-muted)] mb-3 line-clamp-2 leading-relaxed">
                  {item.description}
                </p>

                {/* Matching indicators */}
                <div className="flex flex-wrap gap-1.5">
                  {/* Same author indicator */}
                  {isSameAuthor && (
                    <span className="text-[9px] px-2 py-0.5 rounded-md bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] border border-[var(--accent-purple)]/20">
                      같은 작성자
                    </span>
                  )}
                  {/* Matching tags */}
                  {matchingTags.slice(0, 2).map(tag => (
                    <span
                      key={tag}
                      className="text-[9px] px-2 py-0.5 rounded-md bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/20"
                    >
                      {TAGS[tag]?.label || tag}
                    </span>
                  ))}
                  {matchingTags.length > 2 && (
                    <span className="text-[9px] px-1.5 py-0.5 text-[var(--text-muted)]">
                      +{matchingTags.length - 2}
                    </span>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--border-subtle)]">
                  {item.authorName && <span className="text-[10px] text-[var(--text-muted)]">@{item.authorName}</span>}
                  {item.likes > 0 && (
                    <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                      <span className="text-rose-400">♥</span>
                      {item.likes}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
