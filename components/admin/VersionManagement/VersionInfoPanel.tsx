import { compareVersions } from '@/lib/plugin/updates'
import { VersionBadge } from './VersionBadge'
import { VersionComparison } from './VersionComparison'
import { ChangelogViewer } from './ChangelogViewer'
import type { VersionInfoPanelProps } from './types'

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
          <VersionComparison currentVersion={currentVersion} latestVersion={latestVersion} />
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
