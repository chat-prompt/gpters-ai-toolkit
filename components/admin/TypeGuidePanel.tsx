'use client'

import { TYPE_CONFIG } from '@/lib/data/type-config'
import type { ItemType } from '@/lib/core/types'

interface TypeGuidePanelProps {
  type: ItemType
  className?: string
}

export function TypeGuidePanel({ type, className = '' }: TypeGuidePanelProps) {
  const config = TYPE_CONFIG[type]
  const { guide } = config

  return (
    <div className={`glass rounded-2xl p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">{config.icon}</span>
        <div>
          <h3 className="text-lg font-medium text-[var(--text-primary)]">
            {guide.title}
          </h3>
          <p className="text-sm text-[var(--text-muted)]">{config.description}</p>
        </div>
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
              <div className="mt-2 px-3 py-2 rounded-lg bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/20">
                <p className="text-xs text-[var(--accent-cyan)]">
                  <span className="font-medium">Tip:</span> {section.tip}
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
            특수 문법
          </h4>
          <div className="space-y-2">
            {guide.syntaxHighlights.map((item, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 text-sm"
              >
                <code className="px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--accent-purple)] font-mono text-xs shrink-0">
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
          이 타입의 필드
        </h4>
        <div className="flex flex-wrap gap-2">
          <span className="px-2 py-1 rounded text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
            name
          </span>
          <span className="px-2 py-1 rounded text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
            description
          </span>
          {config.fields.showDifficulty && (
            <span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-400">
              difficulty
            </span>
          )}
          {config.fields.showEstimatedTime && (
            <span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-400">
              estimatedTime
            </span>
          )}
          {config.fields.showAllowedTools && (
            <span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-400">
              allowed-tools
            </span>
          )}
          {config.fields.showAgentFields && (
            <>
              <span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-400">
                model
              </span>
              <span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-400">
                permissionMode
              </span>
              <span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-400">
                skills
              </span>
            </>
          )}
          {config.fields.showCommandFields && (
            <>
              <span className="px-2 py-1 rounded text-xs bg-cyan-500/20 text-cyan-400">
                argument-hint
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
