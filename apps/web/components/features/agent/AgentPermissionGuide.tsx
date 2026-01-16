/**
 * Agent permission guide component
 *
 * Visual guide explaining Claude Code agent permission modes with
 * security levels, use cases, and detailed mode information.
 */
'use client'

import { useState } from 'react'
import {
  PERMISSION_MODES,
  SECURITY_LEVELS,
  type PermissionModeInfo,
  type SecurityLevel,
} from '@/lib/agent/permission-mode'
import { AgentPermissionMode } from '@/lib/core/types'

/** Props for AgentPermissionGuide component */
interface AgentPermissionGuideProps {
  /** Currently selected mode to highlight */
  currentMode?: AgentPermissionMode
  /** Callback when user selects a mode (only in interactive mode) */
  onSelect?: (mode: AgentPermissionMode) => void
  /** Show in compact mode for smaller spaces */
  compact?: boolean
  /** Read-only display mode */
  readOnly?: boolean
  /** Show as collapsible section */
  collapsible?: boolean
  /** Initial collapsed state */
  initialCollapsed?: boolean
}

/**
 * AgentPermissionGuide - Agent 권한 모드 설명 및 선택 UI
 *
 * Agent의 agentPermissionMode 옵션을 시각적으로 설명하고
 * 각 모드의 보안 수준, 사용 사례, 주의사항을 보여줍니다.
 *
 * 사용처:
 * - Agent 상세 페이지: 현재 설정된 모드 표시
 * - Admin 폼: 모드 선택 인터페이스
 */
export function AgentPermissionGuide({
  currentMode,
  onSelect,
  compact = false,
  readOnly = false,
  collapsible = false,
  initialCollapsed = false,
}: AgentPermissionGuideProps) {
  const [expandedMode, setExpandedMode] = useState<AgentPermissionMode | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed)

  const modes = Object.values(PERMISSION_MODES)

  const content = (
    <div className="space-y-4">
      {/* Mode Cards */}
      {compact ? (
        <div className="space-y-2">
          {modes.map((modeInfo) => (
            <CompactModeCard
              key={modeInfo.mode}
              modeInfo={modeInfo}
              isSelected={currentMode === modeInfo.mode}
              onSelect={readOnly ? undefined : () => onSelect?.(modeInfo.mode)}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {modes.map((modeInfo) => (
            <PermissionModeCard
              key={modeInfo.mode}
              modeInfo={modeInfo}
              isSelected={currentMode === modeInfo.mode}
              isExpanded={expandedMode === modeInfo.mode}
              onSelect={readOnly ? undefined : () => onSelect?.(modeInfo.mode)}
              onToggleExpand={() =>
                setExpandedMode(expandedMode === modeInfo.mode ? null : modeInfo.mode)
              }
            />
          ))}
        </div>
      )}

      {/* Security Level Legend */}
      <SecurityLevelLegend />

      {/* General Security Warning */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <div className="flex items-start gap-3">
          <span className="text-lg">⚠️</span>
          <div>
            <h4 className="text-sm font-medium text-amber-400 mb-1">보안 주의사항</h4>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Agent 권한 모드는 Claude Code가 자동으로 수행할 수 있는 작업의 범위를 결정합니다.
              프로덕션 환경이나 민감한 데이터가 있는 프로젝트에서는 항상 <strong className="text-amber-400">Default</strong> 또는 <strong className="text-amber-400">Plan</strong> 모드를 권장합니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  if (collapsible) {
    return (
      <div className="glass rounded-2xl p-6 mb-8">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🔐</span>
            <h2 className="text-lg font-medium text-[var(--text-primary)]">권한 모드 가이드</h2>
            {currentMode && (
              <SecurityModeBadge mode={currentMode} />
            )}
          </div>
          <span className="text-[var(--text-muted)] transition-transform duration-200" style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>
            ▼
          </span>
        </button>

        {!isCollapsed && (
          <div className="mt-6">
            {content}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl p-6 mb-8">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-xl">🔐</span>
        <h2 className="text-lg font-medium text-[var(--text-primary)]">권한 모드 가이드</h2>
        {currentMode && (
          <SecurityModeBadge mode={currentMode} />
        )}
      </div>

      <p className="text-sm text-[var(--text-secondary)] mb-6">
        Agent가 Claude Code에서 실행될 때의 권한 수준을 설정합니다. 각 모드에 따라 자동 실행되는 작업의 범위가 달라집니다.
      </p>

      {content}
    </div>
  )
}

/** Permission mode card with expandable details */
function PermissionModeCard({
  modeInfo,
  isSelected,
  isExpanded,
  onSelect,
  onToggleExpand,
}: {
  modeInfo: PermissionModeInfo
  isSelected: boolean
  isExpanded: boolean
  onSelect?: () => void
  onToggleExpand: () => void
}) {
  const securityInfo = SECURITY_LEVELS[modeInfo.securityLevel]
  const isInteractive = !!onSelect

  return (
    <div
      className={`rounded-xl border-2 p-4 transition-all ${
        isSelected
          ? 'border-[var(--accent-purple)] bg-[var(--accent-purple)]/10'
          : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:border-[var(--border-subtle)]/80'
      } ${isInteractive ? 'cursor-pointer' : ''}`}
      onClick={isInteractive ? onSelect : undefined}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{securityInfo.icon}</span>
          <div>
            <h3 className="font-medium text-[var(--text-primary)]">{modeInfo.label}</h3>
            {isSelected && (
              <span className="text-[10px] text-[var(--accent-purple)] font-medium uppercase tracking-wider">
                현재 설정
              </span>
            )}
          </div>
        </div>
        <SecurityLevelBadge level={modeInfo.securityLevel} />
      </div>

      {/* Short Description */}
      <p className="text-sm text-[var(--text-muted)] mb-3">{modeInfo.shortDescription}</p>

      {/* Expand Toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleExpand()
        }}
        className="text-sm text-[var(--accent-cyan)] hover:text-[var(--accent-cyan)]/80 transition-colors"
      >
        {isExpanded ? '간략히 ▲' : '자세히 보기 ▼'}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] space-y-4">
          {/* Full Description */}
          <div>
            <h4 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">
              상세 설명
            </h4>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {modeInfo.fullDescription}
            </p>
          </div>

          {/* Security Warnings */}
          {modeInfo.securityWarnings.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-amber-400 uppercase tracking-wider mb-2">
                보안 주의사항
              </h4>
              <ul className="space-y-1">
                {modeInfo.securityWarnings.map((warning, i) => (
                  <li key={i} className="text-xs text-amber-300/80 flex items-start gap-2">
                    <span className="text-amber-400 mt-0.5">•</span>
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Allowed Operations */}
          <div>
            <h4 className="text-xs font-medium text-green-400 uppercase tracking-wider mb-2">
              허용 작업
            </h4>
            <ul className="space-y-1">
              {modeInfo.allowedOperations.map((op, i) => (
                <li key={i} className="text-xs text-green-300/80 flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">✓</span>
                  {op}
                </li>
              ))}
            </ul>
          </div>

          {/* Blocked Operations */}
          {modeInfo.blockedOperations.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-red-400 uppercase tracking-wider mb-2">
                차단 작업
              </h4>
              <ul className="space-y-1">
                {modeInfo.blockedOperations.map((op, i) => (
                  <li key={i} className="text-xs text-red-300/80 flex items-start gap-2">
                    <span className="text-red-400 mt-0.5">✗</span>
                    {op}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Use Cases */}
          <div>
            <h4 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">
              사용 사례
            </h4>
            <div className="space-y-2">
              {modeInfo.useCases.slice(0, 2).map((useCase, i) => (
                <div key={i} className="p-3 rounded-lg bg-[var(--bg-tertiary)]">
                  <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
                    {useCase.title}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">{useCase.description}</p>
                  {useCase.example && (
                    <p className="text-xs text-[var(--accent-cyan)] mt-2 font-mono">
                      예: {useCase.example}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Best Practices */}
          <div>
            <h4 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">
              권장 사항
            </h4>
            <ul className="space-y-1">
              {modeInfo.bestPractices.slice(0, 3).map((practice, i) => (
                <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-2">
                  <span className="text-[var(--accent-cyan)] mt-0.5">→</span>
                  {practice}
                </li>
              ))}
            </ul>
          </div>

          {/* Not Recommended For */}
          {modeInfo.notRecommendedFor.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">
                비권장 상황
              </h4>
              <ul className="space-y-1">
                {modeInfo.notRecommendedFor.map((item, i) => (
                  <li key={i} className="text-xs text-[var(--text-muted)] flex items-start gap-2">
                    <span className="text-orange-400 mt-0.5">!</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Compact mode card for smaller spaces */
function CompactModeCard({
  modeInfo,
  isSelected,
  onSelect,
}: {
  modeInfo: PermissionModeInfo
  isSelected: boolean
  onSelect?: () => void
}) {
  const securityInfo = SECURITY_LEVELS[modeInfo.securityLevel]
  const isInteractive = !!onSelect

  return (
    <div
      className={`rounded-lg border p-3 transition-all flex items-center gap-3 ${
        isSelected
          ? 'border-[var(--accent-purple)] bg-[var(--accent-purple)]/10'
          : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
      } ${isInteractive ? 'cursor-pointer' : ''}`}
      onClick={isInteractive ? onSelect : undefined}
    >
      <span className="text-lg">{securityInfo.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--text-primary)]">{modeInfo.label}</span>
          <SecurityLevelBadge level={modeInfo.securityLevel} size="sm" />
        </div>
        <p className="text-xs text-[var(--text-muted)] truncate">{modeInfo.shortDescription}</p>
      </div>
      {isSelected && (
        <span className="text-[var(--accent-purple)]">✓</span>
      )}
    </div>
  )
}

/** Security level badge with size variants */
function SecurityLevelBadge({ level, size = 'md' }: { level: SecurityLevel; size?: 'sm' | 'md' }) {
  const info = SECURITY_LEVELS[level]

  const sizeClasses = size === 'sm'
    ? 'text-[9px] px-1.5 py-0.5'
    : 'text-[10px] px-2 py-0.5'

  // Map security colors to our theme variables
  const colorClasses: Record<SecurityLevel, string> = {
    low: 'bg-green-500/10 text-green-400 border-green-500/20',
    medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  }

  return (
    <span className={`${sizeClasses} rounded-full border font-medium ${colorClasses[level]}`}>
      {info.label}
    </span>
  )
}

/** Security mode badge for header display */
function SecurityModeBadge({ mode }: { mode: AgentPermissionMode }) {
  const modeInfo = PERMISSION_MODES[mode]
  const securityInfo = SECURITY_LEVELS[modeInfo.securityLevel]

  const colorClasses: Record<SecurityLevel, string> = {
    low: 'bg-green-500/10 text-green-400 border-green-500/20',
    medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  }

  return (
    <span className={`text-xs px-2 py-1 rounded-full border ${colorClasses[modeInfo.securityLevel]}`}>
      {securityInfo.icon} {modeInfo.label}
    </span>
  )
}

/** Security level legend explaining all levels */
function SecurityLevelLegend() {
  return (
    <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
      <h4 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
        보안 수준 안내
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.entries(SECURITY_LEVELS) as [SecurityLevel, typeof SECURITY_LEVELS[SecurityLevel]][]).map(([level, info]) => (
          <div key={level} className="flex items-center gap-2">
            <span>{info.icon}</span>
            <div>
              <span className="text-xs font-medium text-[var(--text-primary)]">{info.label}</span>
              <p className="text-[10px] text-[var(--text-muted)] line-clamp-2">{info.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Display-only component for showing current mode in detail pages */
export function AgentPermissionModeDisplay({ mode }: { mode: AgentPermissionMode }) {
  const modeInfo = PERMISSION_MODES[mode]
  const securityInfo = SECURITY_LEVELS[modeInfo.securityLevel]

  const colorClasses: Record<SecurityLevel, string> = {
    low: 'bg-green-500/10 border-green-500/20',
    medium: 'bg-yellow-500/10 border-yellow-500/20',
    high: 'bg-orange-500/10 border-orange-500/20',
    critical: 'bg-red-500/10 border-red-500/20',
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border ${colorClasses[modeInfo.securityLevel]}`}>
      <span className="text-lg">{securityInfo.icon}</span>
      <div>
        <span className="text-sm font-medium text-[var(--text-primary)]">{modeInfo.label}</span>
        <p className="text-xs text-[var(--text-muted)]">{modeInfo.shortDescription}</p>
      </div>
    </div>
  )
}

/** Standalone mode info section for agent detail pages */
export function AgentPermissionModeSection({ mode }: { mode: AgentPermissionMode }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const modeInfo = PERMISSION_MODES[mode]
  const securityInfo = SECURITY_LEVELS[modeInfo.securityLevel]

  const colorClasses: Record<SecurityLevel, string> = {
    low: 'border-green-500/20',
    medium: 'border-yellow-500/20',
    high: 'border-orange-500/20',
    critical: 'border-red-500/20',
  }

  return (
    <div className="glass rounded-2xl p-6 mb-8">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xl">🔐</span>
        <h2 className="text-lg font-medium text-[var(--text-primary)]">권한 모드</h2>
      </div>

      <div className={`p-4 rounded-xl border ${colorClasses[modeInfo.securityLevel]} bg-[var(--bg-secondary)]`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{securityInfo.icon}</span>
            <div>
              <h3 className="font-semibold text-[var(--text-primary)]">{modeInfo.label}</h3>
              <p className="text-sm text-[var(--text-secondary)]">{modeInfo.shortDescription}</p>
            </div>
          </div>
          <SecurityLevelBadge level={modeInfo.securityLevel} />
        </div>

        <p className="text-sm text-[var(--text-muted)] mb-4">{modeInfo.fullDescription}</p>

        {/* Security Warnings */}
        {modeInfo.securityWarnings.length > 0 && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-4">
            <ul className="space-y-1">
              {modeInfo.securityWarnings.map((warning, i) => (
                <li key={i} className="text-xs text-amber-300/80 flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5">⚠</span>
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-[var(--accent-cyan)] hover:text-[var(--accent-cyan)]/80 transition-colors"
        >
          {isExpanded ? '간략히 ▲' : '상세 정보 보기 ▼'}
        </button>

        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] space-y-4">
            {/* Allowed Operations */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-medium text-green-400 uppercase tracking-wider mb-2">
                  허용 작업
                </h4>
                <ul className="space-y-1">
                  {modeInfo.allowedOperations.map((op, i) => (
                    <li key={i} className="text-xs text-green-300/80 flex items-start gap-2">
                      <span className="text-green-400 mt-0.5">✓</span>
                      {op}
                    </li>
                  ))}
                </ul>
              </div>

              {modeInfo.blockedOperations.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-red-400 uppercase tracking-wider mb-2">
                    차단 작업
                  </h4>
                  <ul className="space-y-1">
                    {modeInfo.blockedOperations.map((op, i) => (
                      <li key={i} className="text-xs text-red-300/80 flex items-start gap-2">
                        <span className="text-red-400 mt-0.5">✗</span>
                        {op}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Use Cases */}
            <div>
              <h4 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">
                적합한 사용 사례
              </h4>
              <div className="grid md:grid-cols-2 gap-2">
                {modeInfo.useCases.map((useCase, i) => (
                  <div key={i} className="p-3 rounded-lg bg-[var(--bg-tertiary)]">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{useCase.title}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">{useCase.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Best Practices */}
            <div>
              <h4 className="text-xs font-medium text-[var(--accent-cyan)] uppercase tracking-wider mb-2">
                권장 사항
              </h4>
              <ul className="space-y-1">
                {modeInfo.bestPractices.map((practice, i) => (
                  <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-2">
                    <span className="text-[var(--accent-cyan)] mt-0.5">→</span>
                    {practice}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
