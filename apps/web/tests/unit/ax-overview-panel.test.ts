/**
 * AX 대시보드 — 성과 요약 패널 테스트
 *
 * db는 모킹하고, 다음을 검증한다:
 * 1. 실측 지표(누적 참여·일별 사용 인원·시간대별 사용 인원)가 올바르게 조립되는지
 * 2. 미계측 지표가 값 대신 사유와 함께 내려가는지
 * 3. 빈 구간·문자열 count·쿼리 실패 같은 경계가 안전한지
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@gpters/db', () => ({
  db: { select: vi.fn(), execute: vi.fn() },
  skillEvents: {
    skillId: 'skill_events.skill_id',
    sessionId: 'skill_events.session_id',
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
  users: { id: 'users.id', name: 'users.name' },
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

/** 각 select 쿼리에 넘어간 where 조건 (실행 순서: 누적·카탈로그·잔디·시간대) */
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

/** select 결과를 실행 순서대로 큐에 넣는다: 누적·카탈로그·잔디·시간대(·관리자면 사용자별) */
function queueQueries(results: unknown[]) {
  const select = vi.mocked(db.select)
  select.mockReset()
  for (const result of results) {
    select.mockReturnValueOnce(builder(result) as never)
  }
}

/** 로드 코호트 raw SQL 결과를 지정한다 */
function queueFlow(rows: Array<Record<string, unknown>>) {
  vi.mocked(db.execute).mockResolvedValue({ rows } as never)
}

describe('overviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    innerJoinCalls = 0
    whereConditions = []
    queueFlow([])
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
      [{ users: 21 }],
      [{ count: 504 }],
      [{ date: '2026-08-18', directApplied: 9, appliedAfterLoad: 3, loads: 20 }],
      [
        { hour: 10, users: 4 },
        { hour: 15, users: 2 },
      ],
    ])
    queueFlow([
      {
        date: '2026-08-18',
        direct_applied: 2,
        loaded: 12,
        linkable_loaded: 7,
        applied_after_load: 3,
        summary_direct_applied: 2,
        summary_loaded: 12,
        summary_linkable_loaded: 7,
        summary_applied_after_load: 3,
      },
    ])

    const result = await overviewPanel.load({ days: 30, isAdmin: false })

    expect(result.status).toBe('ok')
    const data = result.data!

    expect(data.totalParticipants).toBe(21)
    expect(data.catalogSkills).toBe(504)

    // 잔디밭은 기간 선택과 무관한 오늘 포함 365일 고정 윈도우다
    expect(data.grassDaily).toHaveLength(365)
    expect(data.grassDaily[0]?.date).toBe('2025-08-20')
    expect(data.grassDaily.at(-1)?.date).toBe('2026-08-19')
    expect(data.grassDaily.find((d) => d.date === '2026-08-18')).toEqual({
      date: '2026-08-18',
      events: 12,
      loads: 20,
      directApplied: 9,
      appliedAfterLoad: 3,
    })

    // 관리자가 아니면 사용자별 사용량은 내려가지 않는다
    expect(data.memberUsage).toBeNull()

    // 로드 전환이 없는 날도 0으로 채워 연속된 축을 만든다
    expect(data.dailySkillFlow).toHaveLength(30)
    expect(data.dailySkillFlow.find((d) => d.date === '2026-08-18')).toEqual({
      date: '2026-08-18',
      directApplied: 2,
      loaded: 12,
      linkableLoaded: 7,
      appliedAfterLoad: 3,
    })
    expect(data.skillFlowSummary).toEqual({
      directApplied: 2,
      loaded: 12,
      linkableLoaded: 7,
      appliedAfterLoad: 3,
    })

    // 시간대 활성 인원은 KST 0~23시가 모두 채워진다
    expect(data.hourlyDensity).toHaveLength(24)
    expect(data.hourlyDensity[10]).toEqual({ hour: 10, users: 4 })
    expect(data.hourlyDensity[0]).toEqual({ hour: 0, users: 0 })

    // 미계측 지표는 값 없이 사유만 내려간다
    expect(data.unmeasured.length).toBeGreaterThan(0)
    for (const item of data.unmeasured) {
      expect(item.label.trim()).not.toBe('')
      expect(item.reason.trim()).not.toBe('')
    }
    expect(data.unmeasured.map((item) => item.label)).not.toContain('에이전트별 사용량')

    // 요약 밴드 수치
    expect(result.highlights).toEqual([
      { label: '팀 스킬', value: '504', hint: '개' },
    ])
  })

  it('모든 쿼리가 카탈로그 모집단(innerJoin)을 쓴다', async () => {
    queueQueries([[{ users: 0 }], [{ count: 0 }], [], []])

    await overviewPanel.load({ days: 7, isAdmin: false })

    // select로 스킬 이벤트를 읽는 3개 쿼리(누적·잔디·시간대) 전부.
    // 로드 전환은 별도 raw SQL에서 같은 카탈로그 조인을 사용한다
    expect(innerJoinCalls).toBe(3)
  })

  it('실제 사용 지표는 적용만 세고, 잔디만 도움말용 로드를 함께 센다', async () => {
    queueQueries([[{ users: 0 }], [{ count: 0 }], [], []])

    await overviewPanel.load({ days: 7, isAdmin: false })

    expect(whereConditions).toHaveLength(4)

    for (const [index, condition] of whereConditions.entries()) {
      const values = collectValues(condition)
      const hasDateFilter = values.some((value) => value instanceof Date)

      if (index === 1) {
        // 카탈로그 count 쿼리 — 발행 스킬 인벤토리라 이벤트 필터가 없다
        expect(values, '카탈로그 쿼리는 type=skill 조건').toContain('skill')
        expect(hasDateFilter, '카탈로그 쿼리는 날짜 필터가 없어야 한다').toBe(false)
        continue
      }

      expect(values, `쿼리 ${index} 적용 보고`).toContain('apply')
      if (index === 2) {
        expect(values, '잔디는 도움말용 로드를 함께 조회').toContain('load')
      } else {
        expect(values, `쿼리 ${index} 실제 사용에 로드 제외`).not.toContain('load')
      }
      expect(values, `쿼리 ${index} 검색 노출 제외`).not.toContain('search')
      expect(values, `쿼리 ${index} 스킵 제외`).not.toContain('skip')
      expect(values, `쿼리 ${index} 배포 제외`).not.toContain('deploy')
      expect(values, `쿼리 ${index} exercise 제외`).not.toContain('exercise_apply')

      if (index === 0) {
        // 누적 참여 인원은 전 기간 — 날짜로 자르면 "누적"이 아니다
        expect(hasDateFilter, '누적 쿼리는 날짜 필터가 없어야 한다').toBe(false)
      } else {
        expect(hasDateFilter, `쿼리 ${index}는 기간 필터가 있어야 한다`).toBe(true)
      }
    }
  })

  it('count가 문자열로 와도 숫자로 환산한다', async () => {
    queueQueries([
      [{ users: '9' }],
      [{ count: '11' }],
      [{ date: '2026-08-18', directApplied: '2', appliedAfterLoad: '1', loads: '8' }],
      [{ hour: '9', users: '5' }],
    ])
    queueFlow([
      {
        date: '2026-08-18',
        direct_applied: '2',
        loaded: '9',
        linkable_loaded: '6',
        applied_after_load: '4',
        summary_direct_applied: '2',
        summary_loaded: '9',
        summary_linkable_loaded: '6',
        summary_applied_after_load: '4',
      },
    ])

    const data = (await overviewPanel.load({ days: 7, isAdmin: false })).data!

    expect(data.totalParticipants).toBe(9)
    expect(data.catalogSkills).toBe(11)
    expect(data.grassDaily.find((d) => d.date === '2026-08-18')?.events).toBe(3)
    expect(data.grassDaily.find((d) => d.date === '2026-08-18')?.loads).toBe(8)
    expect(data.grassDaily.find((d) => d.date === '2026-08-18')?.directApplied).toBe(2)
    expect(data.grassDaily.find((d) => d.date === '2026-08-18')?.appliedAfterLoad).toBe(1)
    expect(data.dailySkillFlow.find((d) => d.date === '2026-08-18')).toMatchObject({
      directApplied: 2,
      loaded: 9,
      linkableLoaded: 6,
      appliedAfterLoad: 4,
    })
    expect(data.skillFlowSummary).toEqual({
      directApplied: 2,
      loaded: 9,
      linkableLoaded: 6,
      appliedAfterLoad: 4,
    })
    expect(data.hourlyDensity[9].users).toBe(5)
  })

  it('활동이 전혀 없으면 error가 아니라 0으로 채운 정상 응답을 준다', async () => {
    queueQueries([[{ users: 0 }], [{ count: 0 }], [], []])

    const result = await overviewPanel.load({ days: 30, isAdmin: false })

    expect(result.status).toBe('ok')
    const data = result.data!
    expect(data.totalParticipants).toBe(0)
    expect(data.dailySkillFlow).toHaveLength(30)
    expect(data.dailySkillFlow.every((day) => day.loaded === 0 && day.directApplied === 0)).toBe(true)
    expect(data.hourlyDensity.every((slot) => slot.users === 0)).toBe(true)
  })

  it('관리자면 사용자별 사용량을 내려주고, 이름이 없으면 대체 표기한다', async () => {
    queueQueries([
      [{ users: 5 }],
      [{ count: 0 }],
      [],
      [],
      [
        { name: '하영', loaded: 31, applied: 9, lastActiveAt: new Date('2026-08-18T02:00:00Z') },
        { name: null, loaded: 3, applied: 0, lastActiveAt: null },
      ],
    ])

    const data = (await overviewPanel.load({ days: 30, isAdmin: true })).data!

    expect(data.memberUsage).toEqual([
      { name: '하영', loaded: 31, applied: 9, lastActiveAt: '2026-08-18T02:00:00.000Z' },
      { name: '이름 미설정', loaded: 3, applied: 0, lastActiveAt: null },
    ])
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
