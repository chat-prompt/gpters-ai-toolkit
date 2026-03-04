/**
 * Catalog API route
 *
 * GET: List all catalog items with optional type filtering and org-based access control
 * POST: Create a new catalog item (requires authentication)
 */
import { NextRequest } from 'next/server'
import { eq, and, or, isNull } from 'drizzle-orm'
import { db, catalogItems, users, organizations } from '@/lib/db'
import type { ItemType, Difficulty, AgentModel, AgentPermissionMode, HookEvent, PluginFile } from '@/lib/core/types'
import { ApiErrors, validateRequired, apiSuccess, requirePermissionAsync, getCurrentUser } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { Permissions, isSuperAdmin, type UserRole } from '@/lib/security/rbac'
import { cachedJsonResponse, addSurrogateKey } from '@/lib/utils/api-cache'
import { auth } from '@/lib/core/auth'

const log = createLogger('api:catalog')

// Valid item types for type validation
const VALID_TYPES: ItemType[] = ['skill', 'agent', 'command', 'guide', 'hook', 'package']

export async function GET(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  try {
    const { searchParams } = new URL(request.url)
    const typeParam = searchParams.get('type')

    if (typeParam && !VALID_TYPES.includes(typeParam as ItemType)) {
      return cachedJsonResponse([], 'catalogList', request)
    }

    const type = typeParam as ItemType | null
    const session = await auth()
    const currentOrgId = session?.user?.currentOrgId
    const userRole = session?.user?.role

    const baseQuery = db
      .select({
        id: catalogItems.id,
        type: catalogItems.type,
        name: catalogItems.name,
        description: catalogItems.description,
        authorId: catalogItems.authorId,
        authorName: users.name,
        tags: catalogItems.tags,
        difficulty: catalogItems.difficulty,
        pluginId: catalogItems.pluginId,
        estimatedTime: catalogItems.estimatedTime,
        dependencies: catalogItems.dependencies,
        likes: catalogItems.likes,
        content: catalogItems.content,
        readme: catalogItems.readme,
        files: catalogItems.files,
        allowedTools: catalogItems.allowedTools,
        agentModel: catalogItems.agentModel,
        agentPermissionMode: catalogItems.agentPermissionMode,
        agentSkills: catalogItems.agentSkills,
        commandArgumentHint: catalogItems.commandArgumentHint,
        commandDisableModelInvocation: catalogItems.commandDisableModelInvocation,
        hookEvent: catalogItems.hookEvent,
        hookMatcher: catalogItems.hookMatcher,
        hookCommand: catalogItems.hookCommand,
        hookTimeout: catalogItems.hookTimeout,
        hookBlocking: catalogItems.hookBlocking,
        mcpEnabled: catalogItems.mcpEnabled,
        version: catalogItems.version,
        status: catalogItems.status,
        changelog: catalogItems.changelog,
        orgId: catalogItems.orgId,
        orgName: organizations.name,
        visibility: catalogItems.visibility,
        forkedFrom: catalogItems.forkedFrom,
        forkCount: catalogItems.forkCount,
        createdAt: catalogItems.createdAt,
        updatedAt: catalogItems.updatedAt,
      })
      .from(catalogItems)
      .leftJoin(users, eq(catalogItems.authorId, users.id))
      .leftJoin(organizations, eq(catalogItems.orgId, organizations.id))

    const whereConditions = []
    
    if (type) {
      whereConditions.push(eq(catalogItems.type, type))
    }

    if (userRole && isSuperAdmin(userRole as UserRole)) {
      const items = whereConditions.length > 0 
        ? await baseQuery.where(and(...whereConditions))
        : await baseQuery
      
      const response = cachedJsonResponse(items, 'catalogList', request)
      addSurrogateKey(response, 'catalog', type ? `catalog-${type}` : 'catalog-all')
      return response
    }

    const orgAccessConditions = currentOrgId
      ? or(
          eq(catalogItems.orgId, currentOrgId),
          eq(catalogItems.visibility, 'public'),
          isNull(catalogItems.orgId)
        )
      : or(
          eq(catalogItems.visibility, 'public'),
          isNull(catalogItems.orgId)
        )

    whereConditions.push(orgAccessConditions)

    const items = await baseQuery.where(and(...whereConditions))

    const response = cachedJsonResponse(items, 'catalogList', request)
    addSurrogateKey(response, 'catalog', type ? `catalog-${type}` : 'catalog-all')

    return response
  } catch (error) {
    log.error('Failed to fetch catalog items', error)
    return ApiErrors.internalError('Failed to fetch catalog items')
  }
}

export async function POST(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  const permissionError = await requirePermissionAsync(Permissions.CATALOG_CREATE, request)
  if (permissionError) return permissionError

  const currentUser = await getCurrentUser()
  const session = await auth()
  const currentOrgId = session?.user?.currentOrgId

  try {
    const body = await request.json()

    const {
    id,
    type,
    name,
    description,
    tags,
    difficulty,
    pluginId,
    estimatedTime,
    content,
    readme,
    files,
    mcpEnabled,
    version,
    allowedTools,
    agentModel,
    agentPermissionMode,
    agentSkills,
    commandArgumentHint,
    commandDisableModelInvocation,
    hookEvent,
    hookMatcher,
    hookCommand,
    hookTimeout,
    hookBlocking,
    visibility,
  } = body

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
    difficulty: difficulty as Difficulty | null,
    pluginId: pluginId || null,
    estimatedTime: estimatedTime || null,
    content,
    readme: readme || null,
    files: (files as PluginFile[]) || null,
    mcpEnabled: mcpEnabled || false,
    version: version || '1.0.0',
    allowedTools: allowedTools || null,
    agentModel: (agentModel as AgentModel) || null,
    agentPermissionMode: (agentPermissionMode as AgentPermissionMode) || null,
    agentSkills: agentSkills || null,
    commandArgumentHint: commandArgumentHint || null,
    commandDisableModelInvocation: commandDisableModelInvocation || false,
    hookEvent: (hookEvent as HookEvent) || null,
    hookMatcher: hookMatcher || null,
    hookCommand: hookCommand || null,
    hookTimeout: hookTimeout || null,
    hookBlocking: hookBlocking ?? true,
    orgId: currentOrgId || null,
    visibility: visibility || (currentOrgId ? 'public' : 'private'),
    forkCount: 0,
  }

  await db.insert(catalogItems).values(newItem)

  return apiSuccess(newItem, 201)
  } catch (error) {
    log.error('Failed to create catalog item', error)
    return ApiErrors.internalError('Failed to create catalog item')
  }
}
