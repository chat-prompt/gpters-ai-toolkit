import type { PluginUpdate, UpdateCheckResult } from '@/lib/plugin/updates'
import type { InstallationSnapshot, RollbackScope, RollbackStatus } from '@/lib/plugin/rollback'

export interface VersionBadgeProps {
  version: string
  type?: 'current' | 'latest' | 'update'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export interface UpdateTypeBadgeProps {
  type: 'major' | 'minor' | 'patch'
  size?: 'sm' | 'md' | 'lg'
  showDescription?: boolean
  className?: string
}

export interface VersionComparisonProps {
  currentVersion: string
  latestVersion: string
  showArrow?: boolean
  className?: string
}

export interface ChangelogViewerProps {
  changelog: string
  currentVersion?: string
  latestVersion?: string
  maxSections?: number
  className?: string
}

export interface UpdateCardProps {
  update: PluginUpdate
  onUpdate?: (update: PluginUpdate) => void
  onViewChangelog?: (update: PluginUpdate) => void
  className?: string
}

export interface UpdateListProps {
  result: UpdateCheckResult
  onUpdateAll?: () => void
  onUpdateSingle?: (update: PluginUpdate) => void
  className?: string
}

export interface RollbackCardProps {
  snapshot: InstallationSnapshot
  onRollback?: (snapshot: InstallationSnapshot, scope: RollbackScope) => void
  onPreview?: (snapshot: InstallationSnapshot) => void
  className?: string
}

export interface RollbackProgressProps {
  currentStep: string
  completedSteps: number
  totalSteps: number
  percentage: number
  status: RollbackStatus
  className?: string
}

export interface VersionHistoryProps {
  versions: Array<{
    version: string
    date: string
    changes: string[]
    isCurrent?: boolean
  }>
  maxItems?: number
  className?: string
}

export interface VersionInfoPanelProps {
  currentVersion: string
  latestVersion?: string
  changelog?: string
  installedAt?: string
  updatedAt?: string
  className?: string
}

export interface UseVersionCheckOptions {
  autoCheck?: boolean
  checkInterval?: number // ms
}
