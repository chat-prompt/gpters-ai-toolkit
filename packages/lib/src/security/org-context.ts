/**
 * Organization context utilities for server-side org validation and cookie management
 *
 * Provides utilities to:
 * - Get/set current organization ID from cookies
 * - Validate user access to organizations
 * - Retrieve organization membership with role
 */

import { db, orgMemberships } from '@gpters/db'
import { eq, and } from 'drizzle-orm'
import { isSuperAdmin, type OrgRole } from './rbac'
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'

/**
 * Cookie name for storing current organization ID
 */
export const ORG_COOKIE_NAME = 'x-current-org-id'

/**
 * Cookie configuration for organization context
 */
const COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 30, // 30 days
}

/**
 * Get current organization ID from cookie or session
 *
 * @param cookies - Request cookies (Next.js cookies() or request.cookies)
 * @returns Organization ID if present, undefined otherwise
 */
export function getCurrentOrgId(
  cookies: ReadonlyRequestCookies | { get: (name: string) => { value: string } | undefined }
): string | undefined {
  const cookie = cookies.get(ORG_COOKIE_NAME)
  return cookie?.value
}

/**
 * Set current organization in cookie
 *
 * @param orgId - Organization ID to set
 * @returns Set-Cookie header value
 */
export function setCurrentOrgCookie(orgId: string): string {
  const options = COOKIE_OPTIONS
  const parts: string[] = [
    `${ORG_COOKIE_NAME}=${orgId}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAge}`,
    `SameSite=${options.sameSite}`,
  ]

  if (options.httpOnly) {
    parts.push('HttpOnly')
  }

  if (options.secure) {
    parts.push('Secure')
  }

  return parts.join('; ')
}

/**
 * Clear current organization cookie
 *
 * @returns Set-Cookie header value to clear the cookie
 */
export function clearCurrentOrgCookie(): string {
  return `${ORG_COOKIE_NAME}=; Path=/; Max-Age=0`
}

/**
 * Validate user has access to organization
 *
 * Super admins bypass membership check and have access to all organizations.
 * Other users must have an active membership in the organization.
 *
 * @param userId - User ID to validate
 * @param orgId - Organization ID to validate access to
 * @param userRole - Optional user role for super admin check
 * @returns Promise resolving to true if user has access, false otherwise
 */
export async function validateOrgAccess(
  userId: string,
  orgId: string,
  userRole?: string
): Promise<boolean> {
  // Super admins have access to all organizations
  if (userRole && isSuperAdmin(userRole as any)) {
    return true
  }

  // Check if user has membership in the organization
  const membership = await getOrgMembership(userId, orgId)
  return membership !== null
}

/**
 * Get user's organization membership with role
 *
 * @param userId - User ID to query
 * @param orgId - Organization ID to query
 * @returns Promise resolving to membership with role, or null if not a member
 */
export async function getOrgMembership(
  userId: string,
  orgId: string
): Promise<{ orgId: string; role: OrgRole } | null> {
  const [membership] = await db
    .select({
      orgId: orgMemberships.orgId,
      role: orgMemberships.role,
    })
    .from(orgMemberships)
    .where(and(eq(orgMemberships.userId, userId), eq(orgMemberships.orgId, orgId)))
    .limit(1)

  if (!membership) {
    return null
  }

  return {
    orgId: membership.orgId,
    role: membership.role as OrgRole,
  }
}
