// @vitest-environment node
/**
 * 세션 user.id 는 token.sub 에서 온다. Auth.js 는 어댑터 없이 로그인마다 임의 id 를 만들기 때문에
 * token.sub 를 users.id 로 고정하지 않으면 session.user.id 로 계정을 찾는 경로가 전부 어긋난다 (DEV-4471).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Callbacks = {
  signIn: (args: { user: Record<string, unknown>; account?: unknown }) => Promise<boolean>
  jwt: (args: { token: Record<string, unknown>; user?: Record<string, unknown> }) => Promise<Record<string, unknown> | null>
  session: (args: { session: { user: Record<string, unknown> }; token: Record<string, unknown> }) => Promise<{ user: Record<string, unknown> }>
}

const mocks = vi.hoisted(() => ({
  config: null as null | { callbacks: unknown },
  results: [] as unknown[][],
  dbDown: false,
}))

vi.mock('next-auth', () => ({
  default: (config: { callbacks: unknown }) => {
    mocks.config = config
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() }
  },
}))
vi.mock('next-auth/providers/google', () => ({ default: () => ({ id: 'google' }) }))
vi.mock('drizzle-orm', () => ({ eq: () => ({}), and: () => ({}), sql: () => ({}) }))
vi.mock('@gpters/lib/core', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@gpters/lib/account-access', () => ({
  GPTTERS_EMAIL_DOMAIN: 'gpters.org',
  isAllowedAccountEmail: async () => true,
}))
// 패키지 기본 설정(packages/lib/src/core/auth.ts)은 같은 의존성을 상대 경로로 가져온다
vi.mock('../../../../packages/lib/src/core/logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('../../../../packages/lib/src/account-access', () => ({
  GPTTERS_EMAIL_DOMAIN: 'gpters.org',
  isAllowedAccountEmail: async () => true,
}))
vi.mock('@gpters/db', () => {
  // select() 호출마다 큐에서 결과 한 묶음을 꺼낸다. where() 결과는 await 도 되고 limit() 도 된다.
  const select = () => {
    if (mocks.dbDown) throw new Error('database unavailable')
    const rows = mocks.results.shift() ?? []
    const whereResult = Object.assign(Promise.resolve(rows), { limit: async () => rows })
    return { from: () => ({ where: () => whereResult }) }
  }
  const update = () => ({ set: () => ({ where: async () => undefined }) })
  const insert = () => ({ values: async () => undefined })
  return { db: { select, update, insert }, users: {}, organizations: {}, orgMemberships: {} }
})

// 웹 설정과 패키지 기본 설정 두 NextAuth 인스턴스를 모두 검사한다 — 한쪽만 고치면 다시 갈라진다
await import('../../lib/core/auth-config')
const webCallbacks = mocks.config!.callbacks as Callbacks
await import('../../../../packages/lib/src/core/auth')
const packageCallbacks = mocks.config!.callbacks as Callbacks

beforeEach(() => {
  mocks.results = []
  mocks.dbDown = false
  delete process.env.RONA_API_URL
})

describe.each([
  ['web auth-config', webCallbacks],
  ['package core/auth', packageCallbacks],
])('session subject is the account id (%s)', (_name, callbacks) => {
  it('signIn pins user.id to the existing account id so the new token subject matches users.id', async () => {
    mocks.results = [
      [{ id: 'org-1' }], // matching organizations
      [{ id: 'account-1', role: 'admin', accountStatus: 'active', ronaUserId: 'r' }], // existing user
      [{ status: 'active' }], // existing membership
    ]
    const user: Record<string, unknown> = { id: 'random-login-id', email: 'Member@gpters.org' }

    expect(await callbacks.signIn({ user })).toBe(true)
    expect(user.id).toBe('account-1')

    // 패키지 설정은 로그인 직후에도 계정을 다시 조회한다 (웹 설정은 쓰지 않고 남긴다)
    mocks.results = [
      [{ id: 'account-1', role: 'admin', accountStatus: 'active' }],
      [{ orgId: 'org-1', role: 'org_admin' }],
    ]
    const token = await callbacks.jwt({ token: { sub: 'random-login-id', email: 'member@gpters.org' }, user })
    expect(token?.sub).toBe('account-1')
  })

  it('an already-issued token with a stale subject is corrected on the next request', async () => {
    mocks.results = [
      [{ id: 'account-1', role: 'admin', accountStatus: 'active' }], // users by email
      [{ orgId: 'org-1', role: 'org_admin' }], // memberships
    ]

    const token = await callbacks.jwt({ token: { sub: 'stale-session-id', email: 'member@gpters.org' } })
    expect(token?.sub).toBe('account-1')

    const session = await callbacks.session({ session: { user: {} }, token: token! })
    expect(session.user.id).toBe('account-1')
  })

  it('keeps a recently verified token through a short database outage', async () => {
    mocks.dbDown = true
    const token = { sub: 'account-1', email: 'member@gpters.org', role: 'admin', tokenRefreshedAt: Date.now() - 60_000 }

    expect(await callbacks.jwt({ token })).toMatchObject({ sub: 'account-1', role: 'admin' })
  })

  it('cuts the outage grace exactly at 30 minutes', async () => {
    // 경계를 고정해 둬야 상수를 몰래 늘리거나 줄이는 변경이 테스트에 걸린다
    mocks.dbDown = true
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-09-21T00:00:00Z'))
      const at = (msAgo: number) => ({ sub: 'account-1', email: 'member@gpters.org', role: 'admin', tokenRefreshedAt: Date.now() - msAgo })
      const GRACE = 30 * 60_000

      expect(await callbacks.jwt({ token: at(GRACE - 1) })).not.toBeNull()
      expect(await callbacks.jwt({ token: at(GRACE) })).not.toBeNull()
      expect(await callbacks.jwt({ token: at(GRACE + 1) })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops the session when the database stays unreachable past the 30 minute grace window', async () => {
    mocks.dbDown = true
    // 정지 여부를 확인하지 못한 채 오래된 토큰의 권한을 계속 쓰게 두지 않는다
    const stale = { sub: 'account-1', email: 'member@gpters.org', role: 'admin', tokenRefreshedAt: Date.now() - 31 * 60_000 }
    expect(await callbacks.jwt({ token: stale })).toBeNull()
    expect(await callbacks.jwt({ token: { sub: 'account-1', email: 'member@gpters.org', role: 'admin' } })).toBeNull()
  })

  it('does not trust a future verification time during an outage', async () => {
    mocks.dbDown = true
    const skewed = { sub: 'account-1', email: 'member@gpters.org', role: 'admin', tokenRefreshedAt: Date.now() + 60 * 60_000 }

    expect(await callbacks.jwt({ token: skewed })).toBeNull()
  })

  it('still rejects a suspended account instead of repairing its token', async () => {
    mocks.results = [[{ id: 'account-1', role: 'admin', accountStatus: 'suspended' }]]

    expect(await callbacks.jwt({ token: { sub: 'stale', email: 'member@gpters.org' } })).toBeNull()
  })
})
