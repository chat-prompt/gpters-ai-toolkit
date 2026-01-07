/**
 * Quick action generator component
 *
 * Generates and displays type-specific quick action buttons
 * for catalog items with copy-to-clipboard functionality.
 */
'use client'

import { useState, useCallback } from 'react'
import { CopyButton } from '../ui/CopyButton'

/** Quick action configuration */
interface QuickAction {
  /** Unique action identifier */
  id: string
  /** Display label for the action */
  label: string
  /** Brief description of what the action does */
  description: string
  /** Command or text to copy */
  command: string
  /** Emoji icon for the action */
  icon: string
  /** Color theme for styling */
  color: string
  /** Optional badge text (e.g., "추천") */
  badge?: string
}

/** Props for QuickActionGenerator component */
interface QuickActionGeneratorProps {
  /** Catalog item ID */
  itemId: string
  /** Comma-separated allowed tools (informational) */
  allowedTools?: string
  /** Whether MCP is enabled for this item */
  mcpEnabled?: boolean
}

/**
 * Quick action cards for catalog items
 *
 * Generates MCP prompt command for items with MCP enabled.
 * Only MCP prompts are functional - local installation commands
 * are not supported by this platform.
 */
export function QuickActionGenerator({
  itemId,
  allowedTools,
  mcpEnabled,
}: QuickActionGeneratorProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopy = useCallback((actionId: string) => {
    setCopiedId(actionId)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  // Generate quick actions - only MCP prompt is functional
  const generateActions = (): QuickAction[] => {
    const actions: QuickAction[] = []

    // MCP Prompt - the only functional action
    if (mcpEnabled) {
      actions.push({
        id: 'mcp-prompt',
        label: 'MCP 프롬프트 호출',
        description: '설치 없이 MCP 서버를 통해 바로 실행',
        command: `/mcp__gpters-ai-toolkit__${itemId}`,
        icon: '🔮',
        color: 'purple',
        badge: '추천',
      })
    }

    // Informational: Allowed tools (not executable, just info)
    if (allowedTools) {
      actions.push({
        id: 'allowed-tools',
        label: '허용된 도구',
        description: '이 아이템이 사용할 수 있는 Claude Code 도구 (참고용)',
        command: allowedTools,
        icon: '🔧',
        color: 'gray',
      })
    }

    return actions
  }

  const actions = generateActions()

  if (actions.length === 0) {
    return null
  }

  const getColorClasses = (color: string) => {
    const colorMap: Record<string, { bg: string; text: string; border: string }> = {
      cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
      purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
      rose: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' },
      green: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
      blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
      indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/30' },
      teal: { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/30' },
      orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
      gray: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/30' },
    }
    return colorMap[color] || colorMap.gray
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-xl">🚀</span>
        <h3 className="text-lg font-medium text-[var(--text-primary)]">퀵 액션</h3>
        <span className="text-xs text-[var(--text-muted)]">
          Claude Code에서 바로 사용
        </span>
      </div>

      <div className="space-y-3">
        {actions.map((action) => {
          const colors = getColorClasses(action.color)
          const isCopied = copiedId === action.id
          const isMultiLine = action.command.includes('\n')

          return (
            <div
              key={action.id}
              className={`relative rounded-xl border ${colors.border} ${colors.bg} p-4 transition-all hover:scale-[1.01]`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{action.icon}</span>
                  <span className={`font-medium ${colors.text}`}>{action.label}</span>
                  {action.badge && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                      {action.badge}
                    </span>
                  )}
                </div>
                <CopyButton
                  text={action.command}
                  onCopy={() => handleCopy(action.id)}
                />
              </div>

              {/* Description */}
              <p className="text-sm text-[var(--text-muted)] mb-3">
                {action.description}
              </p>

              {/* Command Preview */}
              <div className="bg-[var(--bg-primary)] rounded-lg p-3 overflow-x-auto">
                {isMultiLine ? (
                  <pre className={`text-sm font-mono ${colors.text} whitespace-pre-wrap break-all`}>
                    {action.command}
                  </pre>
                ) : (
                  <code className={`text-sm font-mono ${colors.text} break-all`}>
                    {action.command}
                  </code>
                )}
              </div>

              {/* Copied indicator */}
              {isCopied && (
                <div className="absolute top-4 right-4 flex items-center gap-1 text-xs text-green-400 animate-fade-in">
                  <span>Copied!</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Tips section */}
      <div className="mt-6 p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
        <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">
          💡 사용 팁
        </h4>
        <ul className="text-xs text-[var(--text-muted)] space-y-1">
          <li>MCP 프롬프트는 설치 없이 바로 사용할 수 있습니다</li>
          <li>MCP 서버 설정이 필요합니다 (<a href="/getting-started" className="text-[var(--accent-purple)] hover:underline">설정 방법</a>)</li>
          <li>프롬프트 호출 시 Claude Code가 자동으로 내용을 불러옵니다</li>
        </ul>
      </div>
    </div>
  )
}
