'use client'

import { useState, useCallback } from 'react'
import {
  RollbackScope,
  getDaysUntilExpiry,
  isSnapshotExpired,
  formatFileSize,
} from '@/lib/plugin/rollback'
import { VersionBadge } from './VersionBadge'
import type { RollbackCardProps } from './types'

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
            <h3 className="font-medium text-[var(--text-primary)]">{snapshot.pluginName}</h3>
            <VersionBadge version={snapshot.version} size="sm" />
            {snapshot.previousVersion && (
              <>
                <span className="text-[var(--text-muted)]">←</span>
                <VersionBadge version={snapshot.previousVersion} size="sm" type="current" />
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-[var(--text-muted)]">
            <span>📁 {snapshot.metadata.totalFiles}개 파일</span>
            <span>💾 {formatFileSize(snapshot.metadata.totalSize)}</span>
            <span>📅 {new Date(snapshot.installedAt).toLocaleDateString('ko-KR')}</span>
          </div>

          <div className="mt-2 flex items-center gap-2">
            {expired ? (
              <span className="text-xs text-red-400">만료됨</span>
            ) : daysUntilExpiry <= 7 ? (
              <span className="text-xs text-amber-400">{daysUntilExpiry}일 후 만료</span>
            ) : (
              <span className="text-xs text-[var(--text-muted)]">{daysUntilExpiry}일 남음</span>
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
