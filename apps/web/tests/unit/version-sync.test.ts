/**
 * Version sync and stale detection tests (DEV-3067)
 *
 * Tests pure functions from version-sync module directly.
 */

import { describe, it, expect } from 'vitest'
import { isNewerVersion, detectStaleLibraryVersions } from '@gpters/lib/mcp'

describe('isNewerVersion', () => {
  it('should detect newer major version', () => {
    expect(isNewerVersion('6.1.0', '7.0.0')).toBe(true)
  })

  it('should detect newer minor version', () => {
    expect(isNewerVersion('6.1.0', '6.2.0')).toBe(true)
  })

  it('should detect newer patch version', () => {
    expect(isNewerVersion('6.1.0', '6.1.1')).toBe(true)
  })

  it('should return false for same version', () => {
    expect(isNewerVersion('6.1.0', '6.1.0')).toBe(false)
  })

  it('should return false for older version', () => {
    expect(isNewerVersion('7.0.0', '6.1.0')).toBe(false)
  })

  it('should handle v-prefixed versions', () => {
    expect(isNewerVersion('v6.1.0', 'v7.0.0')).toBe(true)
  })

  it('should handle different length versions', () => {
    expect(isNewerVersion('6.1', '6.1.1')).toBe(true)
    expect(isNewerVersion('6.1.1', '6.2')).toBe(true)
  })

  it('should handle two-segment versions', () => {
    expect(isNewerVersion('22.14', '23.0')).toBe(true)
    expect(isNewerVersion('23.0', '22.14')).toBe(false)
  })
})

describe('detectStaleLibraryVersions', () => {
  const versionMap = new Map([
    ['next', '15.2.0'],
    ['react', '19.2.3'],
    ['stripe', '17.5.0'],
    ['vite', '7.0.0'],
  ])

  it('should detect stale package reference', () => {
    const content = 'Install next@13 and run the dev server'
    const warning = detectStaleLibraryVersions(content, versionMap)

    expect(warning).toBeDefined()
    expect(warning).toContain('next@13')
    expect(warning).toContain('최신: 15.2.0')
  })

  it('should detect multiple stale references', () => {
    const content = 'Use stripe@14 with next@13 for payments'
    const warning = detectStaleLibraryVersions(content, versionMap)

    expect(warning).toContain('stripe@14')
    expect(warning).toContain('next@13')
  })

  it('should not flag current version references', () => {
    const content = 'Use next@15 for the latest features'
    const warning = detectStaleLibraryVersions(content, versionMap)

    expect(warning).toBeUndefined()
  })

  it('should not flag unknown packages', () => {
    const content = 'Use somepackage@1 for testing'
    const warning = detectStaleLibraryVersions(content, versionMap)

    expect(warning).toBeUndefined()
  })

  it('should return undefined for null content', () => {
    expect(detectStaleLibraryVersions(null, versionMap)).toBeUndefined()
  })

  it('should handle version with minor and patch', () => {
    const content = 'Install stripe@14.5.2 for webhooks'
    const warning = detectStaleLibraryVersions(content, versionMap)

    expect(warning).toContain('stripe@14.5.2')
  })

  it('should not flag future/equal major versions', () => {
    const content = 'Use vite@7 and react@19'
    const warning = detectStaleLibraryVersions(content, versionMap)

    expect(warning).toBeUndefined()
  })
})
