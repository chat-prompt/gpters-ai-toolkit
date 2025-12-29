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
