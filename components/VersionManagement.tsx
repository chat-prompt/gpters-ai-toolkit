'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  PluginUpdate,
  UpdateCheckResult,
  type ChangelogSection,
  parseChangelog,
  getChangesBetweenVersions,
  getUpdateTypeDescription,
  formatVersionDiff,
  compareVersions,
  normalizeVersion,
  isValidVersion,
} from '@/lib/plugin/updates'
import {
  InstallationSnapshot,
  RollbackScope,
  RollbackStatus,
  getRollbackScopeLabel,
  getRollbackStatusLabel,
  getDaysUntilExpiry,
  isSnapshotExpired,
  formatFileSize,
  formatDuration,
  ROLLBACK_STEPS,
} from '@/lib/plugin/rollback'

// ============================================================================
// Types
// ============================================================================

interface VersionBadgeProps {
  version: string
  type?: 'current' | 'latest' | 'update'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

interface UpdateTypeBadgeProps {
  type: 'major' | 'minor' | 'patch'
  size?: 'sm' | 'md' | 'lg'
  showDescription?: boolean
  className?: string
}

interface VersionComparisonProps {
  currentVersion: string
  latestVersion: string
  showArrow?: boolean
  className?: string
}

interface ChangelogViewerProps {
  changelog: string
  currentVersion?: string
  latestVersion?: string
  maxSections?: number
  className?: string
}

interface UpdateCardProps {
  update: PluginUpdate
  onUpdate?: (update: PluginUpdate) => void
  onViewChangelog?: (update: PluginUpdate) => void
  className?: string
}

interface UpdateListProps {
  result: UpdateCheckResult
  onUpdateAll?: () => void
  onUpdateSingle?: (update: PluginUpdate) => void
  className?: string
}

interface RollbackCardProps {
  snapshot: InstallationSnapshot
  onRollback?: (snapshot: InstallationSnapshot, scope: RollbackScope) => void
  onPreview?: (snapshot: InstallationSnapshot) => void
  className?: string
}

interface RollbackProgressProps {
  currentStep: string
  completedSteps: number
  totalSteps: number
  percentage: number
  status: RollbackStatus
  className?: string
}

interface VersionHistoryProps {
  versions: Array<{
    version: string
    date: string
    changes: string[]
    isCurrent?: boolean
  }>
  maxItems?: number
  className?: string
}

// ============================================================================
// VersionBadge Component
// ============================================================================

/**
 * Display a version number with appropriate styling
 */
export function VersionBadge({
  version,
  type = 'current',
  size = 'md',
  className = '',
}: VersionBadgeProps) {
  const normalizedVersion = useMemo(() => {
    return isValidVersion(version) ? normalizeVersion(version) : version
  }, [version])

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  }

  const typeClasses = {
    current: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
    latest: 'bg-green-500/20 text-green-400',
    update: 'bg-amber-500/20 text-amber-400',
  }

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-lg font-mono font-medium
        ${sizeClasses[size]}
        ${typeClasses[type]}
        ${className}
      `}
    >
      <span className="opacity-60">v</span>
      {normalizedVersion}
    </span>
  )
}

// ============================================================================
// UpdateTypeBadge Component
// ============================================================================

/**
 * Display an update type badge (major, minor, patch)
 */
export function UpdateTypeBadge({
  type,
  size = 'md',
  showDescription = false,
  className = '',
}: UpdateTypeBadgeProps) {
  const config = {
    major: {
      label: 'MAJOR',
      color: 'bg-red-500/20 text-red-400 border-red-500/30',
      icon: '⚠️',
    },
    minor: {
      label: 'MINOR',
      color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      icon: '✨',
    },
    patch: {
      label: 'PATCH',
      color: 'bg-green-500/20 text-green-400 border-green-500/30',
      icon: '🔧',
    },
  }

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  }

  const { label, color, icon } = config[type]

  return (
    <div className={`inline-flex flex-col gap-1 ${className}`}>
      <span
        className={`
          inline-flex items-center gap-1 rounded-md font-medium border
          ${sizeClasses[size]}
          ${color}
        `}
      >
        <span>{icon}</span>
        <span>{label}</span>
      </span>
      {showDescription && (
        <span className="text-xs text-[var(--text-muted)]">
          {getUpdateTypeDescription(type)}
        </span>
      )}
    </div>
  )
}

// ============================================================================
// VersionComparison Component
// ============================================================================

/**
 * Display version comparison with arrow
 */
export function VersionComparison({
  currentVersion,
  latestVersion,
  showArrow = true,
  className = '',
}: VersionComparisonProps) {
  const hasUpdate = useMemo(() => {
    return compareVersions(latestVersion, currentVersion) > 0
  }, [currentVersion, latestVersion])

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <VersionBadge version={currentVersion} type="current" />
      {showArrow && hasUpdate && (
        <>
          <svg
            className="w-4 h-4 text-[var(--text-muted)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
          <VersionBadge version={latestVersion} type="latest" />
        </>
      )}
    </div>
  )
}

// ============================================================================
// ChangelogViewer Component
// ============================================================================

/**
 * Display changelog with version sections
 */
export function ChangelogViewer({
  changelog,
  currentVersion,
  latestVersion,
  maxSections = 5,
  className = '',
}: ChangelogViewerProps) {
  const [expanded, setExpanded] = useState(false)

  const sections = useMemo(() => {
    if (currentVersion && latestVersion) {
      return getChangesBetweenVersions(changelog, currentVersion, latestVersion)
    }
    return parseChangelog(changelog)
  }, [changelog, currentVersion, latestVersion])

  const displaySections = expanded ? sections : sections.slice(0, maxSections)
  const hasMore = sections.length > maxSections

  if (sections.length === 0) {
    return (
      <div className={`text-[var(--text-muted)] text-sm ${className}`}>
        변경 내역이 없습니다.
      </div>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {displaySections.map((section, index) => (
        <ChangelogSectionItem key={`${section.version}-${index}`} section={section} />
      ))}
      {hasMore && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-sm text-[var(--accent-primary)] hover:underline"
        >
          {sections.length - maxSections}개 더 보기
        </button>
      )}
      {expanded && hasMore && (
        <button
          onClick={() => setExpanded(false)}
          className="text-sm text-[var(--accent-primary)] hover:underline"
        >
          접기
        </button>
      )}
    </div>
  )
}

/**
 * Single changelog section display
 */
function ChangelogSectionItem({ section }: { section: ChangelogSection }) {
  return (
    <div className="border-l-2 border-[var(--border-primary)] pl-4">
      <div className="flex items-center gap-2 mb-2">
        <VersionBadge version={section.version} size="sm" />
        {section.date && (
          <span className="text-xs text-[var(--text-muted)]">{section.date}</span>
        )}
      </div>
      {section.changes.length > 0 ? (
        <ul className="space-y-1">
          {section.changes.map((change, idx) => (
            <li
              key={idx}
              className="text-sm text-[var(--text-secondary)] flex items-start gap-2"
            >
              <span className="text-[var(--text-muted)]">•</span>
              <span>{change}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">변경 사항 없음</p>
      )}
    </div>
  )
}

// ============================================================================
// UpdateCard Component
// ============================================================================

/**
 * Card displaying a single available update
 */
export function UpdateCard({
  update,
  onUpdate,
  onViewChangelog,
  className = '',
}: UpdateCardProps) {
  return (
    <div
      className={`
        p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]
        hover:border-[var(--border-secondary)] transition-colors
        ${className}
      `}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-medium text-[var(--text-primary)] truncate">
              {update.name}
            </h3>
            <UpdateTypeBadge type={update.updateType} size="sm" />
          </div>

          <VersionComparison
            currentVersion={update.currentVersion}
            latestVersion={update.latestVersion}
          />

          {update.changelog && (
            <p className="mt-2 text-sm text-[var(--text-muted)] line-clamp-2">
              {update.changelog}
            </p>
          )}

          {update.updatedAt && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              업데이트: {new Date(update.updatedAt).toLocaleDateString('ko-KR')}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {onUpdate && (
            <button
              onClick={() => onUpdate(update)}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-[var(--accent-primary)] text-white hover:opacity-90 transition-opacity"
            >
              업데이트
            </button>
          )}
          {onViewChangelog && update.changelog && (
            <button
              onClick={() => onViewChangelog(update)}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/80 transition-colors"
            >
              변경 내역
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// UpdateList Component
// ============================================================================

/**
 * List of available updates
 */
export function UpdateList({
  result,
  onUpdateAll,
  onUpdateSingle,
  className = '',
}: UpdateListProps) {
  if (!result.hasUpdates) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-500/20 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <p className="text-[var(--text-secondary)]">모든 플러그인이 최신 버전입니다</p>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          마지막 확인: {new Date(result.checkedAt).toLocaleString('ko-KR')}
        </p>
      </div>
    )
  }

  const majorUpdates = result.updates.filter((u) => u.updateType === 'major')
  const otherUpdates = result.updates.filter((u) => u.updateType !== 'major')

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-[var(--text-primary)]">
          {result.updates.length}개 업데이트 가능
        </h2>
        {onUpdateAll && result.updates.length > 1 && (
          <button
            onClick={onUpdateAll}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--accent-primary)] text-white hover:opacity-90 transition-opacity"
          >
            모두 업데이트
          </button>
        )}
      </div>

      {majorUpdates.length > 0 && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-400">
            ⚠️ {majorUpdates.length}개의 메이저 업데이트가 있습니다. 호환성을 확인하세요.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {result.updates.map((update) => (
          <UpdateCard
            key={update.id}
            update={update}
            onUpdate={onUpdateSingle}
          />
        ))}
      </div>

      <p className="text-xs text-[var(--text-muted)] text-center">
        마지막 확인: {new Date(result.checkedAt).toLocaleString('ko-KR')}
      </p>
    </div>
  )
}

// ============================================================================
// RollbackCard Component
// ============================================================================

/**
 * Card displaying a rollback snapshot
 */
export function RollbackCard({
  snapshot,
  onRollback,
  onPreview,
  className = '',
}: RollbackCardProps) {
  const [selectedScope, setSelectedScope] = useState<RollbackScope>('full')
  const daysUntilExpiry = getDaysUntilExpiry(snapshot)
  const expired = isSnapshotExpired(snapshot)

  const handleRollback = useCallback(() => {
    if (onRollback && !expired) {
      onRollback(snapshot, selectedScope)
    }
  }, [onRollback, snapshot, selectedScope, expired])

  return (
    <div
      className={`
        p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]
        ${expired ? 'opacity-60' : ''}
        ${className}
      `}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-medium text-[var(--text-primary)]">
              {snapshot.pluginName}
            </h3>
            <VersionBadge version={snapshot.version} size="sm" />
            {snapshot.previousVersion && (
              <>
                <span className="text-[var(--text-muted)]">←</span>
                <VersionBadge version={snapshot.previousVersion} size="sm" type="current" />
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-[var(--text-muted)]">
            <span>
              📁 {snapshot.metadata.totalFiles}개 파일
            </span>
            <span>
              💾 {formatFileSize(snapshot.metadata.totalSize)}
            </span>
            <span>
              📅 {new Date(snapshot.installedAt).toLocaleDateString('ko-KR')}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-2">
            {expired ? (
              <span className="text-xs text-red-400">만료됨</span>
            ) : daysUntilExpiry <= 7 ? (
              <span className="text-xs text-amber-400">
                {daysUntilExpiry}일 후 만료
              </span>
            ) : (
              <span className="text-xs text-[var(--text-muted)]">
                {daysUntilExpiry}일 남음
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {!expired && onRollback && (
            <>
              <select
                value={selectedScope}
                onChange={(e) => setSelectedScope(e.target.value as RollbackScope)}
                className="px-2 py-1 text-sm rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-primary)] text-[var(--text-secondary)]"
              >
                <option value="full">전체 롤백</option>
                <option value="files_only">파일만</option>
                <option value="config_only">설정만</option>
              </select>
              <button
                onClick={handleRollback}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
              >
                롤백
              </button>
            </>
          )}
          {onPreview && (
            <button
              onClick={() => onPreview(snapshot)}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/80 transition-colors"
            >
              미리보기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// RollbackProgress Component
// ============================================================================

/**
 * Display rollback operation progress
 */
export function RollbackProgress({
  currentStep,
  completedSteps,
  totalSteps,
  percentage,
  status,
  className = '',
}: RollbackProgressProps) {
  const currentStepInfo = ROLLBACK_STEPS.find((s) => s.id === currentStep)

  const statusColors = {
    pending: 'bg-[var(--bg-tertiary)]',
    in_progress: 'bg-blue-500',
    completed: 'bg-green-500',
    failed: 'bg-red-500',
    cancelled: 'bg-gray-500',
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {getRollbackStatusLabel(status)}
        </span>
        <span className="text-sm text-[var(--text-muted)]">
          {completedSteps}/{totalSteps} 단계
        </span>
      </div>

      <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${statusColors[status]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {currentStepInfo && status === 'in_progress' && (
        <div className="flex items-center gap-2 text-sm">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-[var(--text-secondary)]">
            {currentStepInfo.label}: {currentStepInfo.description}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {ROLLBACK_STEPS.map((step, index) => {
          const isCompleted = index < completedSteps
          const isCurrent = step.id === currentStep
          const isPending = index > completedSteps

          return (
            <div
              key={step.id}
              className={`
                px-2 py-1 text-xs rounded-lg
                ${isCompleted ? 'bg-green-500/20 text-green-400' : ''}
                ${isCurrent ? 'bg-blue-500/20 text-blue-400' : ''}
                ${isPending ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]' : ''}
              `}
              title={step.description}
            >
              {step.label}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// VersionHistory Component
// ============================================================================

/**
 * Display version history timeline
 */
export function VersionHistory({
  versions,
  maxItems = 10,
  className = '',
}: VersionHistoryProps) {
  const [showAll, setShowAll] = useState(false)
  const displayVersions = showAll ? versions : versions.slice(0, maxItems)
  const hasMore = versions.length > maxItems

  if (versions.length === 0) {
    return (
      <div className={`text-[var(--text-muted)] text-sm ${className}`}>
        버전 기록이 없습니다.
      </div>
    )
  }

  return (
    <div className={`space-y-0 ${className}`}>
      {displayVersions.map((v, index) => (
        <div
          key={`${v.version}-${index}`}
          className="relative pl-6 pb-4 last:pb-0"
        >
          {/* Timeline line */}
          {index < displayVersions.length - 1 && (
            <div className="absolute left-[9px] top-4 bottom-0 w-0.5 bg-[var(--border-primary)]" />
          )}

          {/* Timeline dot */}
          <div
            className={`
              absolute left-0 top-1 w-5 h-5 rounded-full border-2 flex items-center justify-center
              ${v.isCurrent
                ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)]'
                : 'bg-[var(--bg-secondary)] border-[var(--border-primary)]'
              }
            `}
          >
            {v.isCurrent && (
              <div className="w-2 h-2 rounded-full bg-white" />
            )}
          </div>

          {/* Content */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <VersionBadge
                version={v.version}
                size="sm"
                type={v.isCurrent ? 'latest' : 'current'}
              />
              <span className="text-xs text-[var(--text-muted)]">{v.date}</span>
              {v.isCurrent && (
                <span className="px-1.5 py-0.5 text-xs rounded bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]">
                  현재
                </span>
              )}
            </div>
            {v.changes.length > 0 && (
              <ul className="space-y-0.5">
                {v.changes.slice(0, 3).map((change, idx) => (
                  <li
                    key={idx}
                    className="text-sm text-[var(--text-muted)] flex items-start gap-2"
                  >
                    <span className="opacity-50">•</span>
                    <span>{change}</span>
                  </li>
                ))}
                {v.changes.length > 3 && (
                  <li className="text-xs text-[var(--text-muted)]">
                    +{v.changes.length - 3}개 더...
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      ))}

      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="ml-6 text-sm text-[var(--accent-primary)] hover:underline"
        >
          {showAll ? '접기' : `${versions.length - maxItems}개 더 보기`}
        </button>
      )}
    </div>
  )
}

// ============================================================================
// VersionInfoPanel Component
// ============================================================================

interface VersionInfoPanelProps {
  currentVersion: string
  latestVersion?: string
  changelog?: string
  installedAt?: string
  updatedAt?: string
  className?: string
}

/**
 * Comprehensive version information panel
 */
export function VersionInfoPanel({
  currentVersion,
  latestVersion,
  changelog,
  installedAt,
  updatedAt,
  className = '',
}: VersionInfoPanelProps) {
  const hasUpdate = latestVersion && compareVersions(latestVersion, currentVersion) > 0

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-[var(--text-muted)] mb-1">현재 버전</h3>
          <VersionBadge version={currentVersion} size="lg" type="current" />
        </div>
        {hasUpdate && latestVersion && (
          <div className="text-right">
            <h3 className="text-sm font-medium text-[var(--text-muted)] mb-1">최신 버전</h3>
            <VersionBadge version={latestVersion} size="lg" type="latest" />
          </div>
        )}
      </div>

      {hasUpdate && latestVersion && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-amber-400">✨</span>
            <span className="text-sm font-medium text-amber-400">업데이트 가능</span>
          </div>
          <VersionComparison
            currentVersion={currentVersion}
            latestVersion={latestVersion}
          />
        </div>
      )}

      <div className="flex gap-4 text-sm text-[var(--text-muted)]">
        {installedAt && (
          <div>
            <span className="block text-xs opacity-70">설치일</span>
            {new Date(installedAt).toLocaleDateString('ko-KR')}
          </div>
        )}
        {updatedAt && (
          <div>
            <span className="block text-xs opacity-70">마지막 업데이트</span>
            {new Date(updatedAt).toLocaleDateString('ko-KR')}
          </div>
        )}
      </div>

      {changelog && (
        <div>
          <h3 className="text-sm font-medium text-[var(--text-muted)] mb-2">변경 내역</h3>
          <ChangelogViewer
            changelog={changelog}
            currentVersion={hasUpdate ? currentVersion : undefined}
            latestVersion={hasUpdate ? latestVersion : undefined}
            maxSections={3}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// useVersionCheck Hook
// ============================================================================

interface UseVersionCheckOptions {
  autoCheck?: boolean
  checkInterval?: number // ms
}

/**
 * Hook for version check functionality
 */
export function useVersionCheck(options: UseVersionCheckOptions = {}) {
  const { autoCheck = false, checkInterval = 3600000 } = options // 1 hour default

  const [isChecking, setIsChecking] = useState(false)
  const [lastResult, setLastResult] = useState<UpdateCheckResult | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const checkForUpdates = useCallback(async () => {
    setIsChecking(true)
    setError(null)

    try {
      // This would typically call an API endpoint
      const response = await fetch('/api/updates/check')
      const result = await response.json()
      setLastResult(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to check for updates'))
    } finally {
      setIsChecking(false)
    }
  }, [])

  return {
    isChecking,
    lastResult,
    error,
    checkForUpdates,
    hasUpdates: lastResult?.hasUpdates ?? false,
    updateCount: lastResult?.updates.length ?? 0,
  }
}
