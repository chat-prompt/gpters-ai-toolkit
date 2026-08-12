/**
 * Single catalog item API route
 *
 * GET: Retrieve a catalog item by ID
 * PUT: Update a catalog item (requires authentication and org ownership)
 * DELETE: Delete a catalog item (requires authentication and org ownership)
 */
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, catalogItems } from '@/lib/db'
import type { ItemType, Difficulty } from '@/lib/core/types'
import { ApiErrors, apiSuccess, requirePermissionAsync, getCurrentUser } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { Permissions, isSuperAdmin, type UserRole } from '@/lib/security/rbac'
import { cachedJsonResponse, addSurrogateKey } from '@/lib/utils/api-cache'
import { analyzeChanges, createVersionOnUpdate } from '@/lib/versioning/skill-version'
import { auth } from '@/lib/core/auth'

const log = createLogger('api:catalog')

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  try {
    const { id } = await params
    const [item] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

    if (!item) {
      return ApiErrors.notFound('Catalog item')
    }

    const response = cachedJsonResponse(item, 'catalogItem', request)
    addSurrogateKey(response, 'catalog', `catalog-item-${id}`, `catalog-${item.type}`)
    return response
  } catch (error) {
    log.error('Failed to fetch catalog item', error)
    return ApiErrors.internalError('Failed to fetch catalog item')
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  const permissionError = await requirePermissionAsync(Permissions.CATALOG_EDIT, request)
  if (permissionError) return permissionError

  const currentUser = await getCurrentUser()
  const session = await auth()
  const currentOrgId = session?.user?.currentOrgId
  const userRole = session?.user?.role

  try {
    const { id } = await params
    const body = await request.json()

    const [existing] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

    if (!existing) {
      return ApiErrors.notFound('Catalog item')
    }

    const isSuperAdminUser = userRole && isSuperAdmin(userRole as UserRole)
    if (!isSuperAdminUser && existing.orgId && existing.orgId !== currentOrgId) {
      return ApiErrors.notFound('Catalog item')
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (body.name !== undefined) updateData.name = body.name
    if (body.description !== undefined) updateData.description = body.description
    if (body.authorId !== undefined) updateData.authorId = body.authorId
    if (body.tags !== undefined) updateData.tags = body.tags
    if (body.difficulty !== undefined) updateData.difficulty = body.difficulty as Difficulty
    if (body.pluginId !== undefined) updateData.pluginId = body.pluginId
    if (body.estimatedTime !== undefined) updateData.estimatedTime = body.estimatedTime
    if (body.content !== undefined) updateData.content = body.content
    if (body.readme !== undefined) updateData.readme = body.readme
    if (body.files !== undefined) updateData.files = body.files
    if (body.type !== undefined) updateData.type = body.type as ItemType
    // Marketplace fields
    if (body.mcpEnabled !== undefined) updateData.mcpEnabled = body.mcpEnabled
    if (body.version !== undefined) updateData.version = body.version
    // V2: Status and changelog
    if (body.status !== undefined) updateData.status = body.status
    if (body.changelog !== undefined) updateData.changelog = body.changelog
    updateData.visibility = 'public'
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

    // Enforce changelog when content has meaningful changes
    const hasContentChange = body.content !== undefined &&
      analyzeChanges(existing.content, body.content).hasChanges

    if (hasContentChange) {
      const changelog = (body.changelog ?? '').trim()
      if (!changelog) {
        return ApiErrors.badRequest('업데이트 시 changelog는 필수입니다. 이번 변경 사유를 한 줄 이상 적어주세요.')
      }
    }

    // Check if content changed for version history
    const contentChanged = body.content !== undefined && body.content !== existing.content
    const previousContent = existing.content

    await db.update(catalogItems).set(updateData).where(eq(catalogItems.id, id))

    const [updated] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

    // Create version history entry if content changed
    if (contentChanged && updated) {
      try {
        await createVersionOnUpdate(updated, previousContent, {
          changelog: (body.changelog ?? '').trim(),
          createdBy: currentUser?.id,
        })
        log.info('Created version history entry', { itemId: id })
      } catch (versionError) {
        log.error('Failed to create version history entry', versionError)
        // Don't fail the update if version creation fails
      }
    }

    return NextResponse.json(updated)
  } catch (error) {
    log.error('Failed to update catalog item', error)
    return ApiErrors.internalError('Failed to update catalog item')
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  const permissionError = await requirePermissionAsync(Permissions.CATALOG_DELETE, request)
  if (permissionError) return permissionError

  const session = await auth()
  const currentOrgId = session?.user?.currentOrgId
  const userRole = session?.user?.role

  try {
    const { id } = await params
    const [existing] = await db.select().from(catalogItems).where(eq(catalogItems.id, id))

    if (!existing) {
      return ApiErrors.notFound('Catalog item')
    }

    const isSuperAdminUser = userRole && isSuperAdmin(userRole as UserRole)
    if (!isSuperAdminUser && existing.orgId && existing.orgId !== currentOrgId) {
      return ApiErrors.notFound('Catalog item')
    }

    await db.delete(catalogItems).where(eq(catalogItems.id, id))

    return apiSuccess({ success: true })
  } catch (error) {
    log.error('Failed to delete catalog item', error)
    return ApiErrors.internalError('Failed to delete catalog item')
  }
}
