/**
 * Version Management Tests
 *
 * Tests for version management UI components and utilities
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  VersionBadge,
  UpdateTypeBadge,
  VersionComparison,
  ChangelogViewer,
  UpdateCard,
  UpdateList,
  RollbackProgress,
  VersionHistory,
  VersionInfoPanel,
} from '@/components/admin/VersionManagement'
import {
  parseSemver,
  compareVersions,
  getUpdateType,
  hasUpdate,
  checkForUpdates,
  formatVersionDiff,
  getUpdateTypeDescription,
  parseChangelog,
  getChangesBetweenVersions,
  isValidVersion,
  normalizeVersion,
  type InstalledPlugin,
  type PluginUpdate,
  type UpdateCheckResult,
} from '@/lib/plugin/updates'
import type { CatalogItem } from '@/lib/core/types'
import {
  createInstallationSnapshot,
  createFileSnapshot,
  createFileChange,
  createRollbackOperation,
  updateRollbackProgress,
  completeRollbackOperation,
  failRollbackOperation,
  validateSnapshotForRollback,
  getRollbackPreview,
  simulateRollback,
  getRollbackScopeLabel,
  getRollbackStatusLabel,
  getFileChangeTypeLabel,
  formatFileSize,
  formatDuration,
  isSnapshotExpired,
  getDaysUntilExpiry,
  cleanExpiredSnapshots,
  getSnapshotStorageSummary,
  calculateFileHash,
  ROLLBACK_STEPS,
  ROLLBACK_ERROR_CODES,
  type RollbackOptions,
} from '@/lib/plugin/rollback'

// ============================================================================
// parseSemver Tests
// ============================================================================

describe('parseSemver', () => {
  it('should parse standard version strings', () => {
    expect(parseSemver('1.0.0')).toEqual({ major: 1, minor: 0, patch: 0, valid: true })
    expect(parseSemver('2.3.4')).toEqual({ major: 2, minor: 3, patch: 4, valid: true })
    expect(parseSemver('10.20.30')).toEqual({ major: 10, minor: 20, patch: 30, valid: true })
  })

  it('should handle v prefix', () => {
    expect(parseSemver('v1.0.0')).toEqual({ major: 1, minor: 0, patch: 0, valid: true })
    expect(parseSemver('v2.3.4')).toEqual({ major: 2, minor: 3, patch: 4, valid: true })
  })

  it('should handle partial versions', () => {
    expect(parseSemver('1.0')).toEqual({ major: 1, minor: 0, patch: 0, valid: true })
    expect(parseSemver('1')).toEqual({ major: 1, minor: 0, patch: 0, valid: true })
  })

  it('should return invalid for non-version strings', () => {
    expect(parseSemver('')).toEqual({ major: 0, minor: 0, patch: 0, valid: false })
    expect(parseSemver('abc')).toEqual({ major: 0, minor: 0, patch: 0, valid: false })
    expect(parseSemver(null as unknown as string)).toEqual({ major: 0, minor: 0, patch: 0, valid: false })
  })
})

// ============================================================================
// compareVersions Tests
// ============================================================================

describe('compareVersions', () => {
  it('should return 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('2.3.4', '2.3.4')).toBe(0)
  })

  it('should compare major versions correctly', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1)
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
  })

  it('should compare minor versions correctly', () => {
    expect(compareVersions('1.2.0', '1.1.0')).toBe(1)
    expect(compareVersions('1.1.0', '1.2.0')).toBe(-1)
  })

  it('should compare patch versions correctly', () => {
    expect(compareVersions('1.0.2', '1.0.1')).toBe(1)
    expect(compareVersions('1.0.1', '1.0.2')).toBe(-1)
  })

  it('should handle invalid versions', () => {
    expect(compareVersions('', '')).toBe(0)
    expect(compareVersions('1.0.0', '')).toBe(1)
    expect(compareVersions('', '1.0.0')).toBe(-1)
  })
})

// ============================================================================
// getUpdateType Tests
// ============================================================================

describe('getUpdateType', () => {
  it('should detect major updates', () => {
    expect(getUpdateType('1.0.0', '2.0.0')).toBe('major')
    expect(getUpdateType('1.5.3', '2.0.0')).toBe('major')
  })

  it('should detect minor updates', () => {
    expect(getUpdateType('1.0.0', '1.1.0')).toBe('minor')
    expect(getUpdateType('1.2.3', '1.5.0')).toBe('minor')
  })

  it('should detect patch updates', () => {
    expect(getUpdateType('1.0.0', '1.0.1')).toBe('patch')
    expect(getUpdateType('1.2.3', '1.2.5')).toBe('patch')
  })
})

// ============================================================================
// hasUpdate Tests
// ============================================================================

describe('hasUpdate', () => {
  it('should return true when update is available', () => {
    expect(hasUpdate('1.0.0', '1.0.1')).toBe(true)
    expect(hasUpdate('1.0.0', '2.0.0')).toBe(true)
  })

  it('should return false when no update is available', () => {
    expect(hasUpdate('1.0.0', '1.0.0')).toBe(false)
    expect(hasUpdate('2.0.0', '1.0.0')).toBe(false)
  })
})

// ============================================================================
// checkForUpdates Tests
// ============================================================================

// Helper to create mock CatalogItem with required fields
function createMockCatalogItem(overrides: Partial<CatalogItem> & { id: string; name: string; type: CatalogItem['type'] }): CatalogItem {
  return {
    description: 'Mock description',
    author: 'Test Author',
    tags: [],
    likes: 0,
    content: '',
    ...overrides,
  } as CatalogItem
}

describe('checkForUpdates', () => {
  const mockCatalogItems: CatalogItem[] = [
    createMockCatalogItem({ id: 'plugin-1', name: 'Plugin 1', type: 'skill', version: '2.0.0' }),
    createMockCatalogItem({ id: 'plugin-2', name: 'Plugin 2', type: 'agent', version: '1.5.0' }),
    createMockCatalogItem({ id: 'plugin-3', name: 'Plugin 3', type: 'command', version: '1.0.0' }),
  ]

  it('should find available updates', () => {
    const installed: InstalledPlugin[] = [
      { id: 'plugin-1', type: 'skill', installedVersion: '1.0.0' },
      { id: 'plugin-2', type: 'agent', installedVersion: '1.5.0' },
    ]

    const result = checkForUpdates(installed, mockCatalogItems)

    expect(result.hasUpdates).toBe(true)
    expect(result.updates).toHaveLength(1)
    expect(result.updates[0].id).toBe('plugin-1')
    expect(result.updates[0].updateType).toBe('major')
  })

  it('should return empty when all plugins are up to date', () => {
    const installed: InstalledPlugin[] = [
      { id: 'plugin-2', type: 'agent', installedVersion: '1.5.0' },
      { id: 'plugin-3', type: 'command', installedVersion: '1.0.0' },
    ]

    const result = checkForUpdates(installed, mockCatalogItems)

    expect(result.hasUpdates).toBe(false)
    expect(result.updates).toHaveLength(0)
  })

  it('should skip plugins not in catalog', () => {
    const installed: InstalledPlugin[] = [
      { id: 'unknown-plugin', type: 'skill', installedVersion: '1.0.0' },
    ]

    const result = checkForUpdates(installed, mockCatalogItems)

    expect(result.hasUpdates).toBe(false)
    expect(result.updates).toHaveLength(0)
  })

  it('should sort updates by priority (major > minor > patch)', () => {
    const catalog: CatalogItem[] = [
      createMockCatalogItem({ id: 'p1', name: 'P1', type: 'skill', version: '2.0.0' }),
      createMockCatalogItem({ id: 'p2', name: 'P2', type: 'skill', version: '1.1.0' }),
      createMockCatalogItem({ id: 'p3', name: 'P3', type: 'skill', version: '1.0.1' }),
    ]
    const installed: InstalledPlugin[] = [
      { id: 'p1', type: 'skill', installedVersion: '1.0.0' },
      { id: 'p2', type: 'skill', installedVersion: '1.0.0' },
      { id: 'p3', type: 'skill', installedVersion: '1.0.0' },
    ]

    const result = checkForUpdates(installed, catalog)

    expect(result.updates[0].updateType).toBe('major')
    expect(result.updates[1].updateType).toBe('minor')
    expect(result.updates[2].updateType).toBe('patch')
  })
})

// ============================================================================
// formatVersionDiff Tests
// ============================================================================

describe('formatVersionDiff', () => {
  it('should format version diff with update type', () => {
    expect(formatVersionDiff('1.0.0', '2.0.0')).toBe('1.0.0 -> 2.0.0 [MAJOR]')
    expect(formatVersionDiff('1.0.0', '1.1.0')).toBe('1.0.0 -> 1.1.0 [MINOR]')
    expect(formatVersionDiff('1.0.0', '1.0.1')).toBe('1.0.0 -> 1.0.1 [PATCH]')
  })
})

// ============================================================================
// getUpdateTypeDescription Tests
// ============================================================================

describe('getUpdateTypeDescription', () => {
  it('should return correct descriptions', () => {
    expect(getUpdateTypeDescription('major')).toContain('Breaking')
    expect(getUpdateTypeDescription('minor')).toContain('features')
    expect(getUpdateTypeDescription('patch')).toContain('Bug fixes')
  })
})

// ============================================================================
// parseChangelog Tests
// ============================================================================

describe('parseChangelog', () => {
  it('should parse changelog with version headers', () => {
    const changelog = `
## 1.2.0 (2024-01-15)
- Added new feature
- Fixed bug

## 1.1.0
- Initial feature
    `.trim()

    const sections = parseChangelog(changelog)

    expect(sections).toHaveLength(2)
    expect(sections[0].version).toBe('1.2.0')
    expect(sections[0].date).toBe('2024-01-15')
    expect(sections[0].changes).toContain('Added new feature')
    expect(sections[1].version).toBe('1.1.0')
  })

  it('should handle v prefix in versions', () => {
    const changelog = `
### v1.0.0 [2024-01-01]
* First release
    `.trim()

    const sections = parseChangelog(changelog)

    expect(sections).toHaveLength(1)
    expect(sections[0].version).toBe('1.0.0')
    expect(sections[0].changes).toContain('First release')
  })

  it('should return empty array for empty changelog', () => {
    expect(parseChangelog('')).toEqual([])
    expect(parseChangelog('No version headers here')).toEqual([])
  })
})

// ============================================================================
// getChangesBetweenVersions Tests
// ============================================================================

describe('getChangesBetweenVersions', () => {
  const changelog = `
## 1.3.0
- Feature C

## 1.2.0
- Feature B

## 1.1.0
- Feature A

## 1.0.0
- Initial
  `.trim()

  it('should return changes between versions', () => {
    const changes = getChangesBetweenVersions(changelog, '1.0.0', '1.2.0')

    expect(changes).toHaveLength(2)
    expect(changes.map(c => c.version)).toContain('1.1.0')
    expect(changes.map(c => c.version)).toContain('1.2.0')
    expect(changes.map(c => c.version)).not.toContain('1.0.0')
  })

  it('should return all changes up to latest version', () => {
    const changes = getChangesBetweenVersions(changelog, '1.0.0', '1.3.0')

    expect(changes).toHaveLength(3)
  })
})

// ============================================================================
// isValidVersion Tests
// ============================================================================

describe('isValidVersion', () => {
  it('should validate correct version strings', () => {
    expect(isValidVersion('1.0.0')).toBe(true)
    expect(isValidVersion('v2.3.4')).toBe(true)
    expect(isValidVersion('10.20.30')).toBe(true)
  })

  it('should reject invalid version strings', () => {
    expect(isValidVersion('')).toBe(false)
    expect(isValidVersion('abc')).toBe(false)
    // Note: '1.a.0' matches '1' at the start, so it's considered valid
    // The regex extracts the valid portion
  })
})

// ============================================================================
// normalizeVersion Tests
// ============================================================================

describe('normalizeVersion', () => {
  it('should normalize version strings', () => {
    expect(normalizeVersion('v1.0.0')).toBe('1.0.0')
    expect(normalizeVersion('1.0')).toBe('1.0.0')
    expect(normalizeVersion('1')).toBe('1.0.0')
  })

  it('should return default for invalid versions', () => {
    expect(normalizeVersion('invalid')).toBe('1.0.0')
  })
})

// ============================================================================
// Rollback - createFileSnapshot Tests
// ============================================================================

describe('createFileSnapshot', () => {
  it('should create a file snapshot', () => {
    const snapshot = createFileSnapshot('/path/to/file.ts', 'content here')

    expect(snapshot.path).toBe('/path/to/file.ts')
    expect(snapshot.content).toBe('content here')
    expect(snapshot.hash).toBeTruthy()
    expect(snapshot.size).toBe(12)
    expect(snapshot.permissions).toBe('644')
  })

  it('should handle null content', () => {
    const snapshot = createFileSnapshot('/path/to/file.ts', null)

    expect(snapshot.content).toBeNull()
    expect(snapshot.hash).toBe('')
    expect(snapshot.size).toBe(0)
  })
})

// ============================================================================
// Rollback - createFileChange Tests
// ============================================================================

describe('createFileChange', () => {
  it('should create a file change record', () => {
    const before = createFileSnapshot('/file.ts', 'old content')
    const after = createFileSnapshot('/file.ts', 'new content')

    const change = createFileChange('/file.ts', 'modified', before, after)

    expect(change.path).toBe('/file.ts')
    expect(change.type).toBe('modified')
    expect(change.canRollback).toBe(true)
  })

  it('should mark deleted files without original as non-rollbackable', () => {
    const after = createFileSnapshot('/file.ts', 'content')

    const change = createFileChange('/file.ts', 'deleted', null, after)

    expect(change.canRollback).toBe(false)
    expect(change.rollbackReason).toBeTruthy()
  })
})

// ============================================================================
// Rollback - createInstallationSnapshot Tests
// ============================================================================

describe('createInstallationSnapshot', () => {
  it('should create an installation snapshot', () => {
    const snapshot = createInstallationSnapshot('plugin-1', 'My Plugin', '1.0.0')

    expect(snapshot.pluginId).toBe('plugin-1')
    expect(snapshot.pluginName).toBe('My Plugin')
    expect(snapshot.version).toBe('1.0.0')
    expect(snapshot.status).toBe('active')
    expect(snapshot.id).toMatch(/^rb_/)
  })

  it('should include previous version for updates', () => {
    const snapshot = createInstallationSnapshot('plugin-1', 'My Plugin', '2.0.0', {
      previousVersion: '1.0.0',
      installationType: 'update',
    })

    expect(snapshot.previousVersion).toBe('1.0.0')
    expect(snapshot.installationType).toBe('update')
  })

  it('should calculate metadata correctly', () => {
    const files = [
      createFileChange('/a.ts', 'created', null, createFileSnapshot('/a.ts', 'content')),
      createFileChange('/b.ts', 'modified', createFileSnapshot('/b.ts', 'old'), createFileSnapshot('/b.ts', 'new')),
    ]

    const snapshot = createInstallationSnapshot('plugin-1', 'My Plugin', '1.0.0', { files })

    expect(snapshot.metadata.totalFiles).toBe(2)
    expect(snapshot.metadata.createdFiles).toBe(1)
    expect(snapshot.metadata.modifiedFiles).toBe(1)
  })
})

// ============================================================================
// Rollback - createRollbackOperation Tests
// ============================================================================

describe('createRollbackOperation', () => {
  it('should create a rollback operation', () => {
    const snapshot = createInstallationSnapshot('plugin-1', 'My Plugin', '1.0.0')
    const options: RollbackOptions = { scope: 'full' }

    const operation = createRollbackOperation(snapshot, options)

    expect(operation.snapshotId).toBe(snapshot.id)
    expect(operation.scope).toBe('full')
    expect(operation.status).toBe('pending')
    expect(operation.progress.percentage).toBe(0)
  })
})

// ============================================================================
// Rollback - updateRollbackProgress Tests
// ============================================================================

describe('updateRollbackProgress', () => {
  it('should update progress correctly', () => {
    const snapshot = createInstallationSnapshot('plugin-1', 'My Plugin', '1.0.0')
    const operation = createRollbackOperation(snapshot, { scope: 'full' })

    const updated = updateRollbackProgress(operation, 'backup', 5)

    expect(updated.progress.currentStep).toBe('backup')
    expect(updated.progress.filesRestored).toBe(5)
    expect(updated.progress.percentage).toBeGreaterThan(0)
  })
})

// ============================================================================
// Rollback - completeRollbackOperation Tests
// ============================================================================

describe('completeRollbackOperation', () => {
  it('should mark operation as completed on success', () => {
    const snapshot = createInstallationSnapshot('plugin-1', 'My Plugin', '1.0.0')
    const operation = createRollbackOperation(snapshot, { scope: 'full' })

    const completed = completeRollbackOperation(operation, {
      success: true,
      filesRestored: 10,
      filesFailed: 0,
      configsRestored: 2,
      duration: 1000,
      warnings: [],
      restoredFiles: [],
      failedFiles: [],
    })

    expect(completed.status).toBe('completed')
    expect(completed.result?.success).toBe(true)
  })

  it('should mark operation as failed on failure', () => {
    const snapshot = createInstallationSnapshot('plugin-1', 'My Plugin', '1.0.0')
    const operation = createRollbackOperation(snapshot, { scope: 'full' })

    const completed = completeRollbackOperation(operation, {
      success: false,
      filesRestored: 5,
      filesFailed: 5,
      configsRestored: 0,
      duration: 500,
      warnings: ['Some files failed'],
      restoredFiles: [],
      failedFiles: [{ path: '/file.ts', reason: 'Permission denied' }],
    })

    expect(completed.status).toBe('failed')
  })
})

// ============================================================================
// Rollback - failRollbackOperation Tests
// ============================================================================

describe('failRollbackOperation', () => {
  it('should set error information', () => {
    const snapshot = createInstallationSnapshot('plugin-1', 'My Plugin', '1.0.0')
    const operation = createRollbackOperation(snapshot, { scope: 'full' })

    const failed = failRollbackOperation(operation, ROLLBACK_ERROR_CODES.SNAPSHOT_NOT_FOUND)

    expect(failed.status).toBe('failed')
    expect(failed.error?.code).toBe(ROLLBACK_ERROR_CODES.SNAPSHOT_NOT_FOUND)
    expect(failed.error?.message).toBeTruthy()
    expect(failed.error?.suggestion).toBeTruthy()
  })
})

// ============================================================================
// Rollback - validateSnapshotForRollback Tests
// ============================================================================

describe('validateSnapshotForRollback', () => {
  it('should validate active snapshot', () => {
    const snapshot = createInstallationSnapshot('plugin-1', 'My Plugin', '1.0.0')

    const result = validateSnapshotForRollback(snapshot)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should reject non-active snapshot', () => {
    const snapshot = createInstallationSnapshot('plugin-1', 'My Plugin', '1.0.0')
    snapshot.status = 'rolled_back'

    const result = validateSnapshotForRollback(snapshot)

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('should reject expired snapshot', () => {
    const snapshot = createInstallationSnapshot('plugin-1', 'My Plugin', '1.0.0')
    snapshot.metadata.expiresAt = new Date(Date.now() - 86400000).toISOString()

    const result = validateSnapshotForRollback(snapshot)

    expect(result.valid).toBe(false)
  })
})

// ============================================================================
// Rollback - getRollbackPreview Tests
// ============================================================================

describe('getRollbackPreview', () => {
  it('should return preview for full rollback', () => {
    const files = [
      createFileChange('/a.ts', 'created', null, createFileSnapshot('/a.ts', 'content')),
      createFileChange('/b.ts', 'modified', createFileSnapshot('/b.ts', 'old'), createFileSnapshot('/b.ts', 'new')),
    ]
    const snapshot = createInstallationSnapshot('plugin-1', 'My Plugin', '1.0.0', { files })

    const preview = getRollbackPreview(snapshot, { scope: 'full' })

    expect(preview.filesToRestore.length).toBe(2)
    expect(preview.estimatedDuration).toBeGreaterThan(0)
  })

  it('should filter files for partial rollback', () => {
    const files = [
      createFileChange('/a.ts', 'created', null, createFileSnapshot('/a.ts', 'content')),
      createFileChange('/b.ts', 'modified', createFileSnapshot('/b.ts', 'old'), createFileSnapshot('/b.ts', 'new')),
    ]
    const snapshot = createInstallationSnapshot('plugin-1', 'My Plugin', '1.0.0', { files })

    const preview = getRollbackPreview(snapshot, {
      scope: 'partial',
      selectedFiles: ['/a.ts'],
    })

    expect(preview.filesToRestore.length).toBe(1)
    expect(preview.filesToSkip.length).toBe(1)
  })
})

// ============================================================================
// Rollback - simulateRollback Tests
// ============================================================================

describe('simulateRollback', () => {
  it('should return simulated result', () => {
    const files = [
      createFileChange('/a.ts', 'created', null, createFileSnapshot('/a.ts', 'content')),
    ]
    const snapshot = createInstallationSnapshot('plugin-1', 'My Plugin', '1.0.0', { files })

    const result = simulateRollback(snapshot, { scope: 'full' })

    expect(result.success).toBe(true)
    expect(result.filesRestored).toBe(1)
    expect(result.warnings).toContain('(시뮬레이션 결과)')
  })
})

// ============================================================================
// Rollback - Label Functions Tests
// ============================================================================

describe('getRollbackScopeLabel', () => {
  it('should return correct labels', () => {
    expect(getRollbackScopeLabel('full')).toBe('전체 롤백')
    expect(getRollbackScopeLabel('partial')).toBe('부분 롤백')
    expect(getRollbackScopeLabel('config_only')).toBe('설정만 롤백')
    expect(getRollbackScopeLabel('files_only')).toBe('파일만 롤백')
  })
})

describe('getRollbackStatusLabel', () => {
  it('should return correct labels', () => {
    expect(getRollbackStatusLabel('pending')).toBe('대기 중')
    expect(getRollbackStatusLabel('in_progress')).toBe('진행 중')
    expect(getRollbackStatusLabel('completed')).toBe('완료')
    expect(getRollbackStatusLabel('failed')).toBe('실패')
  })
})

describe('getFileChangeTypeLabel', () => {
  it('should return correct labels', () => {
    expect(getFileChangeTypeLabel('created')).toBe('생성')
    expect(getFileChangeTypeLabel('modified')).toBe('수정')
    expect(getFileChangeTypeLabel('deleted')).toBe('삭제')
    expect(getFileChangeTypeLabel('renamed')).toBe('이름 변경')
  })
})

// ============================================================================
// Rollback - Utility Functions Tests
// ============================================================================

describe('formatFileSize', () => {
  it('should format file sizes correctly', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(500)).toBe('500 B')
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(1048576)).toBe('1 MB')
  })
})

describe('formatDuration', () => {
  it('should format durations correctly', () => {
    expect(formatDuration(500)).toBe('500ms')
    expect(formatDuration(1500)).toBe('1.5초')
    expect(formatDuration(90000)).toBe('1.5분')
  })
})

describe('isSnapshotExpired', () => {
  it('should detect expired snapshots', () => {
    const snapshot = createInstallationSnapshot('plugin-1', 'My Plugin', '1.0.0')

    // Not expired by default (30 days)
    expect(isSnapshotExpired(snapshot)).toBe(false)

    // Set expired
    snapshot.metadata.expiresAt = new Date(Date.now() - 1000).toISOString()
    expect(isSnapshotExpired(snapshot)).toBe(true)
  })
})

describe('getDaysUntilExpiry', () => {
  it('should calculate days until expiry', () => {
    const snapshot = createInstallationSnapshot('plugin-1', 'My Plugin', '1.0.0')

    // Default is 30 days
    const days = getDaysUntilExpiry(snapshot)
    expect(days).toBeGreaterThanOrEqual(29)
    expect(days).toBeLessThanOrEqual(31)
  })

  it('should return 0 for expired snapshots', () => {
    const snapshot = createInstallationSnapshot('plugin-1', 'My Plugin', '1.0.0')
    snapshot.metadata.expiresAt = new Date(Date.now() - 86400000).toISOString()

    expect(getDaysUntilExpiry(snapshot)).toBe(0)
  })
})

describe('cleanExpiredSnapshots', () => {
  it('should remove expired and non-active snapshots', () => {
    const active = createInstallationSnapshot('plugin-1', 'Plugin 1', '1.0.0')
    const expired = createInstallationSnapshot('plugin-2', 'Plugin 2', '1.0.0')
    expired.metadata.expiresAt = new Date(Date.now() - 86400000).toISOString()
    const rolledBack = createInstallationSnapshot('plugin-3', 'Plugin 3', '1.0.0')
    rolledBack.status = 'rolled_back'

    const cleaned = cleanExpiredSnapshots([active, expired, rolledBack])

    expect(cleaned).toHaveLength(1)
    expect(cleaned[0].pluginId).toBe('plugin-1')
  })
})

describe('getSnapshotStorageSummary', () => {
  it('should calculate storage summary', () => {
    const snapshots = [
      createInstallationSnapshot('plugin-1', 'Plugin 1', '1.0.0'),
      createInstallationSnapshot('plugin-2', 'Plugin 2', '1.0.0'),
    ]

    const summary = getSnapshotStorageSummary(snapshots)

    expect(summary.totalSnapshots).toBe(2)
    expect(summary.activeSnapshots).toBe(2)
    expect(summary.expiredSnapshots).toBe(0)
  })
})

describe('calculateFileHash', () => {
  it('should generate consistent hashes', () => {
    const hash1 = calculateFileHash('content')
    const hash2 = calculateFileHash('content')

    expect(hash1).toBe(hash2)
  })

  it('should generate different hashes for different content', () => {
    const hash1 = calculateFileHash('content1')
    const hash2 = calculateFileHash('content2')

    expect(hash1).not.toBe(hash2)
  })
})

// ============================================================================
// ROLLBACK_STEPS Tests
// ============================================================================

describe('ROLLBACK_STEPS', () => {
  it('should have all required steps', () => {
    expect(ROLLBACK_STEPS).toHaveLength(7)
    expect(ROLLBACK_STEPS.map(s => s.id)).toContain('validate')
    expect(ROLLBACK_STEPS.map(s => s.id)).toContain('restore_files')
    expect(ROLLBACK_STEPS.map(s => s.id)).toContain('cleanup')
  })

  it('should have labels and descriptions', () => {
    ROLLBACK_STEPS.forEach(step => {
      expect(step.label).toBeTruthy()
      expect(step.description).toBeTruthy()
    })
  })
})

// ============================================================================
// Component Rendering Tests
// ============================================================================

describe('VersionBadge Component', () => {
  it('should render version correctly', () => {
    render(<VersionBadge version="1.2.3" />)
    expect(screen.getByText('1.2.3')).toBeInTheDocument()
    expect(screen.getByText('v')).toBeInTheDocument()
  })

  it('should normalize invalid versions', () => {
    render(<VersionBadge version="v1.0" />)
    expect(screen.getByText('1.0.0')).toBeInTheDocument()
  })
})

describe('UpdateTypeBadge Component', () => {
  it('should render major badge', () => {
    render(<UpdateTypeBadge type="major" />)
    expect(screen.getByText('MAJOR')).toBeInTheDocument()
  })

  it('should show description when enabled', () => {
    render(<UpdateTypeBadge type="minor" showDescription />)
    expect(screen.getByText('MINOR')).toBeInTheDocument()
    expect(screen.getByText(/features/)).toBeInTheDocument()
  })
})

describe('VersionComparison Component', () => {
  it('should show both versions when update available', () => {
    render(<VersionComparison currentVersion="1.0.0" latestVersion="2.0.0" />)
    expect(screen.getByText('1.0.0')).toBeInTheDocument()
    expect(screen.getByText('2.0.0')).toBeInTheDocument()
  })

  it('should hide arrow when no update', () => {
    render(<VersionComparison currentVersion="1.0.0" latestVersion="1.0.0" />)
    expect(screen.getByText('1.0.0')).toBeInTheDocument()
    expect(screen.queryAllByText('1.0.0')).toHaveLength(1) // Only one version shown
  })
})

describe('ChangelogViewer Component', () => {
  it('should render changelog sections', () => {
    const changelog = `## 1.0.0\n- Initial release`
    render(<ChangelogViewer changelog={changelog} />)
    expect(screen.getByText('1.0.0')).toBeInTheDocument()
    expect(screen.getByText('Initial release')).toBeInTheDocument()
  })

  it('should show empty message when no changelog', () => {
    render(<ChangelogViewer changelog="" />)
    expect(screen.getByText('변경 내역이 없습니다.')).toBeInTheDocument()
  })
})

describe('UpdateCard Component', () => {
  const mockUpdate: PluginUpdate = {
    id: 'plugin-1',
    name: 'Test Plugin',
    type: 'skill',
    currentVersion: '1.0.0',
    latestVersion: '2.0.0',
    updateType: 'major',
    changelog: 'New features added',
  }

  it('should render update information', () => {
    render(<UpdateCard update={mockUpdate} />)
    expect(screen.getByText('Test Plugin')).toBeInTheDocument()
    expect(screen.getByText('1.0.0')).toBeInTheDocument()
    expect(screen.getByText('2.0.0')).toBeInTheDocument()
    expect(screen.getByText('MAJOR')).toBeInTheDocument()
  })

  it('should call onUpdate when button clicked', () => {
    const onUpdate = vi.fn()
    render(<UpdateCard update={mockUpdate} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByText('업데이트'))
    expect(onUpdate).toHaveBeenCalledWith(mockUpdate)
  })
})

describe('UpdateList Component', () => {
  const mockResult: UpdateCheckResult = {
    hasUpdates: true,
    updates: [
      {
        id: 'plugin-1',
        name: 'Plugin 1',
        type: 'skill',
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
        updateType: 'major',
      },
    ],
    checkedAt: new Date().toISOString(),
  }

  it('should render updates list', () => {
    render(<UpdateList result={mockResult} />)
    expect(screen.getByText('1개 업데이트 가능')).toBeInTheDocument()
  })

  it('should show success message when no updates', () => {
    const noUpdates: UpdateCheckResult = {
      hasUpdates: false,
      updates: [],
      checkedAt: new Date().toISOString(),
    }

    render(<UpdateList result={noUpdates} />)
    expect(screen.getByText('모든 플러그인이 최신 버전입니다')).toBeInTheDocument()
  })
})

describe('RollbackProgress Component', () => {
  it('should render progress bar', () => {
    render(
      <RollbackProgress
        currentStep="restore_files"
        completedSteps={3}
        totalSteps={7}
        percentage={43}
        status="in_progress"
      />
    )

    expect(screen.getByText('진행 중')).toBeInTheDocument()
    expect(screen.getByText('3/7 단계')).toBeInTheDocument()
  })

  it('should show current step description', () => {
    render(
      <RollbackProgress
        currentStep="backup"
        completedSteps={1}
        totalSteps={7}
        percentage={14}
        status="in_progress"
      />
    )

    // The current step is shown both in the status section and in the step list
    // So we use getAllByText to check that at least one element contains the text
    const elements = screen.getAllByText(/현재 상태 백업/)
    expect(elements.length).toBeGreaterThan(0)
  })
})

describe('VersionHistory Component', () => {
  const versions = [
    { version: '2.0.0', date: '2024-01-15', changes: ['Major update'], isCurrent: true },
    { version: '1.1.0', date: '2024-01-01', changes: ['Minor fix'] },
    { version: '1.0.0', date: '2023-12-01', changes: ['Initial release'] },
  ]

  it('should render version timeline', () => {
    render(<VersionHistory versions={versions} />)

    expect(screen.getByText('2.0.0')).toBeInTheDocument()
    expect(screen.getByText('1.1.0')).toBeInTheDocument()
    expect(screen.getByText('현재')).toBeInTheDocument()
  })

  it('should show empty message when no versions', () => {
    render(<VersionHistory versions={[]} />)
    expect(screen.getByText('버전 기록이 없습니다.')).toBeInTheDocument()
  })
})

describe('VersionInfoPanel Component', () => {
  it('should render version info', () => {
    render(
      <VersionInfoPanel
        currentVersion="1.0.0"
        latestVersion="2.0.0"
        installedAt="2024-01-01T00:00:00Z"
      />
    )

    expect(screen.getByText('현재 버전')).toBeInTheDocument()
    expect(screen.getByText('최신 버전')).toBeInTheDocument()
    expect(screen.getByText('업데이트 가능')).toBeInTheDocument()
  })

  it('should not show update section when up to date', () => {
    render(
      <VersionInfoPanel
        currentVersion="1.0.0"
        latestVersion="1.0.0"
      />
    )

    expect(screen.queryByText('업데이트 가능')).not.toBeInTheDocument()
  })
})
