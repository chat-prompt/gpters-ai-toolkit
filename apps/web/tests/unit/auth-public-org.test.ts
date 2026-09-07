/**
 * 계정 접근 정책 테스트
 *
 * gpters.org 도메인 게이트는 코드에 고정이고, 그 밖의 계정은
 * DB의 개별 승인 목록(allowed_external_accounts)에 있을 때만 통과한다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const lookup = vi.hoisted(() => ({
  approved: [] as string[],
  queried: [] as unknown[],
}))

vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  eq: (column: unknown, value: unknown) => ({ column, value }),
}))

vi.mock('@gpters/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((condition: { value: string }) => {
          lookup.queried.push(condition.value)
          return {
            limit: vi.fn(async () =>
              lookup.approved.includes(condition.value) ? [{ email: condition.value }] : []
            ),
          }
        }),
      })),
    })),
  },
  allowedExternalAccounts: { email: 'allowed_external_accounts.email' },
}))

import { isAllowedAccountEmail, isGptersEmail } from '@gpters/lib/account-access'

describe('GPTers account access policy', () => {
  beforeEach(() => {
    lookup.approved = []
    lookup.queried = []
  })

  it('accepts exact gpters.org email addresses', () => {
    expect(isGptersEmail('member@gpters.org')).toBe(true)
    expect(isGptersEmail('Member+toolkit@GPTERS.ORG')).toBe(true)
    expect(isGptersEmail('  member@gpters.org  ')).toBe(true)
  })

  it('rejects personal, malformed, and lookalike domains', () => {
    expect(isGptersEmail('jwhyun2215@gmail.com')).toBe(false)
    expect(isGptersEmail('member@notgpters.org')).toBe(false)
    expect(isGptersEmail('member@gpters.org.example.com')).toBe(false)
    expect(isGptersEmail('@gpters.org')).toBe(false)
    expect(isGptersEmail('member@gpters.org@evil.com')).toBe(false)
    expect(isGptersEmail(undefined)).toBe(false)
    expect(isGptersEmail(null)).toBe(false)
  })

  it('admits GPTers accounts without touching the approval table', async () => {
    await expect(isAllowedAccountEmail('member@gpters.org')).resolves.toBe(true)

    expect(lookup.queried).toHaveLength(0)
  })

  it('admits an external account only while it is on the approval list', async () => {
    lookup.approved = ['guest@example.com']
    await expect(isAllowedAccountEmail('guest@example.com')).resolves.toBe(true)

    lookup.approved = []
    await expect(isAllowedAccountEmail('guest@example.com')).resolves.toBe(false)
  })

  it('does not let one approval open the rest of its domain', async () => {
    lookup.approved = ['guest@example.com']

    await expect(isAllowedAccountEmail('someone-else@example.com')).resolves.toBe(false)
    await expect(isAllowedAccountEmail('guest@example.com.evil.com')).resolves.toBe(false)
  })

  it('looks up approvals by the normalized address', async () => {
    lookup.approved = ['guest@example.com']

    await expect(isAllowedAccountEmail('  GUEST@Example.com ')).resolves.toBe(true)
    expect(lookup.queried).toEqual(['guest@example.com'])
  })

  it('rejects missing addresses without querying', async () => {
    await expect(isAllowedAccountEmail(undefined)).resolves.toBe(false)
    await expect(isAllowedAccountEmail(null)).resolves.toBe(false)
    await expect(isAllowedAccountEmail('')).resolves.toBe(false)

    expect(lookup.queried).toHaveLength(0)
  })
})
