/**
 * Skill Version Management Library
 *
 * Provides version tracking, history management, and rollback functionality
 * for catalog items (skills, agents, commands, guides).
 */

import { db } from '@/lib/db'
import { catalogItems, itemVersions, type ItemVersionRecord, type CatalogItemRecord } from '@/lib/db/schema'
import { eq, desc, and, sql } from 'drizzle-orm'
import {
  incrementVersion,
  analyzeChanges,
} from '@/lib/versioning/version'

// ============================================
// Types
// ============================================

export type VersionType = 'major' | 'minor' | 'patch'

export interface VersionInfo {
  version: string
  versionType: VersionType
  changelog: string | null
  createdAt: Date
  createdBy: string | null
}

export interface VersionHistoryEntry extends VersionInfo {
  id: string
  itemId: string
  content: string
  snapshotData: Record<string, unknown> | null
  isCurrent: boolean
}

export interface CreateVersionOptions {
  itemId: string
  version?: string // If not provided, auto-increment based on changes
  versionType?: VersionType // If not provided, auto-detect
  changelog?: string
  createdBy?: string
}

export interface RollbackOptions {
  itemId: string
  targetVersionId: string
  createdBy?: string
  createNewVersion?: boolean // If true, creates a new version instead of reverting
}

export interface RollbackResult {
  success: boolean
  message: string
  newVersion?: string
  restoredData?: Partial<CatalogItemRecord>
}

export interface VersionComparisonResult {
  hasChanges: boolean
  changeType: VersionType | 'none'
  summary: string
  suggestedVersion: string
}

// ============================================
// Version History Functions
// ============================================

/**
 * Get version history for a catalog item
 */
export async function getVersionHistory(
  itemId: string,
  limit = 20
): Promise<VersionHistoryEntry[]> {
  const item = await db
    .select({ version: catalogItems.version })
    .from(catalogItems)
    .where(eq(catalogItems.id, itemId))
    .limit(1)

  const currentVersion = item[0]?.version || '1.0.0'

  const versions = await db
    .select()
    .from(itemVersions)
    .where(eq(itemVersions.itemId, itemId))
    .orderBy(desc(itemVersions.createdAt))
    .limit(limit)

  return versions.map((v) => ({
    id: v.id,
    itemId: v.itemId,
    version: v.version,
    versionType: v.versionType,
    changelog: v.changelog,
    content: v.content,
    snapshotData: v.snapshotData as Record<string, unknown> | null,
    createdAt: v.createdAt || new Date(),
    createdBy: v.createdBy,
    isCurrent: v.version === currentVersion,
  }))
}

/**
 * Get a specific version by ID
 */
export async function getVersion(versionId: string): Promise<VersionHistoryEntry | null> {
  const versions = await db
    .select()
    .from(itemVersions)
    .where(eq(itemVersions.id, versionId))
    .limit(1)

  if (versions.length === 0) return null

  const v = versions[0]
  const item = await db
    .select({ version: catalogItems.version })
    .from(catalogItems)
    .where(eq(catalogItems.id, v.itemId))
    .limit(1)

  const currentVersion = item[0]?.version || '1.0.0'

  return {
    id: v.id,
    itemId: v.itemId,
    version: v.version,
    versionType: v.versionType,
    changelog: v.changelog,
    content: v.content,
    snapshotData: v.snapshotData as Record<string, unknown> | null,
    createdAt: v.createdAt || new Date(),
    createdBy: v.createdBy,
    isCurrent: v.version === currentVersion,
  }
}

/**
 * Get the latest version entry for an item
 */
export async function getLatestVersion(itemId: string): Promise<VersionHistoryEntry | null> {
  const versions = await db
    .select()
    .from(itemVersions)
    .where(eq(itemVersions.itemId, itemId))
    .orderBy(desc(itemVersions.createdAt))
    .limit(1)

  if (versions.length === 0) return null

  const v = versions[0]
  return {
    id: v.id,
    itemId: v.itemId,
    version: v.version,
    versionType: v.versionType,
    changelog: v.changelog,
    content: v.content,
    snapshotData: v.snapshotData as Record<string, unknown> | null,
    createdAt: v.createdAt || new Date(),
    createdBy: v.createdBy,
    isCurrent: true,
  }
}

// ============================================
// Version Creation Functions
// ============================================

/**
 * Create a snapshot of the current item state as a new version
 */
export async function createVersionSnapshot(
  item: CatalogItemRecord,
  options: Omit<CreateVersionOptions, 'itemId'>
): Promise<ItemVersionRecord> {
  const { version, versionType, changelog, createdBy } = options

  // Determine version and type
  let newVersion = version || item.version || '1.0.0'
  const newVersionType = versionType || 'patch'

  // If no explicit version, auto-increment
  if (!version && item.version) {
    newVersion = incrementVersion(item.version, newVersionType)
  }

  // Create snapshot data (convert null to undefined for schema compatibility)
  const snapshotData = {
    name: item.name,
    description: item.description,
    allowedTools: item.allowedTools ?? undefined,
    dependencies: item.dependencies ?? undefined,
    files: item.files ?? undefined,
    agentModel: item.agentModel ?? undefined,
    agentPermissionMode: item.agentPermissionMode ?? undefined,
    agentSkills: item.agentSkills ?? undefined,
    commandArgumentHint: item.commandArgumentHint ?? undefined,
    commandDisableModelInvocation: item.commandDisableModelInvocation ?? undefined,
    hookEvent: item.hookEvent ?? undefined,
    hookMatcher: item.hookMatcher ?? undefined,
    hookCommand: item.hookCommand ?? undefined,
    hookTimeout: item.hookTimeout ?? undefined,
    hookBlocking: item.hookBlocking ?? undefined,
    tags: item.tags ?? undefined,
    difficulty: item.difficulty ?? undefined,
    estimatedTime: item.estimatedTime ?? undefined,
    readme: item.readme ?? undefined,
  }

  const [newVersionRecord] = await db
    .insert(itemVersions)
    .values({
      itemId: item.id,
      version: newVersion,
      versionType: newVersionType,
      content: item.content,
      changelog: changelog || null,
      createdBy: createdBy || null,
      snapshotData,
    })
    .returning()

  return newVersionRecord
}

/**
 * Compare current item with previous version and suggest version bump
 */
export async function compareWithPreviousVersion(
  item: CatalogItemRecord
): Promise<VersionComparisonResult> {
  const latestVersion = await getLatestVersion(item.id)

  if (!latestVersion) {
    return {
      hasChanges: true,
      changeType: 'major',
      summary: 'Initial version',
      suggestedVersion: '1.0.0',
    }
  }

  // Compare content
  const analysis = analyzeChanges(latestVersion.content, item.content)

  if (!analysis.hasChanges) {
    return {
      hasChanges: false,
      changeType: 'none',
      summary: 'No changes detected',
      suggestedVersion: latestVersion.version,
    }
  }

  // Determine version type
  let changeType: VersionType = 'patch'
  if (analysis.breaking) {
    changeType = 'major'
  } else if (analysis.newFeatures) {
    changeType = 'minor'
  }

  const suggestedVersion = incrementVersion(latestVersion.version, changeType)

  return {
    hasChanges: true,
    changeType,
    summary: analysis.summary,
    suggestedVersion,
  }
}

/**
 * Create a new version when item is updated
 */
export async function createVersionOnUpdate(
  item: CatalogItemRecord,
  previousContent: string,
  options: { changelog?: string; createdBy?: string } = {}
): Promise<ItemVersionRecord | null> {
  // Analyze changes
  const analysis = analyzeChanges(previousContent, item.content)

  if (!analysis.hasChanges) {
    return null // No significant changes, skip version creation
  }

  // Determine version type
  let versionType: VersionType = 'patch'
  if (analysis.breaking) {
    versionType = 'major'
  } else if (analysis.newFeatures) {
    versionType = 'minor'
  }

  // Calculate new version
  const currentVersion = item.version || '1.0.0'
  const newVersion = incrementVersion(currentVersion, versionType)

  // Create version snapshot
  return createVersionSnapshot(item, {
    version: newVersion,
    versionType,
    changelog: options.changelog || analysis.summary,
    createdBy: options.createdBy,
  })
}

// ============================================
// Rollback Functions
// ============================================

/**
 * Rollback an item to a previous version
 */
export async function rollbackToVersion(
  options: RollbackOptions
): Promise<RollbackResult> {
  const { itemId, targetVersionId, createdBy, createNewVersion = true } = options

  // Get target version
  const targetVersion = await getVersion(targetVersionId)
  if (!targetVersion) {
    return {
      success: false,
      message: 'Target version not found',
    }
  }

  // Verify item exists
  const [currentItem] = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.id, itemId))
    .limit(1)

  if (!currentItem) {
    return {
      success: false,
      message: 'Item not found',
    }
  }

  // Prepare restored data
  const snapshotData = targetVersion.snapshotData || {}
  const restoredData: Partial<CatalogItemRecord> = {
    content: targetVersion.content,
    name: snapshotData.name as string || currentItem.name,
    description: snapshotData.description as string || currentItem.description,
    allowedTools: snapshotData.allowedTools as string || currentItem.allowedTools,
    dependencies: snapshotData.dependencies as string[] || currentItem.dependencies,
    files: snapshotData.files as CatalogItemRecord['files'] || currentItem.files,
    readme: snapshotData.readme as string || currentItem.readme,
  }

  // If creating new version, snapshot current state first
  if (createNewVersion) {
    await createVersionSnapshot(currentItem, {
      version: currentItem.version || '1.0.0',
      versionType: 'patch',
      changelog: `Snapshot before rollback to v${targetVersion.version}`,
      createdBy,
    })
  }

  // Calculate new version (increment patch from target)
  const newVersion = incrementVersion(targetVersion.version, 'patch')

  // Update the item
  await db
    .update(catalogItems)
    .set({
      ...restoredData,
      version: newVersion,
      changelog: `Rolled back to v${targetVersion.version}`,
      updatedAt: new Date(),
    })
    .where(eq(catalogItems.id, itemId))

  // Create version record for the rollback
  await createVersionSnapshot(
    { ...currentItem, ...restoredData, version: newVersion } as CatalogItemRecord,
    {
      version: newVersion,
      versionType: 'patch',
      changelog: `Rolled back from v${currentItem.version} to v${targetVersion.version}`,
      createdBy,
    }
  )

  return {
    success: true,
    message: `Successfully rolled back to v${targetVersion.version}`,
    newVersion,
    restoredData,
  }
}

/**
 * Preview what would change if rolling back to a version
 */
export async function previewRollback(
  itemId: string,
  targetVersionId: string
): Promise<{
  currentVersion: string
  targetVersion: string
  changes: {
    field: string
    current: unknown
    restored: unknown
  }[]
}> {
  const [currentItem] = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.id, itemId))
    .limit(1)

  const targetVersion = await getVersion(targetVersionId)

  if (!currentItem || !targetVersion) {
    throw new Error('Item or target version not found')
  }

  const snapshotData = targetVersion.snapshotData || {}
  const changes: { field: string; current: unknown; restored: unknown }[] = []

  // Compare content
  if (currentItem.content !== targetVersion.content) {
    changes.push({
      field: 'content',
      current: `${currentItem.content.substring(0, 100)}...`,
      restored: `${targetVersion.content.substring(0, 100)}...`,
    })
  }

  // Compare other fields
  const fieldsToCompare = ['name', 'description', 'allowedTools', 'readme'] as const
  for (const field of fieldsToCompare) {
    const currentValue = currentItem[field]
    const restoredValue = snapshotData[field]
    if (restoredValue !== undefined && currentValue !== restoredValue) {
      changes.push({
        field,
        current: currentValue,
        restored: restoredValue,
      })
    }
  }

  return {
    currentVersion: currentItem.version || '1.0.0',
    targetVersion: targetVersion.version,
    changes,
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get version count for an item
 */
export async function getVersionCount(itemId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(itemVersions)
    .where(eq(itemVersions.itemId, itemId))

  return Number(result[0]?.count || 0)
}

/**
 * Delete old versions keeping only the latest N versions
 */
export async function pruneVersionHistory(
  itemId: string,
  keepCount = 10
): Promise<number> {
  // Get versions to keep
  const versionsToKeep = await db
    .select({ id: itemVersions.id })
    .from(itemVersions)
    .where(eq(itemVersions.itemId, itemId))
    .orderBy(desc(itemVersions.createdAt))
    .limit(keepCount)

  const keepIds = versionsToKeep.map((v) => v.id)

  if (keepIds.length === 0) return 0

  // Delete older versions
  const deleted = await db
    .delete(itemVersions)
    .where(
      and(
        eq(itemVersions.itemId, itemId),
        sql`${itemVersions.id} NOT IN (${sql.join(keepIds.map(id => sql`${id}`), sql`, `)})`
      )
    )
    .returning()

  return deleted.length
}

/**
 * Check if a version exists
 */
export async function versionExists(
  itemId: string,
  version: string
): Promise<boolean> {
  const result = await db
    .select({ id: itemVersions.id })
    .from(itemVersions)
    .where(
      and(
        eq(itemVersions.itemId, itemId),
        eq(itemVersions.version, version)
      )
    )
    .limit(1)

  return result.length > 0
}

/**
 * Format version info for display
 */
export function formatVersionInfo(entry: VersionHistoryEntry): string {
  const date = entry.createdAt.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const typeLabel = {
    major: '주요 업데이트',
    minor: '기능 추가',
    patch: '버그 수정',
  }[entry.versionType]

  return `v${entry.version} - ${typeLabel} (${date})`
}

/**
 * Get version diff summary between two versions
 */
export async function getVersionDiff(
  versionId1: string,
  versionId2: string
): Promise<{
  from: VersionHistoryEntry
  to: VersionHistoryEntry
  contentDiff: {
    linesAdded: number
    linesRemoved: number
    hasBreakingChanges: boolean
  }
}> {
  const [v1, v2] = await Promise.all([
    getVersion(versionId1),
    getVersion(versionId2),
  ])

  if (!v1 || !v2) {
    throw new Error('One or both versions not found')
  }

  // Simple line-based diff
  const lines1 = v1.content.split('\n')
  const lines2 = v2.content.split('\n')
  const set1 = new Set(lines1)
  const set2 = new Set(lines2)

  const linesAdded = lines2.filter((l) => !set1.has(l)).length
  const linesRemoved = lines1.filter((l) => !set2.has(l)).length

  // Check for breaking changes (removed important sections)
  const analysis = analyzeChanges(v1.content, v2.content)

  return {
    from: v1,
    to: v2,
    contentDiff: {
      linesAdded,
      linesRemoved,
      hasBreakingChanges: analysis.breaking,
    },
  }
}
