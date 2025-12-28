'use client'

import { useState, useCallback } from 'react'
import { CopyButton } from './CopyButton'
import type { ItemType, AgentModel, AgentPermissionMode } from '@/lib/types'

interface QuickAction {
  id: string
  label: string
  description: string
  command: string
  icon: string
  color: string
  badge?: string
}

interface QuickActionGeneratorProps {
  itemId: string
  itemType: ItemType
  // Skill-specific
  pluginId?: string
  // Agent-specific
  agentModel?: AgentModel
  agentPermissionMode?: AgentPermissionMode
  agentSkills?: string
  // Command-specific
  commandArgumentHint?: string
  // Common
  allowedTools?: string
  marketplaceEnabled?: boolean
}

export function QuickActionGenerator({
  itemId,
  itemType,
  pluginId,
  agentModel,
  agentPermissionMode,
  agentSkills,
  commandArgumentHint,
  allowedTools,
  marketplaceEnabled,
}: QuickActionGeneratorProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopy = useCallback((actionId: string) => {
    setCopiedId(actionId)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  // Generate quick actions based on item type
  const generateActions = (): QuickAction[] => {
    const actions: QuickAction[] = []

    // MCP Prompt (available when marketplace is enabled)
    if (marketplaceEnabled) {
      actions.push({
        id: 'mcp-prompt',
        label: 'MCP 프롬프트 호출',
        description: '설치 없이 MCP 서버를 통해 바로 실행',
        command: `/mcp__gpters-marketplace__${itemId}`,
        icon: '🔮',
        color: 'purple',
        badge: '추천',
      })
    }

    // Type-specific actions
    if (itemType === 'skill') {
      // Skill activation
      actions.push({
        id: 'skill-invoke',
        label: '스킬 호출',
        description: 'Claude Code에서 스킬을 직접 호출',
        command: `/skill ${itemId}`,
        icon: '⚡',
        color: 'cyan',
      })

      // Plugin install (if pluginId exists)
      if (pluginId) {
        actions.push({
          id: 'plugin-install',
          label: '플러그인 설치',
          description: 'CLI로 플러그인 직접 설치',
          command: `claude plugins install ${pluginId}`,
          icon: '📦',
          color: 'green',
        })
      }

      // Marketplace install
      if (marketplaceEnabled) {
        actions.push({
          id: 'marketplace-install',
          label: '마켓플레이스 설치',
          description: 'GPTers 마켓플레이스에서 설치',
          command: `/plugin install ${itemId}@company-ai-toolkit`,
          icon: '🏪',
          color: 'blue',
        })
      }
    }

    if (itemType === 'agent') {
      // Agent execution with options
      let agentCommand = `/agent ${itemId}`
      const options: string[] = []

      if (agentModel && agentModel !== 'inherit') {
        options.push(`--model ${agentModel}`)
      }
      if (agentPermissionMode && agentPermissionMode !== 'default') {
        options.push(`--permission-mode ${agentPermissionMode}`)
      }

      if (options.length > 0) {
        agentCommand += ` ${options.join(' ')}`
      }

      actions.push({
        id: 'agent-run',
        label: '에이전트 실행',
        description: '에이전트를 실행하고 작업 시작',
        command: agentCommand,
        icon: '🤖',
        color: 'purple',
      })

      // Agent with prompt example
      actions.push({
        id: 'agent-prompt',
        label: '에이전트 + 프롬프트',
        description: '에이전트에 작업 지시와 함께 실행',
        command: `/agent ${itemId} "작업 내용을 입력하세요"`,
        icon: '💬',
        color: 'indigo',
      })

      // If agent has skills, show skill loading command
      if (agentSkills) {
        const skillsList = agentSkills.split(',').map(s => s.trim()).slice(0, 3)
        actions.push({
          id: 'agent-skills',
          label: '사용 스킬 목록',
          description: '이 에이전트가 로드하는 스킬들',
          command: skillsList.map(s => `/skill ${s}`).join('\n'),
          icon: '🧰',
          color: 'teal',
        })
      }
    }

    if (itemType === 'command') {
      // Command execution
      const argHint = commandArgumentHint || ''
      actions.push({
        id: 'command-run',
        label: '커맨드 실행',
        description: '슬래시 커맨드로 바로 실행',
        command: `/${itemId}${argHint ? ` ${argHint}` : ''}`,
        icon: '⌘',
        color: 'rose',
      })

      // Command with example args
      if (commandArgumentHint) {
        actions.push({
          id: 'command-example',
          label: '사용 예시',
          description: '인자와 함께 사용하는 예시',
          command: `/${itemId} ${commandArgumentHint.replace(/\[|\]/g, '')}`,
          icon: '📝',
          color: 'orange',
        })
      }
    }

    // Common: Allowed tools info
    if (allowedTools) {
      actions.push({
        id: 'allowed-tools',
        label: '허용된 도구',
        description: '이 아이템이 사용할 수 있는 Claude Code 도구',
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
          {itemType === 'skill' && (
            <>
              <li>
                <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">/skill list</code>로 설치된 스킬 목록 확인
              </li>
              <li>스킬은 컨텍스트에 자동으로 로드됩니다</li>
            </>
          )}
          {itemType === 'agent' && (
            <>
              <li>
                <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">--model opus</code>로 모델 변경 가능
              </li>
              <li>에이전트는 독립적인 세션에서 실행됩니다</li>
            </>
          )}
          {itemType === 'command' && (
            <>
              <li>
                <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">Tab</code>으로 자동완성 가능
              </li>
              <li>커맨드는 현재 세션에서 즉시 실행됩니다</li>
            </>
          )}
          {marketplaceEnabled && (
            <li>
              MCP 프롬프트는 설치 없이 바로 사용할 수 있습니다
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
