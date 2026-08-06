/**
 * 관련 아이템 구획
 *
 * 태그가 겹치거나 작성자가 같은 항목을 모아 보여준다. 종류마다 다른 색의
 * 그라디언트를 칠하던 방식은 걷어내고, 고정폭 라벨 하나로만 구분한다.
 */
import { Link } from '@/i18n/navigation'
import { getTranslations } from 'next-intl/server'
import { CatalogItemSummary, TAGS, DIFFICULTY_LABELS, ItemType } from '@/lib/core/types'

/** 항목 종류별 표시 라벨 */
const TYPE_LABELS: Record<ItemType, string> = {
  skill: 'SKILL',
  agent: 'AGENT',
  command: 'COMMAND',
  guide: 'GUIDE',
  hook: 'HOOK',
  package: 'PACKAGE',
}

/**
 * Props for the RelatedItems component
 */
interface RelatedItemsProps {
  /** 보여줄 관련 항목들 */
  items: CatalogItemSummary[]
  /** 현재 항목의 태그 — 겹치는 태그를 짚어 주는 데 쓴다 */
  currentItemTags: string[]
  /** 현재 항목의 작성자 — 같은 작성자 표시에 쓴다 */
  currentItemAuthorId?: string
}

/**
 * 관련 아이템 목록
 *
 * @param items - 보여줄 관련 항목들
 * @param currentItemTags - 현재 항목의 태그
 * @param currentItemAuthorId - 현재 항목의 작성자
 *
 * @example
 * ```tsx
 * <RelatedItems items={relatedItems} currentItemTags={['automation']} />
 * ```
 */
export async function RelatedItems({
  items,
  currentItemTags,
  currentItemAuthorId,
}: RelatedItemsProps) {
  if (!items || items.length === 0) {
    return null
  }

  const t = await getTranslations('detail.relatedItems')

  return (
    <div className="surface-card mb-8">
      <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)]">
        {t('title')}
      </h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{t('subtitle')}</p>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const isSameAuthor = currentItemAuthorId && item.authorId === currentItemAuthorId
          const matchingTags = item.tags.filter((tag) => currentItemTags.includes(tag))

          return (
            <Link key={item.id} href={`/${item.type}/${item.id}`} className="group">
              <div className="flex h-full flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-4 transition-colors group-hover:border-[var(--border-hover)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="eyebrow">{TYPE_LABELS[item.type]}</span>
                  {item.difficulty && (
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {DIFFICULTY_LABELS[item.difficulty].label}
                    </span>
                  )}
                </div>

                <h4 className="mt-2 line-clamp-1 text-sm font-medium text-[var(--text-primary)]">
                  {item.name}
                </h4>

                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-muted)]">
                  {item.description}
                </p>

                {(isSameAuthor || matchingTags.length > 0) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {isSameAuthor && (
                      <span className="rounded-md border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                        {t('sameAuthor')}
                      </span>
                    )}
                    {matchingTags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]"
                      >
                        {TAGS[tag]?.label || tag}
                      </span>
                    ))}
                    {matchingTags.length > 2 && (
                      <span className="px-1 py-0.5 font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                        +{matchingTags.length - 2}
                      </span>
                    )}
                  </div>
                )}

                {item.authorName && (
                  <div className="mt-auto border-t border-[var(--border-subtle)] pt-3">
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">
                      @{item.authorName}
                    </span>
                  </div>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
