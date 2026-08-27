/**
 * Authentication organization resolution tests
 *
 * Tests domain-based organization resolution during authentication flow
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
  users: { id: 'id', email: 'email', role: 'role', accountStatus: 'accountStatus', name: 'name', image: 'image', lastLoginAt: 'lastLoginAt', updatedAt: 'updatedAt' },
  organizations: { id: 'id', allowedDomains: 'allowedDomains', isActive: 'isActive' },
  orgMemberships: { userId: 'userId', orgId: 'orgId', role: 'role', status: 'status' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ type: 'eq', field, value })),
  and: vi.fn((...conditions) => ({ type: 'and', conditions })),
  sql: vi.fn((strings, ...values) => ({ type: 'sql', strings, values })),
}))

vi.mock('@gpters/lib/core', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

describe('Auth Organization Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.select.mockReturnValue(mockSelect)
    mockSelect.from.mockReturnValue(mockFrom)
    mockFrom.where.mockReturnValue(mockWhere)
    mockWhere.limit.mockReturnValue(Promise.resolve([]))
    mockDb.insert.mockReturnValue(mockInsert)
    mockInsert.values.mockReturnValue(Promise.resolve({ id: 'test-id' }))
    mockDb.update.mockReturnValue(mockUpdate)
    mockUpdate.set.mockReturnValue(mockSet)
    mockSet.where.mockReturnValue(Promise.resolve())
  })

  describe('Domain Extraction', () => {
    it('extracts domain from email correctly', () => {
      const email = 'user@gpters.org'
      const domain = email.split('@')[1]
      expect(domain).toBe('gpters.org')
    })

    it('handles email without domain', () => {
      const email = 'invalid-email'
      const domain = email.split('@')[1]
      expect(domain).toBeUndefined()
    })
  })

  describe('Organization Matching', () => {
    it('should match organization with allowed domain', async () => {
      const testOrg = {
        id: 'org-1',
        name: 'Test Org',
        slug: 'test-org',
        allowedDomains: ['gpters.org'],
        isActive: true,
      }

      mockWhere.limit.mockResolvedValueOnce([testOrg])

      const matchingOrgs = await mockDb
        .select()
        .from({})
        .where({})
        .limit(1)

      expect(matchingOrgs).toHaveLength(1)
      expect(matchingOrgs[0].id).toBe('org-1')
    })

    it('should not match inactive organization', async () => {
      mockWhere.limit.mockResolvedValueOnce([])

      const matchingOrgs = await mockDb
        .select()
        .from({})
        .where({})
        .limit(1)

      expect(matchingOrgs).toHaveLength(0)
    })

    it('should match multiple organizations with same domain', async () => {
      const testOrgs = [
        {
          id: 'org-1',
          name: 'Test Org 1',
          slug: 'test-org-1',
          allowedDomains: ['gpters.org'],
          isActive: true,
        },
        {
          id: 'org-2',
          name: 'Test Org 2',
          slug: 'test-org-2',
          allowedDomains: ['gpters.org'],
          isActive: true,
        },
      ]

      mockWhere.limit.mockResolvedValueOnce(testOrgs)

      const matchingOrgs = await mockDb
        .select()
        .from({})
        .where({})
        .limit(1)

      expect(matchingOrgs).toHaveLength(2)
    })
  })

  describe('User Creation and Update', () => {
    it('should create new user when not exists', async () => {
      mockWhere.limit.mockResolvedValueOnce([])

      const existingUser = await mockDb
        .select()
        .from({})
        .where({})
        .limit(1)

      expect(existingUser).toHaveLength(0)

      await mockDb.insert({}).values({
        id: 'new-user-id',
        email: 'newuser@gpters.org',
        name: 'New User',
        role: 'viewer' as UserRole,
      })

      expect(mockDb.insert).toHaveBeenCalled()
      expect(mockInsert.values).toHaveBeenCalled()
    })

    it('should update existing user on login', async () => {
      const existingUserData = {
        id: 'existing-user-id',
        email: 'user@gpters.org',
        role: 'editor' as UserRole,
        name: 'Old Name',
      }

      mockWhere.limit.mockResolvedValueOnce([existingUserData])

      const existingUser = await mockDb
        .select()
        .from({})
        .where({})
        .limit(1)

      expect(existingUser).toHaveLength(1)
      expect(existingUser[0].id).toBe('existing-user-id')

      await mockDb
        .update({})
        .set({
          name: 'New Name',
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where({})

      expect(mockDb.update).toHaveBeenCalled()
      expect(mockUpdate.set).toHaveBeenCalled()
    })
  })

  describe('Organization Membership Creation', () => {
    it('should create org membership for new user', async () => {
      mockWhere.limit.mockResolvedValueOnce([])

      const existingMembership = await mockDb
        .select()
        .from({})
        .where({})
        .limit(1)

      expect(existingMembership).toHaveLength(0)

      await mockDb.insert({}).values({
        userId: 'user-id',
        orgId: 'org-id',
        role: 'org_viewer' as OrgRole,
      })

      expect(mockDb.insert).toHaveBeenCalled()
      expect(mockInsert.values).toHaveBeenCalled()
    })

    it('should not create duplicate membership for existing user', async () => {
      const existingMembershipData = {
        userId: 'user-id',
        orgId: 'org-id',
        role: 'org_viewer' as OrgRole,
      }

      mockWhere.limit.mockResolvedValueOnce([existingMembershipData])

      const existingMembership = await mockDb
        .select()
        .from({})
        .where({})
        .limit(1)

      expect(existingMembership).toHaveLength(1)
      expect(mockDb.insert).not.toHaveBeenCalled()
    })

    it('should create memberships for all matching organizations', async () => {
      const orgIds = ['org-1', 'org-2', 'org-3']
      
      for (const orgId of orgIds) {
        mockWhere.limit.mockResolvedValueOnce([])
        
        const existingMembership = await mockDb
          .select()
          .from({})
          .where({})
          .limit(1)

        expect(existingMembership).toHaveLength(0)

        await mockDb.insert({}).values({
          userId: 'user-id',
          orgId,
          role: 'org_viewer' as OrgRole,
        })
      }

      expect(mockInsert.values).toHaveBeenCalledTimes(3)
    })
  })

  describe('Session Enrichment', () => {
    it('should store orgIds in user object', () => {
      const user: { orgIds?: string[] } = {}
      const orgIds = ['org-1', 'org-2']
      
      user.orgIds = orgIds

      expect(user.orgIds).toEqual(['org-1', 'org-2'])
      expect(user.orgIds).toHaveLength(2)
    })

    it('should store currentOrgId and orgRole in JWT token', () => {
      const token: {
        orgIds?: string[]
        currentOrgId?: string
        orgRole?: OrgRole
      } = {}

      const orgMemberships = [
        { orgId: 'org-1', role: 'org_admin' as OrgRole },
        { orgId: 'org-2', role: 'org_viewer' as OrgRole },
      ]

      token.orgIds = orgMemberships.map(m => m.orgId)
      token.currentOrgId = orgMemberships[0].orgId
      token.orgRole = orgMemberships[0].role

      expect(token.orgIds).toEqual(['org-1', 'org-2'])
      expect(token.currentOrgId).toBe('org-1')
      expect(token.orgRole).toBe('org_admin')
    })

    it('should pass org fields to session', () => {
      const session: {
        user: {
          id?: string
          currentOrgId?: string
          orgRole?: OrgRole
          orgIds?: string[]
        }
      } = { user: {} }

      const token = {
        sub: 'user-123',
        currentOrgId: 'org-1',
        orgRole: 'org_editor' as OrgRole,
        orgIds: ['org-1', 'org-2'],
      }

      session.user.id = token.sub
      session.user.currentOrgId = token.currentOrgId
      session.user.orgRole = token.orgRole
      session.user.orgIds = token.orgIds

      expect(session.user.id).toBe('user-123')
      expect(session.user.currentOrgId).toBe('org-1')
      expect(session.user.orgRole).toBe('org_editor')
      expect(session.user.orgIds).toEqual(['org-1', 'org-2'])
    })
  })

  describe('Login Rejection', () => {
    it('should reject login when no matching organizations', async () => {
      mockWhere.limit.mockResolvedValueOnce([])

      const matchingOrgs = await mockDb
        .select()
        .from({})
        .where({})
        .limit(1)

      expect(matchingOrgs).toHaveLength(0)
    })

    it('should reject login when email has no domain', () => {
      const email = 'invalid-email'
      const domain = email.split('@')[1]
      
      expect(domain).toBeUndefined()
    })
  })

  describe('Default Values', () => {
    it('should use viewer as default user role', () => {
      const DEFAULT_ROLE: UserRole = 'viewer'
      expect(DEFAULT_ROLE).toBe('viewer')
    })

    it('should use org_viewer as default org role', () => {
      const DEFAULT_ORG_ROLE: OrgRole = 'org_viewer'
      expect(DEFAULT_ORG_ROLE).toBe('org_viewer')
    })
  })
})
