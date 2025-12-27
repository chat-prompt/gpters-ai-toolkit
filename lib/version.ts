/**
 * Version Management Service
 *
 * Handles semantic versioning for skills/plugins.
 * Auto-determines version bumps based on content changes.
 */

export interface VersionBump {
  version: string
  type: 'major' | 'minor' | 'patch' | 'none'
  changelog: string
}

/**
 * Parse a semver string into components
 */
function parseSemver(version: string): { major: number; minor: number; patch: number } {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) {
    return { major: 1, minor: 0, patch: 0 }
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  }
}

/**
 * Increment version based on bump type
 */
function incrementVersion(version: string, type: 'major' | 'minor' | 'patch'): string {
  const { major, minor, patch } = parseSemver(version)

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
  }
}

/**
 * Simple diff to detect changes between old and new content
 */
function analyzeChanges(oldContent: string, newContent: string): {
  breaking: boolean
  newFeatures: boolean
  hasChanges: boolean
  summary: string
} {
  if (oldContent === newContent) {
    return { breaking: false, newFeatures: false, hasChanges: false, summary: 'No changes' }
  }

  const oldLines = new Set(oldContent.split('\n').map((l) => l.trim()).filter(Boolean))
  const newLines = new Set(newContent.split('\n').map((l) => l.trim()).filter(Boolean))

  // Find added and removed lines
  const added: string[] = []
  const removed: string[] = []

  for (const line of newLines) {
    if (!oldLines.has(line)) {
      added.push(line)
    }
  }

  for (const line of oldLines) {
    if (!newLines.has(line)) {
      removed.push(line)
    }
  }

  // Breaking change patterns (removals)
  const breakingPatterns = [
    /^allowed-tools:/i,
    /^##\s+/,  // Section headers
    /^name:/i,
  ]

  const breaking = removed.some((line) =>
    breakingPatterns.some((pattern) => pattern.test(line))
  )

  // New feature patterns (additions)
  const featurePatterns = [
    /^##\s+/,      // New section
    /^###\s+/,     // New subsection
  ]

  const newFeatures = added.some((line) =>
    featurePatterns.some((pattern) => pattern.test(line))
  )

  // Generate summary
  let summary: string
  if (added.length > removed.length * 2) {
    summary = 'Content expanded'
  } else if (removed.length > added.length * 2) {
    summary = 'Content simplified'
  } else if (added.length > 0 && removed.length > 0) {
    summary = 'Content updated'
  } else if (added.length > 0) {
    summary = 'Content added'
  } else if (removed.length > 0) {
    summary = 'Content removed'
  } else {
    summary = 'Minor updates'
  }

  return { breaking, newFeatures, hasChanges: true, summary }
}

/**
 * Determine the new version based on content changes
 */
export function determineVersion(
  existing: { content: string; version: string } | null,
  newContent: string,
  explicitChangelog?: string
): VersionBump {
  // New skill
  if (!existing) {
    return {
      version: '1.0.0',
      type: 'none',
      changelog: explicitChangelog || 'Initial release',
    }
  }

  const changes = analyzeChanges(existing.content, newContent)

  // No changes
  if (!changes.hasChanges) {
    return {
      version: existing.version,
      type: 'none',
      changelog: 'No changes',
    }
  }

  // Major: Breaking changes
  if (changes.breaking) {
    return {
      version: incrementVersion(existing.version, 'major'),
      type: 'major',
      changelog: explicitChangelog || changes.summary,
    }
  }

  // Minor: New features
  if (changes.newFeatures) {
    return {
      version: incrementVersion(existing.version, 'minor'),
      type: 'minor',
      changelog: explicitChangelog || changes.summary,
    }
  }

  // Patch: Bug fixes, minor improvements
  return {
    version: incrementVersion(existing.version, 'patch'),
    type: 'patch',
    changelog: explicitChangelog || changes.summary,
  }
}

/**
 * Compare two versions
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  const vA = parseSemver(a)
  const vB = parseSemver(b)

  if (vA.major !== vB.major) return vA.major > vB.major ? 1 : -1
  if (vA.minor !== vB.minor) return vA.minor > vB.minor ? 1 : -1
  if (vA.patch !== vB.patch) return vA.patch > vB.patch ? 1 : -1
  return 0
}

/**
 * Check if an update is available
 */
export function hasUpdate(installedVersion: string, latestVersion: string): boolean {
  return compareVersions(latestVersion, installedVersion) > 0
}

/**
 * Generate a slug ID from a name
 */
export function generateIdFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)
}
