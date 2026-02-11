/**
 * Fork API endpoint for copying catalog items across organizations
 *
 * POST: Create a copy of a catalog item in the current user's organization
 */
import { NextRequest } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { db, catalogItems } from '@gpters/db'
import type { ItemType, Difficulty, TeamTag, AgentModel, AgentPermissionMode, HookEvent, PluginFile } from '@/lib/core/types'
import { ApiErrors, apiSuccess, getCurrentUser } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { isSuperAdmin, type UserRole } from '@/lib/security/rbac'
import { auth } from '@/lib/core/auth'

const log = createLogger('api:catalog:fork')

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/catalog/[id]/fork
 *
 * Creates a fork (copy) of a catalog item in the current user's organization.
 * Access is granted based on item visibility:
 * - Public items: Anyone can fork
 * - Shared items: Only shared organizations can fork
 * - Private items: Only same organization can fork
 * - Legacy items (orgId = null): Anyone can fork
 * - Super admins: Can fork any item
 *
 * @param request - Next.js request object
 * @param params - Route parameters containing item ID
 * @returns JSON response with forked item (201) or error
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  try {
    const session = await auth()
    if (!session?.user) {
      return ApiErrors.unauthorized('Authentication required')
    }

    const currentUser = await getCurrentUser()
    const currentOrgId = session.user.currentOrgId
    const userRole = session.user.role

    const { id } = await params
    const [sourceItem] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

    if (!sourceItem) {
      return ApiErrors.notFound('Catalog item')
    }

    const sourceOrgId = sourceItem.orgId
    const sourceVisibility = sourceItem.visibility
    const isSuperAdminUser = userRole && isSuperAdmin(userRole as UserRole)

    if (!isSuperAdminUser) {
      if (sourceOrgId !== null) {
        if (sourceVisibility !== 'public') {
          if (sourceVisibility === 'private' && sourceOrgId !== currentOrgId) {
            return ApiErrors.notFound('Catalog item')
          }

          if (sourceVisibility === 'shared') {
            const sharedWithOrgs = sourceItem.sharedWithOrgs as string[] | null
            const isSharedWithCurrentOrg = sharedWithOrgs && currentOrgId && sharedWithOrgs.includes(currentOrgId)
            
            if (sourceOrgId !== currentOrgId && !isSharedWithCurrentOrg) {
              return ApiErrors.notFound('Catalog item')
            }
          }
        }
      }
    }

    const newItemId = crypto.randomUUID()
    const newItem = {
      id: newItemId,
      type: sourceItem.type as ItemType,
      name: sourceItem.name,
      description: sourceItem.description,
      content: sourceItem.content,
      authorId: currentUser?.id || null,
      tags: sourceItem.tags || [],
      teamTag: (sourceItem.teamTag as TeamTag) || 'general',
      difficulty: sourceItem.difficulty as Difficulty | null,
      pluginId: sourceItem.pluginId || null,
      estimatedTime: sourceItem.estimatedTime || null,
      readme: sourceItem.readme || null,
      files: (sourceItem.files as PluginFile[]) || null,
      mcpEnabled: sourceItem.mcpEnabled || false,
      version: '1.0.0',
      allowedTools: sourceItem.allowedTools || null,
      agentModel: (sourceItem.agentModel as AgentModel) || null,
      agentPermissionMode: (sourceItem.agentPermissionMode as AgentPermissionMode) || null,
      agentSkills: sourceItem.agentSkills || null,
      commandArgumentHint: sourceItem.commandArgumentHint || null,
      commandDisableModelInvocation: sourceItem.commandDisableModelInvocation || false,
      hookEvent: (sourceItem.hookEvent as HookEvent) || null,
      hookMatcher: sourceItem.hookMatcher || null,
      hookCommand: sourceItem.hookCommand || null,
      hookTimeout: sourceItem.hookTimeout || null,
      hookBlocking: sourceItem.hookBlocking ?? true,
      orgId: currentOrgId || null,
      visibility: 'private' as const,
      forkedFrom: sourceItem.id,
      forkCount: 0,
      status: 'draft' as const,
      sharedWithOrgs: [],
    }

    await db.insert(catalogItems).values(newItem)

    await db
      .update(catalogItems)
      .set({
        forkCount: sql`${catalogItems.forkCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(catalogItems.id, id))

    log.info('Forked catalog item', { sourceId: id, newId: newItemId, userId: currentUser?.id })
    return apiSuccess(newItem, 201)
  } catch (error) {
    log.error('Failed to fork catalog item', error)
    return ApiErrors.internalError('Failed to fork catalog item')
  }
}
