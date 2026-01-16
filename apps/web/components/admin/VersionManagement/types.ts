/**
 * Type definitions for version management components
 *
 * Shared interfaces for version badges, update cards, rollback cards,
 * changelog viewer, and version history components.
 */
import type { PluginUpdate, UpdateCheckResult } from '@/lib/plugin/updates'
import type { InstallationSnapshot, RollbackScope, RollbackStatus } from '@/lib/plugin/rollback'

/** Props for VersionBadge component */
export interface VersionBadgeProps {
  /** Version string to display */
  version: string
  /** Badge type affecting color scheme */
  type?: 'current' | 'latest' | 'update'
  /** Badge size */
  size?: 'sm' | 'md' | 'lg'
  /** Additional CSS classes */
  className?: string
}

/** Props for UpdateTypeBadge component */
export interface UpdateTypeBadgeProps {
  /** Update type (major/minor/patch) */
  type: 'major' | 'minor' | 'patch'
  /** Badge size */
  size?: 'sm' | 'md' | 'lg'
  /** Whether to show update type description */
  showDescription?: boolean
  /** Additional CSS classes */
  className?: string
}

/** Props for VersionComparison component */
export interface VersionComparisonProps {
  /** Currently installed version */
  currentVersion: string
  /** Latest available version */
  latestVersion: string
  /** Whether to show arrow between versions */
  showArrow?: boolean
  /** Additional CSS classes */
  className?: string
}

/** Props for ChangelogViewer component */
export interface ChangelogViewerProps {
  /** Raw changelog content */
  changelog: string
  /** Current version to filter changes from */
  currentVersion?: string
  /** Latest version to filter changes to */
  latestVersion?: string
  /** Maximum number of sections to display */
  maxSections?: number
  /** Additional CSS classes */
  className?: string
}

/** Props for UpdateCard component */
export interface UpdateCardProps {
  /** Plugin update information */
  update: PluginUpdate
  /** Callback when update is triggered */
  onUpdate?: (update: PluginUpdate) => void
  /** Callback to view full changelog */
  onViewChangelog?: (update: PluginUpdate) => void
  /** Additional CSS classes */
  className?: string
}

/** Props for UpdateList component */
export interface UpdateListProps {
  /** Update check result with available updates */
  result: UpdateCheckResult
  /** Callback to update all plugins */
  onUpdateAll?: () => void
  /** Callback to update a single plugin */
  onUpdateSingle?: (update: PluginUpdate) => void
  /** Additional CSS classes */
  className?: string
}

/** Props for RollbackCard component */
export interface RollbackCardProps {
  /** Installation snapshot to potentially rollback to */
  snapshot: InstallationSnapshot
  /** Callback when rollback is triggered */
  onRollback?: (snapshot: InstallationSnapshot, scope: RollbackScope) => void
  /** Callback to preview snapshot contents */
  onPreview?: (snapshot: InstallationSnapshot) => void
  /** Additional CSS classes */
  className?: string
}

/** Props for RollbackProgress component */
export interface RollbackProgressProps {
  /** Current step identifier */
  currentStep: string
  /** Number of completed steps */
  completedSteps: number
  /** Total number of steps */
  totalSteps: number
  /** Completion percentage (0-100) */
  percentage: number
  /** Current rollback status */
  status: RollbackStatus
  /** Additional CSS classes */
  className?: string
}

/** Props for VersionHistory component */
export interface VersionHistoryProps {
  /** Array of version history entries */
  versions: Array<{
    /** Version number */
    version: string
    /** Release date */
    date: string
    /** List of changes in this version */
    changes: string[]
    /** Whether this is the currently installed version */
    isCurrent?: boolean
  }>
  /** Maximum items to display before "show more" */
  maxItems?: number
  /** Additional CSS classes */
  className?: string
}

/** Props for VersionInfoPanel component */
export interface VersionInfoPanelProps {
  /** Currently installed version */
  currentVersion: string
  /** Latest available version */
  latestVersion?: string
  /** Changelog content */
  changelog?: string
  /** Installation date ISO string */
  installedAt?: string
  /** Last update date ISO string */
  updatedAt?: string
  /** Additional CSS classes */
  className?: string
}

/** Options for useVersionCheck hook */
export interface UseVersionCheckOptions {
  /** Whether to automatically check for updates */
  autoCheck?: boolean
  /** Check interval in milliseconds (default: 1 hour) */
  checkInterval?: number
}
