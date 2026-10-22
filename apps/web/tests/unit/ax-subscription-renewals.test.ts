/**
 * 구독 갱신 결정표 (EDU-11519) — 주마다 초기화 전 마지막 보고값을 잡아 결제 주기 평균을 낸다
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@gpters/db', () => ({ db: {}, axClientUsage: {}, axSubscriptions: {} }))
vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

const { averageCycleByClient, buildMemberServiceRows, buildRenewalRows, personNameKeys, renewalCycle, samePerson, dailyRowsBeforeWindows } = await import('../../../../packages/lib/src/features/ax/subscription-renewals')

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

describe('dailyRowsBeforeWindows', () => {
  it('회차 기록을 시작한 뒤의 하루 단위 행은 빼고(채운 행의 보고 시각이 끝 무렵 미수집을 가리지 않게), 그 전 행은 남긴다', () => {
    const daily = [
      { syncedAt: kst('2026-10-14T09:00:00') },
      { syncedAt: kst('2026-10-22T19:00:00') },
    ]
    const windows = [{ firstReportedAt: kst('2026-10-19T17:16:00') }, { firstReportedAt: kst('2026-10-20T09:00:00') }]
    expect(dailyRowsBeforeWindows(daily, windows)).toEqual([daily[0]])
    expect(dailyRowsBeforeWindows(daily, [])).toEqual(daily)
  })
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
      averagePercent: 60, currentPercent: 35, currentResetsAt: kst('2026-10-21T10:00:00').toISOString(),
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
      startedAt: kst('2026-10-07T10:00:00').toISOString(),
      endedAt: kst('2026-10-14T10:00:00').toISOString(),
      usedPercent: 90,
      projectedPercent: 90,
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

  it('벤더가 일찍 초기화한 회차는 다음 회차가 시작된 시각에 끝난 것으로 보고 7일 환산해 평균에 넣는다 (Codex 10/20 실측 모양)', () => {
    // A: 10/26 08:58 예정, 10/20 15:30 에 42% 가 마지막. B: 10/20 15:35 에 처음 보고, 7일 뒤 10/27 15:35 초기화 예정
    const later = kst('2026-10-21T12:00:00')
    const [row] = buildRenewalRows([sub({ vendor: 'OpenAI', plan: 'Pro5x', renewalDay: 5 })], [
      report('2026-10-19T10:00:00', '2026-10-19T09:00:00', 60, { client: 'codex' }),
      { ...report('2026-10-26T08:58:00', '2026-10-20T15:30:00', 42, { client: 'codex' }), firstSeenAt: kst('2026-10-19T17:00:00') },
      { ...report('2026-10-27T15:35:00', '2026-10-21T11:00:00', 3, { client: 'codex' }), firstSeenAt: kst('2026-10-20T15:35:00') },
    ], later)
    expect(row.weeks.map((week) => [week.usedPercent, week.endedAt])).toEqual([
      [60, kst('2026-10-19T10:00:00').toISOString()],
      [42, kst('2026-10-20T15:35:00').toISOString()],
    ])
    // 1.3일 만에 끝난 42% 는 7일로 환산하면 230.5% — 7일을 채운 60% 와 평균
    expect(row.weeks.map((week) => week.projectedPercent && Math.round(week.projectedPercent * 10) / 10)).toEqual([60, 230.5])
    // 평균에는 회차 값을 100% 로 잘라 넣는다 — (60 + 100) / 2
    expect(row.averagePercent).toBe(80)
    expect(row).toMatchObject({ currentPercent: 3, currentResetsAt: kst('2026-10-27T15:35:00').toISOString() })
  })

  it('다음 회차 계산 시작보다 늦게까지 받은 회차는 그 마지막 보고 전에 끝났다고 보지 않는다 (Claude 실측 모양)', () => {
    // 10/15 04:00 예정 회차를 10/15 01:34 까지 받았다. 다음 회차는 10/20 01:00 예정(계산 시작 10/13 01:00)
    const [row] = buildRenewalRows([sub()], [
      report('2026-10-15T04:00:00', '2026-10-15T01:34:00', 48),
      { ...report('2026-10-20T01:00:00', '2026-10-19T09:00:00', 81), firstSeenAt: kst('2026-10-15T02:00:00') },
    ], kst('2026-10-21T12:00:00'))
    // 예정보다 2.4시간 이른 것은 조기 초기화가 아니다
    expect(row.weeks.map((week) => week.endedAt === week.resetsAt)).toEqual([true, true])
    // 다만 다음 회차는 앞 회차가 끝난 10/15 04:00 에 시작해 4.9일 만에 끝났다 — 81% 를 7일로 환산(116.3)해 평균
    expect(row.weeks[1].startedAt).toBe(kst('2026-10-15T04:00:00').toISOString())
    expect(row.weeks[1].projectedPercent).toBeCloseTo(81 / 4.875 * 7, 6)
    expect(row.averagePercent).toBe(74) // 100% 넘는 회차는 평균에 100%
  })

  it('나란한 회차가 새 회차 첫 보고 30분 뒤에 보고되면 조기 초기화가 아니고 진행 중 사용률도 그대로다', () => {
    const at = kst('2026-10-10T11:00:00')
    const [row] = buildRenewalRows([sub()], [
      { ...report('2026-10-16T05:00:00', '2026-10-10T10:30:00', 70), firstSeenAt: kst('2026-10-09T06:00:00') },
      { ...report('2026-10-16T07:00:00', '2026-10-10T10:00:00', 10), firstSeenAt: kst('2026-10-10T10:00:00') },
    ], at)
    expect(row.currentPercent).toBe(70)
  })

  it('마지막 날 쓰지 않았을 뿐이면(새 회차를 예정 초기화 뒤에 처음 받음) 조기 초기화가 아니다', () => {
    // Claude: 다음 회차 계산 시작(10/13 01:00)이 이르지만, 새 회차는 예정(10/15 04:00) 뒤에 처음 받았다
    const [row] = buildRenewalRows([sub()], [
      report('2026-10-15T04:00:00', '2026-10-13T09:00:00', 30),
      { ...report('2026-10-20T01:00:00', '2026-10-19T09:00:00', 81), firstSeenAt: kst('2026-10-16T09:00:00') },
    ], kst('2026-10-21T12:00:00'))
    expect(row.weeks.map((week) => week.endedAt === week.resetsAt)).toEqual([true, true])
    // 30% 는 7일 그대로, 81% 는 4.9일 회차라 7일 환산 116.3
    expect(row.averagePercent).toBe(65) // 100% 넘는 회차는 평균에 100%
  })

  it('7일 환산 분모는 마지막 관측이 아니라 회차가 실제로 이어진 기간이고, 1일 미만 회차는 환산하지 않는다', () => {
    const later = kst('2026-10-21T12:00:00')
    const codex = (resetsAt: string, syncedAt: string, percent: number, firstSeen: string) =>
      ({ ...report(resetsAt, syncedAt, percent, { client: 'codex' as const }), firstSeenAt: kst(firstSeen) })
    const [row] = buildRenewalRows([sub({ vendor: 'OpenAI', plan: 'Pro5x', renewalDay: 5 })], [
      // 10/7 13:17 시작 회차: 1.2일째 75% 뒤 쉬었다가 4.14일째(10/11 16:38) 초기화 → 75 ÷ 4.14 × 7 ≈ 126.8
      codex('2026-10-14T13:17:00', '2026-10-08T17:25:00', 75, '2026-10-07T14:00:00'),
      // 10/11 16:38 시작 회차: 0.5일 만에 초기화 → 환산 안 함
      codex('2026-10-18T16:38:00', '2026-10-12T02:00:00', 5, '2026-10-11T17:00:00'),
      codex('2026-10-19T04:38:00', '2026-10-13T09:00:00', 30, '2026-10-12T04:40:00'),
    ], later)
    expect(row.weeks.map((week) => week.projectedPercent && Math.round(week.projectedPercent * 10) / 10)).toEqual([126.8, null, 30])
    expect(row.averagePercent).toBe(65) // (100 + 30) / 2 — 126.8% 는 평균에 100%
  })

  it('초기화 시각이 몇 초 흔들려도 7일 환산 기간이 줄지 않고(1일 경계), 판정용 값은 반올림하지 않는다', () => {
    const later = kst('2026-10-21T12:00:00')
    const codex = (resetsAt: string, syncedAt: string, percent: number, firstSeen: string) =>
      ({ ...report(resetsAt, syncedAt, percent, { client: 'codex' as const }), firstSeenAt: kst(firstSeen) })
    const [row] = buildRenewalRows([sub({ vendor: 'OpenAI', plan: 'Pro5x', renewalDay: 5 })], [
      // 10/18 00:00 시작(예정 10/25 00:00), 정확히 하루 뒤 10/19 00:00 에 조기 초기화. 같은 회차 보고 하나는 3초 늦은 예정 시각
      codex('2026-10-25T00:00:00', '2026-10-18T20:00:00', 4, '2026-10-18T01:00:00'),
      codex('2026-10-25T00:00:03', '2026-10-18T21:00:00', 4, '2026-10-18T02:00:00'),
      codex('2026-10-26T00:00:00', '2026-10-19T09:00:00', 1, '2026-10-19T00:10:00'),
    ], later)
    expect(row.weeks[0].projectedPercent).toBeCloseTo(28, 6)
    // 20.04% 는 20.0 으로 반올림되지 않는다 — 실측 15%, 5일 5시간 45분
    const [edge] = buildRenewalRows([sub({ vendor: 'OpenAI', plan: 'Pro5x', renewalDay: 5 })], [
      codex('2026-10-25T00:00:00', '2026-10-20T09:00:00', 15, '2026-10-18T01:00:00'),
      codex('2026-10-30T05:45:00', '2026-10-21T09:00:00', 1, '2026-10-23T05:46:00'),
    ], kst('2026-10-24T12:00:00'))
    expect(edge.weeks[0].projectedPercent).toBeGreaterThan(20)
  })

  it('다음 회차의 초기화 시각이 흔들려도 이 회차 끝은 가장 이른 시각 기준이라 1일 미만 회차가 환산되지 않는다', () => {
    const later = kst('2026-10-21T12:00:00')
    const codex = (resetsAt: string, syncedAt: string, percent: number, firstSeen: string) =>
      ({ ...report(resetsAt, syncedAt, percent, { client: 'codex' as const }), firstSeenAt: kst(firstSeen) })
    const [row] = buildRenewalRows([sub({ vendor: 'OpenAI', plan: 'Pro5x', renewalDay: 5 })], [
      // A: 10/18 00:00 시작. B 의 예정 시각이 10/25 23:59:59 / 10/26 00:00:02 로 흔들림 → A 는 23시간 59분 59초
      codex('2026-10-25T00:00:00', '2026-10-18T20:00:00', 2, '2026-10-18T01:00:00'),
      codex('2026-10-25T23:59:59', '2026-10-19T09:00:00', 1, '2026-10-19T00:10:00'),
      codex('2026-10-26T00:00:02', '2026-10-19T10:00:00', 1, '2026-10-19T00:20:00'),
    ], later)
    expect(row.weeks[0].projectedPercent).toBeNull()
  })

  it('8시간 어긋난 두 계정 회차가 함께 보고되면 서로의 시작을 옮기지 않는다', () => {
    const both = (resetsAt: string, syncedAt: string, percent: number, firstSeen: string) =>
      ({ ...report(resetsAt, syncedAt, percent), seenAt: kst(syncedAt), firstSeenAt: kst(firstSeen) })
    const [row] = buildRenewalRows([sub()], [
      both('2026-10-09T05:00:00', '2026-10-09T04:00:00', 73, '2026-10-02T06:00:00'),
      both('2026-10-09T13:00:00', '2026-10-09T12:00:00', 62, '2026-10-02T14:00:00'),
      both('2026-10-16T05:00:00', '2026-10-16T04:00:00', 79, '2026-10-09T06:00:00'),
      both('2026-10-16T13:00:00', '2026-10-16T12:00:00', 14, '2026-10-09T14:00:00'),
    ], kst('2026-10-19T12:00:00'))
    expect(row.weeks.map((week) => week.projectedPercent)).toEqual([73, 62, 79, 14])
  })

  it('나란히 보고되는 두 회차(2시간 간격)는 서로의 시작을 옮기지 않는다', () => {
    const [row] = buildRenewalRows([sub()], [
      report('2026-10-09T05:00:00', '2026-10-09T04:00:00', 73),
      report('2026-10-09T07:00:00', '2026-10-09T06:50:00', 62),
      report('2026-10-16T05:00:00', '2026-10-16T04:00:00', 79),
      report('2026-10-16T07:00:00', '2026-10-16T06:50:00', 44),
    ], kst('2026-10-19T12:00:00'))
    expect(row.weeks.map((week) => week.projectedPercent)).toEqual([73, 62, 79, 44])
  })

  it('나란히 보고되는 두 회차(2시간 간격)는 조기 초기화로 보지 않는다', () => {
    const [row] = buildRenewalRows([sub()], [
      report('2026-10-16T05:00:00', '2026-10-16T04:00:00', 79),
      { ...report('2026-10-16T07:00:00', '2026-10-16T06:50:00', 44), firstSeenAt: kst('2026-10-09T08:00:00') },
    ], now)
    expect(row.weeks.map((week) => week.endedAt === week.resetsAt)).toEqual([true, true])
  })

  it('보고가 없으면 평균은 0이 아니라 null이다', () => {
    const [row] = buildRenewalRows([sub()], [], now)
    expect(row).toMatchObject({ weeks: [], averagePercent: null, currentPercent: null, currentResetsAt: null, recentWeeks: [] })
  })

  it('결제일 직전에 끝난 회차는 weeks 에서 빠져도 recentWeeks 에 남고, 8일 지난 회차는 빠진다', () => {
    // 결제일 18일 → 이번 주기는 10/18 00:00 부터. 10/17 에 끝난 회차는 지난 주기다
    const [row] = buildRenewalRows([sub({ renewalDay: 18 })], [
      report('2026-10-17T22:00:00', '2026-10-17T09:00:00', 3),
      report('2026-10-11T10:00:00', '2026-10-10T09:00:00', 50),
    ], now)
    expect(row.weeks).toEqual([])
    expect(row.recentWeeks.map((week) => [week.resetsAt, week.usedPercent])).toEqual([[kst('2026-10-17T22:00:00').toISOString(), 3]])
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

describe('같은 사람 판정 — 로스터 이름과 계정 표시명', () => {
  it('괄호 앞 이름과 괄호 안 별칭을 모두 같은 사람으로 본다', () => {
    expect(personNameKeys('조효희 (타타)')).toEqual(['조효희 (타타)', '조효희', '타타'])
    expect(samePerson('타타', '조효희 (타타)')).toBe(true)
    expect(samePerson('박수오', '박수오 (소파)')).toBe(true)
    expect(samePerson('박수오', '박수진')).toBe(false)
  })

  it('갱신 결정표도 별칭으로 보고를 잇는다', () => {
    const now = kst('2026-10-19T12:00:00')
    const [row] = buildRenewalRows([sub({ ownerName: '타타' })], [
      report('2026-10-14T10:00:00', '2026-10-13T09:00:00', 66, { memberName: '조효희 (타타)' }),
    ], now)
    expect(row.averagePercent).toBe(66)
  })
})

describe('buildMemberServiceRows', () => {
  const now = kst('2026-10-19T12:00:00')
  const member = (overrides: Record<string, unknown> = {}) => ({
    userId: 'u1', memberName: '홍길동', client: 'claude-code' as const, plan: 'Claude Max 20x',
    totalTokens: 1000, sessions: 3, limitUsedPercent: 40, limitResetsAt: null, lastReportedAt: '2026-10-19T00:00:00.000Z',
    ...overrides,
  })
  const subscription = (overrides: Record<string, unknown> = {}) => ({
    ownerName: '홍길동', vendor: 'Anthropic', plan: 'Max20x', amount: 200, currency: 'USD',
    billingCycle: 'monthly' as const, renewalDay: 25, payer: '본인', status: 'active' as const, hasAccountKey: false,
    ...overrides,
  })

  it('구독에 같은 사람·같은 클라이언트의 사용량과 결제 주기 평균을 붙인다', () => {
    const renewals = buildRenewalRows([subscription()], [
      report('2026-10-14T10:00:00', '2026-10-13T09:00:00', 70),
    ], now)
    const [row] = buildMemberServiceRows([member()], [subscription()], renewals, now)
    expect(row).toMatchObject({
      name: '홍길동',
      service: 'Claude Code',
      subscription: { plan: 'Max20x', nextRenewal: '2026-10-25', daysLeft: 6, shared: false },
      cycleAveragePercent: 70,
      usage: { limitUsedPercent: 40, totalTokens: 1000 },
    })
  })

  it('사용 보고 없는 구독, 구독 없는 사용, 공용 구독을 각각 한 줄로 남긴다', () => {
    const rows = buildMemberServiceRows(
      [member({ memberName: '김철수', client: 'codex', plan: 'plus' })],
      [subscription(), subscription({ ownerName: '공용(뽀짝이)', renewalDay: 10 })],
      [],
      now
    )
    expect(rows.map((row) => [row.name, row.service, row.subscription?.shared ?? null, row.usage !== null])).toEqual([
      ['홍길동', 'Claude Code', false, false],
      ['공용(뽀짝이)', 'Claude Code', true, false],
      ['김철수', 'Codex', null, true],
    ])
  })

  it('같은 사람의 보고가 여럿이면 토큰이 많은 옛 보고가 아니라 가장 최근 보고를 붙인다', () => {
    const rows = buildMemberServiceRows(
      [
        member({ memberName: '타타', totalTokens: 1000, lastReportedAt: '2026-10-18T00:00:00.000Z' }),
        member({ memberName: '조효희 (타타)', totalTokens: 100, lastReportedAt: '2026-10-19T00:00:00.000Z' }),
      ],
      [subscription({ ownerName: '타타' })],
      [],
      now
    )
    expect(rows[0]).toMatchObject({ name: '조효희 (타타)', usage: { totalTokens: 100 } })
    // 옛 이름 보고가 "구독 없이 사용" 줄로 남지 않는다
    expect(rows).toHaveLength(1)
  })

  it('수집 경로가 없는 벤더, 이름 없는 구독은 수집 대상이 아니다(누락으로 보지 않는다)', () => {
    const rows = buildMemberServiceRows([], [
      subscription({ vendor: 'Cursor', plan: 'Pro' }),
      subscription({ ownerName: null }),
      subscription(),
    ], [], now)
    expect(rows.map((row) => [row.name, row.service, row.trackable, row.subscription?.shared])).toEqual([
      ['미지정', 'Claude Code', false, true],
      ['홍길동', 'Claude Code', true, false],
      ['홍길동', 'Cursor', false, false],
    ])
  })

  it('사용 보고 없는 줄의 로스터 이름을 같은 사람의 계정 표시명으로 맞춘다', () => {
    const rows = buildMemberServiceRows(
      [member({ memberName: '박수오 (소파)' })],
      [subscription({ ownerName: '박수오' }), subscription({ ownerName: '박수오', vendor: 'OpenAI', plan: 'Pro5x' })],
      [],
      now
    )
    expect(rows.map((row) => row.name)).toEqual(['박수오 (소파)', '박수오 (소파)'])
  })

  it('수집 대상이 아닌 사람 구독도 계정 표시명으로 맞추고, 공용 구독은 그대로 둔다', () => {
    const rows = buildMemberServiceRows(
      [member({ memberName: '박수오 (소파)' })],
      [subscription({ ownerName: '박수오' }), subscription({ ownerName: '박수오', vendor: 'Cursor', plan: 'Pro' }), subscription({ ownerName: '공용(박수오)' })],
      [],
      now
    )
    expect(rows.map((row) => [row.name, row.service])).toEqual([
      ['공용(박수오)', 'Claude Code'],
      ['박수오 (소파)', 'Claude Code'],
      ['박수오 (소파)', 'Cursor'],
    ])
  })

  it('한 사용 보고는 한 구독에만 붙는다', () => {
    const rows = buildMemberServiceRows(
      [member()],
      [subscription(), subscription({ plan: 'Max5x', renewalDay: 3 })],
      [],
      now
    )
    expect(rows.filter((row) => row.usage !== null)).toHaveLength(1)
  })

  it('연간 결제·결제일 없는 구독은 다음 결제일 없이 뒤로 보낸다', () => {
    const rows = buildMemberServiceRows([], [subscription({ billingCycle: 'yearly' }), subscription({ ownerName: '이영희', renewalDay: 3 })], [], now)
    expect(rows.map((row) => [row.name, row.subscription?.daysLeft ?? null])).toEqual([['이영희', 15], ['홍길동', null]])
  })
})

describe('공용·서포트 구독 — 계정 키로 봇 수집기 회차를 잇는다', () => {
  const now = kst('2026-10-19T12:00:00')
  const KEY = 'a'.repeat(64)
  const shared = (overrides: Record<string, unknown> = {}) => sub({ ownerName: '공용(뽀짝이)', plan: 'Max5x', accountKey: KEY, ...overrides })
  const account = (resetsAt: string, syncedAt: string, percent: number, overrides: Record<string, unknown> = {}) =>
    report(resetsAt, syncedAt, percent, { memberName: '', accountKey: KEY, agentIds: ['bbojjak'], ...overrides })

  it('같은 계정을 여러 봇이 보고하면 한 회차로 묶고 봇을 모두 적는다. 사람 보고·다른 계정은 붙지 않는다', () => {
    const rows = buildRenewalRows([shared(), sub()], [
      account('2026-10-14T10:00:00', '2026-10-13T09:00:00', 50),
      account('2026-10-14T10:00:00', '2026-10-13T10:00:00', 55, { agentIds: ['tujjak'] }),
      account('2026-10-21T10:00:00', '2026-10-19T09:00:00', 12),
      account('2026-10-14T10:00:00', '2026-10-13T09:00:00', 99, { accountKey: 'b'.repeat(64) }),
      // 이름이 같아도 사람 보고는 공용 구독에 붙지 않고, 계정 회차는 사람 구독에 붙지 않는다
      report('2026-10-14T10:00:00', '2026-10-13T09:00:00', 70, { memberName: '공용(뽀짝이)' }),
      report('2026-10-14T10:00:00', '2026-10-13T09:00:00', 30),
    ], now)
    const [person, bot] = [rows.find((row) => !row.shared)!, rows.find((row) => row.shared)!]
    expect(bot).toMatchObject({ ownerName: '공용(뽀짝이)', averagePercent: 55, currentPercent: 12, agentIds: ['bbojjak', 'tujjak'] })
    expect(bot.lastSeenAt).toBe(kst('2026-10-19T09:00:00').toISOString())
    expect(person).toMatchObject({ averagePercent: 30, agentIds: [], shared: false })
  })

  it('계정 키가 없는 공용·서포트 구독은 뺀다', () => {
    expect(buildRenewalRows([shared({ accountKey: null }), shared({ ownerName: '서포트', accountKey: undefined })], [], now)).toEqual([])
  })

  it('서비스별 평균은 사람 구독만 — 공용 구독은 넣지 않는다', () => {
    const rows = buildRenewalRows([shared({ plan: 'Max20x' }), sub()], [
      account('2026-10-14T10:00:00', '2026-10-13T09:00:00', 90),
      report('2026-10-14T10:00:00', '2026-10-13T09:00:00', 30),
    ], now)
    expect(averageCycleByClient(rows)).toEqual({ 'claude-code': 30 })
  })

  it('구성원 표: 계정 키가 있으면 수집 대상이고 봇 측정을 붙인다. 서포트도 공용이다', () => {
    const subscriptions = [
      { ...shared(), amount: 100, payer: '홍지연', status: 'active' as const, hasAccountKey: true },
      { ...shared({ ownerName: '서포트', accountKey: null }), amount: 200, payer: null, status: 'active' as const, hasAccountKey: false },
    ]
    const renewals = buildRenewalRows(subscriptions, [account('2026-10-21T10:00:00', '2026-10-19T09:00:00', 12)], now)
    const rows = buildMemberServiceRows([], subscriptions, renewals, now)
    const bot = rows.find((row) => row.name === '공용(뽀짝이)')!
    expect(bot).toMatchObject({
      trackable: true, usage: null, subscription: { shared: true },
      account: { agentIds: ['bbojjak'], currentPercent: 12, lastSeenAt: kst('2026-10-19T09:00:00').toISOString() },
    })
    expect(rows.find((row) => row.name === '서포트')).toMatchObject({ trackable: false, account: null, subscription: { shared: true } })
  })
})
