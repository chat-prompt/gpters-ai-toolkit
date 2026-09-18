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
vi.mock('@gpters/db', () => {
  // select() 호출마다 큐에서 결과 한 묶음을 꺼낸다. where() 결과는 await 도 되고 limit() 도 된다.
  const select = () => {
    const rows = mocks.results.shift() ?? []
    const whereResult = Object.assign(Promise.resolve(rows), { limit: async () => rows })
    return { from: () => ({ where: () => whereResult }) }
  }
  const update = () => ({ set: () => ({ where: async () => undefined }) })
  const insert = () => ({ values: async () => undefined })
  return { db: { select, update, insert }, users: {}, organizations: {}, orgMemberships: {} }
})

const { handlers } = await import('../../lib/core/auth-config')
void handlers
const callbacks = mocks.config!.callbacks as Callbacks

beforeEach(() => {
  mocks.results = []
  delete process.env.RONA_API_URL
})

describe('session subject is the account id', () => {
  it('signIn pins user.id to the existing account id so the new token subject matches users.id', async () => {
    mocks.results = [
      [{ id: 'org-1' }], // matching organizations
      [{ id: 'account-1', role: 'admin', accountStatus: 'active', ronaUserId: 'r' }], // existing user
      [{ status: 'active' }], // existing membership
    ]
    const user: Record<string, unknown> = { id: 'random-login-id', email: 'Member@gpters.org' }

    expect(await callbacks.signIn({ user })).toBe(true)
    expect(user.id).toBe('account-1')

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

  it('still rejects a suspended account instead of repairing its token', async () => {
    mocks.results = [[{ id: 'account-1', role: 'admin', accountStatus: 'suspended' }]]

    expect(await callbacks.jwt({ token: { sub: 'stale', email: 'member@gpters.org' } })).toBeNull()
  })
})
