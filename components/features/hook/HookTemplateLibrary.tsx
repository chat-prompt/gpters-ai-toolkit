/**
 * Hook template library component
 *
 * Browsable library of pre-built hook templates with search,
 * category filtering, and expandable configuration details.
 */
'use client'

import { useState, useMemo } from 'react'
import { CopyButton } from '../../ui/CopyButton'
import {
  HOOK_TEMPLATES,
  HOOK_TEMPLATE_CATEGORIES,
  type HookTemplate,
  type HookTemplateCategory,
} from '@/lib/data/hook-templates'

/** Props for HookTemplateLibrary component */
interface HookTemplateLibraryProps {
  /** Callback when a template is selected for use */
  onSelectTemplate?: (template: HookTemplate) => void
  /** Whether to show in compact mode */
  compact?: boolean
}

/**
 * Hook template library with search and filtering
 *
 * Displays searchable grid of hook templates organized by category.
 * Each template card expands to show command, configuration, and usage examples.
 */
export function HookTemplateLibrary({ onSelectTemplate, compact = false }: HookTemplateLibraryProps) {
  const [selectedCategory, setSelectedCategory] = useState<HookTemplateCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null)

  const filteredTemplates = useMemo(() => {
    return HOOK_TEMPLATES.filter((template) => {
      // Category filter
      if (selectedCategory !== 'all' && template.category !== selectedCategory) {
        return false
      }
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          template.name.toLowerCase().includes(query) ||
          template.description.toLowerCase().includes(query) ||
          template.tags?.some(tag => tag.toLowerCase().includes(query))
        )
      }
      return true
    })
  }, [selectedCategory, searchQuery])

  const categoryColors: Record<string, string> = {
    cyan: 'border-[var(--accent-cyan)] bg-cyan-500/10 text-cyan-400',
    purple: 'border-[var(--accent-purple)] bg-purple-500/10 text-purple-400',
    yellow: 'border-yellow-500 bg-yellow-500/10 text-yellow-400',
    red: 'border-red-500 bg-red-500/10 text-red-400',
  }

  const generateHookConfig = (template: HookTemplate) => {
    return JSON.stringify({
      event: template.hookEvent,
      matcher: template.hookMatcher || '*',
      command: template.hookCommand,
      timeout: template.hookTimeout || 30000,
      blocking: template.hookBlocking ?? true,
    }, null, 2)
  }

  return (
    <div className={compact ? '' : 'glass rounded-2xl p-6'}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <span className="text-2xl">📚</span>
          Hook 템플릿 라이브러리
        </h2>
        <span className="text-sm text-[var(--text-muted)]">
          {filteredTemplates.length}개 템플릿
        </span>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Search */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="템플릿 검색..."
            className="w-full px-4 py-2.5 pl-10
              bg-[var(--bg-secondary)] text-[var(--text-primary)]
              border border-[var(--border-subtle)] rounded-xl
              focus:outline-none focus:border-[var(--accent-cyan)]
              placeholder:text-[var(--text-muted)]
              transition-colors"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
              selectedCategory === 'all'
                ? 'bg-[var(--accent-cyan)] text-[var(--bg-primary)]'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            전체
          </button>
          {(Object.entries(HOOK_TEMPLATE_CATEGORIES) as [HookTemplateCategory, typeof HOOK_TEMPLATE_CATEGORIES[HookTemplateCategory]][]).map(
            ([key, { label, emoji }]) => (
              <button
                key={key}
                onClick={() => setSelectedCategory(key)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-all flex items-center gap-1.5 ${
                  selectedCategory === key
                    ? 'bg-[var(--accent-cyan)] text-[var(--bg-primary)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <span>{emoji}</span>
                <span>{label}</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[var(--text-muted)]">검색 결과가 없습니다</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredTemplates.map((template) => {
            const categoryInfo = HOOK_TEMPLATE_CATEGORIES[template.category]
            const isExpanded = expandedTemplateId === template.id

            return (
              <div
                key={template.id}
                className={`border rounded-xl overflow-hidden transition-all ${
                  categoryColors[categoryInfo.color]
                } ${isExpanded ? 'ring-2 ring-[var(--accent-cyan)]' : ''}`}
              >
                {/* Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => setExpandedTemplateId(isExpanded ? null : template.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{categoryInfo.emoji}</span>
                        <h3 className="font-medium text-[var(--text-primary)]">
                          {template.name}
                        </h3>
                        <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                          {template.hookEvent}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {template.description}
                      </p>
                      {template.tags && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {template.tags.map(tag => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 text-xs rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {onSelectTemplate && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectTemplate(template)
                          }}
                          className="px-3 py-1.5 text-sm rounded-lg
                            bg-[var(--accent-cyan)] text-[var(--bg-primary)]
                            hover:opacity-90 transition-opacity"
                        >
                          사용하기
                        </button>
                      )}
                      <svg
                        className={`w-5 h-5 text-[var(--text-muted)] transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-[var(--border-subtle)] p-4 bg-[var(--bg-primary)]/50">
                    {/* Command */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-[var(--text-secondary)]">
                          Command
                        </label>
                        <CopyButton text={template.hookCommand} />
                      </div>
                      <pre className="p-3 rounded-lg bg-[var(--bg-secondary)] text-sm font-mono text-[var(--text-primary)] overflow-x-auto">
                        {template.hookCommand}
                      </pre>
                    </div>

                    {/* Configuration */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-[var(--text-secondary)]">
                          Hook 설정
                        </label>
                        <CopyButton text={generateHookConfig(template)} />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div className="p-2 rounded bg-[var(--bg-secondary)]">
                          <span className="text-[var(--text-muted)]">Event:</span>
                          <span className="ml-2 text-[var(--text-primary)]">{template.hookEvent}</span>
                        </div>
                        <div className="p-2 rounded bg-[var(--bg-secondary)]">
                          <span className="text-[var(--text-muted)]">Matcher:</span>
                          <span className="ml-2 text-[var(--text-primary)]">{template.hookMatcher || '*'}</span>
                        </div>
                        <div className="p-2 rounded bg-[var(--bg-secondary)]">
                          <span className="text-[var(--text-muted)]">Timeout:</span>
                          <span className="ml-2 text-[var(--text-primary)]">{template.hookTimeout || 30000}ms</span>
                        </div>
                        <div className="p-2 rounded bg-[var(--bg-secondary)]">
                          <span className="text-[var(--text-muted)]">Blocking:</span>
                          <span className="ml-2 text-[var(--text-primary)]">{template.hookBlocking ? 'Yes' : 'No'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Usage Example */}
                    {template.usageExample && (
                      <div>
                        <label className="text-sm font-medium text-[var(--text-secondary)] block mb-2">
                          사용 예시
                        </label>
                        <pre className="p-3 rounded-lg bg-[var(--bg-secondary)] text-sm font-mono text-[var(--text-muted)] overflow-x-auto whitespace-pre-wrap">
                          {template.usageExample}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
