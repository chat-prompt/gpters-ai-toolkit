/**
 * Type guide panel component
 *
 * Displays type-specific guidance for creating catalog items,
 * including field hints, syntax highlights, and best practices.
 */
'use client'

import { useTranslations } from 'next-intl'
import { TYPE_CONFIG } from '@/lib/data/type-config'
import type { ItemType } from '@/lib/core/types'

/** Props for TypeGuidePanel component */
interface TypeGuidePanelProps {
  /** Item type to show guidance for */
  type: ItemType
  /** Additional CSS classes */
  className?: string
}

/** 필드 힌트 칩 공통 클래스 — 알약 배경 없이 테두리로만 구분 */
const fieldChipClass = 'px-2 py-1 rounded text-xs border border-[var(--border-subtle)] text-[var(--text-secondary)]'

/**
 * Displays contextual guidance panel for catalog item types
 *
 * Shows type-specific documentation, field hints, and syntax highlights
 * to help users create well-structured catalog items.
 */
export function TypeGuidePanel({ type, className = '' }: TypeGuidePanelProps) {
  const t = useTranslations('admin.typeGuidePanel')
  const config = TYPE_CONFIG[type]
  const { guide } = config

  return (
    <div className={`surface-card rounded-2xl p-6 ${className}`}>
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-medium text-[var(--text-primary)]">
          {guide.title}
        </h3>
        <p className="text-sm text-[var(--text-muted)]">{config.description}</p>
      </div>

      {/* Guide Sections */}
      <div className="space-y-5">
        {guide.sections.map((section, idx) => (
          <div key={idx}>
            <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">
              {section.heading}
            </h4>
            <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line">
              {section.content}
            </p>
            {section.tip && (
              <div className="mt-2 px-3 py-2 rounded-lg border border-[var(--border-subtle)]">
                <p className="text-xs text-[var(--text-secondary)]">
                  <span className="font-medium text-[var(--text-primary)]">Tip:</span> {section.tip}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Syntax Highlights (for commands) */}
      {guide.syntaxHighlights && guide.syntaxHighlights.length > 0 && (
        <div className="mt-6 pt-5 border-t border-[var(--border-subtle)]">
          <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">
            {t('syntaxHighlights')}
          </h4>
          <div className="space-y-2">
            {guide.syntaxHighlights.map((item, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 text-sm"
              >
                <code className="px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] font-mono text-xs shrink-0">
                  {item.syntax}
                </code>
                <span className="text-[var(--text-muted)]">{item.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Field Hints */}
      <div className="mt-6 pt-5 border-t border-[var(--border-subtle)]">
        <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">
          {t('typeFields')}
        </h4>
        <div className="flex flex-wrap gap-2">
          <span className={fieldChipClass}>name</span>
          <span className={fieldChipClass}>description</span>
          {config.fields.showDifficulty && (
            <span className={fieldChipClass}>difficulty</span>
          )}
          {config.fields.showEstimatedTime && (
            <span className={fieldChipClass}>estimatedTime</span>
          )}
          {config.fields.showAllowedTools && (
            <span className={fieldChipClass}>allowed-tools</span>
          )}
          {config.fields.showAgentFields && (
            <>
              <span className={fieldChipClass}>model</span>
              <span className={fieldChipClass}>permissionMode</span>
              <span className={fieldChipClass}>skills</span>
            </>
          )}
          {config.fields.showCommandFields && (
            <span className={fieldChipClass}>argument-hint</span>
          )}
        </div>
      </div>
    </div>
  )
}
