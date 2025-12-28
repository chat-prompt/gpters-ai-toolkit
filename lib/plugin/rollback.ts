/**
 * Plugin Installation Rollback System
 *
 * Provides rollback capabilities for plugin installations:
 * - Pre-installation snapshot saving
 * - One-click rollback
 * - Partial rollback (specific files only)
 * - Rollback history management
 */

import { createLogger } from '../logger'

const log = createLogger('plugin-rollback')

/**
 * Rollback status
 */
export type RollbackStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'

/**
 * File change type
 */
export type FileChangeType = 'created' | 'modified' | 'deleted' | 'renamed'

/**
 * Rollback scope
 */
export type RollbackScope = 'full' | 'partial' | 'config_only' | 'files_only'

/**
 * File snapshot
 */
export interface FileSnapshot {
  path: string
  content: string | null // null if file didn't exist
  hash: string
  size: number
  permissions: string
  modifiedAt: string
}

/**
 * File change record
 */
export interface FileChange {
  path: string
  type: FileChangeType
  before: FileSnapshot | null
  after: FileSnapshot | null
  canRollback: boolean
  rollbackReason?: string
}

/**
 * Installation snapshot
 */
export interface InstallationSnapshot {
  id: string
  pluginId: string
  pluginName: string
  version: string
  previousVersion?: string
  installedAt: string
  installedBy: string
  installationType: 'install' | 'update' | 'reinstall'
  files: FileChange[]
  configChanges: ConfigChange[]
  metadata: SnapshotMetadata
  status: 'active' | 'rolled_back' | 'expired'
}

/**
 * Configuration change
 */
export interface ConfigChange {
  key: string
  previousValue: unknown
  newValue: unknown
  configFile: string
}

/**
 * Snapshot metadata
 */
export interface SnapshotMetadata {
  totalFiles: number
  totalSize: number
  createdFiles: number
  modifiedFiles: number
  deletedFiles: number
  backupPath: string
  expiresAt: string
  compressed: boolean
}

/**
 * Rollback operation
 */
export interface RollbackOperation {
  id: string
  snapshotId: string
  pluginId: string
  scope: RollbackScope
  selectedFiles?: string[]
  status: RollbackStatus
  startedAt: string
  completedAt?: string
  progress: RollbackProgress
  result?: RollbackResult
  error?: RollbackError
}

/**
 * Rollback progress
 */
export interface RollbackProgress {
  totalSteps: number
  completedSteps: number
  currentStep: string
  percentage: number
  filesRestored: number
  filesTotal: number
}

/**
 * Rollback result
 */
export interface RollbackResult {
  success: boolean
  filesRestored: number
  filesFailed: number
  configsRestored: number
  duration: number
  warnings: string[]
  restoredFiles: string[]
  failedFiles: FailedFileRestore[]
}

/**
 * Failed file restore
 */
export interface FailedFileRestore {
  path: string
  reason: string
  originalError?: string
}

/**
 * Rollback error
 */
export interface RollbackError {
  code: string
  message: string
  details?: string
  recoverable: boolean
  suggestion?: string
}

/**
 * Rollback history entry
 */
export interface RollbackHistoryEntry {
  id: string
  snapshotId: string
  pluginId: string
  pluginName: string
  version: string
  scope: RollbackScope
  status: RollbackStatus
  performedAt: string
  performedBy: string
  duration: number
  filesAffected: number
  reason?: string
}

/**
 * Rollback options
 */
export interface RollbackOptions {
  scope: RollbackScope
  selectedFiles?: string[]
  skipConfigs?: boolean
  createBackup?: boolean
  dryRun?: boolean
  force?: boolean
  reason?: string
}

/**
 * Snapshot storage configuration
 */
export interface SnapshotStorageConfig {
  maxSnapshots: number
  maxAge: number // days
  compressionEnabled: boolean
  backupDirectory: string
  autoCleanup: boolean
}

/**
 * Default storage configuration
 */
export const DEFAULT_STORAGE_CONFIG: SnapshotStorageConfig = {
  maxSnapshots: 10,
  maxAge: 30,
  compressionEnabled: true,
  backupDirectory: '.plugin-backups',
  autoCleanup: true,
}

/**
 * Rollback step definitions
 */
export const ROLLBACK_STEPS = [
  { id: 'validate', label: '스냅샷 검증', description: '롤백 가능 여부 확인' },
  { id: 'backup', label: '현재 상태 백업', description: '롤백 전 현재 상태 저장' },
  { id: 'stop_plugin', label: '플러그인 중지', description: '실행 중인 플러그인 중지' },
  { id: 'restore_files', label: '파일 복원', description: '이전 버전 파일 복원' },
  { id: 'restore_config', label: '설정 복원', description: '이전 설정 복원' },
  { id: 'verify', label: '검증', description: '복원 결과 검증' },
  { id: 'cleanup', label: '정리', description: '임시 파일 정리' },
] as const

/**
 * Error codes
 */
export const ROLLBACK_ERROR_CODES = {
  SNAPSHOT_NOT_FOUND: 'SNAPSHOT_NOT_FOUND',
  SNAPSHOT_EXPIRED: 'SNAPSHOT_EXPIRED',
  SNAPSHOT_CORRUPTED: 'SNAPSHOT_CORRUPTED',
  FILE_ACCESS_DENIED: 'FILE_ACCESS_DENIED',
  FILE_IN_USE: 'FILE_IN_USE',
  DISK_FULL: 'DISK_FULL',
  PLUGIN_RUNNING: 'PLUGIN_RUNNING',
  DEPENDENCY_CONFLICT: 'DEPENDENCY_CONFLICT',
  PARTIAL_FAILURE: 'PARTIAL_FAILURE',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const

/**
 * Error messages
 */
export const ROLLBACK_ERROR_MESSAGES: Record<string, { message: string; suggestion: string }> = {
  [ROLLBACK_ERROR_CODES.SNAPSHOT_NOT_FOUND]: {
    message: '스냅샷을 찾을 수 없습니다',
    suggestion: '스냅샷이 삭제되었거나 만료되었을 수 있습니다',
  },
  [ROLLBACK_ERROR_CODES.SNAPSHOT_EXPIRED]: {
    message: '스냅샷이 만료되었습니다',
    suggestion: '새로운 스냅샷을 생성하거나 수동으로 복원하세요',
  },
  [ROLLBACK_ERROR_CODES.SNAPSHOT_CORRUPTED]: {
    message: '스냅샷이 손상되었습니다',
    suggestion: '다른 스냅샷을 사용하거나 수동으로 복원하세요',
  },
  [ROLLBACK_ERROR_CODES.FILE_ACCESS_DENIED]: {
    message: '파일 접근이 거부되었습니다',
    suggestion: '필요한 권한을 확인하세요',
  },
  [ROLLBACK_ERROR_CODES.FILE_IN_USE]: {
    message: '파일이 사용 중입니다',
    suggestion: '관련 프로세스를 종료하고 다시 시도하세요',
  },
  [ROLLBACK_ERROR_CODES.DISK_FULL]: {
    message: '디스크 공간이 부족합니다',
    suggestion: '디스크 공간을 확보한 후 다시 시도하세요',
  },
  [ROLLBACK_ERROR_CODES.PLUGIN_RUNNING]: {
    message: '플러그인이 실행 중입니다',
    suggestion: '플러그인을 먼저 중지하세요',
  },
  [ROLLBACK_ERROR_CODES.DEPENDENCY_CONFLICT]: {
    message: '의존성 충돌이 발생했습니다',
    suggestion: '의존성 플러그인을 먼저 롤백하세요',
  },
  [ROLLBACK_ERROR_CODES.PARTIAL_FAILURE]: {
    message: '일부 파일 복원에 실패했습니다',
    suggestion: '실패한 파일을 수동으로 복원하세요',
  },
  [ROLLBACK_ERROR_CODES.UNKNOWN_ERROR]: {
    message: '알 수 없는 오류가 발생했습니다',
    suggestion: '로그를 확인하고 다시 시도하세요',
  },
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `rb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Calculate file hash (mock implementation)
 */
export function calculateFileHash(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

/**
 * Create a file snapshot
 */
export function createFileSnapshot(
  path: string,
  content: string | null,
  modifiedAt?: string
): FileSnapshot {
  const now = modifiedAt || new Date().toISOString()
  return {
    path,
    content,
    hash: content ? calculateFileHash(content) : '',
    size: content ? content.length : 0,
    permissions: '644',
    modifiedAt: now,
  }
}

/**
 * Create a file change record
 */
export function createFileChange(
  path: string,
  type: FileChangeType,
  before: FileSnapshot | null,
  after: FileSnapshot | null
): FileChange {
  return {
    path,
    type,
    before,
    after,
    canRollback: type !== 'deleted' || before !== null,
    rollbackReason: type === 'deleted' && before === null
      ? '원본 파일이 없어 복원할 수 없습니다'
      : undefined,
  }
}

/**
 * Create an installation snapshot
 */
export function createInstallationSnapshot(
  pluginId: string,
  pluginName: string,
  version: string,
  options: Partial<{
    previousVersion: string
    installationType: InstallationSnapshot['installationType']
    installedBy: string
    files: FileChange[]
    configChanges: ConfigChange[]
    backupPath: string
  }> = {}
): InstallationSnapshot {
  const id = generateId()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + DEFAULT_STORAGE_CONFIG.maxAge * 24 * 60 * 60 * 1000)

  const files = options.files || []
  const totalSize = files.reduce((sum, f) => sum + (f.after?.size || 0), 0)

  log.info(`Created installation snapshot ${id} for ${pluginName}@${version}`)

  return {
    id,
    pluginId,
    pluginName,
    version,
    previousVersion: options.previousVersion,
    installedAt: now.toISOString(),
    installedBy: options.installedBy || 'system',
    installationType: options.installationType || 'install',
    files,
    configChanges: options.configChanges || [],
    metadata: {
      totalFiles: files.length,
      totalSize,
      createdFiles: files.filter((f) => f.type === 'created').length,
      modifiedFiles: files.filter((f) => f.type === 'modified').length,
      deletedFiles: files.filter((f) => f.type === 'deleted').length,
      backupPath: options.backupPath || `${DEFAULT_STORAGE_CONFIG.backupDirectory}/${id}`,
      expiresAt: expiresAt.toISOString(),
      compressed: DEFAULT_STORAGE_CONFIG.compressionEnabled,
    },
    status: 'active',
  }
}

/**
 * Create a rollback operation
 */
export function createRollbackOperation(
  snapshot: InstallationSnapshot,
  options: RollbackOptions
): RollbackOperation {
  const id = generateId()

  const filesTotal = options.scope === 'partial' && options.selectedFiles
    ? options.selectedFiles.length
    : snapshot.files.length

  log.info(`Created rollback operation ${id} for snapshot ${snapshot.id}`)

  return {
    id,
    snapshotId: snapshot.id,
    pluginId: snapshot.pluginId,
    scope: options.scope,
    selectedFiles: options.selectedFiles,
    status: 'pending',
    startedAt: new Date().toISOString(),
    progress: {
      totalSteps: ROLLBACK_STEPS.length,
      completedSteps: 0,
      currentStep: ROLLBACK_STEPS[0].id,
      percentage: 0,
      filesRestored: 0,
      filesTotal,
    },
  }
}

/**
 * Update rollback progress
 */
export function updateRollbackProgress(
  operation: RollbackOperation,
  stepId: string,
  filesRestored?: number
): RollbackOperation {
  const stepIndex = ROLLBACK_STEPS.findIndex((s) => s.id === stepId)
  const completedSteps = stepIndex >= 0 ? stepIndex + 1 : operation.progress.completedSteps

  return {
    ...operation,
    progress: {
      ...operation.progress,
      completedSteps,
      currentStep: stepId,
      percentage: Math.round((completedSteps / ROLLBACK_STEPS.length) * 100),
      filesRestored: filesRestored ?? operation.progress.filesRestored,
    },
  }
}

/**
 * Complete rollback operation
 */
export function completeRollbackOperation(
  operation: RollbackOperation,
  result: RollbackResult
): RollbackOperation {
  log.info(`Completed rollback operation ${operation.id}: ${result.success ? 'success' : 'failed'}`)

  return {
    ...operation,
    status: result.success ? 'completed' : 'failed',
    completedAt: new Date().toISOString(),
    progress: {
      ...operation.progress,
      completedSteps: ROLLBACK_STEPS.length,
      percentage: 100,
      filesRestored: result.filesRestored,
    },
    result,
  }
}

/**
 * Fail rollback operation
 */
export function failRollbackOperation(
  operation: RollbackOperation,
  errorCode: string,
  details?: string
): RollbackOperation {
  const errorInfo = ROLLBACK_ERROR_MESSAGES[errorCode] || ROLLBACK_ERROR_MESSAGES[ROLLBACK_ERROR_CODES.UNKNOWN_ERROR]

  log.error(`Rollback operation ${operation.id} failed: ${errorCode}`)

  return {
    ...operation,
    status: 'failed',
    completedAt: new Date().toISOString(),
    error: {
      code: errorCode,
      message: errorInfo.message,
      details,
      recoverable: errorCode === ROLLBACK_ERROR_CODES.PARTIAL_FAILURE,
      suggestion: errorInfo.suggestion,
    },
  }
}

/**
 * Validate snapshot for rollback
 */
export function validateSnapshotForRollback(
  snapshot: InstallationSnapshot
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Check if snapshot is active
  if (snapshot.status !== 'active') {
    errors.push(`스냅샷 상태가 '${snapshot.status}'입니다. 'active' 상태만 롤백 가능합니다.`)
  }

  // Check if snapshot is expired
  const expiresAt = new Date(snapshot.metadata.expiresAt)
  if (expiresAt < new Date()) {
    errors.push('스냅샷이 만료되었습니다.')
  }

  // Check if files can be rolled back
  const unrollbackableFiles = snapshot.files.filter((f) => !f.canRollback)
  if (unrollbackableFiles.length > 0) {
    errors.push(`${unrollbackableFiles.length}개 파일을 롤백할 수 없습니다.`)
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Get rollback preview
 */
export function getRollbackPreview(
  snapshot: InstallationSnapshot,
  options: RollbackOptions
): {
  filesToRestore: FileChange[]
  filesToSkip: FileChange[]
  configsToRestore: ConfigChange[]
  estimatedDuration: number
  warnings: string[]
} {
  let filesToRestore = snapshot.files.filter((f) => f.canRollback)
  let filesToSkip = snapshot.files.filter((f) => !f.canRollback)

  // Filter by selected files for partial rollback
  if (options.scope === 'partial' && options.selectedFiles) {
    const selected = new Set(options.selectedFiles)
    filesToRestore = filesToRestore.filter((f) => selected.has(f.path))
    filesToSkip = [
      ...filesToSkip,
      ...snapshot.files.filter((f) => f.canRollback && !selected.has(f.path)),
    ]
  }

  // Filter by scope
  if (options.scope === 'config_only') {
    filesToSkip = [...filesToSkip, ...filesToRestore]
    filesToRestore = []
  }

  const configsToRestore = options.skipConfigs ? [] : snapshot.configChanges

  // Estimate duration (mock: 100ms per file + 50ms per config)
  const estimatedDuration = filesToRestore.length * 100 + configsToRestore.length * 50

  const warnings: string[] = []
  if (filesToSkip.length > 0) {
    warnings.push(`${filesToSkip.length}개 파일이 롤백에서 제외됩니다.`)
  }
  if (options.scope === 'partial') {
    warnings.push('부분 롤백은 플러그인 동작에 영향을 줄 수 있습니다.')
  }

  return {
    filesToRestore,
    filesToSkip,
    configsToRestore,
    estimatedDuration,
    warnings,
  }
}

/**
 * Simulate rollback execution (for dry run)
 */
export function simulateRollback(
  snapshot: InstallationSnapshot,
  options: RollbackOptions
): RollbackResult {
  const preview = getRollbackPreview(snapshot, options)

  return {
    success: true,
    filesRestored: preview.filesToRestore.length,
    filesFailed: 0,
    configsRestored: preview.configsToRestore.length,
    duration: preview.estimatedDuration,
    warnings: [...preview.warnings, '(시뮬레이션 결과)'],
    restoredFiles: preview.filesToRestore.map((f) => f.path),
    failedFiles: [],
  }
}

/**
 * Create rollback history entry
 */
export function createRollbackHistoryEntry(
  operation: RollbackOperation,
  snapshot: InstallationSnapshot,
  performedBy: string,
  reason?: string
): RollbackHistoryEntry {
  const result = operation.result

  return {
    id: operation.id,
    snapshotId: snapshot.id,
    pluginId: snapshot.pluginId,
    pluginName: snapshot.pluginName,
    version: snapshot.version,
    scope: operation.scope,
    status: operation.status,
    performedAt: operation.completedAt || new Date().toISOString(),
    performedBy,
    duration: result?.duration || 0,
    filesAffected: result?.filesRestored || 0,
    reason,
  }
}

/**
 * Get rollback scope label
 */
export function getRollbackScopeLabel(scope: RollbackScope): string {
  const labels: Record<RollbackScope, string> = {
    full: '전체 롤백',
    partial: '부분 롤백',
    config_only: '설정만 롤백',
    files_only: '파일만 롤백',
  }
  return labels[scope]
}

/**
 * Get rollback status label
 */
export function getRollbackStatusLabel(status: RollbackStatus): string {
  const labels: Record<RollbackStatus, string> = {
    pending: '대기 중',
    in_progress: '진행 중',
    completed: '완료',
    failed: '실패',
    cancelled: '취소됨',
  }
  return labels[status]
}

/**
 * Get file change type label
 */
export function getFileChangeTypeLabel(type: FileChangeType): string {
  const labels: Record<FileChangeType, string> = {
    created: '생성',
    modified: '수정',
    deleted: '삭제',
    renamed: '이름 변경',
  }
  return labels[type]
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * Format duration
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}초`
  return `${(ms / 60000).toFixed(1)}분`
}

/**
 * Check if snapshot is expired
 */
export function isSnapshotExpired(snapshot: InstallationSnapshot): boolean {
  return new Date(snapshot.metadata.expiresAt) < new Date()
}

/**
 * Get days until snapshot expires
 */
export function getDaysUntilExpiry(snapshot: InstallationSnapshot): number {
  const expiresAt = new Date(snapshot.metadata.expiresAt)
  const now = new Date()
  const diff = expiresAt.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)))
}

/**
 * Clean expired snapshots from list
 */
export function cleanExpiredSnapshots(snapshots: InstallationSnapshot[]): InstallationSnapshot[] {
  const now = new Date()
  return snapshots.filter((s) => new Date(s.metadata.expiresAt) > now && s.status === 'active')
}

/**
 * Get snapshot storage summary
 */
export function getSnapshotStorageSummary(snapshots: InstallationSnapshot[]): {
  totalSnapshots: number
  activeSnapshots: number
  expiredSnapshots: number
  totalSize: number
  oldestSnapshot?: InstallationSnapshot
  newestSnapshot?: InstallationSnapshot
} {
  const now = new Date()
  const active = snapshots.filter((s) => new Date(s.metadata.expiresAt) > now && s.status === 'active')
  const expired = snapshots.filter((s) => new Date(s.metadata.expiresAt) <= now || s.status !== 'active')

  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.installedAt).getTime() - new Date(b.installedAt).getTime()
  )

  return {
    totalSnapshots: snapshots.length,
    activeSnapshots: active.length,
    expiredSnapshots: expired.length,
    totalSize: snapshots.reduce((sum, s) => sum + s.metadata.totalSize, 0),
    oldestSnapshot: sorted[0],
    newestSnapshot: sorted[sorted.length - 1],
  }
}
