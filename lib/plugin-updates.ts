/**
 * Plugin Update System
 *
 * Handles checking for plugin updates by comparing installed versions
 * with latest available versions from the catalog.
 */

import { CatalogItem, ItemType } from './types'

/**
 * Represents an installed plugin with version information
 */
export interface InstalledPlugin {
  id: string
  type: ItemType
  installedVersion: string
  installedAt?: string
}

/**
 * Represents an available update for a plugin
 */
export interface PluginUpdate {
  id: string
  name: string
  type: ItemType
  currentVersion: string
  latestVersion: string
  changelog?: string
  updatedAt?: string
  updateType: 'major' | 'minor' | 'patch'
}

/**
 * Result of checking for updates
 */
export interface UpdateCheckResult {
  hasUpdates: boolean
  updates: PluginUpdate[]
  checkedAt: string
}

/**
 * Parse a semver string into numeric components
 * Handles versions like "1.0.0", "1.2.3", or partial versions like "1.0"
 */
export function parseSemver(version: string): {
  major: number
  minor: number
  patch: number
  valid: boolean
} {
  if (!version || typeof version !== 'string') {
    return { major: 0, minor: 0, patch: 0, valid: false }
  }

  const match = version.match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
  if (!match) {
    return { major: 0, minor: 0, patch: 0, valid: false }
  }

  return {
    major: parseInt(match[1], 10) || 0,
    minor: parseInt(match[2], 10) || 0,
    patch: parseInt(match[3], 10) || 0,
    valid: true,
  }
}

/**
 * Compare two semantic versions
 * Returns:
 *   1 if a > b
 *   0 if a == b
 *  -1 if a < b
 */
export function compareVersions(a: string, b: string): number {
  const vA = parseSemver(a)
  const vB = parseSemver(b)

  // Invalid versions are considered less than valid versions
  if (!vA.valid && !vB.valid) return 0
  if (!vA.valid) return -1
  if (!vB.valid) return 1

  if (vA.major !== vB.major) return vA.major > vB.major ? 1 : -1
  if (vA.minor !== vB.minor) return vA.minor > vB.minor ? 1 : -1
  if (vA.patch !== vB.patch) return vA.patch > vB.patch ? 1 : -1

  return 0
}

/**
 * Determine the type of version update (major, minor, patch)
 */
export function getUpdateType(
  currentVersion: string,
  newVersion: string
): 'major' | 'minor' | 'patch' {
  const current = parseSemver(currentVersion)
  const latest = parseSemver(newVersion)

  if (latest.major > current.major) {
    return 'major'
  }
  if (latest.minor > current.minor) {
    return 'minor'
  }
  return 'patch'
}

/**
 * Check if an update is available for a plugin
 */
export function hasUpdate(
  installedVersion: string,
  latestVersion: string
): boolean {
  return compareVersions(latestVersion, installedVersion) > 0
}

/**
 * Check for updates for a list of installed plugins
 */
export function checkForUpdates(
  installedPlugins: InstalledPlugin[],
  catalogItems: CatalogItem[]
): UpdateCheckResult {
  const updates: PluginUpdate[] = []

  // Create a lookup map for catalog items
  const catalogMap = new Map<string, CatalogItem>()
  for (const item of catalogItems) {
    catalogMap.set(item.id, item)
  }

  for (const installed of installedPlugins) {
    const catalogItem = catalogMap.get(installed.id)

    if (!catalogItem) {
      // Plugin not found in catalog (might have been removed)
      continue
    }

    const latestVersion = catalogItem.marketplaceVersion || '1.0.0'
    const installedVersion = installed.installedVersion || '1.0.0'

    if (hasUpdate(installedVersion, latestVersion)) {
      updates.push({
        id: catalogItem.id,
        name: catalogItem.name,
        type: catalogItem.type,
        currentVersion: installedVersion,
        latestVersion,
        changelog: catalogItem.changelog,
        updatedAt: catalogItem.updatedAt,
        updateType: getUpdateType(installedVersion, latestVersion),
      })
    }
  }

  // Sort by update type priority: major > minor > patch
  const typePriority = { major: 0, minor: 1, patch: 2 }
  updates.sort((a, b) => typePriority[a.updateType] - typePriority[b.updateType])

  return {
    hasUpdates: updates.length > 0,
    updates,
    checkedAt: new Date().toISOString(),
  }
}

/**
 * Get a formatted version string with update type badge
 */
export function formatVersionDiff(
  currentVersion: string,
  latestVersion: string
): string {
  const updateType = getUpdateType(currentVersion, latestVersion)
  const badges = {
    major: 'MAJOR',
    minor: 'MINOR',
    patch: 'PATCH',
  }
  return `${currentVersion} -> ${latestVersion} [${badges[updateType]}]`
}

/**
 * Get a human-readable description of the update type
 */
export function getUpdateTypeDescription(updateType: 'major' | 'minor' | 'patch'): string {
  const descriptions = {
    major: 'Breaking changes - review carefully before updating',
    minor: 'New features added - backwards compatible',
    patch: 'Bug fixes and minor improvements',
  }
  return descriptions[updateType]
}

/**
 * Parse changelog into structured sections
 */
export interface ChangelogSection {
  version: string
  date?: string
  changes: string[]
}

export function parseChangelog(changelog: string): ChangelogSection[] {
  if (!changelog) return []

  const sections: ChangelogSection[] = []
  const lines = changelog.split('\n')
  let currentSection: ChangelogSection | null = null

  for (const line of lines) {
    // Check for version header (e.g., "## 1.2.0", "### v1.2.0 (2024-01-01)")
    const versionMatch = line.match(/^#{1,3}\s+v?(\d+\.\d+\.\d+)(?:\s*[\[(]?([^)\]]+)[\])]?)?/)

    if (versionMatch) {
      if (currentSection) {
        sections.push(currentSection)
      }
      currentSection = {
        version: versionMatch[1],
        date: versionMatch[2]?.trim(),
        changes: [],
      }
      continue
    }

    // Check for change items (bullet points)
    if (currentSection) {
      const changeMatch = line.match(/^\s*[-*]\s+(.+)/)
      if (changeMatch) {
        currentSection.changes.push(changeMatch[1].trim())
      }
    }
  }

  if (currentSection) {
    sections.push(currentSection)
  }

  return sections
}

/**
 * Get changes between two versions from a changelog
 */
export function getChangesBetweenVersions(
  changelog: string,
  fromVersion: string,
  toVersion: string
): ChangelogSection[] {
  const sections = parseChangelog(changelog)

  return sections.filter((section) => {
    // Include versions greater than fromVersion and up to toVersion
    return (
      compareVersions(section.version, fromVersion) > 0 &&
      compareVersions(section.version, toVersion) <= 0
    )
  })
}

/**
 * Validate version string format
 */
export function isValidVersion(version: string): boolean {
  return parseSemver(version).valid
}

/**
 * Normalize version string (strip 'v' prefix, ensure three parts)
 */
export function normalizeVersion(version: string): string {
  const parsed = parseSemver(version)
  if (!parsed.valid) return '1.0.0'
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`
}
