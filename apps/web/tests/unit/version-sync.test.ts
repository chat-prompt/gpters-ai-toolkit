/**
 * 구버전 라이브러리 참조 탐지 테스트 (DEV-3067의 잔여)
 *
 * Tests pure functions from version-sync module directly.
 */

import { describe, it, expect } from 'vitest'
import { detectStaleLibraryVersions } from '@gpters/lib/mcp'

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
