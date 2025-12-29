import { UpdateTypeBadge } from './UpdateTypeBadge'
import { VersionComparison } from './VersionComparison'
import type { UpdateCardProps } from './types'

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
            <h3 className="font-medium text-[var(--text-primary)] truncate">{update.name}</h3>
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
