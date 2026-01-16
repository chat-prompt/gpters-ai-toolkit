/**
 * Version comparison component
 *
 * Displays current and latest versions side-by-side with an
 * arrow indicator when an update is available.
 */
import { useMemo } from 'react'
import { compareVersions } from '@/lib/plugin/updates'
import { VersionBadge } from './VersionBadge'
import type { VersionComparisonProps } from './types'

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
