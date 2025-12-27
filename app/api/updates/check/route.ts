import { NextRequest } from 'next/server'
import { inArray } from 'drizzle-orm'
import { db, catalogItems } from '@/lib/db'
import {
  checkForUpdates,
  InstalledPlugin,
  UpdateCheckResult,
} from '@/lib/plugin-updates'
import { ApiErrors, apiSuccess, validateRequired } from '@/lib/api-utils'
import { createLogger } from '@/lib/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/rate-limit'
import type { CatalogItem, ItemType } from '@/lib/types'

const log = createLogger('api:updates:check')

/**
 * POST /api/updates/check
 *
 * Check for available updates for a list of installed plugins.
 *
 * Request body:
 * {
 *   plugins: [
 *     { id: string, type: ItemType, installedVersion: string }
 *   ]
 * }
 *
 * Response:
 * {
 *   hasUpdates: boolean,
 *   updates: PluginUpdate[],
 *   checkedAt: string
 * }
 */
export async function POST(request: NextRequest) {
  // Rate limit: 30 requests per minute for update checks
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  try {
    const body = await request.json()

    // Validate request body
    const validation = validateRequired(body, ['plugins'])
    if (!validation.valid) {
      return ApiErrors.badRequest(
        `Missing required fields: ${validation.missing.join(', ')}`
      )
    }

    const { plugins } = body as { plugins: InstalledPlugin[] }

    // Validate plugins array
    if (!Array.isArray(plugins)) {
      return ApiErrors.badRequest('plugins must be an array')
    }

    if (plugins.length === 0) {
      // No plugins to check - return empty result
      const result: UpdateCheckResult = {
        hasUpdates: false,
        updates: [],
        checkedAt: new Date().toISOString(),
      }
      return apiSuccess(result)
    }

    // Validate each plugin entry
    for (const plugin of plugins) {
      if (!plugin.id || typeof plugin.id !== 'string') {
        return ApiErrors.badRequest('Each plugin must have a valid id')
      }
      if (!plugin.installedVersion || typeof plugin.installedVersion !== 'string') {
        return ApiErrors.badRequest(
          `Plugin ${plugin.id} must have an installedVersion`
        )
      }
    }

    // Get plugin IDs to fetch from database
    const pluginIds = plugins.map((p) => p.id)

    // Fetch catalog items for the installed plugins
    const items = await db
      .select()
      .from(catalogItems)
      .where(inArray(catalogItems.id, pluginIds))

    // Convert to CatalogItem format
    const catalogItemsForCheck: CatalogItem[] = items.map((item) => ({
      id: item.id,
      type: item.type as ItemType,
      name: item.name,
      description: item.description,
      author: item.author,
      tags: item.tags || [],
      likes: item.likes,
      content: item.content,
      marketplaceVersion: item.marketplaceVersion ?? '1.0.0',
      changelog: item.changelog ?? undefined,
      updatedAt: item.updatedAt?.toISOString(),
    }))

    // Check for updates
    const result = checkForUpdates(plugins, catalogItemsForCheck)

    log.info('Update check completed', {
      pluginCount: plugins.length,
      updateCount: result.updates.length,
    })

    return apiSuccess(result)
  } catch (error) {
    log.error('Failed to check for updates', error)
    return ApiErrors.internalError('Failed to check for updates')
  }
}

/**
 * GET /api/updates/check
 *
 * Get a list of all available plugin versions (for reference).
 * This can be used by clients to pre-fetch version information.
 */
export async function GET(request: NextRequest) {
  // Rate limit
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') as ItemType | null

    // Build query
    const items = await db
      .select({
        id: catalogItems.id,
        type: catalogItems.type,
        name: catalogItems.name,
        marketplaceVersion: catalogItems.marketplaceVersion,
        changelog: catalogItems.changelog,
        updatedAt: catalogItems.updatedAt,
      })
      .from(catalogItems)

    // Filter by type if specified
    const filteredItems = type
      ? items.filter((item) => item.type === type)
      : items

    // Transform to version info
    const versions = filteredItems.map((item) => ({
      id: item.id,
      type: item.type,
      name: item.name,
      version: item.marketplaceVersion ?? '1.0.0',
      changelog: item.changelog,
      updatedAt: item.updatedAt?.toISOString(),
    }))

    return apiSuccess({
      versions,
      count: versions.length,
      fetchedAt: new Date().toISOString(),
    })
  } catch (error) {
    log.error('Failed to fetch versions', error)
    return ApiErrors.internalError('Failed to fetch versions')
  }
}
