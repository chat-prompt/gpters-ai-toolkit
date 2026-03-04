/**
 * Tool selector component for wizard
 *
 * Grid of selectable Claude Code tools with toggle selection,
 * recommended tool indicators, and tool descriptions.
 */
'use client'

import { useTranslations } from 'next-intl'
import { CLAUDE_TOOLS, ClaudeTool } from '@/lib/data/type-config'
import type { TemplateCategoryInfo } from './types'

/** Props for ToolSelector component */
interface ToolSelectorProps {
  /** Currently selected tool list */
  selectedTools: ClaudeTool[]
  /** Handler for toggling tool selection */
  onToolToggle: (tool: ClaudeTool) => void
  /** Handler to clear all tool selections */
  onClearAll: () => void
  /** Handler to reset to category recommended tools */
  onResetToRecommended: () => void
  /** Category info for recommended tool indicators */
  categoryInfo: TemplateCategoryInfo | null
}

/**
 * Claude tool selection grid
 *
 * Displays all available Claude tools with toggle selection,
 * recommended badges, and quick action buttons.
 */
export function ToolSelector({
  selectedTools,
  onToolToggle,
  onClearAll,
  onResetToRecommended,
  categoryInfo,
}: ToolSelectorProps) {
  const t = useTranslations('templates.skillWizard.toolSelector')

  return (
    <div className="animate-fade-up">
      <h2 className="text-xl font-medium text-[var(--text-primary)] mb-2">{t('title')}</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">{t('subtitle')}</p>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-[var(--text-muted)]">
            {t('selectedCount', { count: selectedTools.length })}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClearAll}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              {t('clearAll')}
            </button>
            <span className="text-[var(--text-muted)]">|</span>
            <button
              onClick={onResetToRecommended}
              className="text-xs text-[var(--accent-cyan)] hover:underline"
            >
              {t('recommendedOnly')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {CLAUDE_TOOLS.map((tool) => {
            const isRecommended = categoryInfo?.recommendedTools.includes(tool)
            const isSelected = selectedTools.includes(tool)

            return (
              <button
                key={tool}
                onClick={() => onToolToggle(tool)}
                className={`p-3 rounded-lg text-left transition-all ${
                  isSelected
                    ? 'bg-[var(--accent-cyan)]/10 border-2 border-[var(--accent-cyan)]'
                    : 'bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-[var(--text-primary)]">{tool}</span>
                  {isSelected && <span className="text-[var(--accent-cyan)]">✓</span>}
                </div>
                {isRecommended && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]">
                    {t('recommended')}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
        <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">
          {t('toolDescriptions')}
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs text-[var(--text-secondary)]">
          {(
            [
              'Read',
              'Write',
              'Edit',
              'Glob',
              'Grep',
              'Bash',
              'Task',
              'WebFetch',
              'WebSearch',
              'TodoWrite',
            ] as const
          ).map((tool) => (
            <div key={tool}>
              <strong>{tool}</strong>: {t(`tools.${tool}`)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
