import { describe, it, expect } from 'vitest'
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
} from '@/lib/plugin/updates'
import type { CatalogItem } from '@/lib/types'

describe('Plugin Updates', () => {
  describe('parseSemver', () => {
    it('parses valid semver strings correctly', () => {
      expect(parseSemver('1.0.0')).toEqual({
        major: 1,
        minor: 0,
        patch: 0,
        valid: true,
      })

      expect(parseSemver('2.5.10')).toEqual({
        major: 2,
        minor: 5,
        patch: 10,
        valid: true,
      })
    })

    it('handles versions with v prefix', () => {
      expect(parseSemver('v1.2.3')).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        valid: true,
      })
    })

    it('handles partial versions', () => {
      expect(parseSemver('1.2')).toEqual({
        major: 1,
        minor: 2,
        patch: 0,
        valid: true,
      })

      expect(parseSemver('1')).toEqual({
        major: 1,
        minor: 0,
        patch: 0,
        valid: true,
      })
    })

    it('returns invalid for invalid version strings', () => {
      expect(parseSemver('')).toEqual({
        major: 0,
        minor: 0,
        patch: 0,
        valid: false,
      })

      expect(parseSemver('abc')).toEqual({
        major: 0,
        minor: 0,
        patch: 0,
        valid: false,
      })

      expect(parseSemver('not-a-version')).toEqual({
        major: 0,
        minor: 0,
        patch: 0,
        valid: false,
      })
    })

    it('returns invalid for null/undefined', () => {
      expect(parseSemver(null as unknown as string)).toEqual({
        major: 0,
        minor: 0,
        patch: 0,
        valid: false,
      })

      expect(parseSemver(undefined as unknown as string)).toEqual({
        major: 0,
        minor: 0,
        patch: 0,
        valid: false,
      })
    })
  })

  describe('compareVersions', () => {
    it('returns 0 for equal versions', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
      expect(compareVersions('2.5.10', '2.5.10')).toBe(0)
    })

    it('returns 1 when first version is greater (major)', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1)
      expect(compareVersions('10.0.0', '9.9.9')).toBe(1)
    })

    it('returns 1 when first version is greater (minor)', () => {
      expect(compareVersions('1.2.0', '1.1.0')).toBe(1)
      expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
    })

    it('returns 1 when first version is greater (patch)', () => {
      expect(compareVersions('1.0.2', '1.0.1')).toBe(1)
      expect(compareVersions('1.0.10', '1.0.9')).toBe(1)
    })

    it('returns -1 when first version is lesser', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
      expect(compareVersions('1.0.0', '1.1.0')).toBe(-1)
      expect(compareVersions('1.0.0', '1.0.1')).toBe(-1)
    })

    it('handles versions with v prefix', () => {
      expect(compareVersions('v1.2.3', '1.2.3')).toBe(0)
      expect(compareVersions('v2.0.0', 'v1.0.0')).toBe(1)
    })

    it('handles invalid versions', () => {
      expect(compareVersions('invalid', '1.0.0')).toBe(-1)
      expect(compareVersions('1.0.0', 'invalid')).toBe(1)
      expect(compareVersions('invalid', 'also-invalid')).toBe(0)
    })
  })

  describe('getUpdateType', () => {
    it('returns major for major version bumps', () => {
      expect(getUpdateType('1.0.0', '2.0.0')).toBe('major')
      expect(getUpdateType('1.5.3', '2.0.0')).toBe('major')
      expect(getUpdateType('1.0.0', '3.0.0')).toBe('major')
    })

    it('returns minor for minor version bumps', () => {
      expect(getUpdateType('1.0.0', '1.1.0')).toBe('minor')
      expect(getUpdateType('1.0.0', '1.5.0')).toBe('minor')
      expect(getUpdateType('2.3.5', '2.4.0')).toBe('minor')
    })

    it('returns patch for patch version bumps', () => {
      expect(getUpdateType('1.0.0', '1.0.1')).toBe('patch')
      expect(getUpdateType('1.0.0', '1.0.10')).toBe('patch')
      expect(getUpdateType('2.3.5', '2.3.6')).toBe('patch')
    })

    it('returns patch for same version (no update)', () => {
      expect(getUpdateType('1.0.0', '1.0.0')).toBe('patch')
    })
  })

  describe('hasUpdate', () => {
    it('returns true when latest version is greater', () => {
      expect(hasUpdate('1.0.0', '1.0.1')).toBe(true)
      expect(hasUpdate('1.0.0', '1.1.0')).toBe(true)
      expect(hasUpdate('1.0.0', '2.0.0')).toBe(true)
    })

    it('returns false when latest version is equal', () => {
      expect(hasUpdate('1.0.0', '1.0.0')).toBe(false)
    })

    it('returns false when latest version is lesser', () => {
      expect(hasUpdate('2.0.0', '1.0.0')).toBe(false)
    })
  })

  describe('checkForUpdates', () => {
    const mockCatalogItems: CatalogItem[] = [
      {
        id: 'plugin-a',
        type: 'skill',
        name: 'Plugin A',
        description: 'Test plugin A',
        author: 'test',
        tags: [],
        likes: 0,
        content: '',
        marketplaceVersion: '2.0.0',
        changelog: 'New major version',
        updatedAt: '2024-01-15T00:00:00Z',
      },
      {
        id: 'plugin-b',
        type: 'agent',
        name: 'Plugin B',
        description: 'Test plugin B',
        author: 'test',
        tags: [],
        likes: 0,
        content: '',
        marketplaceVersion: '1.1.0',
        changelog: 'Added new feature',
        updatedAt: '2024-01-10T00:00:00Z',
      },
      {
        id: 'plugin-c',
        type: 'command',
        name: 'Plugin C',
        description: 'Test plugin C',
        author: 'test',
        tags: [],
        likes: 0,
        content: '',
        marketplaceVersion: '1.0.1',
        changelog: 'Bug fix',
        updatedAt: '2024-01-05T00:00:00Z',
      },
      {
        id: 'plugin-d',
        type: 'skill',
        name: 'Plugin D',
        description: 'Test plugin D',
        author: 'test',
        tags: [],
        likes: 0,
        content: '',
        marketplaceVersion: '1.0.0',
      },
    ]

    it('returns no updates when all plugins are up to date', () => {
      const installed: InstalledPlugin[] = [
        { id: 'plugin-a', type: 'skill', installedVersion: '2.0.0' },
        { id: 'plugin-d', type: 'skill', installedVersion: '1.0.0' },
      ]

      const result = checkForUpdates(installed, mockCatalogItems)

      expect(result.hasUpdates).toBe(false)
      expect(result.updates).toHaveLength(0)
      expect(result.checkedAt).toBeDefined()
    })

    it('finds available updates correctly', () => {
      const installed: InstalledPlugin[] = [
        { id: 'plugin-a', type: 'skill', installedVersion: '1.0.0' },
        { id: 'plugin-b', type: 'agent', installedVersion: '1.0.0' },
        { id: 'plugin-c', type: 'command', installedVersion: '1.0.0' },
        { id: 'plugin-d', type: 'skill', installedVersion: '1.0.0' },
      ]

      const result = checkForUpdates(installed, mockCatalogItems)

      expect(result.hasUpdates).toBe(true)
      expect(result.updates).toHaveLength(3) // plugin-a, plugin-b, plugin-c

      // Should be sorted by update type priority: major > minor > patch
      expect(result.updates[0].updateType).toBe('major')
      expect(result.updates[0].id).toBe('plugin-a')

      expect(result.updates[1].updateType).toBe('minor')
      expect(result.updates[1].id).toBe('plugin-b')

      expect(result.updates[2].updateType).toBe('patch')
      expect(result.updates[2].id).toBe('plugin-c')
    })

    it('includes changelog in update info', () => {
      const installed: InstalledPlugin[] = [
        { id: 'plugin-a', type: 'skill', installedVersion: '1.0.0' },
      ]

      const result = checkForUpdates(installed, mockCatalogItems)

      expect(result.updates[0].changelog).toBe('New major version')
    })

    it('handles plugins not found in catalog', () => {
      const installed: InstalledPlugin[] = [
        { id: 'nonexistent-plugin', type: 'skill', installedVersion: '1.0.0' },
      ]

      const result = checkForUpdates(installed, mockCatalogItems)

      expect(result.hasUpdates).toBe(false)
      expect(result.updates).toHaveLength(0)
    })

    it('handles empty installed plugins list', () => {
      const result = checkForUpdates([], mockCatalogItems)

      expect(result.hasUpdates).toBe(false)
      expect(result.updates).toHaveLength(0)
    })

    it('handles empty catalog items list', () => {
      const installed: InstalledPlugin[] = [
        { id: 'plugin-a', type: 'skill', installedVersion: '1.0.0' },
      ]

      const result = checkForUpdates(installed, [])

      expect(result.hasUpdates).toBe(false)
      expect(result.updates).toHaveLength(0)
    })
  })

  describe('formatVersionDiff', () => {
    it('formats version diff with correct badge', () => {
      expect(formatVersionDiff('1.0.0', '2.0.0')).toBe('1.0.0 -> 2.0.0 [MAJOR]')
      expect(formatVersionDiff('1.0.0', '1.1.0')).toBe('1.0.0 -> 1.1.0 [MINOR]')
      expect(formatVersionDiff('1.0.0', '1.0.1')).toBe('1.0.0 -> 1.0.1 [PATCH]')
    })
  })

  describe('getUpdateTypeDescription', () => {
    it('returns correct descriptions for each type', () => {
      expect(getUpdateTypeDescription('major')).toContain('Breaking changes')
      expect(getUpdateTypeDescription('minor')).toContain('New features')
      expect(getUpdateTypeDescription('patch')).toContain('Bug fixes')
    })
  })

  describe('parseChangelog', () => {
    it('parses changelog with version headers', () => {
      const changelog = `
## 2.0.0 (2024-01-15)
- Breaking change: new API
- Removed deprecated feature

## 1.1.0
- Added new feature
- Improved performance

## 1.0.1
- Fixed bug
`

      const sections = parseChangelog(changelog)

      expect(sections).toHaveLength(3)
      expect(sections[0].version).toBe('2.0.0')
      expect(sections[0].date).toBe('2024-01-15')
      expect(sections[0].changes).toEqual([
        'Breaking change: new API',
        'Removed deprecated feature',
      ])

      expect(sections[1].version).toBe('1.1.0')
      expect(sections[1].changes).toEqual([
        'Added new feature',
        'Improved performance',
      ])
    })

    it('handles versions with v prefix', () => {
      const changelog = `
### v1.2.3
- Some change
`

      const sections = parseChangelog(changelog)

      expect(sections).toHaveLength(1)
      expect(sections[0].version).toBe('1.2.3')
    })

    it('returns empty array for empty changelog', () => {
      expect(parseChangelog('')).toEqual([])
      expect(parseChangelog(null as unknown as string)).toEqual([])
    })

    it('handles changelog without proper headers', () => {
      const changelog = `
Some random text
- A bullet point
More text
`

      const sections = parseChangelog(changelog)
      expect(sections).toHaveLength(0)
    })
  })

  describe('getChangesBetweenVersions', () => {
    const changelog = `
## 3.0.0
- Major change

## 2.0.0
- Another major change

## 1.1.0
- Minor change

## 1.0.1
- Patch fix

## 1.0.0
- Initial release
`

    it('returns changes between versions', () => {
      const changes = getChangesBetweenVersions(changelog, '1.0.0', '2.0.0')

      expect(changes).toHaveLength(3) // 2.0.0, 1.1.0, 1.0.1
      expect(changes.map(c => c.version)).toEqual(['2.0.0', '1.1.0', '1.0.1'])
    })

    it('returns empty for same version', () => {
      const changes = getChangesBetweenVersions(changelog, '1.0.0', '1.0.0')
      expect(changes).toHaveLength(0)
    })

    it('returns all changes up to latest', () => {
      const changes = getChangesBetweenVersions(changelog, '1.0.0', '3.0.0')
      expect(changes).toHaveLength(4) // 3.0.0, 2.0.0, 1.1.0, 1.0.1
    })
  })

  describe('isValidVersion', () => {
    it('returns true for valid versions', () => {
      expect(isValidVersion('1.0.0')).toBe(true)
      expect(isValidVersion('v1.2.3')).toBe(true)
      expect(isValidVersion('10.20.30')).toBe(true)
    })

    it('returns false for invalid versions', () => {
      expect(isValidVersion('')).toBe(false)
      expect(isValidVersion('abc')).toBe(false)
      expect(isValidVersion('not-a-version')).toBe(false)
    })
  })

  describe('normalizeVersion', () => {
    it('normalizes valid versions', () => {
      expect(normalizeVersion('1.0.0')).toBe('1.0.0')
      expect(normalizeVersion('v1.2.3')).toBe('1.2.3')
      expect(normalizeVersion('1.2')).toBe('1.2.0')
      expect(normalizeVersion('1')).toBe('1.0.0')
    })

    it('returns default for invalid versions', () => {
      expect(normalizeVersion('')).toBe('1.0.0')
      expect(normalizeVersion('invalid')).toBe('1.0.0')
    })
  })
})
