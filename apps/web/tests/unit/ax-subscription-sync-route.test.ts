// @vitest-environment node
/**
 * 구독 로스터 동기화 API (DEV-4486) — 뽀밋이가 plan 으로 미리 보고, 그 해시로만 apply 한다
 */
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

type Query = { op: 'update' | 'insert' | 'delete'; values?: unknown; ids?: unknown }

const mocks = vi.hoisted(() => ({
  existing: [] as Array<Record<string, unknown>>,
  batch: vi.fn(async (queries: unknown[]) => queries),
  /** false 면 로컬 postgres-js 처럼 batch 가 없어 transaction 경로를 탄다 */
  hasBatch: true,
  transaction: vi.fn(async (run: (tx: unknown) => Promise<void>) => run({})),
}))

vi.mock('drizzle-orm', () => ({
  eq: (_column: unknown, value: unknown) => ({ eq: value }),
  inArray: (_column: unknown, values: unknown) => ({ inArray: values }),
}))

vi.mock('@/lib/db', () => ({
  axSubscriptions: {},
  db: {
    select: () => ({ from: async () => mocks.existing }),
    update: () => ({ set: (values: unknown) => ({ where: (where: { eq: unknown }) => ({ op: 'update', values, ids: where.eq }) }) }),
    insert: () => ({ values: (values: unknown) => ({ op: 'insert', values }) }),
    delete: () => ({ where: (where: { inArray: unknown }) => ({ op: 'delete', ids: where.inArray }) }),
    get batch() { return mocks.hasBatch ? mocks.batch : undefined },
    transaction: (run: (tx: unknown) => Promise<void>) => mocks.transaction(run),
  },
}))

const { POST } = await import('../../app/api/ax/subscription-sync/route')

const TOKEN = 'bbomit-sync-token'
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const HEADER = 'name,account,plan,price_usd,renewal_day,payer'

function request(body: unknown, token: string | null = TOKEN) {
  return new NextRequest('http://localhost/api/ax/subscription-sync', {
    method: 'POST',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const existingRow = (id: string, ownerName: string, plan: string, renewalDay: number, amount: string) => ({
  id, vendor: 'Anthropic', plan, ownerName, renewalDay, payer: '본인', amount, currency: 'USD', billingCycle: 'monthly', status: 'active', note: null,
})

const csv = (...lines: string[]) => [HEADER, ...lines].join('\n')

async function planFor(body: string) {
  const response = await POST(request({ mode: 'plan', csv: body }))
  return { response, json: await response.json() }
}

describe('POST /api/ax/subscription-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.batch.mockImplementation(async (queries: unknown[]) => queries)
    mocks.hasBatch = true
    vi.stubEnv('AX_SUBSCRIPTION_SYNC_TOKEN_SHA256', sha256(TOKEN))
    mocks.existing = [
      existingRow('a', '홍길동', 'Max20x', 6, '200.00'),
      existingRow('b', '김철수', 'Max5x', 14, '100.00'),
    ]
  })
  afterEach(() => vi.unstubAllEnvs())

  it('설정이 없으면 503, 토큰이 없거나 틀리면 401', async () => {
    const body = { mode: 'plan', csv: csv('홍길동,anthropic,Max20x,200,6,본인') }
    expect((await POST(request(body, null))).status).toBe(401)
    expect((await POST(request(body, 'wrong'))).status).toBe(401)
    vi.stubEnv('AX_SUBSCRIPTION_SYNC_TOKEN_SHA256', '')
    expect((await POST(request(body))).status).toBe(503)
  })

  it('카드·슬랙 열이 있는 CSV 는 받지 않는다', async () => {
    const body = { mode: 'plan', csv: 'name,slack_id,account,plan,price_usd,renewal_day,payer,card_last4\n홍길동,U1,anthropic,Max20x,200,6,본인,1234' }
    const response = await POST(request(body))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/slack_id, card_last4/)
  })

  it('빈 로스터·필수 열 없음·잘못된 행·64KB 초과는 거절한다', async () => {
    expect((await POST(request({ mode: 'plan', csv: HEADER }))).status).toBe(400)
    expect((await POST(request({ mode: 'plan', csv: 'name,plan\n홍길동,Max20x' }))).status).toBe(400)
    const invalid = await POST(request({ mode: 'plan', csv: csv('홍길동,anthropic,Max20x,abc,6,본인') }))
    expect(invalid.status).toBe(400)
    expect((await invalid.json()).details).toHaveLength(1)
    expect((await POST(request({ mode: 'plan', csv: 'x'.repeat(65 * 1024) }))).status).toBe(413)
    expect((await POST(request({ mode: 'other', csv: HEADER }))).status).toBe(400)
  })

  it('plan 은 DB 를 쓰지 않고, 같은 로스터면 unchanged 다', async () => {
    const { response, json } = await planFor(csv('홍길동,anthropic,Max20x,200,6,본인', '김철수,anthropic,Max5x,100,14,본인'))
    expect(response.status).toBe(200)
    expect(json.status).toBe('unchanged')
    expect(json.counts).toEqual({ update: 0, insert: 0, remove: 0 })
    expect(mocks.batch).not.toHaveBeenCalled()
  })

  it('플랜 변경은 삭제 1 + 추가 1 로 계획하고 금액은 응답에 넣지 않는다', async () => {
    const { json } = await planFor(csv('홍길동,anthropic,Max20x,200,6,본인', '김철수,anthropic,Max20x,200,3,본인'))
    expect(json.status).toBe('planned')
    expect(json.counts).toEqual({ update: 0, insert: 1, remove: 1 })
    expect(json.removed).toEqual([{ vendor: 'Anthropic', plan: 'Max5x', ownerName: '김철수', renewalDay: 14 }])
    expect(json.inserted).toEqual([{ vendor: 'Anthropic', plan: 'Max20x', ownerName: '김철수', renewalDay: 3 }])
    const { planHash: _planHash, ...shown } = json
    expect(JSON.stringify(shown)).not.toMatch(/amount|200|100/)
  })

  it('apply 는 해시가 없으면 400, 다르면 409 로 반영하지 않는다', async () => {
    const roster = csv('홍길동,anthropic,Max20x,200,6,본인')
    expect((await POST(request({ mode: 'apply', csv: roster }))).status).toBe(400)

    const conflict = await POST(request({ mode: 'apply', csv: roster, approvedPlanHash: 'f'.repeat(64) }))
    expect(conflict.status).toBe(409)
    expect(mocks.batch).not.toHaveBeenCalled()
  })

  it('plan 에서 받은 해시로 apply 하면 한 batch 로 갱신·추가·삭제하고 synced_at 을 맞춘다', async () => {
    const roster = csv('홍길동,anthropic,Max20x,200,6,본인', '이영희,openai,Plus,20,21,본인')
    const { json: plan } = await planFor(roster)

    const response = await POST(request({ mode: 'apply', csv: roster, approvedPlanHash: plan.planHash }))
    expect(response.status).toBe(200)
    expect((await response.json()).status).toBe('applied')
    expect(mocks.batch).toHaveBeenCalledTimes(1)

    const queries = mocks.batch.mock.calls[0][0] as Query[]
    expect(queries.map((query) => query.op)).toEqual(['update', 'insert', 'delete'])
    expect(queries[0]).toMatchObject({ ids: 'a', values: { plan: 'Max20x', amount: '200.00', syncedAt: expect.any(Date) } })
    expect(queries[0].values).not.toHaveProperty('note')
    expect(queries[1].values).toEqual([expect.objectContaining({ vendor: 'OpenAI', plan: 'Plus', ownerName: '이영희', amount: '20.00' })])
    expect(queries[2].ids).toEqual(['b'])
  })

  it('계획 뒤 DB 가 바뀌면 같은 해시로도 409', async () => {
    const roster = csv('홍길동,anthropic,Max20x,200,6,본인')
    const { json: plan } = await planFor(roster)
    mocks.existing = [...mocks.existing, existingRow('c', '박수오', 'Pro', 1, '20.00')]

    expect((await POST(request({ mode: 'apply', csv: roster, approvedPlanHash: plan.planHash }))).status).toBe(409)
    expect(mocks.batch).not.toHaveBeenCalled()
  })

  describe('동시 apply — 구독 키 유니크 제약(0043, DEV-4491)', () => {
    /** 드라이버 오류를 drizzle 처럼 cause 로 감싼 unique violation */
    const uniqueViolation = (constraint: string, field: 'constraint' | 'constraint_name' = 'constraint') =>
      Object.assign(new Error('Failed query: insert into "ax_subscriptions" ...'), {
        cause: Object.assign(new Error(`duplicate key value violates unique constraint "${constraint}"`), { code: '23505', [field]: constraint }),
      })

    const keyOf = (row: Record<string, unknown>) => [row.vendor, row.plan, row.ownerName ?? null, row.renewalDay ?? null].join('|')

    it('같은 해시로 거의 동시에 두 번 apply 해도 insert 는 한 번만 남고 늦은 쪽은 409 로 다시 plan 하게 한다', async () => {
      const roster = csv('홍길동,anthropic,Max20x,200,6,본인', '김철수,anthropic,Max5x,100,14,본인', '이영희,openai,Plus,20,21,본인')
      const { json: plan } = await planFor(roster)
      expect(plan.counts).toEqual({ update: 0, insert: 1, remove: 0 })

      // 제약이 있는 테이블처럼 동작하는 batch: 한 트랜잭션 — 키가 겹치면 아무것도 쓰지 않고 실패한다
      const table = new Map(mocks.existing.map((row) => [keyOf(row), row]))
      mocks.batch.mockImplementation(async (queries: unknown[]) => {
        const inserts = (queries as Query[]).filter((query) => query.op === 'insert').flatMap((query) => query.values as Array<Record<string, unknown>>)
        if (inserts.some((row) => table.has(keyOf(row)))) throw uniqueViolation('ax_subscriptions_key_uniq')
        for (const row of inserts) table.set(keyOf(row), row)
        return queries
      })

      // 둘 다 같은 existing 을 읽고 해시 확인을 통과한 뒤 batch 에 들어간다
      const responses = await Promise.all([
        POST(request({ mode: 'apply', csv: roster, approvedPlanHash: plan.planHash })),
        POST(request({ mode: 'apply', csv: roster, approvedPlanHash: plan.planHash })),
      ])
      expect(mocks.batch).toHaveBeenCalledTimes(2)
      expect(responses.map((response) => response.status).sort()).toEqual([200, 409])

      const late = responses.find((response) => response.status === 409)!
      const json = await late.json()
      expect(json.status).toBe('conflict')
      expect(json.error).toMatch(/run plan again/i)
      expect([...table.keys()].filter((key) => key.startsWith('OpenAI|Plus|이영희'))).toHaveLength(1)
      expect(table.size).toBe(3)
    })

    it('로컬 postgres-js(transaction 경로)의 constraint_name 도 409 로 다룬다', async () => {
      mocks.hasBatch = false
      mocks.transaction.mockRejectedValueOnce(uniqueViolation('ax_subscriptions_key_uniq', 'constraint_name'))
      const roster = csv('홍길동,anthropic,Max20x,200,6,본인', '김철수,anthropic,Max5x,100,14,본인', '이영희,openai,Plus,20,21,본인')
      const { json: plan } = await planFor(roster)

      const response = await POST(request({ mode: 'apply', csv: roster, approvedPlanHash: plan.planHash }))
      expect(response.status).toBe(409)
      expect(mocks.transaction).toHaveBeenCalledTimes(1)
      expect(mocks.batch).not.toHaveBeenCalled()
    })

    it('다른 제약 위반이나 다른 DB 오류는 충돌로 숨기지 않고 500 이다', async () => {
      const roster = csv('홍길동,anthropic,Max20x,200,6,본인', '김철수,anthropic,Max5x,100,14,본인', '이영희,openai,Plus,20,21,본인')
      const { json: plan } = await planFor(roster)
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})

      mocks.batch.mockRejectedValueOnce(uniqueViolation('ax_subscriptions_pkey'))
      expect((await POST(request({ mode: 'apply', csv: roster, approvedPlanHash: plan.planHash }))).status).toBe(500)
      mocks.batch.mockRejectedValueOnce(new Error('connection reset'))
      expect((await POST(request({ mode: 'apply', csv: roster, approvedPlanHash: plan.planHash }))).status).toBe(500)
      errorLog.mockRestore()
    })
  })
})
