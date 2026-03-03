/**
 * Token endpoint tests for authorization_code and refresh_token grants
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies before imports
vi.mock('@/lib/security/oauth', () => ({
  getAuthCode: vi.fn(),
  consumeAuthCode: vi.fn(),
  verifyPkce: vi.fn(),
  getClient: vi.fn(),
  verifyClientSecret: vi.fn(),
}))

vi.mock('@/lib/security/oauth-tokens', () => ({
  createAccessToken: vi.fn().mockResolvedValue({
    token: 'mcp_new_access_token_00000000000000',
    id: 'new-at-id',
  }),
  createRefreshToken: vi.fn().mockResolvedValue({
    token: 'mrt_new_refresh_token_0000000000',
    id: 'new-rt-id',
    familyId: 'family-123',
  }),
  validateRefreshToken: vi.fn(),
  revokeAccessToken: vi.fn(),
  ACCESS_TOKEN_EXPIRY_SECONDS: 3600,
  REFRESH_TOKEN_EXPIRY_SECONDS: 2592000,
}))

vi.mock('@/lib/core/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('@gpters/db', () => {
  const mockDb = {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  }
  return {
    db: mockDb,
    oauthRefreshTokens: { id: 'id' },
  }
})

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}))

import { POST } from '@/app/oauth/token/route'
import {
  getAuthCode,
  consumeAuthCode,
  verifyPkce,
} from '@/lib/security/oauth'
import {
  createAccessToken,
  createRefreshToken,
  validateRefreshToken,
  revokeAccessToken,
} from '@/lib/security/oauth-tokens'
import { NextRequest } from 'next/server'

/** Helper to create a POST request with JSON body */
function createTokenRequest(body: Record<string, string>): NextRequest {
  return new NextRequest('https://test.example.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('OAuth Token Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('grant_type=authorization_code', () => {
    it('should return access_token and refresh_token on success', async () => {
      vi.mocked(getAuthCode).mockResolvedValue({
        code: 'test-code',
        clientId: 'client-1',
        userId: 'user-1',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
        redirectUri: 'http://localhost:3000/callback',
        scope: 'read',
        expiresAt: new Date(Date.now() + 60000),
        createdAt: new Date(),
      })
      vi.mocked(verifyPkce).mockResolvedValue(true)
      vi.mocked(consumeAuthCode).mockResolvedValue(undefined)

      const req = createTokenRequest({
        grant_type: 'authorization_code',
        code: 'test-code',
        client_id: 'client-1',
        code_verifier: 'verifier',
        redirect_uri: 'http://localhost:3000/callback',
      })

      const res = await POST(req)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.access_token).toBeDefined()
      expect(body.refresh_token).toBeDefined()
      expect(body.token_type).toBe('Bearer')
      expect(body.expires_in).toBe(3600) // 1 hour, not 10 years
      expect(body.scope).toBe('read')

      // Should have created both tokens
      expect(createAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'client-1',
          userId: 'user-1',
          expiresAt: expect.any(Date),
        })
      )
      expect(createRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'client-1',
          userId: 'user-1',
          accessTokenId: 'new-at-id',
        })
      )
    })

    it('should reject unsupported grant types', async () => {
      const req = createTokenRequest({
        grant_type: 'client_credentials',
        client_id: 'client-1',
      })

      const res = await POST(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('unsupported_grant_type')
    })
  })

  describe('grant_type=refresh_token', () => {
    it('should issue new tokens on valid refresh', async () => {
      vi.mocked(validateRefreshToken).mockResolvedValue({
        valid: true,
        id: 'rt-old',
        clientId: 'client-1',
        userId: 'user-1',
        accessTokenId: 'at-old',
        scope: 'read',
        familyId: 'family-1',
        generation: 0,
      })

      const req = createTokenRequest({
        grant_type: 'refresh_token',
        refresh_token: 'mrt_' + 'a'.repeat(32),
        client_id: 'client-1',
      })

      const res = await POST(req)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.access_token).toBeDefined()
      expect(body.refresh_token).toBeDefined()
      expect(body.expires_in).toBe(3600)

      // Should revoke old access token
      expect(revokeAccessToken).toHaveBeenCalledWith('at-old')

      // New refresh token should use same family, incremented generation
      expect(createRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({
          familyId: 'family-1',
          generation: 1,
        })
      )
    })

    it('should reject missing refresh_token', async () => {
      const req = createTokenRequest({
        grant_type: 'refresh_token',
        client_id: 'client-1',
      })

      const res = await POST(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('invalid_request')
      expect(body.error_description).toContain('refresh_token')
    })

    it('should reject missing client_id', async () => {
      const req = createTokenRequest({
        grant_type: 'refresh_token',
        refresh_token: 'mrt_' + 'a'.repeat(32),
      })

      const res = await POST(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('invalid_request')
      expect(body.error_description).toContain('client_id')
    })

    it('should reject invalid refresh token', async () => {
      vi.mocked(validateRefreshToken).mockResolvedValue({
        valid: false,
        error: 'Invalid refresh token',
      })

      const req = createTokenRequest({
        grant_type: 'refresh_token',
        refresh_token: 'mrt_' + 'a'.repeat(32),
        client_id: 'client-1',
      })

      const res = await POST(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('invalid_grant')
    })

    it('should reject client_id mismatch', async () => {
      vi.mocked(validateRefreshToken).mockResolvedValue({
        valid: true,
        id: 'rt-1',
        clientId: 'client-different',
        userId: 'user-1',
        familyId: 'family-1',
        generation: 0,
      })

      const req = createTokenRequest({
        grant_type: 'refresh_token',
        refresh_token: 'mrt_' + 'a'.repeat(32),
        client_id: 'client-1',
      })

      const res = await POST(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('invalid_grant')
      expect(body.error_description).toContain('client_id')
    })

    it('should detect replay attack (token reuse)', async () => {
      vi.mocked(validateRefreshToken).mockResolvedValue({
        valid: false,
        error: 'Token reuse detected — family revoked',
      })

      const req = createTokenRequest({
        grant_type: 'refresh_token',
        refresh_token: 'mrt_' + 'a'.repeat(32),
        client_id: 'client-1',
      })

      const res = await POST(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('invalid_grant')
      expect(body.error_description).toContain('reuse')
    })

    it('should reject expired refresh token', async () => {
      vi.mocked(validateRefreshToken).mockResolvedValue({
        valid: false,
        error: 'Refresh token expired',
      })

      const req = createTokenRequest({
        grant_type: 'refresh_token',
        refresh_token: 'mrt_' + 'a'.repeat(32),
        client_id: 'client-1',
      })

      const res = await POST(req)
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe('invalid_grant')
      expect(body.error_description).toContain('expired')
    })
  })
})
