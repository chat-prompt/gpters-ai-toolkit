'use client'

import { useState, useMemo } from 'react'
import {
  type ChangelogSection,
  parseChangelog,
  getChangesBetweenVersions,
} from '@/lib/plugin/updates'
import { VersionBadge } from './VersionBadge'
import type { ChangelogViewerProps } from './types'

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
