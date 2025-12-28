'use client'

import { useState, useMemo, memo } from 'react'
import { CopyButton } from './CopyButton'
import { MarkdownContent } from './MarkdownContent'
import { parseExamplesFromContent, type Example } from '@/lib/parse-examples'

interface ExamplesSectionProps {
  content: string
  maxVisible?: number
}

// ============================================================================
// Sub-Components
// ============================================================================

interface ExampleCardProps {
  example: Example
}

const ExampleCard = memo(function ExampleCard({ example }: ExampleCardProps) {
  const hasInputOutput = example.input && example.output

  return (
    <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
      {/* Example Header */}
      {example.title && (
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
          <h4 className="text-sm font-medium text-[var(--text-primary)]">
            {example.title}
          </h4>
        </div>
      )}

      {/* Description */}
      {example.description && (
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <MarkdownContent content={example.description} />
        </div>
      )}

      {/* Input/Output Layout */}
      {hasInputOutput ? (
        <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border-subtle)]">
          {/* Input */}
          <div>
            <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)]">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                입력
              </span>
              <CopyButton text={example.input!} />
            </div>
            <pre className="p-4 overflow-x-auto text-sm">
              <code className="text-emerald-400">{example.input}</code>
            </pre>
          </div>

          {/* Output */}
          <div>
            <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)]">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                출력
              </span>
              <CopyButton text={example.output!} />
            </div>
            <pre className="p-4 overflow-x-auto text-sm">
              <code className="text-cyan-400">{example.output}</code>
            </pre>
          </div>
        </div>
      ) : example.code ? (
        /* Single Code Block */
        <div>
          <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)]">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {example.language || '코드'}
            </span>
            <CopyButton text={example.code} />
          </div>
          <pre className="p-4 overflow-x-auto text-sm">
            <code className="text-emerald-400">{example.code}</code>
          </pre>
        </div>
      ) : null}
    </div>
  )
})

// ============================================================================
// Main Component
// ============================================================================

export const ExamplesSection = memo(function ExamplesSection({
  content,
  maxVisible = 3,
}: ExamplesSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const examples = useMemo(() => parseExamplesFromContent(content), [content])

  if (examples.length === 0) {
    return null
  }

  const shouldCollapse = examples.length > maxVisible
  const visibleExamples = isExpanded ? examples : examples.slice(0, maxVisible)
  const hiddenCount = examples.length - maxVisible

  return (
    <div className="glass rounded-2xl p-8 mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-xl">💡</span>
          <h2 className="text-lg font-medium text-[var(--text-primary)]">
            사용 예시
          </h2>
          <span className="px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-xs text-[var(--text-muted)]">
            {examples.length}개
          </span>
        </div>
      </div>

      {/* Examples List */}
      <div className="space-y-4">
        {visibleExamples.map((example) => (
          <ExampleCard key={example.id} example={example} />
        ))}
      </div>

      {/* Expand/Collapse Button */}
      {shouldCollapse && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-4 w-full py-3 rounded-xl bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center justify-center gap-2"
        >
          {isExpanded ? (
            <>
              <span>접기</span>
              <span className="text-xs">▲</span>
            </>
          ) : (
            <>
              <span>{hiddenCount}개 더 보기</span>
              <span className="text-xs">▼</span>
            </>
          )}
        </button>
      )}
    </div>
  )
})

// ============================================================================
// Exports
// ============================================================================

export type { ExamplesSectionProps }
