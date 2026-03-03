/**
 * Refresh token generation, validation, rotation, and replay detection tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @gpters/db before imports
vi.mock('@gpters/db', () => {
  const mockDb = {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'test-refresh-id' }]),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
  }
  return {
    db: mockDb,
    oauthRefreshTokens: {
      id: 'id',
      tokenHash: 'token_hash',
      clientId: 'client_id',
      userId: 'user_id',
      accessTokenId: 'access_token_id',
      scope: 'scope',
      familyId: 'family_id',
      generation: 'generation',
      expiresAt: 'expires_at',
      isActive: 'is_active',
      revokedAt: 'revoked_at',
      revokeReason: 'revoke_reason',
      createdAt: 'created_at',
    },
    oauthAccessTokens: {
      id: 'id',
      tokenHash: 'token_hash',
      isActive: 'is_active',
    },
    oauthClients: { id: 'id' },
    users: { id: 'id', role: 'role' },
  }
})

// Mock logger
vi.mock('@gpters/lib/core/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Mock utils
vi.mock('@gpters/lib/utils', () => ({
  getBaseUrl: () => 'https://test.example.com',
}))

import {
  generateRefreshToken,
  isValidRefreshTokenFormat,
  createRefreshToken,
  validateRefreshToken,
  revokeTokenFamily,
  revokeAccessToken,
  REFRESH_TOKEN_EXPIRY_SECONDS,
  ACCESS_TOKEN_EXPIRY_SECONDS,
} from '@/lib/security/oauth-tokens'
import { db } from '@gpters/db'

describe('Refresh Token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateRefreshToken', () => {
    it('should generate token with mrt_ prefix', () => {
      const token = generateRefreshToken()
      expect(token).toMatch(/^mrt_[0-9a-f]{32}$/)
    })

    it('should generate unique tokens', () => {
      const tokens = new Set(Array.from({ length: 100 }, () => generateRefreshToken()))
      expect(tokens.size).toBe(100)
    })
  })

  describe('isValidRefreshTokenFormat', () => {
    it('should accept valid mrt_ tokens', () => {
      expect(isValidRefreshTokenFormat('mrt_' + 'a'.repeat(32))).toBe(true)
      expect(isValidRefreshTokenFormat('mrt_0123456789abcdef0123456789abcdef')).toBe(true)
    })

    it('should reject invalid formats', () => {
      expect(isValidRefreshTokenFormat('')).toBe(false)
      expect(isValidRefreshTokenFormat('mcp_' + 'a'.repeat(32))).toBe(false) // wrong prefix
      expect(isValidRefreshTokenFormat('mrt_' + 'a'.repeat(31))).toBe(false) // too short
      expect(isValidRefreshTokenFormat('mrt_' + 'a'.repeat(33))).toBe(false) // too long
      expect(isValidRefreshTokenFormat('mrt_' + 'g'.repeat(32))).toBe(false) // invalid hex
    })
  })

  describe('constants', () => {
    it('should have correct access token expiry (1 hour)', () => {
      expect(ACCESS_TOKEN_EXPIRY_SECONDS).toBe(3600)
    })

    it('should have correct refresh token expiry (30 days)', () => {
      expect(REFRESH_TOKEN_EXPIRY_SECONDS).toBe(30 * 24 * 60 * 60)
    })
  })

  describe('createRefreshToken', () => {
    it('should insert token into database and return result', async () => {
      const result = await createRefreshToken({
        clientId: 'client-1',
        userId: 'user-1',
        accessTokenId: 'at-1',
        scope: 'read',
      })

      expect(result.token).toMatch(/^mrt_/)
      expect(result.id).toBe('test-refresh-id')
      expect(result.familyId).toBeDefined()
      expect(db.insert).toHaveBeenCalled()
    })

    it('should use provided familyId and generation', async () => {
      const result = await createRefreshToken({
        clientId: 'client-1',
        userId: 'user-1',
        accessTokenId: 'at-1',
        familyId: 'family-123',
        generation: 3,
      })

      expect(result.familyId).toBe('family-123')
    })
  })

  describe('validateRefreshToken', () => {
    it('should reject invalid format', async () => {
      const result = await validateRefreshToken('invalid-token')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('format')
    })

    it('should reject unknown token (not in DB)', async () => {
      // Default mock returns empty array for select().from().where()
      const result = await validateRefreshToken('mrt_' + 'a'.repeat(32))
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid refresh token')
    })

    it('should detect replay attack on inactive token', async () => {
      // Mock: return inactive token (already rotated)
      const mockWhere = vi.fn()
        .mockResolvedValueOnce([{
          id: 'rt-1',
          tokenHash: 'hash',
          clientId: 'client-1',
          userId: 'user-1',
          accessTokenId: 'at-1',
          scope: null,
          familyId: 'family-1',
          generation: 0,
          expiresAt: new Date(Date.now() + 86400000),
          isActive: false,
          revokedAt: new Date(),
          revokeReason: 'rotated',
          createdAt: new Date(),
        }])
        // revokeTokenFamily update call
        .mockResolvedValueOnce([])

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: mockWhere,
        }),
      } as unknown as ReturnType<typeof db.select>)

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.update>)

      const result = await validateRefreshToken('mrt_' + 'a'.repeat(32))
      expect(result.valid).toBe(false)
      expect(result.error).toContain('reuse')
    })

    it('should reject expired token', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: 'rt-1',
            tokenHash: 'hash',
            clientId: 'client-1',
            userId: 'user-1',
            accessTokenId: 'at-1',
            scope: null,
            familyId: 'family-1',
            generation: 0,
            expiresAt: new Date(Date.now() - 1000), // expired
            isActive: true,
            revokedAt: null,
            revokeReason: null,
            createdAt: new Date(),
          }]),
        }),
      } as unknown as ReturnType<typeof db.select>)

      const result = await validateRefreshToken('mrt_' + 'a'.repeat(32))
      expect(result.valid).toBe(false)
      expect(result.error).toContain('expired')
    })

    it('should validate active, non-expired token', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: 'rt-1',
            tokenHash: 'hash',
            clientId: 'client-1',
            userId: 'user-1',
            accessTokenId: 'at-1',
            scope: 'read',
            familyId: 'family-1',
            generation: 2,
            expiresAt: new Date(Date.now() + 86400000),
            isActive: true,
            revokedAt: null,
            revokeReason: null,
            createdAt: new Date(),
          }]),
        }),
      } as unknown as ReturnType<typeof db.select>)

      const result = await validateRefreshToken('mrt_' + 'a'.repeat(32))
      expect(result.valid).toBe(true)
      expect(result.clientId).toBe('client-1')
      expect(result.userId).toBe('user-1')
      expect(result.familyId).toBe('family-1')
      expect(result.generation).toBe(2)
    })
  })

  describe('revokeTokenFamily', () => {
    it('should update all active tokens in the family', async () => {
      const mockWhere = vi.fn().mockResolvedValue([])
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: mockWhere,
        }),
      } as unknown as ReturnType<typeof db.update>)

      await revokeTokenFamily('family-1', 'replay_detected')

      expect(db.update).toHaveBeenCalled()
    })
  })

  describe('revokeAccessToken', () => {
    it('should deactivate the access token', async () => {
      const mockWhere = vi.fn().mockResolvedValue([])
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: mockWhere,
        }),
      } as unknown as ReturnType<typeof db.update>)

      await revokeAccessToken('at-1')

      expect(db.update).toHaveBeenCalled()
    })
  })
})
