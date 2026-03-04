/**
 * Template preview component for wizard
 *
 * Displays generated template with summary cards, copy/download
 * actions, and installation instructions.
 */
'use client'

import { useTranslations } from 'next-intl'
import { CopyButton } from '../../../ui/CopyButton'
import type { TemplateCategoryInfo } from './types'
import type { ClaudeTool } from '@/lib/data/type-config'

/** Props for TemplatePreview component */
interface TemplatePreviewProps {
  /** Selected category information */
  categoryInfo: TemplateCategoryInfo | null
  /** Generated skill ID */
  generatedId: string
  /** List of selected tools */
  selectedTools: ClaudeTool[]
  /** Generated markdown template content */
  generatedContent: string
  /** Handler for downloading template file */
  onDownload: () => void
}

/**
 * Generated template preview and export
 *
 * Shows template summary, code preview with syntax highlighting,
 * copy/download buttons, and next steps guide.
 */
export function TemplatePreview({
  categoryInfo,
  generatedId,
  selectedTools,
  generatedContent,
  onDownload,
}: TemplatePreviewProps) {
  const t = useTranslations('templates.skillWizard.templatePreview')

  return (
    <div className="animate-fade-up">
      <h2 className="text-xl font-medium text-[var(--text-primary)] mb-2">{t('title')}</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">{t('subtitle')}</p>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="p-3 rounded-lg bg-[var(--bg-secondary)]">
          <div className="text-xs text-[var(--text-muted)] uppercase mb-1">{t('category')}</div>
          <div className="text-sm text-[var(--text-primary)] flex items-center gap-2">
            <span>{categoryInfo?.icon}</span>
            {categoryInfo?.name}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--bg-secondary)]">
          <div className="text-xs text-[var(--text-muted)] uppercase mb-1">{t('skillId')}</div>
          <div className="text-sm text-[var(--accent-cyan)] font-mono truncate">{generatedId}</div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--bg-secondary)]">
          <div className="text-xs text-[var(--text-muted)] uppercase mb-1">{t('tools')}</div>
          <div className="text-sm text-[var(--text-primary)]">
            {selectedTools.length > 0
              ? t('toolsAllowed', { count: selectedTools.length })
              : t('toolsAllowAll')}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--bg-secondary)]">
          <div className="text-xs text-[var(--text-muted)] uppercase mb-1">{t('installPath')}</div>
          <div className="text-sm text-[var(--text-secondary)] font-mono truncate">
            ~/.claude/skills/{generatedId}/
          </div>
        </div>
      </div>

      {/* Allowed Tools Display */}
      {selectedTools.length > 0 && (
        <div className="mb-6">
          <div className="text-xs text-[var(--text-muted)] uppercase mb-2">{t('allowedTools')}</div>
          <div className="flex flex-wrap gap-2">
            {selectedTools.map((tool) => (
              <span
                key={tool}
                className="px-2 py-1 rounded text-xs bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Code Preview */}
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-[var(--text-muted)] uppercase">skill.md</div>
          <div className="flex items-center gap-2">
            <button
              onClick={onDownload}
              className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              {t('download')}
            </button>
            <CopyButton text={generatedContent} />
          </div>
        </div>
        <div className="relative rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] overflow-hidden">
          <pre className="p-4 overflow-auto max-h-[400px] text-sm text-[var(--text-secondary)] font-mono">
            <code>{generatedContent}</code>
          </pre>
        </div>
      </div>

      {/* Next Steps */}
      <div className="mt-6 p-4 rounded-lg bg-[var(--accent-cyan)]/5 border border-[var(--accent-cyan)]/20">
        <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">{t('nextSteps')}</h4>
        <ol className="space-y-2 text-xs text-[var(--text-secondary)]">
          <li className="flex items-start gap-2">
            <span className="text-[var(--accent-cyan)] font-medium">1.</span>
            <span>
              {t('step1')}{' '}
              <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--accent-cyan)]">
                mkdir -p ~/.claude/skills/{generatedId}
              </code>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[var(--accent-cyan)] font-medium">2.</span>
            <span>
              {t('step2')}{' '}
              <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">
                ~/.claude/skills/{generatedId}/skill.md
              </code>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[var(--accent-cyan)] font-medium">3.</span>
            <span>{t('step3')}</span>
          </li>
        </ol>
      </div>
    </div>
  )
}
