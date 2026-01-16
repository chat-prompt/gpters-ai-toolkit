import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the db module
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockFrom = vi.fn()
const mockWhere = vi.fn()
const mockLimit = vi.fn()
const mockValues = vi.fn()
const mockSet = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mockSelect(),
        }),
      }),
    }),
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
  users: {},
}))

vi.mock('@/lib/db/schema', () => ({
  users: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ field, value })),
}))

vi.mock('@/lib/core/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
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

describe('Auth Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelect.mockResolvedValue([])
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
      mockSelect.mockResolvedValue([])
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

    it('should reject sign in for non-gpters.org emails', async () => {
      const result = await mockSignInCallback({
        user: { id: 'user-1', email: 'test@gmail.com', name: 'Test' },
        account: { provider: 'google', providerAccountId: '123' },
      })

      expect(result).toBe(false)
    })

    it('should allow sign in for gpters.org emails', async () => {
      const result = await mockSignInCallback({
        user: { id: 'user-1', email: 'test@gpters.org', name: 'Test' },
        account: { provider: 'google', providerAccountId: '123' },
      })

      expect(result).toBe(true)
    })

    it('should create new user on first sign in', async () => {
      mockSelect.mockResolvedValue([])

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
      mockSelect.mockResolvedValue([{ id: 'existing-id', email: 'existing@gpters.org', role: 'admin' }])

      const user = { id: 'user-1', email: 'existing@gpters.org', name: 'Updated Name', image: 'https://example.com/new-avatar.jpg' }
      await mockSignInCallback({
        user,
        account: { provider: 'google', providerAccountId: '123' },
      })

      expect(mockSet).toHaveBeenCalled()
      const updatedData = mockSet.mock.calls[0][0]
      expect(updatedData.name).toBe('Updated Name')
      expect(updatedData.image).toBe('https://example.com/new-avatar.jpg')
    })

    it('should set user role from database for existing user', async () => {
      mockSelect.mockResolvedValue([{ id: 'existing-id', email: 'admin@gpters.org', role: 'admin' }])

      const user: { email: string; name: string; role?: string } = { email: 'admin@gpters.org', name: 'Admin' }
      await mockSignInCallback({
        user,
        account: { provider: 'google', providerAccountId: '123' },
      })

      expect(user.role).toBe('admin')
    })

    it('should set default viewer role for new users', async () => {
      mockSelect.mockResolvedValue([])

      const user: { email: string; name: string; role?: string } = { email: 'new@gpters.org', name: 'New User' }
      await mockSignInCallback({
        user,
        account: { provider: 'google', providerAccountId: '123' },
      })

      expect(user.role).toBe('viewer')
    })

    it('should still allow sign in if database operation fails', async () => {
      mockSelect.mockRejectedValue(new Error('Database error'))

      const result = await mockSignInCallback({
        user: { id: 'user-1', email: 'test@gpters.org', name: 'Test' },
        account: { provider: 'google', providerAccountId: '123' },
      })

      // Should not block sign in even if DB fails
      expect(result).toBe(true)
    })
  })

  describe('Session Callback', () => {
    beforeEach(async () => {
      vi.resetModules()
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
      await import('@/lib/core/auth')
    })

    it('should add user id and role to token on first sign in', async () => {
      const token = {}
      const user = { id: 'user-123', role: 'admin' }

      const result = await mockJwtCallback({ token, user })

      expect(result.id).toBe('user-123')
      expect(result.role).toBe('admin')
    })

    it('should preserve token on subsequent requests without user', async () => {
      const token = { id: 'existing-id', role: 'viewer' }

      const result = await mockJwtCallback({ token, user: undefined })

      expect(result.id).toBe('existing-id')
      expect(result.role).toBe('viewer')
    })

    it('should update token when user object is present', async () => {
      const token = { id: 'old-id', role: 'viewer' }
      const user = { id: 'new-id', role: 'admin' }

      const result = await mockJwtCallback({ token, user })

      expect(result.id).toBe('new-id')
      expect(result.role).toBe('admin')
    })
  })

  describe('Email Domain Validation', () => {
    beforeEach(async () => {
      vi.resetModules()
      mockSelect.mockResolvedValue([])
      await import('@/lib/core/auth')
    })

    it('should reject various invalid email domains', async () => {
      const invalidEmails = [
        'test@gmail.com',
        'test@yahoo.com',
        'test@outlook.com',
        'test@company.com',
        'test@gpters.com', // Note: gpters.com, not gpters.org
        'test@mail.gpters.org', // Subdomain
      ]

      for (const email of invalidEmails) {
        const result = await mockSignInCallback({
          user: { id: 'user-1', email, name: 'Test' },
          account: { provider: 'google', providerAccountId: '123' },
        })
        expect(result).toBe(false)
      }
    })

    it('should accept valid gpters.org emails', async () => {
      const validEmails = [
        'user@gpters.org',
        'admin@gpters.org',
        'test.user@gpters.org',
        'user+tag@gpters.org',
      ]

      for (const email of validEmails) {
        mockSelect.mockResolvedValue([])
        const result = await mockSignInCallback({
          user: { id: 'user-1', email, name: 'Test' },
          account: { provider: 'google', providerAccountId: '123' },
        })
        expect(result).toBe(true)
      }
    })
  })
})
