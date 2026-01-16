/**
 * Version management component exports
 *
 * Provides components for displaying version information, handling updates,
 * viewing changelogs, managing rollbacks, and tracking version history.
 */

export { VersionBadge } from './VersionBadge'
export { UpdateTypeBadge } from './UpdateTypeBadge'
export { VersionComparison } from './VersionComparison'
export { ChangelogViewer } from './ChangelogViewer'
export { UpdateCard } from './UpdateCard'
export { UpdateList } from './UpdateList'
export { RollbackCard } from './RollbackCard'
export { RollbackProgress } from './RollbackProgress'
export { VersionHistory } from './VersionHistory'
export { VersionInfoPanel } from './VersionInfoPanel'
export { useVersionCheck } from './useVersionCheck'

export type {
  VersionBadgeProps,
  UpdateTypeBadgeProps,
  VersionComparisonProps,
  ChangelogViewerProps,
  UpdateCardProps,
  UpdateListProps,
  RollbackCardProps,
  RollbackProgressProps,
  VersionHistoryProps,
  VersionInfoPanelProps,
  UseVersionCheckOptions,
} from './types'
