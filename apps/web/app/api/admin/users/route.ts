/**
 * Admin user management API route
 *
 * GET: List all users with roles and stats
 * PATCH: Update user role
 * Requires USERS_VIEW/USERS_EDIT permissions
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { ApiErrors, apiSuccess } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { requirePermission, Permissions, isValidRole, type UserRole } from '@/lib/security/rbac'

const log = createLogger('api:admin:users')

/**
 * GET /api/admin/users
 * List all users (requires USERS_VIEW permission)
 */
export async function GET(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  const permissionError = await requirePermission(Permissions.USERS_VIEW)
  if (permissionError) return permissionError

  try {
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
        role: users.role,
        accountStatus: users.accountStatus,
        deactivatedAt: users.deactivatedAt,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .orderBy(desc(users.lastLoginAt))

    return NextResponse.json(allUsers)
  } catch (error) {
    log.error('Failed to fetch users', error)
    return ApiErrors.internalError('Failed to fetch users')
  }
}

/**
 * PATCH /api/admin/users
 * Update user role (requires USERS_MANAGE permission)
 */
export async function PATCH(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  const permissionError = await requirePermission(Permissions.USERS_MANAGE)
  if (permissionError) return permissionError

  try {
    const body = await request.json()
    const { userId, role } = body

    if (!userId || typeof userId !== 'string') {
      return ApiErrors.badRequest('Missing or invalid userId')
    }

    if (!role || !isValidRole(role)) {
      return ApiErrors.badRequest('Invalid role. Must be one of: admin, editor, viewer')
    }

    // Check if user exists
    const [existingUser] = await db.select().from(users).where(eq(users.id, userId))
    if (!existingUser) {
      return ApiErrors.notFound('User')
    }

    // Update user role
    await db.update(users)
      .set({
        role: role as UserRole,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))

    const [updatedUser] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
        role: users.role,
        accountStatus: users.accountStatus,
        deactivatedAt: users.deactivatedAt,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, userId))

    log.info('User role updated', { userId, newRole: role })

    return apiSuccess(updatedUser)
  } catch (error) {
    log.error('Failed to update user role', error)
    return ApiErrors.internalError('Failed to update user role')
  }
}
