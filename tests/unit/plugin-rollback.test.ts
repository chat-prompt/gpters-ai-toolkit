/**
 * Plugin Rollback System Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  calculateFileHash,
  createFileSnapshot,
  createFileChange,
  createInstallationSnapshot,
  createRollbackOperation,
  updateRollbackProgress,
  completeRollbackOperation,
  failRollbackOperation,
  validateSnapshotForRollback,
  getRollbackPreview,
  simulateRollback,
  createRollbackHistoryEntry,
  getRollbackScopeLabel,
  getRollbackStatusLabel,
  getFileChangeTypeLabel,
  formatFileSize,
  formatDuration,
  isSnapshotExpired,
  getDaysUntilExpiry,
  cleanExpiredSnapshots,
  getSnapshotStorageSummary,
  ROLLBACK_STEPS,
  ROLLBACK_ERROR_CODES,
  DEFAULT_STORAGE_CONFIG,
  type InstallationSnapshot,
  type RollbackOperation,
  type RollbackOptions,
  type FileChange,
} from '@/lib/plugin-rollback'

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

describe('plugin-rollback', () => {
  describe('calculateFileHash', () => {
    it('should calculate consistent hash for same content', () => {
      const content = 'test content'
      const hash1 = calculateFileHash(content)
      const hash2 = calculateFileHash(content)

      expect(hash1).toBe(hash2)
    })

    it('should calculate different hash for different content', () => {
      const hash1 = calculateFileHash('content 1')
      const hash2 = calculateFileHash('content 2')

      expect(hash1).not.toBe(hash2)
    })

    it('should return 8-character hex string', () => {
      const hash = calculateFileHash('test')

      expect(hash).toMatch(/^[0-9a-f]{8}$/)
    })
  })

  describe('createFileSnapshot', () => {
    it('should create snapshot with content', () => {
      const snapshot = createFileSnapshot('/path/to/file.ts', 'file content')

      expect(snapshot.path).toBe('/path/to/file.ts')
      expect(snapshot.content).toBe('file content')
      expect(snapshot.hash).toBeTruthy()
      expect(snapshot.size).toBe(12)
      expect(snapshot.permissions).toBe('644')
      expect(snapshot.modifiedAt).toBeTruthy()
    })

    it('should handle null content (non-existent file)', () => {
      const snapshot = createFileSnapshot('/path/to/file.ts', null)

      expect(snapshot.content).toBeNull()
      expect(snapshot.hash).toBe('')
      expect(snapshot.size).toBe(0)
    })

    it('should use provided modifiedAt', () => {
      const date = '2024-01-01T00:00:00Z'
      const snapshot = createFileSnapshot('/path/to/file.ts', 'content', date)

      expect(snapshot.modifiedAt).toBe(date)
    })
  })

  describe('createFileChange', () => {
    it('should create change record for created file', () => {
      const after = createFileSnapshot('/path/file.ts', 'new content')
      const change = createFileChange('/path/file.ts', 'created', null, after)

      expect(change.type).toBe('created')
      expect(change.before).toBeNull()
      expect(change.after).toBe(after)
      expect(change.canRollback).toBe(true)
    })

    it('should create change record for modified file', () => {
      const before = createFileSnapshot('/path/file.ts', 'old content')
      const after = createFileSnapshot('/path/file.ts', 'new content')
      const change = createFileChange('/path/file.ts', 'modified', before, after)

      expect(change.type).toBe('modified')
      expect(change.canRollback).toBe(true)
    })

    it('should create change record for deleted file', () => {
      const before = createFileSnapshot('/path/file.ts', 'content')
      const change = createFileChange('/path/file.ts', 'deleted', before, null)

      expect(change.type).toBe('deleted')
      expect(change.canRollback).toBe(true)
    })

    it('should mark deleted file without backup as non-rollbackable', () => {
      const change = createFileChange('/path/file.ts', 'deleted', null, null)

      expect(change.canRollback).toBe(false)
      expect(change.rollbackReason).toContain('원본 파일이 없어')
    })
  })

  describe('createInstallationSnapshot', () => {
    it('should create snapshot with required fields', () => {
      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0')

      expect(snapshot.id).toMatch(/^rb_/)
      expect(snapshot.pluginId).toBe('plugin-1')
      expect(snapshot.pluginName).toBe('Test Plugin')
      expect(snapshot.version).toBe('1.0.0')
      expect(snapshot.status).toBe('active')
      expect(snapshot.installedAt).toBeTruthy()
    })

    it('should accept optional parameters', () => {
      const files: FileChange[] = [
        createFileChange('/path/file.ts', 'created', null, createFileSnapshot('/path/file.ts', 'content')),
      ]

      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '2.0.0', {
        previousVersion: '1.0.0',
        installationType: 'update',
        installedBy: 'user@example.com',
        files,
      })

      expect(snapshot.previousVersion).toBe('1.0.0')
      expect(snapshot.installationType).toBe('update')
      expect(snapshot.installedBy).toBe('user@example.com')
      expect(snapshot.files).toBe(files)
    })

    it('should calculate metadata correctly', () => {
      const files: FileChange[] = [
        createFileChange('/file1.ts', 'created', null, createFileSnapshot('/file1.ts', 'content1')),
        createFileChange('/file2.ts', 'modified', createFileSnapshot('/file2.ts', 'old'), createFileSnapshot('/file2.ts', 'new')),
        createFileChange('/file3.ts', 'deleted', createFileSnapshot('/file3.ts', 'old'), null),
      ]

      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0', { files })

      expect(snapshot.metadata.totalFiles).toBe(3)
      expect(snapshot.metadata.createdFiles).toBe(1)
      expect(snapshot.metadata.modifiedFiles).toBe(1)
      expect(snapshot.metadata.deletedFiles).toBe(1)
    })

    it('should set expiry date based on config', () => {
      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0')
      const expiresAt = new Date(snapshot.metadata.expiresAt)
      const installedAt = new Date(snapshot.installedAt)

      const daysDiff = (expiresAt.getTime() - installedAt.getTime()) / (24 * 60 * 60 * 1000)
      expect(Math.round(daysDiff)).toBe(DEFAULT_STORAGE_CONFIG.maxAge)
    })
  })

  describe('createRollbackOperation', () => {
    let snapshot: InstallationSnapshot

    beforeEach(() => {
      const files: FileChange[] = [
        createFileChange('/file1.ts', 'created', null, createFileSnapshot('/file1.ts', 'c1')),
        createFileChange('/file2.ts', 'modified', createFileSnapshot('/file2.ts', 'o'), createFileSnapshot('/file2.ts', 'n')),
      ]
      snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0', { files })
    })

    it('should create operation with full scope', () => {
      const options: RollbackOptions = { scope: 'full' }
      const operation = createRollbackOperation(snapshot, options)

      expect(operation.id).toMatch(/^rb_/)
      expect(operation.snapshotId).toBe(snapshot.id)
      expect(operation.scope).toBe('full')
      expect(operation.status).toBe('pending')
      expect(operation.progress.filesTotal).toBe(2)
    })

    it('should create operation with partial scope', () => {
      const options: RollbackOptions = {
        scope: 'partial',
        selectedFiles: ['/file1.ts'],
      }
      const operation = createRollbackOperation(snapshot, options)

      expect(operation.scope).toBe('partial')
      expect(operation.selectedFiles).toEqual(['/file1.ts'])
      expect(operation.progress.filesTotal).toBe(1)
    })

    it('should initialize progress correctly', () => {
      const options: RollbackOptions = { scope: 'full' }
      const operation = createRollbackOperation(snapshot, options)

      expect(operation.progress.totalSteps).toBe(ROLLBACK_STEPS.length)
      expect(operation.progress.completedSteps).toBe(0)
      expect(operation.progress.currentStep).toBe(ROLLBACK_STEPS[0].id)
      expect(operation.progress.percentage).toBe(0)
    })
  })

  describe('updateRollbackProgress', () => {
    let operation: RollbackOperation

    beforeEach(() => {
      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0')
      operation = createRollbackOperation(snapshot, { scope: 'full' })
    })

    it('should update current step', () => {
      const updated = updateRollbackProgress(operation, 'backup')

      expect(updated.progress.currentStep).toBe('backup')
    })

    it('should calculate completed steps', () => {
      const updated = updateRollbackProgress(operation, 'restore_files')

      // restore_files is at index 3
      expect(updated.progress.completedSteps).toBe(4)
    })

    it('should calculate percentage', () => {
      const updated = updateRollbackProgress(operation, 'cleanup')

      // cleanup is the last step
      expect(updated.progress.percentage).toBe(100)
    })

    it('should update files restored count', () => {
      const updated = updateRollbackProgress(operation, 'restore_files', 5)

      expect(updated.progress.filesRestored).toBe(5)
    })
  })

  describe('completeRollbackOperation', () => {
    it('should mark operation as completed on success', () => {
      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0')
      const operation = createRollbackOperation(snapshot, { scope: 'full' })

      const result = {
        success: true,
        filesRestored: 5,
        filesFailed: 0,
        configsRestored: 2,
        duration: 1000,
        warnings: [],
        restoredFiles: ['/file1.ts', '/file2.ts'],
        failedFiles: [],
      }

      const completed = completeRollbackOperation(operation, result)

      expect(completed.status).toBe('completed')
      expect(completed.completedAt).toBeTruthy()
      expect(completed.result).toBe(result)
      expect(completed.progress.percentage).toBe(100)
    })

    it('should mark operation as failed on failure', () => {
      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0')
      const operation = createRollbackOperation(snapshot, { scope: 'full' })

      const result = {
        success: false,
        filesRestored: 3,
        filesFailed: 2,
        configsRestored: 0,
        duration: 500,
        warnings: [],
        restoredFiles: [],
        failedFiles: [{ path: '/file.ts', reason: 'Access denied' }],
      }

      const completed = completeRollbackOperation(operation, result)

      expect(completed.status).toBe('failed')
    })
  })

  describe('failRollbackOperation', () => {
    it('should set error with known error code', () => {
      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0')
      const operation = createRollbackOperation(snapshot, { scope: 'full' })

      const failed = failRollbackOperation(operation, ROLLBACK_ERROR_CODES.SNAPSHOT_NOT_FOUND)

      expect(failed.status).toBe('failed')
      expect(failed.error?.code).toBe(ROLLBACK_ERROR_CODES.SNAPSHOT_NOT_FOUND)
      expect(failed.error?.message).toBe('스냅샷을 찾을 수 없습니다')
      expect(failed.error?.suggestion).toBeTruthy()
    })

    it('should handle unknown error code', () => {
      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0')
      const operation = createRollbackOperation(snapshot, { scope: 'full' })

      const failed = failRollbackOperation(operation, 'CUSTOM_ERROR')

      expect(failed.error?.code).toBe('CUSTOM_ERROR')
      expect(failed.error?.message).toBe('알 수 없는 오류가 발생했습니다')
    })

    it('should include details when provided', () => {
      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0')
      const operation = createRollbackOperation(snapshot, { scope: 'full' })

      const failed = failRollbackOperation(operation, ROLLBACK_ERROR_CODES.FILE_ACCESS_DENIED, '/restricted/file.ts')

      expect(failed.error?.details).toBe('/restricted/file.ts')
    })

    it('should mark partial failure as recoverable', () => {
      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0')
      const operation = createRollbackOperation(snapshot, { scope: 'full' })

      const failed = failRollbackOperation(operation, ROLLBACK_ERROR_CODES.PARTIAL_FAILURE)

      expect(failed.error?.recoverable).toBe(true)
    })
  })

  describe('validateSnapshotForRollback', () => {
    it('should validate active non-expired snapshot', () => {
      const files: FileChange[] = [
        createFileChange('/file.ts', 'created', null, createFileSnapshot('/file.ts', 'c')),
      ]
      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0', { files })

      const result = validateSnapshotForRollback(snapshot)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject rolled back snapshot', () => {
      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0')
      snapshot.status = 'rolled_back'

      const result = validateSnapshotForRollback(snapshot)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('rolled_back'))).toBe(true)
    })

    it('should reject expired snapshot', () => {
      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0')
      snapshot.metadata.expiresAt = new Date(Date.now() - 1000).toISOString()

      const result = validateSnapshotForRollback(snapshot)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('만료'))).toBe(true)
    })

    it('should warn about unrollbackable files', () => {
      const files: FileChange[] = [
        createFileChange('/file.ts', 'deleted', null, null), // can't rollback
      ]
      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0', { files })

      const result = validateSnapshotForRollback(snapshot)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('롤백할 수 없습니다'))).toBe(true)
    })
  })

  describe('getRollbackPreview', () => {
    let snapshot: InstallationSnapshot

    beforeEach(() => {
      const files: FileChange[] = [
        createFileChange('/file1.ts', 'created', null, createFileSnapshot('/file1.ts', 'c1')),
        createFileChange('/file2.ts', 'modified', createFileSnapshot('/file2.ts', 'o'), createFileSnapshot('/file2.ts', 'n')),
        createFileChange('/file3.ts', 'deleted', null, null), // can't rollback
      ]
      snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0', {
        files,
        configChanges: [{ key: 'setting', previousValue: 'old', newValue: 'new', configFile: 'config.json' }],
      })
    })

    it('should preview full rollback', () => {
      const preview = getRollbackPreview(snapshot, { scope: 'full' })

      expect(preview.filesToRestore).toHaveLength(2)
      expect(preview.filesToSkip).toHaveLength(1)
      expect(preview.configsToRestore).toHaveLength(1)
    })

    it('should preview partial rollback', () => {
      const preview = getRollbackPreview(snapshot, {
        scope: 'partial',
        selectedFiles: ['/file1.ts'],
      })

      expect(preview.filesToRestore).toHaveLength(1)
      expect(preview.filesToRestore[0].path).toBe('/file1.ts')
    })

    it('should preview config only rollback', () => {
      const preview = getRollbackPreview(snapshot, { scope: 'config_only' })

      expect(preview.filesToRestore).toHaveLength(0)
      expect(preview.configsToRestore).toHaveLength(1)
    })

    it('should skip configs when requested', () => {
      const preview = getRollbackPreview(snapshot, { scope: 'full', skipConfigs: true })

      expect(preview.configsToRestore).toHaveLength(0)
    })

    it('should add warnings for skipped files', () => {
      const preview = getRollbackPreview(snapshot, { scope: 'full' })

      expect(preview.warnings.some((w) => w.includes('제외'))).toBe(true)
    })

    it('should estimate duration', () => {
      const preview = getRollbackPreview(snapshot, { scope: 'full' })

      expect(preview.estimatedDuration).toBeGreaterThan(0)
    })
  })

  describe('simulateRollback', () => {
    it('should simulate successful rollback', () => {
      const files: FileChange[] = [
        createFileChange('/file1.ts', 'created', null, createFileSnapshot('/file1.ts', 'c')),
        createFileChange('/file2.ts', 'modified', createFileSnapshot('/file2.ts', 'o'), createFileSnapshot('/file2.ts', 'n')),
      ]
      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0', { files })

      const result = simulateRollback(snapshot, { scope: 'full' })

      expect(result.success).toBe(true)
      expect(result.filesRestored).toBe(2)
      expect(result.filesFailed).toBe(0)
      expect(result.warnings.some((w) => w.includes('시뮬레이션'))).toBe(true)
    })
  })

  describe('createRollbackHistoryEntry', () => {
    it('should create history entry from completed operation', () => {
      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0')
      let operation = createRollbackOperation(snapshot, { scope: 'full' })
      operation = completeRollbackOperation(operation, {
        success: true,
        filesRestored: 5,
        filesFailed: 0,
        configsRestored: 2,
        duration: 1000,
        warnings: [],
        restoredFiles: [],
        failedFiles: [],
      })

      const entry = createRollbackHistoryEntry(operation, snapshot, 'user@example.com', 'Bug fix')

      expect(entry.id).toBe(operation.id)
      expect(entry.pluginName).toBe('Test Plugin')
      expect(entry.performedBy).toBe('user@example.com')
      expect(entry.reason).toBe('Bug fix')
      expect(entry.duration).toBe(1000)
      expect(entry.filesAffected).toBe(5)
    })
  })

  describe('label functions', () => {
    describe('getRollbackScopeLabel', () => {
      it('should return Korean labels', () => {
        expect(getRollbackScopeLabel('full')).toBe('전체 롤백')
        expect(getRollbackScopeLabel('partial')).toBe('부분 롤백')
        expect(getRollbackScopeLabel('config_only')).toBe('설정만 롤백')
        expect(getRollbackScopeLabel('files_only')).toBe('파일만 롤백')
      })
    })

    describe('getRollbackStatusLabel', () => {
      it('should return Korean labels', () => {
        expect(getRollbackStatusLabel('pending')).toBe('대기 중')
        expect(getRollbackStatusLabel('in_progress')).toBe('진행 중')
        expect(getRollbackStatusLabel('completed')).toBe('완료')
        expect(getRollbackStatusLabel('failed')).toBe('실패')
        expect(getRollbackStatusLabel('cancelled')).toBe('취소됨')
      })
    })

    describe('getFileChangeTypeLabel', () => {
      it('should return Korean labels', () => {
        expect(getFileChangeTypeLabel('created')).toBe('생성')
        expect(getFileChangeTypeLabel('modified')).toBe('수정')
        expect(getFileChangeTypeLabel('deleted')).toBe('삭제')
        expect(getFileChangeTypeLabel('renamed')).toBe('이름 변경')
      })
    })
  })

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(0)).toBe('0 B')
      expect(formatFileSize(500)).toBe('500 B')
    })

    it('should format kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1 KB')
      expect(formatFileSize(1536)).toBe('1.5 KB')
    })

    it('should format megabytes', () => {
      expect(formatFileSize(1048576)).toBe('1 MB')
      expect(formatFileSize(2621440)).toBe('2.5 MB')
    })

    it('should format gigabytes', () => {
      expect(formatFileSize(1073741824)).toBe('1 GB')
    })
  })

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms')
    })

    it('should format seconds', () => {
      expect(formatDuration(1500)).toBe('1.5초')
      expect(formatDuration(30000)).toBe('30.0초')
    })

    it('should format minutes', () => {
      expect(formatDuration(90000)).toBe('1.5분')
    })
  })

  describe('isSnapshotExpired', () => {
    it('should return false for non-expired snapshot', () => {
      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0')

      expect(isSnapshotExpired(snapshot)).toBe(false)
    })

    it('should return true for expired snapshot', () => {
      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0')
      snapshot.metadata.expiresAt = new Date(Date.now() - 1000).toISOString()

      expect(isSnapshotExpired(snapshot)).toBe(true)
    })
  })

  describe('getDaysUntilExpiry', () => {
    it('should return days until expiry', () => {
      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0')
      const days = getDaysUntilExpiry(snapshot)

      expect(days).toBeGreaterThan(25) // Should be close to 30 days
      expect(days).toBeLessThanOrEqual(30)
    })

    it('should return 0 for expired snapshot', () => {
      const snapshot = createInstallationSnapshot('plugin-1', 'Test Plugin', '1.0.0')
      snapshot.metadata.expiresAt = new Date(Date.now() - 1000).toISOString()

      expect(getDaysUntilExpiry(snapshot)).toBe(0)
    })
  })

  describe('cleanExpiredSnapshots', () => {
    it('should remove expired snapshots', () => {
      const active = createInstallationSnapshot('p1', 'Plugin 1', '1.0.0')
      const expired = createInstallationSnapshot('p2', 'Plugin 2', '1.0.0')
      expired.metadata.expiresAt = new Date(Date.now() - 1000).toISOString()

      const cleaned = cleanExpiredSnapshots([active, expired])

      expect(cleaned).toHaveLength(1)
      expect(cleaned[0].pluginId).toBe('p1')
    })

    it('should remove rolled back snapshots', () => {
      const active = createInstallationSnapshot('p1', 'Plugin 1', '1.0.0')
      const rolledBack = createInstallationSnapshot('p2', 'Plugin 2', '1.0.0')
      rolledBack.status = 'rolled_back'

      const cleaned = cleanExpiredSnapshots([active, rolledBack])

      expect(cleaned).toHaveLength(1)
    })
  })

  describe('getSnapshotStorageSummary', () => {
    it('should calculate storage summary', () => {
      const files: FileChange[] = [
        createFileChange('/f.ts', 'created', null, createFileSnapshot('/f.ts', 'x'.repeat(1000))),
      ]
      const snapshot1 = createInstallationSnapshot('p1', 'Plugin 1', '1.0.0', { files })
      const snapshot2 = createInstallationSnapshot('p2', 'Plugin 2', '1.0.0', { files })

      const summary = getSnapshotStorageSummary([snapshot1, snapshot2])

      expect(summary.totalSnapshots).toBe(2)
      expect(summary.activeSnapshots).toBe(2)
      expect(summary.expiredSnapshots).toBe(0)
      expect(summary.totalSize).toBe(2000)
      expect(summary.oldestSnapshot).toBeDefined()
      expect(summary.newestSnapshot).toBeDefined()
    })

    it('should handle empty array', () => {
      const summary = getSnapshotStorageSummary([])

      expect(summary.totalSnapshots).toBe(0)
      expect(summary.totalSize).toBe(0)
      expect(summary.oldestSnapshot).toBeUndefined()
    })

    it('should count expired snapshots', () => {
      const active = createInstallationSnapshot('p1', 'Plugin 1', '1.0.0')
      const expired = createInstallationSnapshot('p2', 'Plugin 2', '1.0.0')
      expired.metadata.expiresAt = new Date(Date.now() - 1000).toISOString()

      const summary = getSnapshotStorageSummary([active, expired])

      expect(summary.activeSnapshots).toBe(1)
      expect(summary.expiredSnapshots).toBe(1)
    })
  })

  describe('constants', () => {
    it('should have correct number of rollback steps', () => {
      expect(ROLLBACK_STEPS.length).toBe(7)
    })

    it('should have all error codes defined', () => {
      expect(Object.keys(ROLLBACK_ERROR_CODES).length).toBeGreaterThan(5)
    })

    it('should have default storage config', () => {
      expect(DEFAULT_STORAGE_CONFIG.maxSnapshots).toBe(10)
      expect(DEFAULT_STORAGE_CONFIG.maxAge).toBe(30)
      expect(DEFAULT_STORAGE_CONFIG.autoCleanup).toBe(true)
    })
  })
})
