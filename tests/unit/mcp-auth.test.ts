/**
 * Unit tests for MCP Authentication System
 *
 * Tests pure functions that don't require database access.
 * Database-dependent functions are tested via API tests.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock the database module to prevent connection errors
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

// Import after mocking
const {
  generateToken,
  hashToken,
  isValidTokenFormat,
  checkTokenRateLimit,
  extractBearerToken,
} = await import('@/lib/security/mcp-auth')

describe('MCP Authentication', () => {
  describe('generateToken', () => {
    it('should generate token with correct prefix', () => {
      const token = generateToken()
      expect(token).toMatch(/^mcp_/)
    })

    it('should generate token with correct length', () => {
      const token = generateToken()
      // mcp_ (4 chars) + 32 hex chars = 36 total
      expect(token.length).toBe(36)
    })

    it('should generate hex characters after prefix', () => {
      const token = generateToken()
      const hexPart = token.slice(4)
      expect(hexPart).toMatch(/^[0-9a-f]{32}$/i)
    })

    it('should generate unique tokens', () => {
      const tokens = new Set<string>()
      for (let i = 0; i < 100; i++) {
        tokens.add(generateToken())
      }
      expect(tokens.size).toBe(100)
    })
  })

  describe('hashToken', () => {
    it('should return a SHA-256 hash (64 hex characters)', async () => {
      const token = generateToken()
      const hash = await hashToken(token)
      expect(hash.length).toBe(64)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should produce consistent hashes for same input', async () => {
      const token = 'mcp_1234567890abcdef1234567890abcdef'
      const hash1 = await hashToken(token)
      const hash2 = await hashToken(token)
      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different inputs', async () => {
      const token1 = 'mcp_1234567890abcdef1234567890abcdef'
      const token2 = 'mcp_abcdef1234567890abcdef1234567890'
      const hash1 = await hashToken(token1)
      const hash2 = await hashToken(token2)
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('isValidTokenFormat', () => {
    it('should accept valid tokens', () => {
      expect(isValidTokenFormat('mcp_1234567890abcdef1234567890abcdef')).toBe(true)
      expect(isValidTokenFormat('mcp_ABCDEF1234567890ABCDEF1234567890')).toBe(true)
      expect(isValidTokenFormat('mcp_aaaabbbbccccddddeeeeffffaaaabbbb')).toBe(true)
    })

    it('should reject tokens without correct prefix', () => {
      expect(isValidTokenFormat('1234567890abcdef1234567890abcdef')).toBe(false)
      expect(isValidTokenFormat('abc_1234567890abcdef1234567890abcdef')).toBe(false)
      expect(isValidTokenFormat('MCP_1234567890abcdef1234567890abcdef')).toBe(false)
    })

    it('should reject tokens with wrong length', () => {
      expect(isValidTokenFormat('mcp_123')).toBe(false)
      expect(isValidTokenFormat('mcp_1234567890abcdef')).toBe(false)
      expect(isValidTokenFormat('mcp_1234567890abcdef1234567890abcdef00')).toBe(false)
    })

    it('should reject tokens with invalid characters', () => {
      expect(isValidTokenFormat('mcp_ghijklmnopqrstuv1234567890abcdef')).toBe(false)
      expect(isValidTokenFormat('mcp_1234-567890abcdef1234567890abcde')).toBe(false)
      expect(isValidTokenFormat('mcp_1234 567890abcdef1234567890abcde')).toBe(false)
    })

    it('should reject empty or null values', () => {
      expect(isValidTokenFormat('')).toBe(false)
      expect(isValidTokenFormat('mcp_')).toBe(false)
    })
  })

  describe('checkTokenRateLimit', () => {
    beforeEach(() => {
      // Use fake timers for rate limit window tests
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should allow requests within limit', () => {
      const tokenId = `test-token-${Date.now()}-${Math.random()}`
      const limit = 100

      const result1 = checkTokenRateLimit(tokenId, limit)
      expect(result1.allowed).toBe(true)
      expect(result1.remaining).toBe(99)

      const result2 = checkTokenRateLimit(tokenId, limit)
      expect(result2.allowed).toBe(true)
      expect(result2.remaining).toBe(98)
    })

    it('should block requests over limit', () => {
      const tokenId = `test-token-limit-${Date.now()}-${Math.random()}`
      const limit = 3

      checkTokenRateLimit(tokenId, limit) // 1
      checkTokenRateLimit(tokenId, limit) // 2
      checkTokenRateLimit(tokenId, limit) // 3

      const result = checkTokenRateLimit(tokenId, limit) // 4 - should be blocked
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('should reset after window expires', () => {
      const tokenId = `test-token-reset-${Date.now()}-${Math.random()}`
      const limit = 2

      checkTokenRateLimit(tokenId, limit)
      checkTokenRateLimit(tokenId, limit)

      const blockedResult = checkTokenRateLimit(tokenId, limit)
      expect(blockedResult.allowed).toBe(false)

      // Advance time by 61 seconds (window is 60 seconds)
      vi.advanceTimersByTime(61000)

      const result = checkTokenRateLimit(tokenId, limit)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(1)
    })

    it('should track different tokens separately', () => {
      const tokenId1 = `test-token-1-${Date.now()}-${Math.random()}`
      const tokenId2 = `test-token-2-${Date.now()}-${Math.random()}`
      const limit = 2

      // Exhaust limit for token1
      checkTokenRateLimit(tokenId1, limit)
      checkTokenRateLimit(tokenId1, limit)
      checkTokenRateLimit(tokenId1, limit)

      // Token2 should still work
      const result = checkTokenRateLimit(tokenId2, limit)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(1)
    })
  })

  describe('extractBearerToken', () => {
    function createMockRequest(authHeader: string | null): NextRequest {
      const headers = new Headers()
      if (authHeader) {
        headers.set('Authorization', authHeader)
      }
      return {
        headers,
      } as unknown as NextRequest
    }

    it('should extract valid bearer token', () => {
      const request = createMockRequest('Bearer mcp_1234567890abcdef1234567890abcdef')
      const token = extractBearerToken(request)
      expect(token).toBe('mcp_1234567890abcdef1234567890abcdef')
    })

    it('should handle case-insensitive Bearer keyword', () => {
      const request1 = createMockRequest('bearer mcp_1234567890abcdef1234567890abcdef')
      const request2 = createMockRequest('BEARER mcp_1234567890abcdef1234567890abcdef')
      const request3 = createMockRequest('BeArEr mcp_1234567890abcdef1234567890abcdef')

      expect(extractBearerToken(request1)).toBe('mcp_1234567890abcdef1234567890abcdef')
      expect(extractBearerToken(request2)).toBe('mcp_1234567890abcdef1234567890abcdef')
      expect(extractBearerToken(request3)).toBe('mcp_1234567890abcdef1234567890abcdef')
    })

    it('should return null for missing Authorization header', () => {
      const request = createMockRequest(null)
      const token = extractBearerToken(request)
      expect(token).toBeNull()
    })

    it('should return null for non-Bearer auth', () => {
      const request = createMockRequest('Basic dXNlcm5hbWU6cGFzc3dvcmQ=')
      const token = extractBearerToken(request)
      expect(token).toBeNull()
    })

    it('should return null for malformed header', () => {
      const request1 = createMockRequest('Bearer')
      const request2 = createMockRequest('Bearer token extra')
      const request3 = createMockRequest('')

      expect(extractBearerToken(request1)).toBeNull()
      expect(extractBearerToken(request2)).toBeNull()
      expect(extractBearerToken(request3)).toBeNull()
    })
  })
})

describe('Token Format Consistency', () => {
  it('should generate tokens that pass validation', () => {
    for (let i = 0; i < 50; i++) {
      const token = generateToken()
      expect(isValidTokenFormat(token)).toBe(true)
    }
  })

  it('should generate tokens that can be hashed', async () => {
    const token = generateToken()
    const hash = await hashToken(token)
    expect(hash).toBeDefined()
    expect(hash.length).toBe(64)
  })
})

// Import additional functions for extended tests
const { mcpAuthError } = await import('@/lib/security/mcp-auth')

describe('mcpAuthError', () => {
  it('should create 401 unauthorized response by default', () => {
    const response = mcpAuthError('Authentication required')

    expect(response.status).toBe(401)
  })

  it('should create 401 response with explicit status', () => {
    const response = mcpAuthError('Token invalid', 401)

    expect(response.status).toBe(401)
  })

  it('should create 403 forbidden response', () => {
    const response = mcpAuthError('Access denied', 403)

    expect(response.status).toBe(403)
  })

  it('should return JSON response with error message and code', async () => {
    const response = mcpAuthError('Test error', 401)
    const json = await response.json()

    expect(json.error).toBe('Test error')
    expect(json.code).toBe('UNAUTHORIZED')
  })

  it('should return FORBIDDEN code for 403 status', async () => {
    const response = mcpAuthError('Forbidden', 403)
    const json = await response.json()

    expect(json.error).toBe('Forbidden')
    expect(json.code).toBe('FORBIDDEN')
  })
})

// Database-dependent function tests with mocking
describe('Database-dependent Functions', () => {
  const mockDbSelect = vi.fn()
  const mockDbInsert = vi.fn()
  const mockDbUpdate = vi.fn()
  const mockDbDelete = vi.fn()

  beforeEach(async () => {
    vi.clearAllMocks()
    // Reset db mocks
    const dbModule = vi.mocked(await import('@/lib/db'))
    dbModule.db.select = mockDbSelect
    dbModule.db.insert = mockDbInsert
    dbModule.db.update = mockDbUpdate
    dbModule.db.delete = mockDbDelete
  })

  describe('validateToken', () => {
    it('should return invalid for malformed tokens', async () => {
      const { validateToken } = await import('@/lib/security/mcp-auth')
      const result = await validateToken('invalid-token')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid token format')
    })

    it('should return invalid for tokens not found in database', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([])
        })
      })

      const { validateToken } = await import('@/lib/security/mcp-auth')
      const result = await validateToken('mcp_1234567890abcdef1234567890abcdef')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid token')
    })

    it('should return invalid for inactive tokens', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: 'token-1',
            name: 'Test Token',
            isActive: false,
            expiresAt: null,
            rateLimit: 100,
          }])
        })
      })

      const { validateToken } = await import('@/lib/security/mcp-auth')
      const result = await validateToken('mcp_1234567890abcdef1234567890abcdef')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Token has been revoked')
    })

    it('should return invalid for expired tokens', async () => {
      const pastDate = new Date(Date.now() - 86400000) // 1 day ago
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: 'token-1',
            name: 'Test Token',
            isActive: true,
            expiresAt: pastDate,
            rateLimit: 100,
          }])
        })
      })

      const { validateToken } = await import('@/lib/security/mcp-auth')
      const result = await validateToken('mcp_1234567890abcdef1234567890abcdef')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Token has expired')
    })

    it('should return valid for active non-expired tokens', async () => {
      const futureDate = new Date(Date.now() + 86400000) // 1 day from now
      const mockTokenId = `token-valid-${Date.now()}`
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: mockTokenId,
            name: 'Test Token',
            isActive: true,
            expiresAt: futureDate,
            rateLimit: 100,
          }])
        })
      })
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            catch: vi.fn()
          })
        })
      })

      const { validateToken } = await import('@/lib/security/mcp-auth')
      const result = await validateToken('mcp_1234567890abcdef1234567890abcdef')

      expect(result.valid).toBe(true)
      expect(result.tokenId).toBe(mockTokenId)
      expect(result.name).toBe('Test Token')
      expect(result.rateLimit).toBe(100)
    })

    it('should handle database errors gracefully', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error('Database connection failed'))
        })
      })

      const { validateToken } = await import('@/lib/security/mcp-auth')
      const result = await validateToken('mcp_1234567890abcdef1234567890abcdef')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Token validation failed')
    })
  })

  describe('authenticateMcpRequest', () => {
    function createMockRequest(authHeader: string | null): NextRequest {
      const headers = new Headers()
      if (authHeader) {
        headers.set('Authorization', authHeader)
      }
      return { headers } as unknown as NextRequest
    }

    it('should return null for requests without auth header', async () => {
      const { authenticateMcpRequest } = await import('@/lib/security/mcp-auth')
      const request = createMockRequest(null)

      const result = await authenticateMcpRequest(request)

      expect(result).toBeNull()
    })

    it('should return unauthenticated for invalid tokens', async () => {
      const { authenticateMcpRequest } = await import('@/lib/security/mcp-auth')
      const request = createMockRequest('Bearer invalid-token')

      const result = await authenticateMcpRequest(request)

      expect(result?.authenticated).toBe(false)
      expect(result?.error).toBeDefined()
    })

    it('should return authenticated for valid tokens', async () => {
      const mockTokenId = `token-auth-${Date.now()}`
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: mockTokenId,
            name: 'API Token',
            isActive: true,
            expiresAt: null,
            rateLimit: 100,
          }])
        })
      })
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            catch: vi.fn()
          })
        })
      })

      const { authenticateMcpRequest } = await import('@/lib/security/mcp-auth')
      const request = createMockRequest('Bearer mcp_1234567890abcdef1234567890abcdef')

      const result = await authenticateMcpRequest(request)

      expect(result?.authenticated).toBe(true)
      expect(result?.tokenId).toBe(mockTokenId)
      expect(result?.tokenName).toBe('API Token')
    })
  })

  describe('withMcpAuth middleware', () => {
    function createMockRequest(authHeader: string | null): NextRequest {
      const headers = new Headers()
      if (authHeader) {
        headers.set('Authorization', authHeader)
      }
      return { headers } as unknown as NextRequest
    }

    it('should allow public mode when auth not required', async () => {
      const { withMcpAuth } = await import('@/lib/security/mcp-auth')
      const request = createMockRequest(null)

      const result = await withMcpAuth(request, { requireAuth: false })

      expect(result.error).toBeUndefined()
      expect(result.auth).toBeUndefined()
    })

    it('should return error when auth required but not provided', async () => {
      const { withMcpAuth } = await import('@/lib/security/mcp-auth')
      const request = createMockRequest(null)

      const result = await withMcpAuth(request, { requireAuth: true })

      expect(result.error).toBeDefined()
      expect(result.error?.status).toBe(401)
    })

    it('should return error for invalid auth header', async () => {
      const { withMcpAuth } = await import('@/lib/security/mcp-auth')
      const request = createMockRequest('Bearer invalid-format')

      const result = await withMcpAuth(request)

      expect(result.error).toBeDefined()
    })

    it('should return auth result for valid token', async () => {
      const mockTokenId = `token-with-${Date.now()}`
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: mockTokenId,
            name: 'Middleware Token',
            isActive: true,
            expiresAt: null,
            rateLimit: 100,
          }])
        })
      })
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            catch: vi.fn()
          })
        })
      })

      const { withMcpAuth } = await import('@/lib/security/mcp-auth')
      const request = createMockRequest('Bearer mcp_1234567890abcdef1234567890abcdef')

      const result = await withMcpAuth(request)

      expect(result.error).toBeUndefined()
      expect(result.auth?.authenticated).toBe(true)
    })
  })

  describe('Token Management Functions', () => {
    describe('createToken', () => {
      it('should create a token and return raw token once', async () => {
        const mockCreatedRecord = {
          id: 'new-token-id',
          name: 'My API Token',
          description: 'For testing',
          expiresAt: null,
          rateLimit: 50,
          createdAt: new Date(),
        }
        mockDbInsert.mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockCreatedRecord])
          })
        })

        const { createToken } = await import('@/lib/security/mcp-auth')
        const result = await createToken({
          name: 'My API Token',
          description: 'For testing',
          rateLimit: 50,
        })

        expect(result.token).toMatch(/^mcp_/)
        expect(result.id).toBe('new-token-id')
        expect(result.name).toBe('My API Token')
        expect(result.rateLimit).toBe(50)
      })
    })

    describe('listTokens', () => {
      it('should return list of tokens without raw values', async () => {
        const mockTokens = [
          { id: 'token-1', name: 'Token 1', isActive: true },
          { id: 'token-2', name: 'Token 2', isActive: false },
        ]
        mockDbSelect.mockReturnValue({
          from: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockTokens)
          })
        })

        const { listTokens } = await import('@/lib/security/mcp-auth')
        const result = await listTokens()

        expect(result).toHaveLength(2)
        expect(result[0].name).toBe('Token 1')
      })
    })

    describe('getToken', () => {
      it('should return token by id', async () => {
        const mockToken = { id: 'token-1', name: 'Single Token', isActive: true }
        mockDbSelect.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([mockToken])
          })
        })

        const { getToken } = await import('@/lib/security/mcp-auth')
        const result = await getToken('token-1')

        expect(result?.id).toBe('token-1')
        expect(result?.name).toBe('Single Token')
      })

      it('should return undefined for non-existent token', async () => {
        mockDbSelect.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([])
          })
        })

        const { getToken } = await import('@/lib/security/mcp-auth')
        const result = await getToken('non-existent')

        expect(result).toBeUndefined()
      })
    })

    describe('revokeToken', () => {
      it('should revoke an active token', async () => {
        mockDbUpdate.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'token-1' }])
            })
          })
        })

        const { revokeToken } = await import('@/lib/security/mcp-auth')
        const result = await revokeToken('token-1')

        expect(result).toBe(true)
      })

      it('should return false for non-existent token', async () => {
        mockDbUpdate.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([])
            })
          })
        })

        const { revokeToken } = await import('@/lib/security/mcp-auth')
        const result = await revokeToken('non-existent')

        expect(result).toBe(false)
      })
    })

    describe('deleteToken', () => {
      it('should delete a token permanently', async () => {
        mockDbDelete.mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'token-1' }])
          })
        })

        const { deleteToken } = await import('@/lib/security/mcp-auth')
        const result = await deleteToken('token-1')

        expect(result).toBe(true)
      })

      it('should return false for non-existent token', async () => {
        mockDbDelete.mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([])
          })
        })

        const { deleteToken } = await import('@/lib/security/mcp-auth')
        const result = await deleteToken('non-existent')

        expect(result).toBe(false)
      })
    })

    describe('reactivateToken', () => {
      it('should reactivate a revoked token', async () => {
        mockDbUpdate.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'token-1' }])
            })
          })
        })

        const { reactivateToken } = await import('@/lib/security/mcp-auth')
        const result = await reactivateToken('token-1')

        expect(result).toBe(true)
      })

      it('should return false for already active or non-existent token', async () => {
        mockDbUpdate.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([])
            })
          })
        })

        const { reactivateToken } = await import('@/lib/security/mcp-auth')
        const result = await reactivateToken('token-1')

        expect(result).toBe(false)
      })
    })

    describe('updateToken', () => {
      it('should update token settings', async () => {
        mockDbUpdate.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'token-1' }])
            })
          })
        })

        const { updateToken } = await import('@/lib/security/mcp-auth')
        const result = await updateToken('token-1', {
          name: 'Updated Name',
          rateLimit: 200,
        })

        expect(result).toBe(true)
      })

      it('should return false for non-existent token', async () => {
        mockDbUpdate.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([])
            })
          })
        })

        const { updateToken } = await import('@/lib/security/mcp-auth')
        const result = await updateToken('non-existent', { name: 'New Name' })

        expect(result).toBe(false)
      })
    })
  })
})
