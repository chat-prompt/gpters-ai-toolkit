/**
 * Organization domains management API route
 *
 * GET: List allowed domains
 * POST: Add domain
 * DELETE: Remove domain
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { organizations } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ApiErrors, apiSuccess, validateRequired } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { isSuperAdmin, hasOrgPermission, Permissions } from '@/lib/security/rbac'
import { getOrgMembership } from '@/lib/security/org-context'
import { auth } from '@/lib/core/auth'

const log = createLogger('api:organizations:domains')

interface RouteContext {
  params: Promise<{ orgId: string }>
}

/**
 * GET /api/organizations/[orgId]/domains
 * List allowed domains for the organization
 *
 * Access: org_admin OR super_admin
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

    if (!isSuperAdmin(userRole)) {
      const membership = await getOrgMembership(userId, orgId)
      if (!membership) {
        return ApiErrors.notFound('Organization')
      }

      if (!hasOrgPermission(membership.role, Permissions.USERS_MANAGE)) {
        return ApiErrors.forbidden('org_admin role required to view domains')
      }
    }

    const [org] = await db
      .select({ allowedDomains: organizations.allowedDomains })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1)

    if (!org) {
      return ApiErrors.notFound('Organization')
    }

    return NextResponse.json({ domains: org.allowedDomains || [] })
  } catch (error) {
    log.error('Failed to fetch domains', error)
    return ApiErrors.internalError('Failed to fetch domains')
  }
}

/**
 * POST /api/organizations/[orgId]/domains
 * Add a domain to the allowed domains list
 *
 * Access: org_admin OR super_admin
 * Body: { domain: string }
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
        return ApiErrors.forbidden('org_admin role required to add domains')
      }
    }

    const body = await request.json()
    const { domain } = body

    const validation = validateRequired(body, ['domain'])
    if (!validation.valid) {
      return ApiErrors.badRequest('Missing required field: domain')
    }

    if (typeof domain !== 'string' || domain.trim().length === 0) {
      return ApiErrors.badRequest('domain must be a non-empty string')
    }

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1)

    if (!org) {
      return ApiErrors.notFound('Organization')
    }

    const currentDomains = (org.allowedDomains || []) as string[]

    if (currentDomains.includes(domain)) {
      return ApiErrors.conflict('Domain already exists in allowed domains')
    }

    const newDomains = [...currentDomains, domain]

    const [updatedOrg] = await db
      .update(organizations)
      .set({
        allowedDomains: newDomains,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, orgId))
      .returning()

    log.info('Domain added to organization', { orgId, domain })

    return apiSuccess({ domains: updatedOrg.allowedDomains }, 201)
  } catch (error) {
    log.error('Failed to add domain', error)
    return ApiErrors.internalError('Failed to add domain')
  }
}

/**
 * DELETE /api/organizations/[orgId]/domains
 * Remove a domain from the allowed domains list
 *
 * Access: org_admin OR super_admin
 * Body or query: { domain: string }
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
    const userId = session.user.id
    const userRole = session.user.role

    if (!isSuperAdmin(userRole)) {
      const membership = await getOrgMembership(userId, orgId)
      if (!membership) {
        return ApiErrors.notFound('Organization')
      }

      if (!hasOrgPermission(membership.role, Permissions.USERS_MANAGE)) {
        return ApiErrors.forbidden('org_admin role required to remove domains')
      }
    }

    const { searchParams } = new URL(request.url)
    const domain = searchParams.get('domain')

    if (!domain) {
      return ApiErrors.badRequest('domain query parameter is required')
    }

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1)

    if (!org) {
      return ApiErrors.notFound('Organization')
    }

    const currentDomains = (org.allowedDomains || []) as string[]

    if (!currentDomains.includes(domain)) {
      return ApiErrors.notFound('Domain not found in allowed domains')
    }

    if (currentDomains.length === 1) {
      return ApiErrors.badRequest('Cannot remove the last domain')
    }

    const newDomains = currentDomains.filter(d => d !== domain)

    await db
      .update(organizations)
      .set({
        allowedDomains: newDomains,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, orgId))

    log.info('Domain removed from organization', { orgId, domain })

    return NextResponse.json({ success: true, domains: newDomains })
  } catch (error) {
    log.error('Failed to remove domain', error)
    return ApiErrors.internalError('Failed to remove domain')
  }
}
