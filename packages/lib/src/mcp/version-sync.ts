/**
 * CLI tool version sync via Context7 API (DEV-3067)
 *
 * Checks latest versions of CLI tools that have a context7_library_id
 * and updates cli_tools.latest_version when a newer version is found.
 */

import { db, cliTools } from '@gpters/db'
import { eq, isNotNull } from 'drizzle-orm'
import { createLogger } from '../core/logger'

const log = createLogger('version-sync')

/** Context7 search API response */
interface Context7SearchResult {
  results: Array<{
    id: string
    title: string
    versions: string[]
    stars: number
    trustScore: number
  }>
}

/** Result of a single tool version check */
export interface VersionCheckResult {
  toolId: string
  toolName: string
  currentVersion: string | null
  latestVersion: string | null
  isStale: boolean
  source: string
}

/** Summary of a full sync run */
export interface VersionSyncSummary {
  checked: number
  updated: number
  stale: number
  errors: number
  results: VersionCheckResult[]
  durationMs: number
}

/**
 * Query Context7 API for latest version of a library
 *
 * @param libraryId - Context7 library ID (e.g., "/vitejs/vite")
 * @returns Latest version string or null
 */
export async function fetchLatestVersion(libraryId: string): Promise<string | null> {
  try {
    const url = `https://context7.com/api/v2/libs/search?libraryName=${encodeURIComponent(libraryId)}`
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      log.warn('Context7 API error', { libraryId, status: res.status })
      return null
    }

    const data = await res.json() as Context7SearchResult
    const match = data.results.find(r => r.id === libraryId)
    if (!match || match.versions.length === 0) return null

    // Filter to valid semver-like versions (skip branches like "__branch__main")
    const validVersion = match.versions.find(v => /^v?\d+\.\d+/.test(v))
    if (!validVersion) return null
    return validVersion.replace(/^v/, '')
  } catch (err) {
    log.warn('Context7 fetch failed', { libraryId, error: (err as Error).message })
    return null
  }
}

/**
 * Compare two semver-like version strings
 *
 * @returns true if `latest` is newer than `current`
 */
export function isNewerVersion(current: string, latest: string): boolean {
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

/**
 * Detect stale library version references in skill content
 *
 * Looks for patterns like "stripe@14", "vite@5", "next@14" and compares
 * against cli_tools.latest_version.
 *
 * @param content - Skill content to check
 * @param versionMap - Map of tool name → latest version
 * @returns Warning message if stale versions found, undefined otherwise
 */
export function detectStaleLibraryVersions(
  content: string | null,
  versionMap: Map<string, string>
): string | undefined {
  if (!content) return undefined

  const stale: string[] = []
  // Match patterns: packageName@majorVersion (e.g., stripe@14, next@13)
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

/**
 * Sync all CLI tools with Context7 library IDs
 *
 * @returns Summary of sync results
 */
export async function syncCliToolVersions(): Promise<VersionSyncSummary> {
  const startTime = Date.now()

  // Fetch tools with context7_library_id
  const tools = await db
    .select({
      id: cliTools.id,
      name: cliTools.name,
      latestVersion: cliTools.latestVersion,
      context7LibraryId: cliTools.context7LibraryId,
    })
    .from(cliTools)
    .where(isNotNull(cliTools.context7LibraryId))

  log.info('Starting version sync', { toolCount: tools.length })

  const results: VersionCheckResult[] = []
  let updated = 0
  let staleCount = 0
  let errors = 0

  for (const tool of tools) {
    try {
      const latestVersion = await fetchLatestVersion(tool.context7LibraryId!)

      const isStale = latestVersion && tool.latestVersion
        ? isNewerVersion(tool.latestVersion, latestVersion)
        : false

      results.push({
        toolId: tool.id,
        toolName: tool.name,
        currentVersion: tool.latestVersion,
        latestVersion,
        isStale,
        source: 'context7',
      })

      if (isStale && latestVersion) {
        staleCount++
        log.info('Stale version detected', {
          tool: tool.id,
          current: tool.latestVersion,
          latest: latestVersion,
        })

        // Update to latest version
        await db
          .update(cliTools)
          .set({ latestVersion, updatedAt: new Date() })
          .where(eq(cliTools.id, tool.id))
        updated++
      }

      // Rate limit: 500ms between Context7 API calls
      await new Promise(r => setTimeout(r, 500))
    } catch (err) {
      errors++
      log.error('Version check failed', { tool: tool.id, error: (err as Error).message })
      results.push({
        toolId: tool.id,
        toolName: tool.name,
        currentVersion: tool.latestVersion,
        latestVersion: null,
        isStale: false,
        source: 'context7',
      })
    }
  }

  const durationMs = Date.now() - startTime

  log.info('Version sync completed', {
    checked: tools.length,
    updated,
    stale: staleCount,
    errors,
    durationMs,
  })

  return {
    checked: tools.length,
    updated,
    stale: staleCount,
    errors,
    results,
    durationMs,
  }
}
