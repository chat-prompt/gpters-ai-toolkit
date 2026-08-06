/**
 * AX 대시보드 — 팀원별 구독 패널 테스트
 *
 * db는 모킹하고, 패널이 벤더별로 어떻게 집계·환산하는지와
 * isAdmin이 아닐 때 개인 식별 데이터(members)가 절대 노출되지 않는지를 검증한다.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@gpters/db', () => ({
  db: { select: vi.fn() },
  axSubscriptions: { name: 'ax_subscriptions', status: 'status' },
}))

vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const { subscriptionsPanel } = await import('../../../../packages/lib/src/features/ax/subscriptions')
const { db } = await import('@gpters/db')

/** 어떤 체이닝(from/where…)에도 자신을 돌려주고, await 하면 결과를 내는 쿼리 빌더 */
function builder(result: unknown) {
  const stub: Record<string, unknown> = {}
  for (const method of ['from', 'where', 'limit']) {
    stub[method] = vi.fn(() => stub)
  }
  stub.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return stub
}

function queueRows(rows: unknown[]) {
  vi.mocked(db.select).mockReset()
  vi.mocked(db.select).mockReturnValueOnce(builder(rows) as never)
}

const memberRow = (overrides: Record<string, unknown> = {}) => ({
  vendor: 'Claude Max',
  plan: 'Max 20x',
  ownerName: '진우',
  renewalDay: 11,
  payer: '본인',
  amount: 200000,
  currency: 'KRW',
  billingCycle: 'monthly',
  status: 'active',
  ...overrides,
})

describe('subscriptionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('meta가 레지스트리 계약과 일치한다', () => {
    expect(subscriptionsPanel.meta.id).toBe('subscriptions')
    expect(subscriptionsPanel.meta.visibility).toBe('org')
  })

  it('isAdmin=false면 members가 null이고 응답 어디에도 이메일이 실리지 않는다', async () => {
    queueRows([
      memberRow(),
      memberRow({ vendor: 'ChatGPT Pro', plan: 'Pro', ownerName: '혜민', amount: 20, currency: 'USD' }),
    ])

    const result = await subscriptionsPanel.load({ days: 30, isAdmin: false, orgId: null })

    expect(result.status).toBe('ok')
    expect(result.data!.members).toBeNull()
    // 회귀 가드: 직렬화한 응답 전체에 이메일·이름 흔적이 없어야 한다
    expect(JSON.stringify(result)).not.toContain('@')
    expect(JSON.stringify(result)).not.toContain('진우')
    expect(JSON.stringify(result)).not.toContain('혜민')
  })

  it('isAdmin=true면 members가 팀원별 상세로 채워진다', async () => {
    queueRows([memberRow()])

    const result = await subscriptionsPanel.load({ days: 30, isAdmin: true, orgId: null })

    expect(result.data!.members).toEqual([
      {
        // 이메일은 아예 담지 않는다 — 이 화면에 필요한 건 연락처가 아니다
        ownerName: '진우',
        vendor: 'Claude Max',
        plan: 'Max 20x',
        amount: 200000,
        currency: 'KRW',
        billingCycle: 'monthly',
        renewalDay: 11,
        payer: '본인',
        status: 'active',
      },
    ])
  })

  it('yearly 구독은 12로 나눠 월 환산한다', async () => {
    queueRows([memberRow({ amount: 2400000, billingCycle: 'yearly' })])

    const result = await subscriptionsPanel.load({ days: 30, isAdmin: false, orgId: null })

    expect(result.data!.monthlyByCurrency).toEqual({ KRW: 200000 })
    expect(result.data!.byVendor[0].monthlyByCurrency).toEqual({ KRW: 200000 })
  })

  it('통화가 섞여 있으면 환율 환산 없이 통화별로 분리 합산한다', async () => {
    queueRows([
      memberRow({ vendor: 'Claude Max', amount: 200000, currency: 'KRW' }),
      memberRow({ vendor: 'ChatGPT Pro', plan: 'Pro', amount: 20, currency: 'USD' }),
    ])

    const result = await subscriptionsPanel.load({ days: 30, isAdmin: false, orgId: null })

    expect(result.data!.activeSeats).toBe(2)
    expect(result.data!.monthlyByCurrency).toEqual({ KRW: 200000, USD: 20 })

    const byVendor = result.data!.byVendor
    expect(byVendor.find((v) => v.vendor === 'Claude Max')!.monthlyByCurrency).toEqual({ KRW: 200000 })
    expect(byVendor.find((v) => v.vendor === 'ChatGPT Pro')!.monthlyByCurrency).toEqual({ USD: 20 })
  })

  it('0건이면 status는 ok이고 빈 집계를 돌려준다', async () => {
    queueRows([])

    const result = await subscriptionsPanel.load({ days: 30, isAdmin: true, orgId: null })

    expect(result.status).toBe('ok')
    expect(result.data).toEqual({
      syncedAt: null,
      activeSeats: 0,
      monthlyByCurrency: {},
      byVendor: [],
      members: [],
    })
  })

  it('쿼리가 실패하면 throw하지 않고 error 상태를 반환한다', async () => {
    vi.mocked(db.select).mockReset()
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error('connection refused')
    })

    const result = await subscriptionsPanel.load({ days: 30, isAdmin: false, orgId: null })

    expect(result.status).toBe('error')
    expect(result.data).toBeNull()
    expect(result.message).toBeTruthy()
    expect(result.meta.id).toBe('subscriptions')
  })
})
