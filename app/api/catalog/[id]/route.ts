import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, catalogItems } from '@/lib/db'
import type { ItemType, Difficulty, TeamTag, HookEvent } from '@/lib/core/types'
import { syncItemToGitHub, deleteItemFromGitHub, updateMarketplaceJson } from '@/lib/marketplace'
import { ApiErrors, apiSuccess, requirePermissionAsync, getCurrentUser } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { Permissions } from '@/lib/security/rbac'
import { cachedJsonResponse, addSurrogateKey } from '@/lib/utils/api-cache'
import { createVersionOnUpdate } from '@/lib/versioning/skill-version'

const log = createLogger('api:catalog')

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  // Rate limit: 100 requests per minute for item queries
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  try {
    const { id } = await params
    const [item] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

    if (!item) {
      return ApiErrors.notFound('Catalog item')
    }

    // Return cached response with ETag support
    const response = cachedJsonResponse(item, 'catalogItem', request)

    // Add surrogate keys for CDN cache invalidation
    addSurrogateKey(response, 'catalog', `catalog-item-${id}`, `catalog-${item.type}`)

    return response
  } catch (error) {
    log.error('Failed to fetch catalog item', error)
    return ApiErrors.internalError('Failed to fetch catalog item')
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  // Rate limit: 60 requests per minute for admin operations
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  // Check RBAC permission for editing catalog items
  const permissionError = await requirePermissionAsync(Permissions.CATALOG_EDIT, request)
  if (permissionError) return permissionError

  // Get current user for version tracking
  const currentUser = await getCurrentUser()

  try {
    const { id } = await params
    const body = await request.json()

    const [existing] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

    if (!existing) {
      return ApiErrors.notFound('Catalog item')
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (body.name !== undefined) updateData.name = body.name
    if (body.description !== undefined) updateData.description = body.description
    if (body.authorId !== undefined) updateData.authorId = body.authorId
    if (body.tags !== undefined) updateData.tags = body.tags
    if (body.teamTag !== undefined) updateData.teamTag = body.teamTag as TeamTag
    if (body.difficulty !== undefined) updateData.difficulty = body.difficulty as Difficulty
    if (body.pluginId !== undefined) updateData.pluginId = body.pluginId
    if (body.estimatedTime !== undefined) updateData.estimatedTime = body.estimatedTime
    if (body.content !== undefined) updateData.content = body.content
    if (body.readme !== undefined) updateData.readme = body.readme
    if (body.files !== undefined) updateData.files = body.files
    if (body.type !== undefined) updateData.type = body.type as ItemType
    // Marketplace fields
    if (body.marketplaceEnabled !== undefined) updateData.marketplaceEnabled = body.marketplaceEnabled
    if (body.marketplaceVersion !== undefined) updateData.marketplaceVersion = body.marketplaceVersion
    // V2: Status and changelog
    if (body.status !== undefined) updateData.status = body.status
    if (body.changelog !== undefined) updateData.changelog = body.changelog
    // Type-specific fields
    if (body.allowedTools !== undefined) updateData.allowedTools = body.allowedTools
    if (body.agentModel !== undefined) updateData.agentModel = body.agentModel
    if (body.agentPermissionMode !== undefined) updateData.agentPermissionMode = body.agentPermissionMode
    if (body.agentSkills !== undefined) updateData.agentSkills = body.agentSkills
    if (body.commandArgumentHint !== undefined) updateData.commandArgumentHint = body.commandArgumentHint
    if (body.commandDisableModelInvocation !== undefined) updateData.commandDisableModelInvocation = body.commandDisableModelInvocation
    // Hook-specific fields
    if (body.hookEvent !== undefined) updateData.hookEvent = body.hookEvent
    if (body.hookMatcher !== undefined) updateData.hookMatcher = body.hookMatcher
    if (body.hookCommand !== undefined) updateData.hookCommand = body.hookCommand
    if (body.hookTimeout !== undefined) updateData.hookTimeout = body.hookTimeout
    if (body.hookBlocking !== undefined) updateData.hookBlocking = body.hookBlocking

    // Check if content changed for version history
    const contentChanged = body.content !== undefined && body.content !== existing.content
    const previousContent = existing.content

    await db.update(catalogItems).set(updateData).where(eq(catalogItems.id, id))

    const [updated] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

    // Create version history entry if content changed
    if (contentChanged && updated) {
      try {
        await createVersionOnUpdate(updated, previousContent, {
          changelog: body.changelog,
          createdBy: currentUser?.id,
        })
        log.info('Created version history entry', { itemId: id })
      } catch (versionError) {
        log.error('Failed to create version history entry', versionError)
        // Don't fail the update if version creation fails
      }
    }

    // Auto-sync to GitHub if marketplace is enabled
    if (updated.marketplaceEnabled && updated.type !== 'guide') {
      try {
        const catalogItem = {
          ...updated,
          tags: updated.tags || [],
          dependencies: updated.dependencies || [],
          authorId: updated.authorId ?? undefined,
          teamTag: updated.teamTag ?? undefined,
          difficulty: updated.difficulty ?? undefined,
          pluginId: updated.pluginId ?? undefined,
          estimatedTime: updated.estimatedTime ?? undefined,
          readme: updated.readme ?? undefined,
          files: updated.files ?? undefined,
          allowedTools: updated.allowedTools ?? undefined,
          agentModel: (updated.agentModel ?? undefined) as import('@/lib/core/types').AgentModel | undefined,
          agentPermissionMode: (updated.agentPermissionMode ?? undefined) as import('@/lib/core/types').AgentPermissionMode | undefined,
          agentSkills: updated.agentSkills ?? undefined,
          commandArgumentHint: updated.commandArgumentHint ?? undefined,
          commandDisableModelInvocation: updated.commandDisableModelInvocation ?? undefined,
          hookEvent: (updated.hookEvent ?? undefined) as HookEvent | undefined,
          hookMatcher: updated.hookMatcher ?? undefined,
          hookCommand: updated.hookCommand ?? undefined,
          hookTimeout: updated.hookTimeout ?? undefined,
          hookBlocking: updated.hookBlocking ?? undefined,
          marketplaceEnabled: updated.marketplaceEnabled ?? undefined,
          marketplaceVersion: updated.marketplaceVersion ?? undefined,
          status: (updated.status as 'draft' | 'published') ?? 'published',
          changelog: updated.changelog ?? undefined,
          createdAt: updated.createdAt?.toISOString(),
          updatedAt: updated.updatedAt?.toISOString(),
          marketplaceSyncedAt: updated.marketplaceSyncedAt?.toISOString(),
        }
        await syncItemToGitHub(catalogItem)

        // Update marketplace.json
        const allItems = await db.select().from(catalogItems).where(eq(catalogItems.marketplaceEnabled, true))
        const allCatalogItems = allItems.map(item => ({
          ...item,
          tags: item.tags || [],
          dependencies: item.dependencies || [],
          authorId: item.authorId ?? undefined,
          teamTag: item.teamTag ?? undefined,
          difficulty: item.difficulty ?? undefined,
          pluginId: item.pluginId ?? undefined,
          estimatedTime: item.estimatedTime ?? undefined,
          readme: item.readme ?? undefined,
          files: item.files ?? undefined,
          allowedTools: item.allowedTools ?? undefined,
          agentModel: (item.agentModel ?? undefined) as import('@/lib/core/types').AgentModel | undefined,
          agentPermissionMode: (item.agentPermissionMode ?? undefined) as import('@/lib/core/types').AgentPermissionMode | undefined,
          agentSkills: item.agentSkills ?? undefined,
          commandArgumentHint: item.commandArgumentHint ?? undefined,
          commandDisableModelInvocation: item.commandDisableModelInvocation ?? undefined,
          hookEvent: (item.hookEvent ?? undefined) as HookEvent | undefined,
          hookMatcher: item.hookMatcher ?? undefined,
          hookCommand: item.hookCommand ?? undefined,
          hookTimeout: item.hookTimeout ?? undefined,
          hookBlocking: item.hookBlocking ?? undefined,
          marketplaceEnabled: item.marketplaceEnabled ?? undefined,
          marketplaceVersion: item.marketplaceVersion ?? undefined,
          status: (item.status as 'draft' | 'published') ?? 'published',
          changelog: item.changelog ?? undefined,
          createdAt: item.createdAt?.toISOString(),
          updatedAt: item.updatedAt?.toISOString(),
          marketplaceSyncedAt: item.marketplaceSyncedAt?.toISOString(),
        }))
        await updateMarketplaceJson(allCatalogItems)

        // Update sync timestamp
        await db.update(catalogItems).set({ marketplaceSyncedAt: new Date() }).where(eq(catalogItems.id, id))
      } catch (error) {
        log.error('Failed to sync to marketplace', error)
        // Don't fail the update if sync fails
      }
    }

    return NextResponse.json(updated)
  } catch (error) {
    log.error('Failed to update catalog item', error)
    return ApiErrors.internalError('Failed to update catalog item')
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  // Rate limit: 60 requests per minute for admin operations
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  // Check RBAC permission for deleting catalog items (admin only)
  const permissionError = await requirePermissionAsync(Permissions.CATALOG_DELETE, request)
  if (permissionError) return permissionError

  try {
    const { id } = await params
    const [existing] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

    if (!existing) {
      return ApiErrors.notFound('Catalog item')
    }

    // Delete from marketplace if it was enabled
    if (existing.marketplaceEnabled) {
      try {
        await deleteItemFromGitHub(id)

        // Update marketplace.json
        const allItems = await db.select().from(catalogItems).where(eq(catalogItems.marketplaceEnabled, true))
        const remainingItems = allItems.filter(item => item.id !== id).map(item => ({
          ...item,
          tags: item.tags || [],
          dependencies: item.dependencies || [],
          authorId: item.authorId ?? undefined,
          teamTag: item.teamTag ?? undefined,
          difficulty: item.difficulty ?? undefined,
          pluginId: item.pluginId ?? undefined,
          estimatedTime: item.estimatedTime ?? undefined,
          readme: item.readme ?? undefined,
          files: item.files ?? undefined,
          allowedTools: item.allowedTools ?? undefined,
          agentModel: (item.agentModel ?? undefined) as import('@/lib/core/types').AgentModel | undefined,
          agentPermissionMode: (item.agentPermissionMode ?? undefined) as import('@/lib/core/types').AgentPermissionMode | undefined,
          agentSkills: item.agentSkills ?? undefined,
          commandArgumentHint: item.commandArgumentHint ?? undefined,
          commandDisableModelInvocation: item.commandDisableModelInvocation ?? undefined,
          hookEvent: (item.hookEvent ?? undefined) as HookEvent | undefined,
          hookMatcher: item.hookMatcher ?? undefined,
          hookCommand: item.hookCommand ?? undefined,
          hookTimeout: item.hookTimeout ?? undefined,
          hookBlocking: item.hookBlocking ?? undefined,
          marketplaceEnabled: item.marketplaceEnabled ?? undefined,
          marketplaceVersion: item.marketplaceVersion ?? undefined,
          status: (item.status as 'draft' | 'published') ?? 'published',
          changelog: item.changelog ?? undefined,
          createdAt: item.createdAt?.toISOString(),
          updatedAt: item.updatedAt?.toISOString(),
          marketplaceSyncedAt: item.marketplaceSyncedAt?.toISOString(),
        }))
        await updateMarketplaceJson(remainingItems)
      } catch (error) {
        log.error('Failed to delete from marketplace', error)
        // Don't fail the delete if marketplace sync fails
      }
    }

    await db.delete(catalogItems).where(eq(catalogItems.id, id))

    return apiSuccess({ success: true })
  } catch (error) {
    log.error('Failed to delete catalog item', error)
    return ApiErrors.internalError('Failed to delete catalog item')
  }
}
