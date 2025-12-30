import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, catalogItems } from '@/lib/db'
import type { ItemType, Difficulty, TeamTag, AgentModel, AgentPermissionMode, HookEvent, PluginFile } from '@/lib/core/types'
import { syncItemToGitHub, updateMarketplaceJson } from '@/lib/marketplace'
import { ApiErrors, validateRequired, apiSuccess, requirePermissionAsync, getCurrentUser } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { Permissions } from '@/lib/security/rbac'
import { cachedJsonResponse, addSurrogateKey } from '@/lib/utils/api-cache'

const log = createLogger('api:catalog')

// Valid item types for type validation
const VALID_TYPES: ItemType[] = ['skill', 'agent', 'command', 'guide', 'hook', 'package']

export async function GET(request: NextRequest) {
  // Rate limit: 100 requests per minute for catalog queries
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  try {
    const { searchParams } = new URL(request.url)
    const typeParam = searchParams.get('type')

    // Return empty array for invalid type (graceful handling)
    if (typeParam && !VALID_TYPES.includes(typeParam as ItemType)) {
      return cachedJsonResponse([], 'catalogList', request)
    }

    const type = typeParam as ItemType | null

    const items = type
      ? await db.select().from(catalogItems).where(eq(catalogItems.type, type))
      : await db.select().from(catalogItems)

    // Return cached response with ETag support
    const response = cachedJsonResponse(items, 'catalogList', request)

    // Add surrogate keys for CDN cache invalidation
    addSurrogateKey(response, 'catalog', type ? `catalog-${type}` : 'catalog-all')

    return response
  } catch (error) {
    log.error('Failed to fetch catalog items', error)
    return ApiErrors.internalError('Failed to fetch catalog items')
  }
}

export async function POST(request: NextRequest) {
  // Rate limit: 60 requests per minute for admin operations
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  // Check RBAC permission for creating catalog items
  const permissionError = await requirePermissionAsync(Permissions.CATALOG_CREATE, request)
  if (permissionError) return permissionError

  // Get current user for authorId
  const currentUser = await getCurrentUser()

  try {
    const body = await request.json()

    const {
    id,
    type,
    name,
    description,
    tags,
    teamTag,
    difficulty,
    pluginId,
    estimatedTime,
    content,
    readme,
    files,
    marketplaceEnabled,
    marketplaceVersion,
    // Type-specific fields
    allowedTools,
    agentModel,
    agentPermissionMode,
    agentSkills,
    commandArgumentHint,
    commandDisableModelInvocation,
    // Hook fields
    hookEvent,
    hookMatcher,
    hookCommand,
    hookTimeout,
    hookBlocking,
  } = body

  // Validate required fields
    const validation = validateRequired(body, ['id', 'type', 'name', 'content'])
    if (!validation.valid) {
      return ApiErrors.badRequest(
        `Missing required fields: ${validation.missing.join(', ')}`
      )
    }

  const newItem = {
    id,
    type: type as ItemType,
    name,
    description: description || '',
    authorId: currentUser?.id || null,
    tags: tags || [],
    teamTag: (teamTag as TeamTag) || 'general',
    difficulty: difficulty as Difficulty | null,
    pluginId: pluginId || null,
    estimatedTime: estimatedTime || null,
    content,
    readme: readme || null,
    files: (files as PluginFile[]) || null,
    marketplaceEnabled: marketplaceEnabled || false,
    marketplaceVersion: marketplaceVersion || '1.0.0',
    // Type-specific fields
    allowedTools: allowedTools || null,
    agentModel: (agentModel as AgentModel) || null,
    agentPermissionMode: (agentPermissionMode as AgentPermissionMode) || null,
    agentSkills: agentSkills || null,
    commandArgumentHint: commandArgumentHint || null,
    commandDisableModelInvocation: commandDisableModelInvocation || false,
    // Hook fields
    hookEvent: (hookEvent as HookEvent) || null,
    hookMatcher: hookMatcher || null,
    hookCommand: hookCommand || null,
    hookTimeout: hookTimeout || null,
    hookBlocking: hookBlocking ?? true,
  }

  await db.insert(catalogItems).values(newItem)

  // Auto-sync to GitHub if marketplace is enabled
  if (newItem.marketplaceEnabled && newItem.type !== 'guide') {
    try {
      const catalogItem = {
        ...newItem,
        likes: 0,
        dependencies: [],
        authorId: newItem.authorId ?? undefined,
        teamTag: newItem.teamTag ?? undefined,
        difficulty: newItem.difficulty ?? undefined,
        pluginId: newItem.pluginId ?? undefined,
        estimatedTime: newItem.estimatedTime ?? undefined,
        readme: newItem.readme ?? undefined,
        files: newItem.files ?? undefined,
        marketplaceEnabled: newItem.marketplaceEnabled ?? undefined,
        marketplaceVersion: newItem.marketplaceVersion ?? undefined,
        // Type-specific fields
        allowedTools: newItem.allowedTools ?? undefined,
        agentModel: (newItem.agentModel ?? undefined) as import('@/lib/core/types').AgentModel | undefined,
        agentPermissionMode: (newItem.agentPermissionMode ?? undefined) as import('@/lib/core/types').AgentPermissionMode | undefined,
        agentSkills: newItem.agentSkills ?? undefined,
        commandArgumentHint: newItem.commandArgumentHint ?? undefined,
        commandDisableModelInvocation: newItem.commandDisableModelInvocation ?? undefined,
        // Hook fields
        hookEvent: (newItem.hookEvent ?? undefined) as HookEvent | undefined,
        hookMatcher: newItem.hookMatcher ?? undefined,
        hookCommand: newItem.hookCommand ?? undefined,
        hookTimeout: newItem.hookTimeout ?? undefined,
        hookBlocking: newItem.hookBlocking ?? undefined,
        // V2 fields
        status: 'published' as const,
        changelog: undefined,
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
        marketplaceEnabled: item.marketplaceEnabled ?? undefined,
        marketplaceVersion: item.marketplaceVersion ?? undefined,
        createdAt: item.createdAt?.toISOString(),
        updatedAt: item.updatedAt?.toISOString(),
        marketplaceSyncedAt: item.marketplaceSyncedAt?.toISOString(),
        // Type-specific fields
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
        // V2 fields
        status: (item.status as 'draft' | 'published') ?? 'published',
        changelog: item.changelog ?? undefined,
      }))
      await updateMarketplaceJson(allCatalogItems)

      // Update sync timestamp
      await db.update(catalogItems).set({ marketplaceSyncedAt: new Date() }).where(eq(catalogItems.id, id))
    } catch (error) {
      log.error('Failed to sync to marketplace', error)
      // Don't fail the insert if sync fails
    }
  }

    return apiSuccess(newItem, 201)
  } catch (error) {
    log.error('Failed to create catalog item', error)
    return ApiErrors.internalError('Failed to create catalog item')
  }
}
