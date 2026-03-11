/**
 * Version sync and stale detection tests (DEV-3067)
 */

import { describe, it, expect } from 'vitest'

// Inline copies for unit testing (avoids DB/network deps)

function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number)
  const c = parse(current)
  const l = parse(latest)
  for (let i = 0; i < Math.max(c.length, l.length); i++) {
    const cv = c[i] || 0
    const lv = l[i] || 0
    if (lv > cv) return true
    if (lv < cv) return false
  }
  return false
}

function detectStaleLibraryVersions(
  content: string | null,
  versionMap: Map<string, string>
): string | undefined {
  if (!content) return undefined
  const stale: string[] = []
  const versionRefs = content.matchAll(/(\w[\w-]*)@(\d+)(?:\.\d+)?(?:\.\d+)?/g)
  for (const match of versionRefs) {
    const pkgName = match[1].toLowerCase()
    const refMajor = parseInt(match[2], 10)
    const latestVersion = versionMap.get(pkgName)
    if (!latestVersion) continue
    const latestMajor = parseInt(latestVersion.split('.')[0], 10)
    if (refMajor < latestMajor) {
      stale.push(`${match[0]} (최신: ${latestVersion})`)
    }
  }
  if (stale.length === 0) return undefined
  return `⚠️ 구버전 라이브러리 참조: ${stale.join(', ')}`
}

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
