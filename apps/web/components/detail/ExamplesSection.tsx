'use client'

/**
 * 사용 예시 구획
 *
 * 본문 마크다운에서 예시를 뽑아 입력·출력 짝으로 보여준다.
 * 예시가 많으면 앞의 몇 개만 펴 두고 나머지는 접는다.
 */

import { useState, useMemo, memo } from 'react'
import { useTranslations } from 'next-intl'
import { CopyButton } from '../ui/CopyButton'
import { MarkdownContent } from '../ui/MarkdownContent'
import { parseExamplesFromContent, type Example } from '@/lib/search/parse-examples'

/**
 * Props for the ExamplesSection component
 */
interface ExamplesSectionProps {
  /** 예시를 뽑아낼 마크다운 본문 */
  content: string
  /** 접기 전까지 펴 둘 예시 개수 */
  maxVisible?: number
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Props for the ExampleCard component
 */
interface ExampleCardProps {
  /** 파싱된 예시 하나 */
  example: Example
}

/** 코드 칸 머리 — 무엇이 담겼는지 알리는 줄 */
const CODE_HEADER_CLASS =
  'flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-2'

/** 코드 본문 — 여기는 고정폭이 맞다 */
const CODE_BODY_CLASS =
  'overflow-x-auto p-4 font-mono text-xs leading-relaxed text-[var(--text-primary)]'

/**
 * 예시 한 칸 — 입력·출력이 모두 있으면 나란히 놓는다
 *
 * @param example - 파싱된 예시
 */
const ExampleCard = memo(function ExampleCard({ example }: ExampleCardProps) {
  const t = useTranslations('detail.examples')
  const hasInputOutput = example.input && example.output

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)]">
      {example.title && (
        <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3">
          <h4 className="text-sm font-medium text-[var(--text-primary)]">{example.title}</h4>
        </div>
      )}

      {example.description && (
        <div className="border-b border-[var(--border-subtle)] px-4 py-3">
          <MarkdownContent content={example.description} />
        </div>
      )}

      {hasInputOutput ? (
        <div className="grid divide-y divide-[var(--border-subtle)] md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="min-w-0">
            <div className={CODE_HEADER_CLASS}>
              <span className="eyebrow">{t('input')}</span>
              <CopyButton text={example.input!} />
            </div>
            <pre className={CODE_BODY_CLASS}>
              <code>{example.input}</code>
            </pre>
          </div>

          <div className="min-w-0">
            <div className={CODE_HEADER_CLASS}>
              <span className="eyebrow">{t('output')}</span>
              <CopyButton text={example.output!} />
            </div>
            <pre className={CODE_BODY_CLASS}>
              <code>{example.output}</code>
            </pre>
          </div>
        </div>
      ) : example.code ? (
        <div className="min-w-0">
          <div className={CODE_HEADER_CLASS}>
            <span className="eyebrow">{example.language || t('code')}</span>
            <CopyButton text={example.code} />
          </div>
          <pre className={CODE_BODY_CLASS}>
            <code>{example.code}</code>
          </pre>
        </div>
      ) : null}
    </div>
  )
})

// ============================================================================
// Main Component
// ============================================================================

/**
 * 사용 예시 목록
 *
 * @param content - 예시를 뽑아낼 마크다운 본문
 * @param maxVisible - 접기 전까지 펴 둘 예시 개수
 *
 * @example
 * ```tsx
 * <ExamplesSection content={markdownWithExamples} maxVisible={3} />
 * ```
 */
export const ExamplesSection = memo(function ExamplesSection({
  content,
  maxVisible = 3,
}: ExamplesSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const t = useTranslations('detail.examples')

  const examples = useMemo(() => parseExamplesFromContent(content), [content])

  if (examples.length === 0) {
    return null
  }

  const shouldCollapse = examples.length > maxVisible
  const visibleExamples = isExpanded ? examples : examples.slice(0, maxVisible)
  const hiddenCount = examples.length - maxVisible

  return (
    <div className="surface-card mb-8">
      <div className="mb-5 flex flex-wrap items-baseline gap-3">
        <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)]">
          {t('title')}
        </h2>
        <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
          {examples.length}
        </span>
      </div>

      <div className="space-y-4">
        {visibleExamples.map((example) => (
          <ExampleCard key={example.id} example={example} />
        ))}
      </div>

      {shouldCollapse && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-4 w-full rounded-xl border border-[var(--border-subtle)] py-3 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
        >
          {isExpanded ? t('collapse') : t('showMore', { count: hiddenCount })}
        </button>
      )}
    </div>
  )
})

// ============================================================================
// Exports
// ============================================================================

export type { ExamplesSectionProps }
