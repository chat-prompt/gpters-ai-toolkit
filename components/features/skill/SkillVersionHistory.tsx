'use client'

import { useState, useEffect } from 'react'
import type { VersionHistoryEntry } from '@/lib/versioning/skill-version'

interface SkillVersionHistoryProps {
  itemId: string
  currentVersion?: string
  isAdmin?: boolean
}

// Version type badge component
function VersionTypeBadge({ type }: { type: 'major' | 'minor' | 'patch' }) {
  const config = {
    major: {
      label: 'Major',
      color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      description: '주요 변경',
    },
    minor: {
      label: 'Minor',
      color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      description: '기능 추가',
    },
    patch: {
      label: 'Patch',
      color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      description: '버그 수정',
    },
  }

  const { label, color } = config[type]

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

// Single version entry component
function VersionEntry({
  entry,
  isCurrent,
  isAdmin,
  onRollback,
}: {
  entry: VersionHistoryEntry
  isCurrent: boolean
  isAdmin?: boolean
  onRollback?: (versionId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const formattedDate = new Date(entry.createdAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div
      className={`relative pl-6 pb-6 border-l-2 ${
        isCurrent
          ? 'border-cyan-500 dark:border-cyan-400'
          : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      {/* Timeline dot */}
      <div
        className={`absolute -left-2 top-0 w-4 h-4 rounded-full ${
          isCurrent
            ? 'bg-cyan-500 dark:bg-cyan-400 ring-4 ring-cyan-100 dark:ring-cyan-900/30'
            : 'bg-gray-300 dark:bg-gray-600'
        }`}
      />

      <div className="ml-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`font-mono font-semibold ${
              isCurrent ? 'text-cyan-600 dark:text-cyan-400' : 'text-foreground'
            }`}
          >
            v{entry.version}
          </span>
          <VersionTypeBadge type={entry.versionType} />
          {isCurrent && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300">
              Current
            </span>
          )}
        </div>

        <p className="text-sm text-muted-foreground mt-1">{formattedDate}</p>

        {entry.changelog && (
          <div className="mt-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-sm text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
            >
              <span>{expanded ? '접기' : '변경 내용 보기'}</span>
              <svg
                className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expanded && (
              <div className="mt-2 p-3 bg-muted/50 rounded-lg text-sm">
                <p className="whitespace-pre-wrap">{entry.changelog}</p>
              </div>
            )}
          </div>
        )}

        {/* Rollback button for admin */}
        {isAdmin && !isCurrent && onRollback && (
          <button
            onClick={() => onRollback(entry.id)}
            className="mt-2 text-sm text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
              />
            </svg>
            <span>이 버전으로 롤백</span>
          </button>
        )}
      </div>
    </div>
  )
}

// Rollback confirmation modal
function RollbackModal({
  isOpen,
  onClose,
  onConfirm,
  targetVersion,
  isLoading,
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  targetVersion: string
  isLoading: boolean
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">버전 롤백 확인</h3>
        <p className="text-muted-foreground mb-6">
          v{targetVersion}으로 롤백하시겠습니까?
          <br />
          <span className="text-sm">현재 버전은 히스토리에 저장됩니다.</span>
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            {isLoading ? '롤백 중...' : '롤백'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function SkillVersionHistory({ itemId, currentVersion, isAdmin }: SkillVersionHistoryProps) {
  const [versions, setVersions] = useState<VersionHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<VersionHistoryEntry | null>(null)
  const [isRollingBack, setIsRollingBack] = useState(false)

  useEffect(() => {
    async function fetchVersions() {
      try {
        setLoading(true)
        const response = await fetch(`/api/versions/${itemId}?limit=10`)
        if (!response.ok) {
          throw new Error('Failed to fetch version history')
        }
        const data = await response.json()
        setVersions(data.versions || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchVersions()
  }, [itemId])

  const handleRollback = async () => {
    if (!rollbackTarget) return

    setIsRollingBack(true)
    try {
      const response = await fetch(`/api/versions/${itemId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetVersionId: rollbackTarget.id }),
      })

      if (!response.ok) {
        throw new Error('Failed to rollback')
      }

      // Refresh the page to show updated content
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed')
    } finally {
      setIsRollingBack(false)
      setRollbackTarget(null)
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-4 bg-muted rounded w-1/3" />
        <div className="h-20 bg-muted rounded" />
        <div className="h-20 bg-muted rounded" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">버전 히스토리를 불러올 수 없습니다.</p>
      </div>
    )
  }

  if (versions.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
          <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <p className="text-muted-foreground">버전 히스토리가 없습니다.</p>
        <p className="text-sm text-muted-foreground mt-1">
          현재 버전: v{currentVersion || '1.0.0'}
        </p>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        버전 히스토리
      </h3>

      <div className="mt-4">
        {versions.map((entry, index) => (
          <VersionEntry
            key={entry.id}
            entry={entry}
            isCurrent={index === 0}
            isAdmin={isAdmin}
            onRollback={(versionId) => {
              const target = versions.find((v) => v.id === versionId)
              if (target) setRollbackTarget(target)
            }}
          />
        ))}
      </div>

      <RollbackModal
        isOpen={!!rollbackTarget}
        onClose={() => setRollbackTarget(null)}
        onConfirm={handleRollback}
        targetVersion={rollbackTarget?.version || ''}
        isLoading={isRollingBack}
      />
    </div>
  )
}
