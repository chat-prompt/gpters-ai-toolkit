/**
 * AX 대시보드 — 성과 요약 패널 테스트
 *
 * db는 모킹하고, 다음을 검증한다:
 * 1. 실측 지표(주간 활성·누적 참여·추이·분포·밀도)가 쿼리 결과에서 올바르게 조립되는지
 * 2. 미계측 지표가 값 대신 사유와 함께 내려가는지
 * 3. 빈 구간·문자열 count·쿼리 실패 같은 경계가 안전한지
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@gpters/db', () => ({
  db: { select: vi.fn() },
  skillEvents: {
    skillId: 'skill_events.skill_id',
    userId: 'skill_events.user_id',
    action: 'skill_events.action',
    createdAt: 'skill_events.created_at',
  },
  catalogItems: {
    id: 'catalog_items.id',
    name: 'catalog_items.name',
    type: 'catalog_items.type',
    status: 'catalog_items.status',
  },
}))

vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const { overviewPanel } = await import('../../../../packages/lib/src/features/ax/overview')
const { db } = await import('@gpters/db')

/** innerJoin 호출 횟수 — 모든 쿼리가 카탈로그 모집단을 쓰는지 확인용 */
let innerJoinCalls = 0

/** 각 쿼리에 넘어간 where 조건 (실행 순서: 주간·누적·일별·유형·시간대) */
let whereConditions: unknown[] = []

/** 어떤 체이닝에도 자신을 돌려주고, await 하면 결과를 내는 쿼리 빌더 */
function builder(result: unknown) {
  const stub: Record<string, unknown> = {}
  for (const method of ['from', 'groupBy', 'orderBy', 'limit']) {
    stub[method] = vi.fn(() => stub)
  }
  stub.where = vi.fn((condition: unknown) => {
    whereConditions.push(condition)
    return stub
  })
  stub.innerJoin = vi.fn(() => {
    innerJoinCalls += 1
    return stub
  })
  stub.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return stub
}

/**
 * Drizzle 조건 객체를 훑어 리터럴 값을 전부 모은다 (skills 패널 테스트와 같은 방식)
 *
 * @param node - 조건 트리 노드
 * @param out - 수집 배열
 * @returns 조건에 들어간 원시값·Date 목록
 */
function collectValues(node: unknown, out: unknown[] = []): unknown[] {
  if (node === null || node === undefined) return out
  if (typeof node !== 'object') {
    out.push(node)
    return out
  }
  if (node instanceof Date) {
    out.push(node)
    return out
  }

  const record = node as Record<string, unknown>
  if (Array.isArray(record.queryChunks)) {
    for (const chunk of record.queryChunks) collectValues(chunk, out)
    return out
  }
  if (Array.isArray(node)) {
    for (const item of node) collectValues(item, out)
    return out
  }
  if ('value' in record) {
    collectValues(record.value, out)
  }
  return out
}

/** 패널이 실행하는 5개 쿼리 결과를 순서대로 큐에 넣는다: 주간·누적·일별·유형·시간대 */
function queueQueries(results: unknown[]) {
  const select = vi.mocked(db.select)
  select.mockReset()
  for (const result of results) {
    select.mockReturnValueOnce(builder(result) as never)
  }
}

describe('overviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    innerJoinCalls = 0
    whereConditions = []
    // 패널이 실제 시계로 구간을 잡으므로 고정한다 — 아니면 아래의 날짜 상수들이
    // 달력이 지나며 조회 구간 밖으로 밀려 테스트가 저절로 깨진다
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-19T03:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('meta가 레지스트리 계약과 일치한다', () => {
    expect(overviewPanel.meta.id).toBe('overview')
    expect(overviewPanel.meta.visibility).toBe('org')
    expect(overviewPanel.meta.usesPeriod).toBe(true)
  })

  it('실측 지표를 조립하고 미계측 지표를 사유와 함께 내려준다', async () => {
    queueQueries([
      [{ users: 6 }],
      [{ users: 21 }],
      [
        { date: '2026-08-17', users: 4 },
        { date: '2026-08-18', users: 6 },
      ],
      [
        { action: 'load', count: 30 },
        { action: 'search', count: 50 },
        { action: 'apply', count: 12 },
      ],
      [
        { hour: 10, events: 40 },
        { hour: 15, events: 25 },
      ],
    ])

    const result = await overviewPanel.load({ days: 30, isAdmin: false })

    expect(result.status).toBe('ok')
    const data = result.data!

    expect(data.weeklyActiveUsers).toBe(6)
    expect(data.totalParticipants).toBe(21)

    // 활동 없는 날도 0으로 채워 연속된 축을 만든다
    expect(data.dailyActiveUsers).toHaveLength(30)
    expect(data.dailyActiveUsers.find((d) => d.date === '2026-08-18')).toEqual({
      date: '2026-08-18',
      users: 6,
    })

    // 분포는 CORE_ACTIONS 고정 순서 — 값이 없는 action은 0으로 채운다
    expect(data.actionDistribution.map((row) => row.action)).toEqual([
      'search',
      'load',
      'apply',
      'skip',
      'deploy',
    ])
    expect(data.actionDistribution[0]).toEqual({ action: 'search', count: 50 })
    expect(data.actionDistribution.find((row) => row.action === 'skip')?.count).toBe(0)

    // 시간대 밀도는 KST 0~23시가 모두 채워진다
    expect(data.hourlyDensity).toHaveLength(24)
    expect(data.hourlyDensity[10]).toEqual({ hour: 10, events: 40 })
    expect(data.hourlyDensity[0]).toEqual({ hour: 0, events: 0 })

    // 미계측 지표는 값 없이 사유만 내려간다
    expect(data.unmeasured.length).toBeGreaterThan(0)
    for (const item of data.unmeasured) {
      expect(item.label.trim()).not.toBe('')
      expect(item.reason.trim()).not.toBe('')
    }

    // 요약 밴드 수치
    expect(result.highlights).toEqual([
      { label: '주간 활성', value: '6', hint: '명 · 7일' },
      { label: '누적 참여', value: '21', hint: '명' },
    ])
  })

  it('모든 쿼리가 카탈로그 모집단(innerJoin)을 쓴다', async () => {
    queueQueries([[{ users: 0 }], [{ users: 0 }], [], [], []])

    await overviewPanel.load({ days: 7, isAdmin: false })

    // 주간 · 누적 · 일별 · 유형 · 시간대 = 5개 쿼리 전부
    expect(innerJoinCalls).toBe(5)
  })

  it('모든 쿼리가 CORE_ACTIONS 필터를 쓰고, 누적 쿼리만 날짜 필터가 없다', async () => {
    queueQueries([[{ users: 0 }], [{ users: 0 }], [], [], []])

    await overviewPanel.load({ days: 7, isAdmin: false })

    expect(whereConditions).toHaveLength(5)

    for (const [index, condition] of whereConditions.entries()) {
      const values = collectValues(condition)
      // 기계 트래픽(exercise_*)이 섞이면 스킬 사용량 패널과 숫자가 어긋난다
      expect(values, `쿼리 ${index} CORE_ACTIONS`).toEqual(
        expect.arrayContaining(['search', 'load', 'apply', 'skip', 'deploy'])
      )
      expect(values, `쿼리 ${index} exercise 제외`).not.toContain('exercise_apply')

      const hasDateFilter = values.some((value) => value instanceof Date)
      if (index === 1) {
        // 누적 참여 인원은 전 기간 — 날짜로 자르면 "누적"이 아니다
        expect(hasDateFilter, '누적 쿼리는 날짜 필터가 없어야 한다').toBe(false)
      } else {
        expect(hasDateFilter, `쿼리 ${index}는 기간 필터가 있어야 한다`).toBe(true)
      }
    }
  })

  it('count가 문자열로 와도 숫자로 환산한다', async () => {
    queueQueries([
      [{ users: '3' }],
      [{ users: '9' }],
      [{ date: '2026-08-18', users: '2' }],
      [{ action: 'load', count: '7' }],
      [{ hour: '9', events: '5' }],
    ])

    const data = (await overviewPanel.load({ days: 7, isAdmin: false })).data!

    expect(data.weeklyActiveUsers).toBe(3)
    expect(data.totalParticipants).toBe(9)
    expect(data.dailyActiveUsers.find((d) => d.date === '2026-08-18')?.users).toBe(2)
    expect(data.actionDistribution.find((row) => row.action === 'load')?.count).toBe(7)
    expect(data.hourlyDensity[9].events).toBe(5)
  })

  it('활동이 전혀 없으면 error가 아니라 0으로 채운 정상 응답을 준다', async () => {
    queueQueries([[{ users: 0 }], [{ users: 0 }], [], [], []])

    const result = await overviewPanel.load({ days: 30, isAdmin: false })

    expect(result.status).toBe('ok')
    const data = result.data!
    expect(data.weeklyActiveUsers).toBe(0)
    expect(data.totalParticipants).toBe(0)
    expect(data.dailyActiveUsers).toHaveLength(30)
    expect(data.dailyActiveUsers.every((day) => day.users === 0)).toBe(true)
    expect(data.hourlyDensity.every((slot) => slot.events === 0)).toBe(true)
  })

  it('예상 밖 action이 와도 조립을 깨뜨리지 않고 뒤에 붙인다 (방어적 처리)', async () => {
    // 운영 SQL은 CORE_ACTIONS로 필터하므로 이 입력은 실제로는 오지 않는다.
    // CORE_ACTIONS와 표시 순서(ACTION_ORDER)가 어긋나게 수정되는 회귀에 대한 방어를 검증한다.
    queueQueries([
      [{ users: 1 }],
      [{ users: 1 }],
      [],
      [
        { action: 'load', count: 3 },
        { action: 'future-action', count: 2 },
      ],
      [],
    ])

    const data = (await overviewPanel.load({ days: 7, isAdmin: false })).data!

    const tail = data.actionDistribution[data.actionDistribution.length - 1]
    expect(tail).toEqual({ action: 'future-action', count: 2 })
    // 합계가 보존된다 — 목록 밖 action을 조용히 버리면 합계가 어긋난다
    const total = data.actionDistribution.reduce((sum, row) => sum + row.count, 0)
    expect(total).toBe(5)
  })

  it('쿼리가 실패하면 throw하지 않고 error 상태를 반환한다', async () => {
    vi.mocked(db.select).mockReset()
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error('connection refused')
    })

    const result = await overviewPanel.load({ days: 30, isAdmin: false })

    expect(result.status).toBe('error')
    expect(result.data).toBeNull()
    expect(result.meta.id).toBe('overview')
  })
})
