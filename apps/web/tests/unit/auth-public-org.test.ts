/**
 * Tests for public organization fallback in authentication flow
 *
 * Verifies that external (non-@gpters.org) Google users are automatically
 * enrolled into the 'public' organization on first login, while existing
 * domain-matched users are unaffected.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UserRole, OrgRole } from '@gpters/lib/security'

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}

const mockSelect = {
  from: vi.fn(),
}

const mockFrom = {
  where: vi.fn(),
}

const mockWhere = {
  limit: vi.fn(),
}

const mockInsert = {
  values: vi.fn(),
}

const mockUpdate = {
  set: vi.fn(),
}

const mockSet = {
  where: vi.fn(),
}

vi.mock('@gpters/db', () => ({
  db: mockDb,
  users: { id: 'id', email: 'email', role: 'role', name: 'name', image: 'image', lastLoginAt: 'lastLoginAt', updatedAt: 'updatedAt' },
  organizations: { id: 'id', slug: 'slug', allowedDomains: 'allowedDomains', isActive: 'isActive' },
  orgMemberships: { userId: 'userId', orgId: 'orgId', role: 'role' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ type: 'eq', field, value })),
  and: vi.fn((...conditions) => ({ type: 'and', conditions })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ type: 'sql', strings, values })),
}))

vi.mock('@gpters/lib/core', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

/**
 * Simulates the signIn callback logic from auth-config.ts
 *
 * Extracted to test the public org fallback behavior without
 * importing NextAuth internals.
 *
 * @param email - User email address
 * @returns Whether login is allowed
 */
async function simulateSignIn(email: string): Promise<boolean> {
  if (!email) return false
  const domain = email.split('@')[1]
  if (!domain) return false

  // Step 1: Find domain-matched orgs
  const matchingOrgs = await mockDb
    .select()
    .from('organizations')
    .where({ domain })
    .limit(0) as Array<{ id: string; slug: string; isActive: boolean }>

  // Step 2: Public org fallback
  if (matchingOrgs.length === 0) {
    const publicOrgResults = await mockDb
      .select()
      .from('organizations')
      .where({ slug: 'public', isActive: true })
      .limit(1) as Array<{ id: string; slug: string; isActive: boolean }>

    if (publicOrgResults.length === 0) {
      return false
    }
    matchingOrgs.push(publicOrgResults[0])
  }

  // Step 3: Create/update user + memberships (simplified)
  const existingUser = await mockDb
    .select()
    .from('users')
    .where({ email })
    .limit(1) as Array<{ id: string; role: UserRole }>

  const userId = existingUser.length > 0
    ? existingUser[0].id
    : 'new-user-id'

  if (existingUser.length === 0) {
    await mockDb.insert('users').values({
      id: userId,
      email,
      role: 'viewer' as UserRole,
    })
  }

  for (const org of matchingOrgs) {
    const existing = await mockDb
      .select()
      .from('orgMemberships')
      .where({ userId, orgId: org.id })
      .limit(1) as Array<{ userId: string; orgId: string }>

    if (existing.length === 0) {
      await mockDb.insert('orgMemberships').values({
        userId,
        orgId: org.id,
        role: 'org_viewer' as OrgRole,
      })
    }
  }

  return true
}

describe('Auth Public Organization Fallback', () => {
  const PUBLIC_ORG = {
    id: 'public-org-id',
    slug: 'public',
    name: 'Public',
    allowedDomains: [],
    isActive: true,
  }

  const GPTERS_ORG = {
    id: 'gpters-org-id',
    slug: 'gpters',
    name: 'GPTers',
    allowedDomains: ['gpters.org'],
    isActive: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.select.mockReturnValue(mockSelect)
    mockSelect.from.mockReturnValue(mockFrom)
    mockFrom.where.mockReturnValue(mockWhere)
    mockWhere.limit.mockReturnValue(Promise.resolve([]))
    mockDb.insert.mockReturnValue(mockInsert)
    mockInsert.values.mockReturnValue(Promise.resolve())
    mockDb.update.mockReturnValue(mockUpdate)
    mockUpdate.set.mockReturnValue(mockSet)
    mockSet.where.mockReturnValue(Promise.resolve())
  })

  describe('External domain user login with public org', () => {
    it('should allow login for external user when public org exists', async () => {
      // 1st call: domain-matched orgs → empty
      mockWhere.limit.mockResolvedValueOnce([])
      // 2nd call: public org lookup → found
      mockWhere.limit.mockResolvedValueOnce([PUBLIC_ORG])
      // 3rd call: existing user lookup → not found
      mockWhere.limit.mockResolvedValueOnce([])
      // 4th call: existing membership check → not found
      mockWhere.limit.mockResolvedValueOnce([])

      const result = await simulateSignIn('beta@example.com')

      expect(result).toBe(true)
      // Should have created user and membership
      expect(mockInsert.values).toHaveBeenCalledTimes(2)
    })

    it('should deny login for external user when public org does not exist', async () => {
      // 1st call: domain-matched orgs → empty
      mockWhere.limit.mockResolvedValueOnce([])
      // 2nd call: public org lookup → not found
      mockWhere.limit.mockResolvedValueOnce([])

      const result = await simulateSignIn('beta@example.com')

      expect(result).toBe(false)
      expect(mockInsert.values).not.toHaveBeenCalled()
    })

    it('should enroll external user into public org membership', async () => {
      // 1st: domain orgs → empty
      mockWhere.limit.mockResolvedValueOnce([])
      // 2nd: public org → found
      mockWhere.limit.mockResolvedValueOnce([PUBLIC_ORG])
      // 3rd: existing user → not found (new user)
      mockWhere.limit.mockResolvedValueOnce([])
      // 4th: existing membership → not found
      mockWhere.limit.mockResolvedValueOnce([])

      await simulateSignIn('external@gmail.com')

      // Verify membership was created with public org
      expect(mockInsert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: 'public-org-id',
          role: 'org_viewer',
        })
      )
    })
  })

  describe('Existing @gpters.org user is unaffected', () => {
    it('should match gpters.org user to GPTers org without touching public org', async () => {
      // 1st call: domain-matched orgs → GPTers org found
      mockWhere.limit.mockResolvedValueOnce([GPTERS_ORG])
      // 2nd call: existing user → found
      mockWhere.limit.mockResolvedValueOnce([{ id: 'gpters-user', role: 'editor' }])
      // 3rd call: existing membership → found (already a member)
      mockWhere.limit.mockResolvedValueOnce([{ userId: 'gpters-user', orgId: 'gpters-org-id' }])

      const result = await simulateSignIn('user@gpters.org')

      expect(result).toBe(true)
      // Public org lookup should never happen (domain matched)
      // Only 3 limit calls, not 4+
      expect(mockWhere.limit).toHaveBeenCalledTimes(3)
    })

    it('should not create new membership for existing gpters.org member', async () => {
      // 1st: domain orgs → GPTers org
      mockWhere.limit.mockResolvedValueOnce([GPTERS_ORG])
      // 2nd: existing user → exists
      mockWhere.limit.mockResolvedValueOnce([{ id: 'gpters-user', role: 'viewer' }])
      // 3rd: existing membership → exists
      mockWhere.limit.mockResolvedValueOnce([{ userId: 'gpters-user', orgId: 'gpters-org-id' }])

      await simulateSignIn('user@gpters.org')

      // No insert for membership (already exists)
      expect(mockInsert.values).not.toHaveBeenCalled()
    })
  })

  describe('Edge cases', () => {
    it('should deny login for email without domain part', async () => {
      const result = await simulateSignIn('nodomain')
      expect(result).toBe(false)
    })

    it('should deny login for empty email', async () => {
      const result = await simulateSignIn('')
      expect(result).toBe(false)
    })

    it('should handle inactive public org gracefully', async () => {
      // 1st: domain orgs → empty
      mockWhere.limit.mockResolvedValueOnce([])
      // 2nd: public org → not found (inactive ones filtered out by query)
      mockWhere.limit.mockResolvedValueOnce([])

      const result = await simulateSignIn('beta@external.com')
      expect(result).toBe(false)
    })

    it('should handle returning external user who already has public org membership', async () => {
      // 1st: domain orgs → empty
      mockWhere.limit.mockResolvedValueOnce([])
      // 2nd: public org → found
      mockWhere.limit.mockResolvedValueOnce([PUBLIC_ORG])
      // 3rd: existing user → found (returning user)
      mockWhere.limit.mockResolvedValueOnce([{ id: 'returning-user', role: 'viewer' }])
      // 4th: existing membership → found (already enrolled)
      mockWhere.limit.mockResolvedValueOnce([{ userId: 'returning-user', orgId: 'public-org-id' }])

      const result = await simulateSignIn('returning@gmail.com')

      expect(result).toBe(true)
      // No new membership created
      expect(mockInsert.values).not.toHaveBeenCalled()
    })
  })
})
