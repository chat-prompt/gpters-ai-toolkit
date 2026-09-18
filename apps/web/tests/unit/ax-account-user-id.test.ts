// @vitest-environment node
/** 검토자 판정은 세션 id 가 아니라 로그인 이메일로 찾은 활성 계정의 users.id 로 한다 (DEV-4319) */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rows: [] as Array<{ id: string }>, where: vi.fn() }))
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return { ...actual, eq: (_column: unknown, value: unknown) => ({ eq: value }), and: (...conds: unknown[]) => ({ and: conds }) }
})
vi.mock('@gpters/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (cond: unknown) => {
          mocks.where(cond)
          return { limit: async () => mocks.rows }
        },
      }),
    }),
  },
  users: { id: 'users.id', email: 'users.email', accountStatus: 'users.account_status' },
  axIncidentReviews: {},
}))

const { resolveAccountUserId } = await import('../../../../packages/lib/src/features/ax/incident-review-store')

beforeEach(() => {
  mocks.rows = []
  mocks.where.mockReset()
})

describe('resolveAccountUserId', () => {
  it('normalizes the email and only matches active accounts', async () => {
    mocks.rows = [{ id: 'account-1' }]
    expect(await resolveAccountUserId('  Operator@Example.org ')).toBe('account-1')
    expect(mocks.where).toHaveBeenCalledWith({ and: [{ eq: 'operator@example.org' }, { eq: 'active' }] })
  })

  it('returns null for a missing, blank, unknown or inactive account without guessing', async () => {
    expect(await resolveAccountUserId(undefined)).toBeNull()
    expect(await resolveAccountUserId('   ')).toBeNull()
    expect(mocks.where).not.toHaveBeenCalled()
    mocks.rows = []
    expect(await resolveAccountUserId('suspended@example.org')).toBeNull()
  })
})
