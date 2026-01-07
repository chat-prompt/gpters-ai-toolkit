/**
 * Skill preview component
 *
 * Renders a preview of a catalog item including metadata,
 * dependencies, usage examples, and markdown content.
 */
'use client'

import { MarkdownContent } from '../../ui/MarkdownContent'
import { TAGS, DIFFICULTY_LABELS, parseDependency } from '@/lib/core/types'
import { extractUsageExamples, type CodeBlock } from '@/lib/features/playground-utils'
import type { CatalogItem } from '@/lib/core/types'

/** Props for SkillPreview component */
interface SkillPreviewProps {
  /** Catalog item to preview */
  item: CatalogItem
  /** Additional CSS classes */
  className?: string
}

/**
 * Skill preview panel with metadata and content
 *
 * Displays item header, tags, dependencies, usage examples,
 * and rendered markdown content.
 */
export function SkillPreview({ item, className = '' }: SkillPreviewProps) {
  const usageExamples = extractUsageExamples(item.content)

  return (
    <div className={`h-full overflow-auto ${className}`}>
      {/* Header with metadata */}
      <div className="p-6 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xl">
            {item.type === 'skill' && '⚡'}
            {item.type === 'agent' && '◈'}
            {item.type === 'command' && '▸'}
            {item.type === 'hook' && '🪝'}
            {item.type === 'guide' && '📚'}
          </span>
          <h2
            className="text-2xl font-light text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-newsreader)' }}
          >
            {item.name}
          </h2>
        </div>

        <p className="text-[var(--text-secondary)] mb-4">{item.description}</p>

        {/* Author and metadata */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--text-muted)] mb-4">
          <span>@{item.authorName}</span>
          {item.difficulty && (
            <span
              className={`px-2 py-0.5 rounded-full text-xs ${
                DIFFICULTY_LABELS[item.difficulty]?.color || 'bg-gray-100 text-gray-800'
              }`}
            >
              {DIFFICULTY_LABELS[item.difficulty]?.emoji}{' '}
              {DIFFICULTY_LABELS[item.difficulty]?.label || item.difficulty}
            </span>
          )}
          {item.updatedAt && <span>Updated {item.updatedAt}</span>}
        </div>

        {/* Tags */}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-1 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
              >
                {TAGS[tag]?.label || tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Dependencies */}
      {item.dependencies && item.dependencies.length > 0 && (
        <div className="p-6 border-b border-[var(--border-subtle)]">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <span>🔗</span>
            <span>Dependencies</span>
          </h3>
          <div className="space-y-2">
            {item.dependencies.map((dep) => {
              const parsed = parseDependency(dep)
              return (
                <div
                  key={dep}
                  className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"
                >
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${
                      parsed.type === 'mcp'
                        ? 'bg-purple-500/20 text-purple-400'
                        : parsed.type === 'skill'
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {parsed.type}
                  </span>
                  <span>{parsed.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Usage Examples */}
      {usageExamples.length > 0 && (
        <div className="p-6 border-b border-[var(--border-subtle)]">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <span>💡</span>
            <span>Usage Examples</span>
          </h3>
          <div className="space-y-3">
            {usageExamples.slice(0, 3).map((example: CodeBlock, index: number) => (
              <div
                key={index}
                className="rounded-lg bg-[var(--bg-primary)] overflow-hidden"
              >
                <div className="px-3 py-1.5 text-xs text-[var(--text-muted)] bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)]">
                  {example.language}
                </div>
                <pre className="p-3 overflow-x-auto text-sm">
                  <code className="text-emerald-400">{example.code}</code>
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rendered Content Preview */}
      <div className="p-6">
        <h3 className="text-sm font-medium text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <span>📄</span>
          <span>Content Preview</span>
        </h3>
        <div className="prose prose-invert max-w-none">
          <MarkdownContent content={item.content} />
        </div>
      </div>
    </div>
  )
}
