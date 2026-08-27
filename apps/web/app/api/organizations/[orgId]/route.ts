/**
 * Organization detail and update API route
 *
 * GET: Get organization details (members only or super_admin)
 * PATCH: Update organization (org_admin or super_admin)
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { organizations, orgMemberships } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { ApiErrors, apiSuccess } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { isSuperAdmin, hasOrgPermission, Permissions } from '@/lib/security/rbac'
import { validateOrgAccess, getOrgMembership } from '@/lib/security/org-context'
import { auth } from '@/lib/core/auth'

const log = createLogger('api:organizations:detail')

interface RouteContext {
  params: Promise<{ orgId: string }>
}

/**
 * GET /api/organizations/[orgId]
 * Get organization details with member count
 *
 * Access: Must be member of org OR super_admin
 * Non-members receive 404 (don't leak existence)
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  try {
    const session = await auth()
    if (!session?.user) {
      return ApiErrors.unauthorized()
    }

    const { orgId } = await context.params
    const userId = session.user.id
    const userRole = session.user.role

    const hasAccess = await validateOrgAccess(userId, orgId, userRole)
    if (!hasAccess) {
      return ApiErrors.notFound('Organization')
    }

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1)

    if (!org) {
      return ApiErrors.notFound('Organization')
    }

    const [memberCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orgMemberships)
      .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.status, 'active')))

    return NextResponse.json({
      ...org,
      memberCount: memberCount?.count || 0,
    })
  } catch (error) {
    log.error('Failed to fetch organization', error)
    return ApiErrors.internalError('Failed to fetch organization')
  }
}

/**
 * PATCH /api/organizations/[orgId]
 * Update organization details
 *
 * Access: org_admin of the org OR super_admin
 * Body: { name?, description?, isActive? }
 * Note: slug is immutable after creation
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  try {
    const session = await auth()
    if (!session?.user) {
      return ApiErrors.unauthorized()
    }

    const { orgId } = await context.params
    const userId = session.user.id
    const userRole = session.user.role

    if (!isSuperAdmin(userRole)) {
      const membership = await getOrgMembership(userId, orgId)
      if (!membership) {
        return ApiErrors.notFound('Organization')
      }

      if (!hasOrgPermission(membership.role, Permissions.CATALOG_DELETE)) {
        return ApiErrors.forbidden('org_admin role required to update organization')
      }
    }

    const body = await request.json()
    const { name, description, isActive } = body

    const updateData: Partial<typeof organizations.$inferInsert> = {
      updatedAt: new Date(),
    }

    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (isActive !== undefined) updateData.isActive = isActive

    if (Object.keys(updateData).length === 1) {
      return ApiErrors.badRequest('No valid fields to update')
    }

    const [updatedOrg] = await db
      .update(organizations)
      .set(updateData)
      .where(eq(organizations.id, orgId))
      .returning()

    if (!updatedOrg) {
      return ApiErrors.notFound('Organization')
    }

    log.info('Organization updated', { orgId, fields: Object.keys(updateData) })

    return apiSuccess(updatedOrg)
  } catch (error) {
    log.error('Failed to update organization', error)
    return ApiErrors.internalError('Failed to update organization')
  }
}
