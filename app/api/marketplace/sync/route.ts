import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, catalogItems } from '@/lib/db'
import { syncAllToGitHub } from '@/lib/marketplace'
import type { HookEvent } from '@/lib/core/types'
import { ApiErrors, requireAdminAuth } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'

const log = createLogger('api:marketplace:sync')

/**
 * POST /api/marketplace/sync
 * Trigger full sync of all marketplace-enabled items to GitHub
 * Requires admin authentication
 */
export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request)
  if (authError) return authError

  try {
    // Get all marketplace-enabled items
    const items = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.marketplaceEnabled, true))

    // Transform DB records to CatalogItem format
    const catalogItemsList = items.map((item) => ({
      ...item,
      tags: item.tags || [],
      dependencies: item.dependencies || [],
      authorId: item.authorId ?? undefined,
      files: item.files ?? undefined,
      teamTag: item.teamTag ?? undefined,
      difficulty: item.difficulty ?? undefined,
      pluginId: item.pluginId ?? undefined,
      estimatedTime: item.estimatedTime ?? undefined,
      readme: item.readme ?? undefined,
      allowedTools: item.allowedTools ?? undefined,
      agentModel: (item.agentModel ?? undefined) as import('@/lib/core/types').AgentModel | undefined,
      agentPermissionMode: (item.agentPermissionMode ?? undefined) as import('@/lib/core/types').AgentPermissionMode | undefined,
      agentSkills: item.agentSkills ?? undefined,
      commandArgumentHint: item.commandArgumentHint ?? undefined,
      commandDisableModelInvocation: item.commandDisableModelInvocation ?? undefined,
      // Hook fields
      hookEvent: (item.hookEvent ?? undefined) as HookEvent | undefined,
      hookMatcher: item.hookMatcher ?? undefined,
      hookCommand: item.hookCommand ?? undefined,
      hookTimeout: item.hookTimeout ?? undefined,
      hookBlocking: item.hookBlocking ?? undefined,
      marketplaceEnabled: item.marketplaceEnabled ?? undefined,
      marketplaceVersion: item.marketplaceVersion ?? undefined,
      // V2 fields
      status: (item.status as 'draft' | 'published') ?? 'published',
      changelog: item.changelog ?? undefined,
      createdAt: item.createdAt?.toISOString(),
      updatedAt: item.updatedAt?.toISOString(),
      marketplaceSyncedAt: item.marketplaceSyncedAt?.toISOString(),
    }))

    // Sync to GitHub
    const result = await syncAllToGitHub(catalogItemsList)

    // Update sync timestamps for successful items
    if (result.success) {
      await db
        .update(catalogItems)
        .set({ marketplaceSyncedAt: new Date() })
        .where(eq(catalogItems.marketplaceEnabled, true))
    }

    return NextResponse.json({
      success: result.success,
      syncedAt: result.syncedAt.toISOString(),
      stats: {
        filesCreated: result.filesCreated.length,
        filesUpdated: result.filesUpdated.length,
        filesDeleted: result.filesDeleted.length,
        errors: result.errors.length,
      },
      details: {
        filesCreated: result.filesCreated,
        filesUpdated: result.filesUpdated,
        filesDeleted: result.filesDeleted,
        errors: result.errors,
      },
    })
  } catch (error) {
    log.error('Marketplace sync failed', error)
    return ApiErrors.internalError(
      error instanceof Error ? error.message : 'Sync failed'
    )
  }
}
