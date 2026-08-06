/**
 * 카탈로그 항목 카드
 *
 * 유형 라벨·이름·설명·작성자를 한 장에 담는다. 카드가 수십 장 늘어서는
 * 화면이라 여백을 줄이고, 구분은 1px 테두리와 라벨로만 준다.
 */
import { memo } from 'react'
import { Link } from '@/i18n/navigation'
import { TAGS, DIFFICULTY_LABELS } from '@/lib/core/types'
import { PLATFORM_LABELS, type SkillPlatform } from '@/lib/security/client-type'
import { TYPE_CONFIG } from './constants'
import type { ItemCardProps } from './types'

/**
 * 카탈로그 항목 카드
 *
 * @param item - 카드로 그릴 항목
 * @param index - 목록 안에서의 순서 (등장 지연에 쓴다)
 *
 * @example
 * ```tsx
 * <ItemCard item={catalogItem} index={0} />
 * ```
 */
export const ItemCard = memo(function ItemCard({ item, index }: ItemCardProps) {
  const config = TYPE_CONFIG[item.type]
  const isDraft = item.status === 'draft'
  // 등장 지연은 앞쪽 몇 장까지만 — 목록이 길어도 마지막 카드가 늦게 뜨지 않게 한다
  const revealDelay = `${Math.min(index, 8) * 40}ms`

  return (
    <Link
      href={`/${item.type}/${item.id}`}
      className="reveal block h-full"
      style={{ '--ax-delay': revealDelay } as React.CSSProperties}
    >
      <article className="group h-full flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 transition-all duration-200 hover:border-[var(--border-hover)] hover:-translate-y-0.5">
        {/* 머리 — 유형과 상태만 */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {config.label}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {isDraft && (
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border border-[var(--accent-orange)] text-[var(--accent-orange)]">
                Draft
              </span>
            )}
            {item.difficulty && (
              <span className="text-[11px] text-[var(--text-muted)]">
                {DIFFICULTY_LABELS[item.difficulty].label}
              </span>
            )}
          </div>
        </div>

        <h3 className="text-[15px] font-medium leading-snug tracking-tight text-[var(--text-primary)] transition-colors group-hover:text-[var(--brand-primary)]">
          {item.name}
        </h3>

        <p className="mt-1.5 mb-4 flex-grow text-[13px] leading-relaxed text-[var(--text-secondary)] line-clamp-2">
          {item.description}
        </p>

        {/* 태그·플랫폼 — 한 줄에 모아 카드가 세로로 길어지지 않게 한다 */}
        {(item.tags.length > 0 || (item.platforms && item.platforms.length > 0)) && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {item.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
              >
                {TAGS[tag]?.label || tag}
              </span>
            ))}
            {item.platforms?.map((platform) => {
              const info = PLATFORM_LABELS[platform as SkillPlatform]
              if (!info) return null
              return (
                <span
                  key={platform}
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded-md border border-[var(--border-subtle)] text-[var(--text-muted)]"
                >
                  {info.shortLabel}
                </span>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-muted)] truncate">@{item.authorName}</span>
          {item.type === 'skill' && item.pluginId && (
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)] shrink-0">
              Plugin
            </span>
          )}
        </div>
      </article>
    </Link>
  )
})
