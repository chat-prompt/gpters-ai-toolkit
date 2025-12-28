'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  PERMISSION_MODES,
  SECURITY_LEVELS,
  getRecommendation,
  validateModeForContext,
  compareModes,
  type PermissionModeInfo,
  type RecommendationCriteria,
  type SecurityLevel,
} from '@/lib/agent/permission-mode'
import { AgentPermissionMode } from '@/lib/types'

interface AgentPermissionModeSelectorProps {
  value?: AgentPermissionMode
  onChange?: (mode: AgentPermissionMode) => void
  showRecommendation?: boolean
  context?: Partial<RecommendationCriteria>
  compact?: boolean
  readOnly?: boolean
}

export function AgentPermissionModeSelector({
  value,
  onChange,
  showRecommendation = false,
  context,
  compact = false,
  readOnly = false,
}: AgentPermissionModeSelectorProps) {
  const [selectedMode, setSelectedMode] = useState<AgentPermissionMode | undefined>(value)
  const [expandedMode, setExpandedMode] = useState<AgentPermissionMode | null>(null)

  const handleSelect = useCallback(
    (mode: AgentPermissionMode) => {
      if (readOnly) return
      setSelectedMode(mode)
      onChange?.(mode)
    },
    [onChange, readOnly]
  )

  const recommendation = useMemo(() => {
    if (!showRecommendation || !context) return null
    return getRecommendation(context as RecommendationCriteria)
  }, [showRecommendation, context])

  const modes = Object.values(PERMISSION_MODES)

  if (compact) {
    return (
      <CompactModeSelector
        modes={modes}
        selectedMode={selectedMode}
        onSelect={handleSelect}
        readOnly={readOnly}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Recommendation Banner */}
      {recommendation && (
        <RecommendationBanner recommendation={recommendation} onSelect={handleSelect} />
      )}

      {/* Mode Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {modes.map((modeInfo) => (
          <ModeCard
            key={modeInfo.mode}
            modeInfo={modeInfo}
            isSelected={selectedMode === modeInfo.mode}
            isRecommended={recommendation?.recommended === modeInfo.mode}
            isExpanded={expandedMode === modeInfo.mode}
            onSelect={() => handleSelect(modeInfo.mode)}
            onToggleExpand={() =>
              setExpandedMode(expandedMode === modeInfo.mode ? null : modeInfo.mode)
            }
            context={context}
            readOnly={readOnly}
          />
        ))}
      </div>

      {/* Selected Mode Details */}
      {selectedMode && (
        <SelectedModeDetails modeInfo={PERMISSION_MODES[selectedMode]} context={context} />
      )}
    </div>
  )
}

// Compact selector for forms
function CompactModeSelector({
  modes,
  selectedMode,
  onSelect,
  readOnly,
}: {
  modes: PermissionModeInfo[]
  selectedMode?: AgentPermissionMode
  onSelect: (mode: AgentPermissionMode) => void
  readOnly: boolean
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-300">권한 모드</label>
      <select
        value={selectedMode || ''}
        onChange={(e) => onSelect(e.target.value as AgentPermissionMode)}
        disabled={readOnly}
        className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
      >
        <option value="">선택하세요</option>
        {modes.map((mode) => {
          const securityInfo = SECURITY_LEVELS[mode.securityLevel]
          return (
            <option key={mode.mode} value={mode.mode}>
              {securityInfo.icon} {mode.label} - {mode.shortDescription}
            </option>
          )
        })}
      </select>
      {selectedMode && (
        <p className="text-sm text-gray-400">{PERMISSION_MODES[selectedMode].fullDescription}</p>
      )}
    </div>
  )
}

// Recommendation banner component
function RecommendationBanner({
  recommendation,
  onSelect,
}: {
  recommendation: ReturnType<typeof getRecommendation>
  onSelect: (mode: AgentPermissionMode) => void
}) {
  const modeInfo = PERMISSION_MODES[recommendation.recommended]
  const securityInfo = SECURITY_LEVELS[modeInfo.securityLevel]

  return (
    <div className={`rounded-lg border p-4 ${securityInfo.bgColor} ${securityInfo.borderColor}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{securityInfo.icon}</span>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">권장 모드: {modeInfo.label}</h3>
          <p className="mt-1 text-sm text-gray-700">{modeInfo.shortDescription}</p>

          {recommendation.reasoning.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              {recommendation.reasoning.map((reason, i) => (
                <li key={i}>• {reason}</li>
              ))}
            </ul>
          )}

          {recommendation.warnings.length > 0 && (
            <div className="mt-2 space-y-1 text-sm text-amber-700">
              {recommendation.warnings.map((warning, i) => (
                <p key={i}>⚠️ {warning}</p>
              ))}
            </div>
          )}

          <button
            onClick={() => onSelect(recommendation.recommended)}
            className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            권장 모드 선택
          </button>
        </div>
      </div>
    </div>
  )
}

// Mode card component
function ModeCard({
  modeInfo,
  isSelected,
  isRecommended,
  isExpanded,
  onSelect,
  onToggleExpand,
  context,
  readOnly,
}: {
  modeInfo: PermissionModeInfo
  isSelected: boolean
  isRecommended: boolean
  isExpanded: boolean
  onSelect: () => void
  onToggleExpand: () => void
  context?: Partial<RecommendationCriteria>
  readOnly: boolean
}) {
  const securityInfo = SECURITY_LEVELS[modeInfo.securityLevel]
  const validation = context ? validateModeForContext(modeInfo.mode, context) : null

  return (
    <div
      className={`rounded-lg border-2 p-4 transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-gray-700 bg-gray-800 hover:border-gray-600'
      } ${!readOnly && 'cursor-pointer'}`}
      onClick={readOnly ? undefined : onSelect}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{securityInfo.icon}</span>
          <div>
            <h3 className="font-semibold text-white">{modeInfo.label}</h3>
            {isRecommended && (
              <span className="text-xs text-blue-400">✓ 권장</span>
            )}
          </div>
        </div>
        <SecurityBadge level={modeInfo.securityLevel} />
      </div>

      {/* Description */}
      <p className="mt-2 text-sm text-gray-400">{modeInfo.shortDescription}</p>

      {/* Validation warnings */}
      {validation && !validation.isValid && (
        <div className="mt-2 rounded bg-red-500/20 px-2 py-1 text-xs text-red-400">
          {validation.warnings[0]}
        </div>
      )}

      {/* Expand button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleExpand()
        }}
        className="mt-3 text-sm text-blue-400 hover:text-blue-300"
      >
        {isExpanded ? '간략히 보기 ▲' : '자세히 보기 ▼'}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-4 space-y-4 border-t border-gray-700 pt-4">
          {/* Full description */}
          <div>
            <h4 className="text-sm font-medium text-gray-300">상세 설명</h4>
            <p className="mt-1 text-sm text-gray-400">{modeInfo.fullDescription}</p>
          </div>

          {/* Security warnings */}
          {modeInfo.securityWarnings.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-300">보안 주의사항</h4>
              <ul className="mt-1 space-y-1 text-sm text-amber-400">
                {modeInfo.securityWarnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Allowed operations */}
          <div>
            <h4 className="text-sm font-medium text-gray-300">허용되는 작업</h4>
            <ul className="mt-1 space-y-1 text-sm text-green-400">
              {modeInfo.allowedOperations.map((op, i) => (
                <li key={i}>✓ {op}</li>
              ))}
            </ul>
          </div>

          {/* Blocked operations */}
          {modeInfo.blockedOperations.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-300">차단되는 작업</h4>
              <ul className="mt-1 space-y-1 text-sm text-red-400">
                {modeInfo.blockedOperations.map((op, i) => (
                  <li key={i}>✗ {op}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Use cases */}
          <div>
            <h4 className="text-sm font-medium text-gray-300">사용 사례</h4>
            <div className="mt-2 space-y-2">
              {modeInfo.useCases.slice(0, 2).map((useCase, i) => (
                <div key={i} className="rounded bg-gray-700/50 p-2 text-sm">
                  <p className="font-medium text-white">{useCase.title}</p>
                  <p className="text-gray-400">{useCase.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Security badge component
function SecurityBadge({ level }: { level: SecurityLevel }) {
  const info = SECURITY_LEVELS[level]
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${info.bgColor} ${info.color}`}
    >
      {info.label}
    </span>
  )
}

// Selected mode details panel
function SelectedModeDetails({
  modeInfo,
  context,
}: {
  modeInfo: PermissionModeInfo
  context?: Partial<RecommendationCriteria>
}) {
  const validation = context ? validateModeForContext(modeInfo.mode, context) : null
  const securityInfo = SECURITY_LEVELS[modeInfo.securityLevel]

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{securityInfo.icon}</span>
        <div>
          <h2 className="text-xl font-bold text-white">{modeInfo.label}</h2>
          <p className="text-gray-400">{modeInfo.shortDescription}</p>
        </div>
      </div>

      {/* Validation results */}
      {validation && (
        <div className="mt-4">
          {validation.warnings.map((warning, i) => (
            <p key={i} className="text-sm text-amber-400">
              {warning}
            </p>
          ))}
          {validation.suggestions.map((suggestion, i) => (
            <p key={i} className="text-sm text-blue-400">
              💡 {suggestion}
            </p>
          ))}
        </div>
      )}

      {/* Best practices */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-300">모범 사례</h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-400">
          {modeInfo.bestPractices.map((practice, i) => (
            <li key={i}>• {practice}</li>
          ))}
        </ul>
      </div>

      {/* Not recommended for */}
      {modeInfo.notRecommendedFor.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-gray-300">권장하지 않는 경우</h3>
          <ul className="mt-2 space-y-1 text-sm text-gray-400">
            {modeInfo.notRecommendedFor.map((item, i) => (
              <li key={i}>• {item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// Export sub-components for flexibility
export { ModeCard, SecurityBadge, RecommendationBanner, SelectedModeDetails }

// Permission Mode Comparison component
export function PermissionModeComparison({
  mode1,
  mode2,
}: {
  mode1: AgentPermissionMode
  mode2: AgentPermissionMode
}) {
  const comparison = compareModes(mode1, mode2)
  const info1 = PERMISSION_MODES[mode1]
  const info2 = PERMISSION_MODES[mode2]

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <h3 className="text-lg font-semibold text-white">모드 비교</h3>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded bg-gray-700/50 p-3">
          <div className="flex items-center gap-2">
            <span>{SECURITY_LEVELS[info1.securityLevel].icon}</span>
            <span className="font-medium text-white">{info1.label}</span>
          </div>
          <SecurityBadge level={info1.securityLevel} />
        </div>

        <div className="rounded bg-gray-700/50 p-3">
          <div className="flex items-center gap-2">
            <span>{SECURITY_LEVELS[info2.securityLevel].icon}</span>
            <span className="font-medium text-white">{info2.label}</span>
          </div>
          <SecurityBadge level={info2.securityLevel} />
        </div>
      </div>

      <div className="mt-4">
        <p className="text-sm text-gray-400">
          보안 수준: {info1.label}은(는) {info2.label}보다{' '}
          {comparison.securityComparison === 'safer'
            ? '더 안전합니다'
            : comparison.securityComparison === 'riskier'
              ? '더 위험합니다'
              : '동일한 보안 수준입니다'}
        </p>
      </div>

      {comparison.differences.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-300">주요 차이점</h4>
          <ul className="mt-2 space-y-1 text-sm text-gray-400">
            {comparison.differences.map((diff, i) => (
              <li key={i}>• {diff}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// Simple display component for showing current mode
export function PermissionModeDisplay({ mode }: { mode: AgentPermissionMode }) {
  const info = PERMISSION_MODES[mode]
  const securityInfo = SECURITY_LEVELS[info.securityLevel]

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 ${securityInfo.bgColor} ${securityInfo.borderColor}`}
    >
      <span>{securityInfo.icon}</span>
      <span className={`font-medium ${securityInfo.color}`}>{info.label}</span>
    </div>
  )
}
