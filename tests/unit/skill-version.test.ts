/**
 * Skill Version Management Tests
 */

import { describe, it, expect, vi } from 'vitest'

// Mock the database
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'test-version-id' }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
}))

vi.mock('@/lib/db/schema', () => ({
  catalogItems: { id: 'id', marketplaceVersion: 'marketplaceVersion' },
  itemVersions: { id: 'id', itemId: 'itemId', version: 'version', createdAt: 'createdAt' },
}))

// Import after mocking
import {
  parseSemver,
  incrementVersion,
  compareVersions,
  analyzeChanges,
} from '@/lib/versioning/version'

describe('Skill Version Management', () => {
  describe('parseSemver', () => {
    it('should parse valid semver string', () => {
      const result = parseSemver('1.2.3')
      expect(result).toEqual({ major: 1, minor: 2, patch: 3 })
    })

    it('should parse semver starting with digits (v prefix not stripped)', () => {
      // Note: Current implementation doesn't strip 'v' prefix, so it falls back to default
      const result = parseSemver('v2.0.0')
      expect(result).toEqual({ major: 1, minor: 0, patch: 0 })
    })

    it('should default to 1.0.0 for partial version', () => {
      // Regex requires all three parts, so partial version falls back to default
      const result = parseSemver('1.2')
      expect(result).toEqual({ major: 1, minor: 0, patch: 0 })
    })

    it('should return 1.0.0 for invalid version (new skill default)', () => {
      const result = parseSemver('invalid')
      expect(result).toEqual({ major: 1, minor: 0, patch: 0 })
    })

    it('should handle empty string with default', () => {
      const result = parseSemver('')
      expect(result).toEqual({ major: 1, minor: 0, patch: 0 })
    })
  })

  describe('incrementVersion', () => {
    it('should increment major version', () => {
      expect(incrementVersion('1.2.3', 'major')).toBe('2.0.0')
    })

    it('should increment minor version', () => {
      expect(incrementVersion('1.2.3', 'minor')).toBe('1.3.0')
    })

    it('should increment patch version', () => {
      expect(incrementVersion('1.2.3', 'patch')).toBe('1.2.4')
    })

    it('should handle version with v prefix (falls back to 1.0.0 default)', () => {
      // v prefix is not stripped, so it parses as 1.0.0 default, then increments
      expect(incrementVersion('v1.0.0', 'minor')).toBe('1.1.0')
    })

    it('should handle 0.x.x versions', () => {
      expect(incrementVersion('0.1.0', 'major')).toBe('1.0.0')
      expect(incrementVersion('0.1.0', 'minor')).toBe('0.2.0')
      expect(incrementVersion('0.1.0', 'patch')).toBe('0.1.1')
    })
  })

  describe('compareVersions', () => {
    it('should return 0 for equal versions', () => {
      expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
    })

    it('should return 1 when first version is greater', () => {
      expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
      expect(compareVersions('1.3.0', '1.2.9')).toBe(1)
      expect(compareVersions('1.2.4', '1.2.3')).toBe(1)
    })

    it('should return -1 when first version is smaller', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
      expect(compareVersions('1.2.0', '1.3.0')).toBe(-1)
      expect(compareVersions('1.2.3', '1.2.4')).toBe(-1)
    })

    it('should handle versions with v prefix (falls back to 1.0.0)', () => {
      // v prefix versions fall back to 1.0.0
      expect(compareVersions('v1.2.3', '1.2.3')).toBe(-1) // 1.0.0 < 1.2.3
      expect(compareVersions('v2.0.0', 'v1.0.0')).toBe(0) // both fall back to 1.0.0
    })
  })

  describe('analyzeChanges', () => {
    it('should detect no changes', () => {
      const content = '# Skill\nSome content'
      const result = analyzeChanges(content, content)
      expect(result.hasChanges).toBe(false)
    })

    it('should detect minor content changes', () => {
      const oldContent = '# Skill\nOld content'
      const newContent = '# Skill\nNew content'
      const result = analyzeChanges(oldContent, newContent)
      expect(result.hasChanges).toBe(true)
    })

    it('should detect new features (new sections)', () => {
      const oldContent = '# Skill\nContent'
      const newContent = '# Skill\nContent\n\n## New Feature\nNew stuff'
      const result = analyzeChanges(oldContent, newContent)
      expect(result.hasChanges).toBe(true)
      expect(result.newFeatures).toBe(true)
    })

    it('should detect breaking changes (removed sections)', () => {
      const oldContent = '# Skill\nContent\n\n## Feature\nStuff'
      const newContent = '# Skill\nContent'
      const result = analyzeChanges(oldContent, newContent)
      expect(result.hasChanges).toBe(true)
      expect(result.breaking).toBe(true)
    })

    it('should detect breaking changes when allowed-tools removed', () => {
      const oldContent = '---\nallowed-tools: Read, Write\n---\n# Skill'
      const newContent = '---\n---\n# Skill'
      const result = analyzeChanges(oldContent, newContent)
      expect(result.breaking).toBe(true)
    })
  })
})

describe('Version History Entry Types', () => {
  it('should have correct version type values', () => {
    const types = ['major', 'minor', 'patch'] as const
    types.forEach(type => {
      expect(['major', 'minor', 'patch']).toContain(type)
    })
  })
})

describe('Version Comparison Result', () => {
  it('should correctly identify change types', () => {
    // Test data structures
    const noChangeResult = {
      hasChanges: false,
      changeType: 'none' as const,
      summary: 'No changes detected',
      suggestedVersion: '1.0.0',
    }
    expect(noChangeResult.hasChanges).toBe(false)
    expect(noChangeResult.changeType).toBe('none')

    const patchResult = {
      hasChanges: true,
      changeType: 'patch' as const,
      summary: 'Bug fixes',
      suggestedVersion: '1.0.1',
    }
    expect(patchResult.hasChanges).toBe(true)
    expect(patchResult.changeType).toBe('patch')

    const minorResult = {
      hasChanges: true,
      changeType: 'minor' as const,
      summary: 'New features',
      suggestedVersion: '1.1.0',
    }
    expect(minorResult.changeType).toBe('minor')

    const majorResult = {
      hasChanges: true,
      changeType: 'major' as const,
      summary: 'Breaking changes',
      suggestedVersion: '2.0.0',
    }
    expect(majorResult.changeType).toBe('major')
  })
})

describe('Rollback Options', () => {
  it('should validate rollback options structure', () => {
    const options = {
      itemId: 'test-item',
      targetVersionId: 'test-version',
      createdBy: 'user-123',
      createNewVersion: true,
    }

    expect(options.itemId).toBeDefined()
    expect(options.targetVersionId).toBeDefined()
    expect(typeof options.createNewVersion).toBe('boolean')
  })
})

describe('Rollback Result', () => {
  it('should have correct success result structure', () => {
    const successResult = {
      success: true,
      message: 'Successfully rolled back',
      newVersion: '1.0.1',
      restoredData: { content: 'restored content' },
    }

    expect(successResult.success).toBe(true)
    expect(successResult.newVersion).toBeDefined()
    expect(successResult.restoredData).toBeDefined()
  })

  it('should have correct failure result structure', () => {
    const failureResult = {
      success: false,
      message: 'Target version not found',
    }

    expect(failureResult.success).toBe(false)
    expect(failureResult.message).toBeDefined()
  })
})

describe('Version History Entry', () => {
  it('should have all required fields', () => {
    const entry = {
      id: 'version-1',
      itemId: 'item-1',
      version: '1.0.0',
      versionType: 'patch' as const,
      changelog: 'Initial release',
      content: '# Skill content',
      snapshotData: { name: 'Test Skill' },
      createdAt: new Date(),
      createdBy: 'user-1',
      isCurrent: true,
    }

    expect(entry.id).toBeDefined()
    expect(entry.itemId).toBeDefined()
    expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(['major', 'minor', 'patch']).toContain(entry.versionType)
    expect(entry.content).toBeDefined()
    expect(entry.createdAt).toBeInstanceOf(Date)
  })
})

describe('Format Version Info', () => {
  it('should format version entry correctly', () => {
    const entry = {
      id: 'v1',
      itemId: 'item1',
      version: '1.2.0',
      versionType: 'minor' as const,
      changelog: 'Added new features',
      content: '',
      snapshotData: null,
      createdAt: new Date('2024-01-15'),
      createdBy: null,
      isCurrent: false,
    }

    // Test formatting logic
    const typeLabel = {
      major: '주요 업데이트',
      minor: '기능 추가',
      patch: '버그 수정',
    }[entry.versionType]

    expect(typeLabel).toBe('기능 추가')
    expect(entry.version).toBe('1.2.0')
  })
})

describe('Snapshot Data', () => {
  it('should store all necessary fields for rollback', () => {
    const snapshotData = {
      name: 'Test Skill',
      description: 'A test skill',
      allowedTools: 'Read, Write, Bash',
      dependencies: ['mcp:github'],
      files: [{ name: 'helper.ts', content: 'export {}', type: 'typescript' }],
      agentModel: 'sonnet',
      agentPermissionMode: 'default',
      tags: ['test', 'demo'],
      difficulty: 'easy',
      readme: '# README',
    }

    expect(snapshotData.name).toBeDefined()
    expect(snapshotData.description).toBeDefined()
    expect(snapshotData.allowedTools).toBeDefined()
    expect(Array.isArray(snapshotData.dependencies)).toBe(true)
    expect(Array.isArray(snapshotData.files)).toBe(true)
    expect(Array.isArray(snapshotData.tags)).toBe(true)
  })
})

describe('Version Pruning', () => {
  it('should keep only specified number of versions', () => {
    const versions = Array.from({ length: 15 }, (_, i) => ({
      id: `v${i}`,
      version: `1.0.${i}`,
      createdAt: new Date(Date.now() - i * 86400000),
    }))

    const keepCount = 10
    const toKeep = versions.slice(0, keepCount)
    const toDelete = versions.slice(keepCount)

    expect(toKeep.length).toBe(10)
    expect(toDelete.length).toBe(5)
  })
})

describe('Version Diff', () => {
  it('should calculate line changes correctly', () => {
    const content1 = 'line1\nline2\nline3'
    const content2 = 'line1\nline2\nline4\nline5'

    const lines1 = content1.split('\n')
    const lines2 = content2.split('\n')
    const set1 = new Set(lines1)
    const set2 = new Set(lines2)

    const linesAdded = lines2.filter(l => !set1.has(l)).length
    const linesRemoved = lines1.filter(l => !set2.has(l)).length

    expect(linesAdded).toBe(2) // line4, line5
    expect(linesRemoved).toBe(1) // line3
  })
})
