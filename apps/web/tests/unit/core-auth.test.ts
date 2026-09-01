import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the db module
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockValues = vi.fn()
const mockSet = vi.fn()

// Chainable mock helpers
function createChainableSelect(result: () => Promise<unknown[]>) {
  return {
    from: () => ({
      where: () => ({
        limit: () => result(),
      }),
    }),
  }
}

function createSelectWithFields(result: () => Promise<unknown[]>) {
  return (fields?: unknown) => {
    if (fields) {
      // select({ id, role }) pattern — still chainable
      return {
        from: () => ({
          where: () => result(),
        }),
      }
    }
    // select() pattern — chainable with limit
    return createChainableSelect(result)
  }
}

// Track call order for select to return different results for different queries
let selectCallCount = 0
const selectResults: Array<() => Promise<unknown[]>> = []

function pushSelectResult(result: unknown[]) {
  selectResults.push(() => Promise.resolve(result))
}

function resetSelectResults() {
  selectCallCount = 0
  selectResults.length = 0
}

vi.mock('@gpters/db', () => ({
  db: {
    select: (...args: unknown[]) => {
      const idx = selectCallCount++
      const resolver = selectResults[idx] || (() => Promise.resolve([]))
      mockSelect()
      // Make result thenable so both .where() and .where().limit() work
      const makeResult = () => {
        const promise = resolver()
        // Return a thenable that also has .limit()
        return {
          then: (res: (v: unknown) => void, rej: (e: unknown) => void) => promise.then(res, rej),
          limit: () => resolver(),
        }
      }
      if (args.length > 0) {
        // select({ fields }) pattern
        return {
          from: () => ({
            where: makeResult,
          }),
        }
      }
      return {
        from: () => ({
          where: makeResult,
        }),
      }
    },
    insert: () => ({
      values: (data: unknown) => {
        mockValues(data)
        return mockInsert()
      },
    }),
    update: () => ({
      set: (data: unknown) => ({
        where: () => {
          mockSet(data)
          return mockUpdate()
        },
      }),
    }),
  },
  users: { email: 'users.email', id: 'users.id', role: 'users.role', accountStatus: 'users.accountStatus' },
  organizations: { allowedDomains: 'organizations.allowedDomains', isActive: 'organizations.isActive' },
  orgMemberships: { userId: 'orgMemberships.userId', orgId: 'orgMemberships.orgId', role: 'orgMemberships.role', status: 'orgMemberships.status' },
}))

vi.mock('drizzle-orm', async (importOriginal) => {
  const original = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...original,
    eq: vi.fn((field, value) => ({ field, value })),
    sql: vi.fn((...args: unknown[]) => ({ sql: args })),
    and: vi.fn((...args: unknown[]) => ({ and: args })),
  }
})

vi.mock('@gpters/lib/core', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@gpters/lib/security', () => ({
  // Types are erased at runtime, no need to mock them
}))

// Mock NextAuth
const mockSignInCallback = vi.fn()
const mockSessionCallback = vi.fn()
const mockJwtCallback = vi.fn()

vi.mock('next-auth', () => ({
  default: vi.fn((config) => {
    // Store callbacks for testing
    if (config.callbacks) {
      mockSignInCallback.mockImplementation(config.callbacks.signIn)
      mockSessionCallback.mockImplementation(config.callbacks.session)
      mockJwtCallback.mockImplementation(config.callbacks.jwt)
    }
    return {
      handlers: {},
      signIn: vi.fn(),
      signOut: vi.fn(),
      auth: vi.fn(),
    }
  }),
}))

vi.mock('next-auth/providers/google', () => ({
  default: vi.fn((config) => ({
    id: 'google',
    name: 'Google',
    ...config,
  })),
}))

// Mock react cache (used in auth.ts re-export)
vi.mock('react', () => ({
  cache: (fn: unknown) => fn,
}))

// Helper: mock org found for domain
const MOCK_ORG = { id: 'org-1', name: 'GPTers', allowedDomains: ['gpters.org'], isActive: true }

describe('Auth Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSelectResults()
    mockInsert.mockResolvedValue(undefined)
    mockUpdate.mockResolvedValue(undefined)
  })

  describe('Module Exports', () => {
    it('should export handlers', async () => {
      const authModule = await import('@/lib/core/auth')
      expect(authModule.handlers).toBeDefined()
    })

    it('should export signIn function', async () => {
      const authModule = await import('@/lib/core/auth')
      expect(authModule.signIn).toBeDefined()
    })

    it('should export signOut function', async () => {
      const authModule = await import('@/lib/core/auth')
      expect(authModule.signOut).toBeDefined()
    })

    it('should export auth function', async () => {
      const authModule = await import('@/lib/core/auth')
      expect(authModule.auth).toBeDefined()
    })
  })

  describe('Sign In Callback', () => {
    beforeEach(async () => {
      vi.resetModules()
      resetSelectResults()
      mockInsert.mockResolvedValue(undefined)
      mockUpdate.mockResolvedValue(undefined)
      // Re-import to trigger callback registration
      await import('@/lib/core/auth')
    })

    it('should reject sign in for users without email', async () => {
      const result = await mockSignInCallback({
        user: { id: 'user-1', name: 'Test' },
        account: { provider: 'google', providerAccountId: '123' },
      })

      expect(result).toBe(false)
    })

    it('should reject sign in when no matching org found', async () => {
      const result = await mockSignInCallback({
        user: { id: 'user-1', email: 'test@gmail.com', name: 'Test' },
        account: { provider: 'google', providerAccountId: '123' },
      })

      expect(result).toBe(false)
      expect(mockSelect).not.toHaveBeenCalled()
    })

    it('should allow sign in when matching org exists', async () => {
      // organizations query returns matching org
      pushSelectResult([MOCK_ORG])
      // users query returns empty (new user)
      pushSelectResult([])
      // orgMemberships query returns empty (new membership)
      pushSelectResult([])

      const result = await mockSignInCallback({
        user: { id: 'user-1', email: 'test@gpters.org', name: 'Test' },
        account: { provider: 'google', providerAccountId: '123' },
      })

      expect(result).toBe(true)
    })

    it('should create new user on first sign in', async () => {
      // organizations query
      pushSelectResult([MOCK_ORG])
      // users query (not found)
      pushSelectResult([])
      // orgMemberships query (not found)
      pushSelectResult([])

      await mockSignInCallback({
        user: { id: 'user-1', email: 'new@gpters.org', name: 'New User', image: 'https://example.com/avatar.jpg' },
        account: { provider: 'google', providerAccountId: '123' },
      })

      expect(mockValues).toHaveBeenCalled()
      const insertedData = mockValues.mock.calls[0][0]
      expect(insertedData.email).toBe('new@gpters.org')
      expect(insertedData.name).toBe('New User')
      expect(insertedData.role).toBe('viewer')
    })

    it('should update existing user on subsequent sign ins', async () => {
      // organizations query
      pushSelectResult([MOCK_ORG])
      // users query (found)
      pushSelectResult([{ id: 'existing-id', email: 'existing@gpters.org', role: 'admin', accountStatus: 'active' }])
      // orgMemberships query (already exists)
      pushSelectResult([{ userId: 'existing-id', orgId: 'org-1', role: 'org_viewer', status: 'active' }])

      await mockSignInCallback({
        user: { id: 'user-1', email: 'existing@gpters.org', name: 'Updated Name', image: 'https://example.com/new-avatar.jpg' },
        account: { provider: 'google', providerAccountId: '123' },
      })

      expect(mockSet).toHaveBeenCalled()
      const updatedData = mockSet.mock.calls[0][0]
      expect(updatedData.name).toBe('Updated Name')
      expect(updatedData.image).toBe('https://example.com/new-avatar.jpg')
    })

    it('should set user role from database for existing user', async () => {
      // organizations query
      pushSelectResult([MOCK_ORG])
      // users query (found with admin role)
      pushSelectResult([{ id: 'existing-id', email: 'admin@gpters.org', role: 'admin', accountStatus: 'active' }])
      // orgMemberships query (already exists)
      pushSelectResult([{ userId: 'existing-id', orgId: 'org-1', role: 'org_viewer', status: 'active' }])

      const user: { email: string; name: string; role?: string } = { email: 'admin@gpters.org', name: 'Admin' }
      await mockSignInCallback({
        user,
        account: { provider: 'google', providerAccountId: '123' },
      })

      expect(user.role).toBe('admin')
    })

    it('should set default viewer role for new users', async () => {
      // organizations query
      pushSelectResult([MOCK_ORG])
      // users query (not found)
      pushSelectResult([])
      // orgMemberships query (not found)
      pushSelectResult([])

      const user: { email: string; name: string; role?: string } = { email: 'new@gpters.org', name: 'New User' }
      await mockSignInCallback({
        user,
        account: { provider: 'google', providerAccountId: '123' },
      })

      expect(user.role).toBe('viewer')
    })

    it('should return false if database operation fails', async () => {
      // organizations query throws
      selectResults.push(() => Promise.reject(new Error('Database error')))

      const result = await mockSignInCallback({
        user: { id: 'user-1', email: 'test@gpters.org', name: 'Test' },
        account: { provider: 'google', providerAccountId: '123' },
      })

      // Current implementation returns false on DB failure
      expect(result).toBe(false)
    })
  })

  describe('Session Callback', () => {
    beforeEach(async () => {
      vi.resetModules()
      resetSelectResults()
      await import('@/lib/core/auth')
    })

    it('should add user id from token to session', async () => {
      const session = { user: {} }
      const token = { sub: 'user-id-123', role: 'viewer' }

      const result = await mockSessionCallback({ session, token })

      expect(result.user.id).toBe('user-id-123')
    })

    it('should add user role from token to session', async () => {
      const session = { user: {} }
      const token = { sub: 'user-id-123', role: 'admin' }

      const result = await mockSessionCallback({ session, token })

      expect(result.user.role).toBe('admin')
    })

    it('should add org context from token to session', async () => {
      const session = { user: {} }
      const token = { sub: 'user-id-123', role: 'viewer', currentOrgId: 'org-1', orgRole: 'org_admin', orgIds: ['org-1'] }

      const result = await mockSessionCallback({ session, token })

      expect(result.user.currentOrgId).toBe('org-1')
      expect(result.user.orgRole).toBe('org_admin')
      expect(result.user.orgIds).toEqual(['org-1'])
    })

    it('should handle missing token sub', async () => {
      const session = { user: {} }
      const token = { role: 'viewer' }

      const result = await mockSessionCallback({ session, token })

      expect(result.user.id).toBeUndefined()
      expect(result.user.role).toBe('viewer')
    })

    it('should handle missing token role', async () => {
      const session = { user: {} }
      const token = { sub: 'user-id-123' }

      const result = await mockSessionCallback({ session, token })

      expect(result.user.id).toBe('user-id-123')
      expect(result.user.role).toBeUndefined()
    })

    it('should handle missing user in session', async () => {
      const session = {}
      const token = { sub: 'user-id-123', role: 'viewer' }

      const result = await mockSessionCallback({ session, token })

      expect(result).toEqual({})
    })
  })

  describe('JWT Callback', () => {
    beforeEach(async () => {
      vi.resetModules()
      resetSelectResults()
      await import('@/lib/core/auth')
    })

    it('should add user id and role to token on first sign in', async () => {
      const token = { email: 'member@gpters.org' }
      const user = { id: 'user-123', role: 'admin', orgIds: ['org-1'] }

      const result = await mockJwtCallback({ token, user })

      expect(result.id).toBe('user-123')
      expect(result.role).toBe('admin')
      expect(result.orgIds).toEqual(['org-1'])
    })

    it('should set initial org context on first sign in', async () => {
      const token = { email: 'member@gpters.org' }
      const user = { id: 'user-123', role: 'viewer', orgIds: ['org-1'] }

      const result = await mockJwtCallback({ token, user })

      expect(result.currentOrgId).toBe('org-1')
      expect(result.orgRole).toBe('org_viewer')
    })

    it('should preserve token on subsequent requests without user', async () => {
      const token = { id: 'existing-id', email: 'member@gpters.org', role: 'viewer', tokenRefreshedAt: Date.now() }
      pushSelectResult([{ id: 'existing-id', role: 'viewer', accountStatus: 'active' }])
      pushSelectResult([{ orgId: 'org-1', role: 'org_viewer', status: 'active' }])

      const result = await mockJwtCallback({ token, user: undefined })

      expect(result.id).toBe('existing-id')
      expect(result.role).toBe('viewer')
    })

    it('should invalidate a suspended account on the next request', async () => {
      const token = { id: 'suspended-id', email: 'former@gpters.org', role: 'viewer' }
      pushSelectResult([{ id: 'suspended-id', role: 'viewer', accountStatus: 'suspended' }])

      const result = await mockJwtCallback({ token, user: undefined })

      expect(result).toBeNull()
    })

    it('should invalidate an existing session for an external email immediately', async () => {
      const token = {
        id: 'external-id',
        email: 'jwhyun2215@gmail.com',
        role: 'viewer',
        orgIds: ['public-org'],
        tokenRefreshedAt: Date.now(),
      }

      const result = await mockJwtCallback({ token, user: undefined })

      expect(result).toBeNull()
      expect(mockSelect).not.toHaveBeenCalled()
    })

    it('should invalidate a session when the GPTers user was deleted', async () => {
      const token = {
        id: 'deleted-id',
        email: 'deleted@gpters.org',
        role: 'viewer',
        orgIds: ['org-1'],
        tokenRefreshedAt: 0,
      }
      pushSelectResult([])

      const result = await mockJwtCallback({ token, user: undefined })

      expect(result).toBeNull()
    })

    it('should update token when user object is present', async () => {
      const token = { id: 'old-id', email: 'member@gpters.org', role: 'viewer' }
      const user = { id: 'new-id', role: 'admin', orgIds: ['org-2'] }

      const result = await mockJwtCallback({ token, user })

      expect(result.id).toBe('new-id')
      expect(result.role).toBe('admin')
      expect(result.orgIds).toEqual(['org-2'])
    })
  })

  describe('Domain Validation via Organizations', () => {
    beforeEach(async () => {
      vi.resetModules()
      resetSelectResults()
      mockInsert.mockResolvedValue(undefined)
      mockUpdate.mockResolvedValue(undefined)
      await import('@/lib/core/auth')
    })

    it('should reject emails when no org matches domain', async () => {
      const invalidEmails = [
        'test@gmail.com',
        'test@yahoo.com',
        'test@outlook.com',
        'test@company.com',
      ]

      for (const email of invalidEmails) {
        resetSelectResults()

        const result = await mockSignInCallback({
          user: { id: 'user-1', email, name: 'Test' },
          account: { provider: 'google', providerAccountId: '123' },
        })
        expect(result).toBe(false)
      }
    })

    it('should accept emails when matching org exists', async () => {
      const validEmails = [
        'user@gpters.org',
        'admin@gpters.org',
        'test.user@gpters.org',
        'user+tag@gpters.org',
      ]

      for (const email of validEmails) {
        resetSelectResults()
        // organizations query returns matching org
        pushSelectResult([MOCK_ORG])
        // users query (new user)
        pushSelectResult([])
        // orgMemberships query (new)
        pushSelectResult([])

        const result = await mockSignInCallback({
          user: { id: 'user-1', email, name: 'Test' },
          account: { provider: 'google', providerAccountId: '123' },
        })
        expect(result).toBe(true)
      }
    })
  })
})
