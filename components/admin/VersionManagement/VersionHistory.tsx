'use client'

import { useState } from 'react'
import { VersionBadge } from './VersionBadge'
import type { VersionHistoryProps } from './types'

/**
 * Display version history timeline
 */
export function VersionHistory({ versions, maxItems = 10, className = '' }: VersionHistoryProps) {
  const [showAll, setShowAll] = useState(false)
  const displayVersions = showAll ? versions : versions.slice(0, maxItems)
  const hasMore = versions.length > maxItems

  if (versions.length === 0) {
    return (
      <div className={`text-[var(--text-muted)] text-sm ${className}`}>버전 기록이 없습니다.</div>
    )
  }

  return (
    <div className={`space-y-0 ${className}`}>
      {displayVersions.map((v, index) => (
        <div key={`${v.version}-${index}`} className="relative pl-6 pb-4 last:pb-0">
          {/* Timeline line */}
          {index < displayVersions.length - 1 && (
            <div className="absolute left-[9px] top-4 bottom-0 w-0.5 bg-[var(--border-primary)]" />
          )}

          {/* Timeline dot */}
          <div
            className={`
              absolute left-0 top-1 w-5 h-5 rounded-full border-2 flex items-center justify-center
              ${
                v.isCurrent
                  ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)]'
                  : 'bg-[var(--bg-secondary)] border-[var(--border-primary)]'
              }
            `}
          >
            {v.isCurrent && <div className="w-2 h-2 rounded-full bg-white" />}
          </div>

          {/* Content */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <VersionBadge version={v.version} size="sm" type={v.isCurrent ? 'latest' : 'current'} />
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
                  <li className="text-xs text-[var(--text-muted)]">+{v.changes.length - 3}개 더...</li>
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
