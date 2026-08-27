/**
 * Organization members management API route
 *
 * GET: List organization members
 * POST: Invite/add member
 * PATCH: Update member role
 * DELETE: Offboard member while preserving history
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  oauthAccessTokens,
  oauthCodes,
  oauthRefreshTokens,
  orgMemberships,
  orgInvitations,
  users,
} from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { ApiErrors, apiSuccess, validateRequired } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { isSuperAdmin, hasOrgPermission, isValidOrgRole, Permissions, type OrgRole } from '@/lib/security/rbac'
import { validateOrgAccess, getOrgMembership } from '@/lib/security/org-context'
import { auth } from '@/lib/core/auth'

const log = createLogger('api:organizations:members')

interface RouteContext {
  params: Promise<{ orgId: string }>
}

/**
 * GET /api/organizations/[orgId]/members
 * List all members of an organization
 *
 * Access: Must be member of org OR super_admin
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

    const members = await db
      .select({
        userId: orgMemberships.userId,
        name: users.name,
        email: users.email,
        role: orgMemberships.role,
        status: orgMemberships.status,
        joinedAt: orgMemberships.joinedAt,
        endedAt: orgMemberships.endedAt,
        accountStatus: users.accountStatus,
      })
      .from(orgMemberships)
      .leftJoin(users, eq(orgMemberships.userId, users.id))
      .where(eq(orgMemberships.orgId, orgId))

    return NextResponse.json({ members })
  } catch (error) {
    log.error('Failed to fetch organization members', error)
    return ApiErrors.internalError('Failed to fetch organization members')
  }
}

/**
 * POST /api/organizations/[orgId]/members
 * Invite/add a member to the organization
 *
 * Access: org_admin OR super_admin
 * Body: { email, role: OrgRole }
 */
export async function POST(request: NextRequest, context: RouteContext) {
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

      if (!hasOrgPermission(membership.role, Permissions.USERS_MANAGE)) {
        return ApiErrors.forbidden('org_admin role required to invite members')
      }
    }

    const body = await request.json()
    const { email, role } = body

    const validation = validateRequired(body, ['email', 'role'])
    if (!validation.valid) {
      return ApiErrors.badRequest(
        `Missing required fields: ${validation.missing.join(', ')}`
      )
    }

    if (!isValidOrgRole(role)) {
      return ApiErrors.badRequest('Invalid role. Must be one of: org_admin, org_editor, org_viewer')
    }

    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (targetUser) {
      const [existingMembership] = await db
        .select()
        .from(orgMemberships)
        .where(and(eq(orgMemberships.userId, targetUser.id), eq(orgMemberships.orgId, orgId)))
        .limit(1)

      if (existingMembership) {
        if (existingMembership.status === 'active') {
          return ApiErrors.conflict('User is already a member of this organization')
        }

        const now = new Date()
        await db.update(orgMemberships)
          .set({
            role: role as OrgRole,
            status: 'active',
            joinedAt: now,
            endedAt: null,
            deactivatedBy: null,
            deactivationReason: null,
          })
          .where(and(eq(orgMemberships.userId, targetUser.id), eq(orgMemberships.orgId, orgId)))

        await db.update(users)
          .set({
            accountStatus: 'active',
            deactivatedAt: null,
            deactivationReason: null,
            updatedAt: now,
          })
          .where(eq(users.id, targetUser.id))

        log.info('Member reactivated in organization', { orgId, targetUserId: targetUser.id, role })
        return apiSuccess({ userId: targetUser.id, email, role, status: 'active' }, 200)
      }

      await db.insert(orgMemberships).values({
        userId: targetUser.id,
        orgId,
        role: role as OrgRole,
        status: 'active',
        invitedBy: userId,
      })

      log.info('Member added to organization', { orgId, targetUserId: targetUser.id, role })

      return apiSuccess({ userId: targetUser.id, email, role }, 201)
    } else {
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)

      const [invitation] = await db.insert(orgInvitations).values({
        orgId,
        email,
        role: role as OrgRole,
        status: 'pending',
        invitedBy: userId,
        expiresAt,
      }).returning()

      log.info('Invitation created', { orgId, email, invitationId: invitation.id })

      return apiSuccess({ invitationId: invitation.id, email, role }, 201)
    }
  } catch (error) {
    log.error('Failed to invite member', error)
    return ApiErrors.internalError('Failed to invite member')
  }
}

/**
 * PATCH /api/organizations/[orgId]/members
 * Update a member's role
 *
 * Access: org_admin OR super_admin
 * Body: { userId, role: OrgRole }
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
    const currentUserId = session.user.id
    const userRole = session.user.role

    if (!isSuperAdmin(userRole)) {
      const membership = await getOrgMembership(currentUserId, orgId)
      if (!membership) {
        return ApiErrors.notFound('Organization')
      }

      if (!hasOrgPermission(membership.role, Permissions.USERS_MANAGE)) {
        return ApiErrors.forbidden('org_admin role required to update member roles')
      }
    }

    const body = await request.json()
    const { userId: targetUserId, role } = body

    const validation = validateRequired(body, ['userId', 'role'])
    if (!validation.valid) {
      return ApiErrors.badRequest(
        `Missing required fields: ${validation.missing.join(', ')}`
      )
    }

    if (!isValidOrgRole(role)) {
      return ApiErrors.badRequest('Invalid role. Must be one of: org_admin, org_editor, org_viewer')
    }

    const [currentAdminCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orgMemberships)
      .where(
        and(
          eq(orgMemberships.orgId, orgId),
          eq(orgMemberships.role, 'org_admin'),
          eq(orgMemberships.status, 'active')
        )
      )

    if (currentAdminCount.count === 1) {
      const [targetMembership] = await db
        .select()
        .from(orgMemberships)
        .where(and(eq(orgMemberships.userId, targetUserId), eq(orgMemberships.orgId, orgId)))
        .limit(1)

      if (targetMembership?.role === 'org_admin' && role !== 'org_admin') {
        return ApiErrors.badRequest('Cannot demote the last org_admin')
      }
    }

    const [updatedMembership] = await db
      .update(orgMemberships)
      .set({ role: role as OrgRole })
      .where(
        and(
          eq(orgMemberships.userId, targetUserId),
          eq(orgMemberships.orgId, orgId),
          eq(orgMemberships.status, 'active')
        )
      )
      .returning()

    if (!updatedMembership) {
      return ApiErrors.notFound('Member not found in this organization')
    }

    log.info('Member role updated', { orgId, targetUserId, newRole: role })

    return apiSuccess(updatedMembership)
  } catch (error) {
    log.error('Failed to update member role', error)
    return ApiErrors.internalError('Failed to update member role')
  }
}

/**
 * DELETE /api/organizations/[orgId]/members
 * Offboard a member from the organization
 *
 * Access: org_admin OR super_admin
 * Body or query: { userId }
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  try {
    const session = await auth()
    if (!session?.user) {
      return ApiErrors.unauthorized()
    }

    const { orgId } = await context.params
    const currentUserId = session.user.id
    const userRole = session.user.role

    if (!isSuperAdmin(userRole)) {
      const membership = await getOrgMembership(currentUserId, orgId)
      if (!membership) {
        return ApiErrors.notFound('Organization')
      }

      if (!hasOrgPermission(membership.role, Permissions.USERS_MANAGE)) {
        return ApiErrors.forbidden('org_admin role required to remove members')
      }
    }

    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('userId')
    const reason = searchParams.get('reason')?.trim() || 'organization offboarding'

    if (!targetUserId) {
      return ApiErrors.badRequest('userId is required')
    }

    const [currentAdminCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orgMemberships)
      .where(
        and(
          eq(orgMemberships.orgId, orgId),
          eq(orgMemberships.role, 'org_admin'),
          eq(orgMemberships.status, 'active')
        )
      )

    if (currentAdminCount.count === 1) {
      const [targetMembership] = await db
        .select()
        .from(orgMemberships)
        .where(and(eq(orgMemberships.userId, targetUserId), eq(orgMemberships.orgId, orgId)))
        .limit(1)

      if (targetMembership?.role === 'org_admin') {
        return ApiErrors.badRequest('Cannot remove the last org_admin')
      }
    }

    const now = new Date()
    const [offboarded] = await db
      .update(orgMemberships)
      .set({
        status: 'offboarded',
        endedAt: now,
        deactivatedBy: currentUserId,
        deactivationReason: reason,
      })
      .where(
        and(
          eq(orgMemberships.userId, targetUserId),
          eq(orgMemberships.orgId, orgId),
          eq(orgMemberships.status, 'active')
        )
      )
      .returning()

    if (!offboarded) {
      return ApiErrors.notFound('Member not found in this organization')
    }

    const [remaining] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orgMemberships)
      .where(and(eq(orgMemberships.userId, targetUserId), eq(orgMemberships.status, 'active')))

    // 마지막 활성 소속까지 종료된 경우에만 계정 전체와 개인 OAuth 자격을 막는다.
    if ((remaining?.count ?? 0) === 0) {
      await Promise.all([
        db.update(users)
          .set({
            accountStatus: 'suspended',
            deactivatedAt: now,
            deactivationReason: reason,
            updatedAt: now,
          })
          .where(eq(users.id, targetUserId)),
        db.update(oauthAccessTokens)
          .set({ isActive: false })
          .where(eq(oauthAccessTokens.userId, targetUserId)),
        db.update(oauthRefreshTokens)
          .set({
            isActive: false,
            revokedAt: now,
            revokeReason: 'offboarded',
          })
          .where(eq(oauthRefreshTokens.userId, targetUserId)),
        db.delete(oauthCodes).where(eq(oauthCodes.userId, targetUserId)),
      ])
    }

    log.info('Member offboarded from organization', {
      orgId,
      targetUserId,
      accountSuspended: (remaining?.count ?? 0) === 0,
    })

    return NextResponse.json({
      success: true,
      status: 'offboarded',
      accountSuspended: (remaining?.count ?? 0) === 0,
    })
  } catch (error) {
    log.error('Failed to remove member', error)
    return ApiErrors.internalError('Failed to remove member')
  }
}
