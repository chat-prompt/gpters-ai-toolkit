/**
 * Organization management API route
 *
 * GET: List organizations (filtered by user access)
 * POST: Create new organization (super_admin only)
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { organizations, orgMemberships } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { ApiErrors, apiSuccess, validateRequired } from '@/lib/utils/api-utils'
import { createLogger } from '@/lib/core/logger'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import { requireSuperAdmin, isSuperAdmin } from '@/lib/security/rbac'
import { auth } from '@/lib/core/auth'

const log = createLogger('api:organizations')

/** Development bypass check */
const DEV_BYPASS_AUTH = process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true'

/**
 * GET /api/organizations
 * List organizations accessible to the current user
 *
 * - super_admin: Returns all organizations
 * - Regular user: Returns only organizations they belong to
 */
export async function GET(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.standard)
  if (rateLimitError) return rateLimitError

  try {
    const session = await auth()
    if (!session?.user) {
      if (DEV_BYPASS_AUTH) {
        const allOrgs = await db.select().from(organizations)
        return NextResponse.json({ organizations: allOrgs, total: allOrgs.length })
      }
      return ApiErrors.unauthorized()
    }

    const userId = session.user.id
    const userRole = session.user.role

    let orgList

    if (isSuperAdmin(userRole)) {
      // Super admin: get all orgs with their role (if they're a member)
      const allOrgs = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          description: organizations.description,
          allowedDomains: organizations.allowedDomains,
          isActive: organizations.isActive,
          createdAt: organizations.createdAt,
          updatedAt: organizations.updatedAt,
        })
        .from(organizations)

      // Get memberships for super admin
      const memberships = await db
        .select({ orgId: orgMemberships.orgId, role: orgMemberships.role })
        .from(orgMemberships)
        .where(eq(orgMemberships.userId, userId))

      const membershipMap = new Map(memberships.map(m => [m.orgId, m.role]))

      orgList = allOrgs.map(org => ({
        ...org,
        role: membershipMap.get(org.id) || 'org_viewer',
      }))
    } else {
      // Regular user: get only orgs they belong to with their role
      const memberships = await db
        .select({ 
          orgId: orgMemberships.orgId,
          role: orgMemberships.role,
        })
        .from(orgMemberships)
        .where(eq(orgMemberships.userId, userId))

      const orgIds = memberships.map(m => m.orgId)

      if (orgIds.length === 0) {
        return NextResponse.json({ organizations: [], total: 0 })
      }

      const orgs = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          description: organizations.description,
          allowedDomains: organizations.allowedDomains,
          isActive: organizations.isActive,
          createdAt: organizations.createdAt,
          updatedAt: organizations.updatedAt,
        })
        .from(organizations)
        .where(inArray(organizations.id, orgIds))

      const membershipMap = new Map(memberships.map(m => [m.orgId, m.role]))

      orgList = orgs.map(org => ({
        ...org,
        role: membershipMap.get(org.id) || 'org_viewer',
      }))
    }

    return NextResponse.json({
      organizations: orgList,
      total: orgList.length,
    })
  } catch (error) {
    log.error('Failed to fetch organizations', error)
    return ApiErrors.internalError('Failed to fetch organizations')
  }
}

/**
 * POST /api/organizations
 * Create a new organization (super_admin only)
 *
 * Body: { name, slug, description?, allowedDomains: string[] }
 */
export async function POST(request: NextRequest) {
  const rateLimitError = withRateLimit(request, RateLimitPresets.admin)
  if (rateLimitError) return rateLimitError

  const permissionError = await requireSuperAdmin()
  if (permissionError) return permissionError

  try {
    const body = await request.json()
    const { name, slug, description, allowedDomains } = body

    const validation = validateRequired(body, ['name', 'slug', 'allowedDomains'])
    if (!validation.valid) {
      return ApiErrors.badRequest(
        `Missing required fields: ${validation.missing.join(', ')}`
      )
    }

    if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) {
      return ApiErrors.badRequest('allowedDomains must be a non-empty array')
    }

    const [existingOrg] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1)

    if (existingOrg) {
      return ApiErrors.conflict(`Organization with slug "${slug}" already exists`)
    }

    const [newOrg] = await db
      .insert(organizations)
      .values({
        name,
        slug,
        description: description || null,
        allowedDomains,
        isActive: true,
      })
      .returning()

    log.info('Organization created', { orgId: newOrg.id, slug: newOrg.slug })

    return apiSuccess(newOrg, 201)
  } catch (error) {
    log.error('Failed to create organization', error)
    return ApiErrors.internalError('Failed to create organization')
  }
}
