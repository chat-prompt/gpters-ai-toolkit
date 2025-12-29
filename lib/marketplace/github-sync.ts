/**
 * GitHub Sync Service for Claude Code Marketplace
 * Syncs catalog items to GitHub repository as plugin files
 */

import { Octokit } from '@octokit/rest'
import type { CatalogItem } from '../core/types'
import type { SyncResult } from './types'
import { MARKETPLACE_CONFIG } from './types'
import { generateMarketplaceJson, generatePluginFiles } from './transform'

/**
 * Build full path, handling empty base path
 */
function buildFullPath(relativePath: string): string {
  const basePath = MARKETPLACE_CONFIG.repository.path
  if (!basePath) {
    return relativePath
  }
  return `${basePath}/${relativePath}`
}

// Initialize Octokit with GitHub token
function getOctokit(): Octokit {
  const token = process.env.GH_TOKEN
  if (!token) {
    throw new Error('GH_TOKEN environment variable is required')
  }
  return new Octokit({ auth: token })
}

/**
 * Get file content from GitHub
 */
async function getFileContent(
  octokit: Octokit,
  path: string
): Promise<{ content: string; sha: string } | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner: MARKETPLACE_CONFIG.repository.owner,
      repo: MARKETPLACE_CONFIG.repository.repo,
      path: buildFullPath(path),
      ref: MARKETPLACE_CONFIG.repository.branch,
    })

    if ('content' in data && 'sha' in data) {
      return {
        content: Buffer.from(data.content, 'base64').toString('utf-8'),
        sha: data.sha,
      }
    }
    return null
  } catch (error: unknown) {
    if (error instanceof Error && 'status' in error && (error as { status: number }).status === 404) {
      return null
    }
    throw error
  }
}

/**
 * Create or update a file in GitHub
 */
async function upsertFile(
  octokit: Octokit,
  path: string,
  content: string,
  message: string
): Promise<{ created: boolean; path: string }> {
  const fullPath = buildFullPath(path)
  const existing = await getFileContent(octokit, path)

  const encodedContent = Buffer.from(content).toString('base64')

  // Skip if content is identical
  if (existing && existing.content === content) {
    return { created: false, path: fullPath }
  }

  await octokit.repos.createOrUpdateFileContents({
    owner: MARKETPLACE_CONFIG.repository.owner,
    repo: MARKETPLACE_CONFIG.repository.repo,
    path: fullPath,
    message,
    content: encodedContent,
    sha: existing?.sha,
    branch: MARKETPLACE_CONFIG.repository.branch,
  })

  return { created: !existing, path: fullPath }
}

/**
 * Delete a file from GitHub
 */
async function deleteFile(
  octokit: Octokit,
  path: string,
  message: string
): Promise<boolean> {
  const fullPath = buildFullPath(path)
  const existing = await getFileContent(octokit, path)

  if (!existing) {
    return false
  }

  await octokit.repos.deleteFile({
    owner: MARKETPLACE_CONFIG.repository.owner,
    repo: MARKETPLACE_CONFIG.repository.repo,
    path: fullPath,
    message,
    sha: existing.sha,
    branch: MARKETPLACE_CONFIG.repository.branch,
  })

  return true
}

/**
 * Sync a single catalog item to GitHub
 */
export async function syncItemToGitHub(item: CatalogItem): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    filesCreated: [],
    filesUpdated: [],
    filesDeleted: [],
    errors: [],
    syncedAt: new Date(),
  }

  try {
    const octokit = getOctokit()

    // Don't sync guides (web-only) or disabled items
    if (item.type === 'guide' || !item.marketplaceEnabled) {
      result.success = true
      return result
    }

    // Generate plugin files
    const files = generatePluginFiles(item)

    // Upload each file
    for (const file of files) {
      try {
        const { created, path } = await upsertFile(
          octokit,
          file.path,
          file.content,
          `Sync ${item.id} to marketplace`
        )

        if (created) {
          result.filesCreated.push(path)
        } else {
          result.filesUpdated.push(path)
        }
      } catch (error) {
        result.errors.push(
          `Failed to sync ${file.path}: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    }

    result.success = result.errors.length === 0
  } catch (error) {
    result.errors.push(
      `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }

  return result
}

/**
 * Delete a plugin from GitHub marketplace
 */
export async function deleteItemFromGitHub(itemId: string): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    filesCreated: [],
    filesUpdated: [],
    filesDeleted: [],
    errors: [],
    syncedAt: new Date(),
  }

  try {
    const octokit = getOctokit()
    const basePath = `plugins/${itemId}`

    // List files in the plugin directory
    const filesToDelete = [
      `${basePath}/.claude-plugin/plugin.json`,
      `${basePath}/skills/${itemId}/SKILL.md`,
      `${basePath}/agents/${itemId}.md`,
      `${basePath}/commands/${itemId}.md`,
      `${basePath}/README.md`,
    ]

    for (const path of filesToDelete) {
      try {
        const deleted = await deleteFile(
          octokit,
          path,
          `Remove ${itemId} from marketplace`
        )
        if (deleted) {
          result.filesDeleted.push(path)
        }
      } catch {
        // Ignore delete errors for non-existent files
      }
    }

    result.success = true
  } catch (error) {
    result.errors.push(
      `Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }

  return result
}

/**
 * Sync all marketplace-enabled items to GitHub
 */
export async function syncAllToGitHub(items: CatalogItem[]): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    filesCreated: [],
    filesUpdated: [],
    filesDeleted: [],
    errors: [],
    syncedAt: new Date(),
  }

  try {
    const octokit = getOctokit()

    // Filter to marketplace-enabled, non-guide items
    const marketplaceItems = items.filter(
      (item) => item.type !== 'guide' && item.marketplaceEnabled
    )

    // Generate and upload marketplace.json
    const marketplaceJson = generateMarketplaceJson(items)
    const marketplaceJsonContent = JSON.stringify(marketplaceJson, null, 2)

    try {
      const { created, path } = await upsertFile(
        octokit,
        '.claude-plugin/marketplace.json',
        marketplaceJsonContent,
        'Update marketplace.json'
      )

      if (created) {
        result.filesCreated.push(path)
      } else {
        result.filesUpdated.push(path)
      }
    } catch (error) {
      result.errors.push(
        `Failed to update marketplace.json: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }

    // Sync each item
    for (const item of marketplaceItems) {
      const itemResult = await syncItemToGitHub(item)

      result.filesCreated.push(...itemResult.filesCreated)
      result.filesUpdated.push(...itemResult.filesUpdated)
      result.filesDeleted.push(...itemResult.filesDeleted)
      result.errors.push(...itemResult.errors)
    }

    result.success = result.errors.length === 0
  } catch (error) {
    result.errors.push(
      `Sync all failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }

  return result
}

/**
 * Update marketplace.json with current items
 */
export async function updateMarketplaceJson(items: CatalogItem[]): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    filesCreated: [],
    filesUpdated: [],
    filesDeleted: [],
    errors: [],
    syncedAt: new Date(),
  }

  try {
    const octokit = getOctokit()
    const marketplaceJson = generateMarketplaceJson(items)
    const content = JSON.stringify(marketplaceJson, null, 2)

    const { created, path } = await upsertFile(
      octokit,
      '.claude-plugin/marketplace.json',
      content,
      'Update marketplace.json'
    )

    if (created) {
      result.filesCreated.push(path)
    } else {
      result.filesUpdated.push(path)
    }

    result.success = true
  } catch (error) {
    result.errors.push(
      `Update marketplace.json failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }

  return result
}
