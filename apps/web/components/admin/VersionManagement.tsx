/**
 * Version management component exports
 *
 * Re-exports all version management components from the
 * VersionManagement folder for backwards compatibility.
 */

// Re-export from new folder structure for backwards compatibility
export {
  VersionBadge,
  UpdateTypeBadge,
  VersionComparison,
  ChangelogViewer,
  UpdateCard,
  UpdateList,
  RollbackCard,
  RollbackProgress,
  VersionHistory,
  VersionInfoPanel,
  useVersionCheck,
} from './VersionManagement/index'

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
} from './VersionManagement/index'
