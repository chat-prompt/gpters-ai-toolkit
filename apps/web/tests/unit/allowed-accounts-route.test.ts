/**
 * 개별 승인 외부 계정 관리 API 테스트
 *
 * 슈퍼 어드민 게이트, 주소 검증, 중복·미존재 처리, 승인자 기록을 확인한다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const session = vi.hoisted(() => ({
  current: null as { user?: { id: string; role: string } } | null,
}))
const store = vi.hoisted(() => ({
  rows: [] as { email: string }[],
  inserted: [] as Record<string, unknown>[],
  deleted: [] as string[],
}))

vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  eq: (column: unknown, value: unknown) => ({ column, value }),
}))

vi.mock('@/lib/core/auth', () => ({
  auth: vi.fn(async () => session.current),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({ orderBy: vi.fn(async () => store.rows) })),
        where: vi.fn((condition: { value: string }) => ({
          limit: vi.fn(async () => store.rows.filter(row => row.email === condition.value)),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((data: Record<string, unknown>) => ({
        returning: vi.fn(async () => {
          store.inserted.push(data)
          return [data]
        }),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn((condition: { value: string }) => ({
        returning: vi.fn(async () => {
          const match = store.rows.filter(row => row.email === condition.value)
          if (match.length > 0) store.deleted.push(condition.value)
          return match
        }),
      })),
    })),
  },
}))

vi.mock('@/lib/db/schema', () => ({
  allowedExternalAccounts: {
    email: 'allowed_external_accounts.email',
    note: 'allowed_external_accounts.note',
    createdAt: 'allowed_external_accounts.created_at',
    addedByUserId: 'allowed_external_accounts.added_by_user_id',
  },
  users: { id: 'users.id', email: 'users.email' },
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  withRateLimit: () => null,
  RateLimitPresets: { admin: { limit: 30, windowSec: 60 } },
}))

vi.mock('@/lib/core/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

const { GET, POST, DELETE } = await import('../../app/api/admin/allowed-accounts/route')

function post(body: unknown) {
  return new NextRequest('http://localhost/api/admin/allowed-accounts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function del(query: string) {
  return new NextRequest(`http://localhost/api/admin/allowed-accounts${query}`, { method: 'DELETE' })
}

function get() {
  return new NextRequest('http://localhost/api/admin/allowed-accounts')
}

describe('allowed external accounts API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store.rows = []
    store.inserted = []
    store.deleted = []
    session.current = { user: { id: 'super-1', role: 'super_admin' } }
  })

  it('슈퍼 어드민만 목록을 볼 수 있다', async () => {
    store.rows = [{ email: 'guest@example.com' }]
    expect((await GET(get())).status).toBe(200)

    session.current = { user: { id: 'admin-1', role: 'admin' } }
    expect((await GET(get())).status).toBe(403)

    session.current = null
    expect((await GET(get())).status).toBe(401)
  })

  it('승인 시 주소를 정규화하고 승인자를 함께 기록한다', async () => {
    const response = await POST(post({ email: '  GPTers.Admin.Agent@Gmail.com ', note: ' 운영 봇 ' }))

    expect(response.status).toBe(201)
    expect(store.inserted).toEqual([
      {
        email: 'gpters.admin.agent@gmail.com',
        note: '운영 봇',
        addedByUserId: 'super-1',
      },
    ])
  })

  it('잘못된 주소와 이미 통과하는 GPTers 계정은 거부한다', async () => {
    expect((await POST(post({}))).status).toBe(400)
    expect((await POST(post({ email: '   ' }))).status).toBe(400)
    expect((await POST(post({ email: 'not-an-email' }))).status).toBe(400)
    expect((await POST(post({ email: 'member@gpters.org' }))).status).toBe(400)
    expect((await POST(post({ email: 'guest@example.com', note: 7 }))).status).toBe(400)

    expect(store.inserted).toHaveLength(0)
  })

  it('이미 승인된 계정은 중복 추가하지 않는다', async () => {
    store.rows = [{ email: 'guest@example.com' }]

    const response = await POST(post({ email: 'Guest@Example.com' }))

    expect(response.status).toBe(409)
    expect(store.inserted).toHaveLength(0)
  })

  it('승인 취소는 정규화된 주소로 지우고, 없는 계정은 404를 준다', async () => {
    store.rows = [{ email: 'guest@example.com' }]

    expect((await DELETE(del('?email=Guest%40Example.com'))).status).toBe(200)
    expect(store.deleted).toEqual(['guest@example.com'])

    expect((await DELETE(del('?email=nobody%40example.com'))).status).toBe(404)
    expect((await DELETE(del(''))).status).toBe(400)
  })

  it('일반 어드민은 승인을 추가하거나 취소할 수 없다', async () => {
    session.current = { user: { id: 'admin-1', role: 'admin' } }

    expect((await POST(post({ email: 'guest@example.com' }))).status).toBe(403)
    expect((await DELETE(del('?email=guest%40example.com'))).status).toBe(403)
    expect(store.inserted).toHaveLength(0)
    expect(store.deleted).toHaveLength(0)
  })
})
