/**
 * 구독 갱신 결정표 (EDU-11519) — 주마다 초기화 전 마지막 보고값을 잡아 결제 주기 평균을 낸다
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@gpters/db', () => ({ db: {}, axClientUsage: {}, axSubscriptions: {} }))
vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

const { buildRenewalRows, renewalCycle } = await import('../../../../packages/lib/src/features/ax/subscription-renewals')

/** KST 시각 → Date */
const kst = (text: string) => new Date(`${text}+09:00`)

const sub = (overrides: Record<string, unknown> = {}) => ({
  ownerName: '홍길동',
  vendor: 'Anthropic',
  plan: 'Max20x',
  amount: '200.00',
  currency: 'USD',
  renewalDay: 25,
  billingCycle: 'monthly' as const,
  ...overrides,
})

const report = (resetsAt: string, syncedAt: string, percent: number | string | null, overrides: Record<string, unknown> = {}) => ({
  memberName: '홍길동',
  client: 'claude-code' as const,
  limitUsedPercent: percent,
  limitResetsAt: kst(resetsAt),
  syncedAt: kst(syncedAt),
  ...overrides,
})

describe('renewalCycle', () => {
  it('이번 달 결제일이 남았으면 이번 달, 지났으면 다음 달이 다음 결제일이다 (KST)', () => {
    expect(renewalCycle(25, kst('2026-10-19T12:00:00'))).toEqual({
      previous: kst('2026-09-25T00:00:00'), next: kst('2026-10-25T00:00:00'),
    })
    expect(renewalCycle(5, kst('2026-10-19T12:00:00'))).toEqual({
      previous: kst('2026-10-05T00:00:00'), next: kst('2026-11-05T00:00:00'),
    })
    // 결제일 당일은 오늘이 다음 결제일
    expect(renewalCycle(19, kst('2026-10-19T23:00:00')).next).toEqual(kst('2026-10-19T00:00:00'))
  })

  it('그 달에 없는 결제일은 말일로 당기고, 연도를 넘긴다', () => {
    expect(renewalCycle(31, kst('2027-02-10T09:00:00'))).toEqual({
      previous: kst('2027-01-31T00:00:00'), next: kst('2027-02-28T00:00:00'),
    })
    expect(renewalCycle(3, kst('2026-12-20T09:00:00'))).toEqual({
      previous: kst('2026-12-03T00:00:00'), next: kst('2027-01-03T00:00:00'),
    })
  })
})

describe('buildRenewalRows', () => {
  const now = kst('2026-10-19T12:00:00')

  it('회차마다 초기화 전에 받은 값의 최댓값을 쓰고 평균한다', () => {
    const rows = buildRenewalRows([sub()], [
      // 9/30 초기화 회차: 최댓값 80. 다른 머신의 오래된 스냅샷(50)이 더 늦게 와도 80
      report('2026-09-30T10:00:00', '2026-09-28T09:00:00', '80.00'),
      report('2026-09-30T10:00:00', '2026-09-29T09:00:00', 50),
      // 초기화 뒤에 다시 보낸 지난 스냅샷은 뺀다
      report('2026-09-30T10:00:00', '2026-10-01T09:00:00', 95),
      // 10/7 주: 초기화 시각이 초 단위로 흔들려도 같은 주로 묶는다
      report('2026-10-07T10:00:00', '2026-10-06T09:00:00', 40),
      report('2026-10-07T10:00:03', '2026-10-05T09:00:00', 30),
      // 10/14 주
      report('2026-10-14T10:00:00', '2026-10-13T09:00:00', 60),
      // 진행 중인 주는 평균에 넣지 않는다
      report('2026-10-21T10:00:00', '2026-10-19T09:00:00', 35),
      // 지난 결제일(9/25) 전 주는 이번 주기가 아니다
      report('2026-09-23T10:00:00', '2026-09-22T09:00:00', 99),
    ], now)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      ownerName: '홍길동', nextRenewal: '2026-10-25', daysLeft: 6, amount: 200,
      averagePercent: 60, currentPercent: 35,
    })
    expect(rows[0].weeks.map((week) => week.usedPercent)).toEqual([80, 40, 60])
    // 보고 시각은 최댓값(80)을 보고한 행의 것
    expect(rows[0].weeks[0].reportedAt).toBe(kst('2026-09-28T09:00:00').toISOString())
  })

  it('초기화 시각이 30분 경계를 넘나들어도 한 회차로 묶고, 입력 순서와 무관하다', () => {
    const reports = [
      report('2026-10-14T10:29:59', '2026-10-12T09:00:00', 20),
      report('2026-10-14T10:30:01', '2026-10-13T09:00:00', 80),
    ]
    for (const input of [reports, [...reports].reverse()]) {
      const [row] = buildRenewalRows([sub()], input, now)
      expect(row.weeks).toHaveLength(1)
      expect(row.weeks[0]).toMatchObject({ usedPercent: 80, resetsAt: kst('2026-10-14T10:30:01').toISOString() })
    }
  })

  it('결제일 경계에 걸친 회차도 입력 순서와 무관하게 같은 판정을 받는다', () => {
    // 직전 결제일 9/25 00:00 KST. 대표 시각(마지막 초기화 시각)이 경계 뒤라 이번 주기에 든다
    const reports = [
      report('2026-09-24T23:59:59', '2026-09-23T09:00:00', 30),
      report('2026-09-25T00:00:01', '2026-09-24T09:00:00', 80),
    ]
    const forward = buildRenewalRows([sub()], reports, now)[0].weeks
    const backward = buildRenewalRows([sub()], [...reports].reverse(), now)[0].weeks
    expect(forward).toEqual(backward)
    expect(forward.map((week) => week.usedPercent)).toEqual([80])
  })

  it('회차 테이블 행과 하루 단위 행이 같은 회차면 하나로 합쳐 최댓값을 쓴다', () => {
    // 하루 단위 행은 같은 날 초기화 뒤 덮여 40만 남았고, 회차 테이블에는 초기화 직전 90이 남아 있다
    const [row] = buildRenewalRows([sub()], [
      report('2026-10-14T10:00:00', '2026-10-13T09:00:00', 40),
      report('2026-10-14T10:00:00', '2026-10-14T09:55:00', '90.00'),
    ], now)
    expect(row.weeks).toEqual([{
      resetsAt: kst('2026-10-14T10:00:00').toISOString(),
      usedPercent: 90,
      reportedAt: kst('2026-10-14T09:55:00').toISOString(),
    }])
  })

  it('합칠 때 보고 시각은 최댓값을 보고한 행의 것이다 — 낮은 값이 더 늦게 와도', () => {
    const reports = [
      report('2026-10-14T10:00:00', '2026-10-12T09:00:00', 90),
      report('2026-10-14T10:00:00', '2026-10-13T09:00:00', 40),
    ]
    for (const input of [reports, [...reports].reverse()]) {
      const [row] = buildRenewalRows([sub()], input, now)
      expect(row.weeks[0]).toMatchObject({ usedPercent: 90, reportedAt: kst('2026-10-12T09:00:00').toISOString() })
    }
  })

  it('초기화 전 회차가 둘이면 가장 최근에 보고된 쪽을 진행 중으로 본다', () => {
    const [row] = buildRenewalRows([sub()], [
      // 10/21 로 예정됐던 회차가 앞당겨 초기화돼 새 회차(10/26)로 보고가 넘어갔다
      report('2026-10-21T10:00:00', '2026-10-16T09:00:00', 95),
      report('2026-10-26T10:00:00', '2026-10-19T09:00:00', 12),
    ], now)
    expect(row.currentPercent).toBe(12)
  })

  it('진행 중 회차는 최댓값 시각이 아니라 그 회차의 가장 늦은 보고로 고른다', () => {
    const [row] = buildRenewalRows([sub()], [
      // 회차 A: 10/16 에 90, 10/19 에 다른 머신의 낮은 옛 스냅샷 50 — 가장 늦게 보고된 회차
      report('2026-10-21T10:00:00', '2026-10-16T09:00:00', 90),
      report('2026-10-21T10:00:00', '2026-10-19T09:00:00', 50),
      // 회차 B: 10/18 에 12
      report('2026-10-26T10:00:00', '2026-10-18T09:00:00', 12),
    ], now)
    expect(row.currentPercent).toBe(90)
  })

  it('하루 단위 행이 덮인 뒤에도 회차 테이블의 마지막 관측 시각으로 진행 중 회차를 고른다', () => {
    const [row] = buildRenewalRows([sub()], [
      // 회차 테이블: A 는 최댓값 90 을 10/16 에 확인했지만 10/19 에도 (낮은 값으로) 보고받았다
      { ...report('2026-10-21T10:00:00', '2026-10-16T09:00:00', 90), seenAt: kst('2026-10-19T09:00:00') },
      { ...report('2026-10-26T10:00:00', '2026-10-18T09:00:00', 12), seenAt: kst('2026-10-18T09:00:00') },
    ], now)
    expect(row.currentPercent).toBe(90)
  })

  it('보고가 없으면 평균은 0이 아니라 null이다', () => {
    const [row] = buildRenewalRows([sub()], [], now)
    expect(row).toMatchObject({ weeks: [], averagePercent: null, currentPercent: null })
  })

  it('사람·벤더·클라이언트가 맞는 보고만 잇는다', () => {
    const rows = buildRenewalRows(
      [sub(), sub({ vendor: 'OpenAI', plan: 'Pro', renewalDay: 5 })],
      [
        report('2026-10-14T10:00:00', '2026-10-13T09:00:00', 70),
        report('2026-10-14T10:00:00', '2026-10-13T09:00:00', 20, { client: 'codex' }),
        report('2026-10-14T10:00:00', '2026-10-13T09:00:00', 90, { memberName: '김철수' }),
      ],
      now
    )
    expect(rows.map((row) => [row.vendor, row.averagePercent])).toEqual([['Anthropic', 70], ['OpenAI', 20]])
  })

  it('사용자 없는 구독, 공용 구독, 한도 개념 없는 벤더, 결제일 없음, 연간 결제는 뺀다', () => {
    const rows = buildRenewalRows([
      sub({ ownerName: null }),
      sub({ ownerName: '공용(뽀짝이)' }),
      sub({ ownerName: '  ' }),
      sub({ vendor: 'Cursor' }),
      sub({ renewalDay: null }),
      sub({ billingCycle: 'yearly' }),
    ], [], now)
    expect(rows).toEqual([])
  })

  it('결제일이 가까운 순으로 정렬한다', () => {
    const rows = buildRenewalRows([sub({ ownerName: '나중', renewalDay: 5 }), sub({ ownerName: '먼저', renewalDay: 20 })], [], now)
    expect(rows.map((row) => [row.ownerName, row.daysLeft])).toEqual([['먼저', 1], ['나중', 17]])
  })
})
