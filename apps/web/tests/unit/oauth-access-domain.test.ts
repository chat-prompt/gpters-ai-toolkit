import { beforeEach, describe, expect, it, vi } from 'vitest'

const tokenRecord = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }))
const approvedEmails = vi.hoisted(() => ({ current: [] as string[] }))
const execute = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const insertValues = vi.hoisted(() => vi.fn())

vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  eq: (column: unknown, value: unknown) => ({ column, value }),
}))

const APPROVALS_TABLE = vi.hoisted(() => ({ email: 'allowed_external_accounts.email' }))

vi.mock('@gpters/db', () => {
  const where = vi.fn(async () => tokenRecord.current ? [tokenRecord.current] : [])
  return {
    db: {
      select: vi.fn((fields?: Record<string, unknown>) => ({
        from: vi.fn((table?: unknown) => {
          if (table === APPROVALS_TABLE) {
            return {
              where: vi.fn((condition: { value: string }) => ({
                limit: vi.fn(async () =>
                  approvedEmails.current.includes(condition.value) ? [{ email: condition.value }] : []
                ),
              })),
            }
          }
          return {
            where: fields?.email
              ? vi.fn(async () => [{ email: tokenRecord.current?.userEmail }])
              : where,
            leftJoin: vi.fn(() => ({ leftJoin: vi.fn(() => ({ where })) })),
          }
        }),
      })),
      insert: vi.fn(() => ({
        values: insertValues.mockReturnValue({
          returning: vi.fn(async () => [{ id: 'new-token-id' }]),
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ execute })),
        })),
      })),
    },
    oauthAccessTokens: {
      id: 'access_token.id', clientId: 'access_token.client_id', userId: 'access_token.user_id',
      scope: 'access_token.scope', isActive: 'access_token.is_active', expiresAt: 'access_token.expires_at',
      tokenHash: 'access_token.token_hash', lastUsedAt: 'access_token.last_used_at', usageCount: 'access_token.usage_count',
    },
    oauthClients: { id: 'client.id', name: 'client.name' },
    oauthRefreshTokens: {},
    users: { id: 'user.id', email: 'user.email', role: 'user.role' },
    allowedExternalAccounts: APPROVALS_TABLE,
  }
})

vi.mock('@gpters/lib/core/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('@gpters/lib/utils', () => ({ getBaseUrl: () => 'https://ai-toolkit.gpters.org' }))

import { createAccessToken, validateAccessToken } from '@/lib/security/oauth-tokens'

const VALID_TOKEN = `mcp_${'a'.repeat(32)}`

describe('OAuth access token domain enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    approvedEmails.current = []
    tokenRecord.current = {
      id: 'token-1',
      clientId: 'client-1',
      userId: 'user-1',
      scope: 'mcp:read',
      isActive: true,
      expiresAt: new Date(Date.now() + 60_000),
      userRole: 'viewer',
      clientName: 'AITK CLI',
      userEmail: 'member@gpters.org',
    }
  })

  it('accepts an active token owned by a GPTers account', async () => {
    const result = await validateAccessToken(VALID_TOKEN)

    expect(result.valid).toBe(true)
    expect(result.userId).toBe('user-1')
  })

  it('accepts a token owned by the individually approved external account', async () => {
    tokenRecord.current = { ...tokenRecord.current, userEmail: 'zeusajm@yonsei.ac.kr' }
    approvedEmails.current = ['zeusajm@yonsei.ac.kr']

    const result = await validateAccessToken(VALID_TOKEN)

    expect(result.valid).toBe(true)
    expect(result.userId).toBe('user-1')
  })

  it('rejects an otherwise valid token owned by an external account', async () => {
    tokenRecord.current = { ...tokenRecord.current, userEmail: 'jwhyun2215@gmail.com' }

    const result = await validateAccessToken(VALID_TOKEN)

    expect(result).toEqual({ valid: false, error: 'Account is not authorized' })
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects a token whose user was deleted', async () => {
    tokenRecord.current = { ...tokenRecord.current, userEmail: null }

    const result = await validateAccessToken(VALID_TOKEN)

    expect(result).toEqual({ valid: false, error: 'Account is not authorized' })
    expect(execute).not.toHaveBeenCalled()
  })

  it('issues CLI and MCP tokens to the individually approved external account', async () => {
    tokenRecord.current = { ...tokenRecord.current, userEmail: 'zeusajm@yonsei.ac.kr' }
    approvedEmails.current = ['zeusajm@yonsei.ac.kr']

    await expect(createAccessToken({ clientId: 'client-1', userId: 'user-1' })).resolves.toBeDefined()
    expect(insertValues).toHaveBeenCalled()
  })

  it('refuses to issue any new CLI or MCP token to an external account', async () => {
    tokenRecord.current = { ...tokenRecord.current, userEmail: 'jwhyun2215@gmail.com' }

    await expect(createAccessToken({ clientId: 'client-1', userId: 'user-1' }))
      .rejects.toThrow('Account is not authorized')
    expect(insertValues).not.toHaveBeenCalled()
  })
})
