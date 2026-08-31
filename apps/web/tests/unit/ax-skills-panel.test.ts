/**
 * AX 대시보드 — 스킬 사용량 패널 테스트
 *
 * db는 모킹하고, 패널이 쿼리 결과를 어떻게 피벗·정렬·환산하는지와
 * 모든 집계가 단일 GPTers 카탈로그를 같은 모집단으로 사용하는지 검증한다.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// 모킹한 테이블의 컬럼은 서로 구분 가능한 문자열로 둔다.
// 그래야 조립된 where 조건을 훑어 "어떤 컬럼이 조건에 들어갔는지" 단언할 수 있다.
vi.mock('@gpters/db', () => ({
  db: { select: vi.fn() },
  skillEvents: {
    skillId: 'skill_events.skill_id',
    userId: 'skill_events.user_id',
    action: 'skill_events.action',
    createdAt: 'skill_events.created_at',
  },
  mcpSessions: { startedAt: 'mcp_sessions.started_at', userId: 'mcp_sessions.user_id' },
  orgMemberships: { userId: 'org_memberships.user_id', orgId: 'org_memberships.org_id' },
  catalogItems: {
    id: 'catalog_items.id',
    name: 'catalog_items.name',
    type: 'catalog_items.type',
    status: 'catalog_items.status',
    orgId: 'catalog_items.org_id',
    visibility: 'catalog_items.visibility',
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

const { skillUsagePanel } = await import('../../../../packages/lib/src/features/ax/skills')
const { db } = await import('@gpters/db')

/** 각 쿼리에 넘어간 where 조건 (실행 순서대로) */
let whereConditions: unknown[] = []
/** innerJoin 호출 인자 */
let innerJoinCalls: unknown[][] = []
/** leftJoin 호출 인자 — 카탈로그 밖 이벤트가 섞이는 회귀를 잡기 위해 함께 기록한다 */
let leftJoinCalls: unknown[][] = []

/** 어떤 체이닝(from/where/groupBy…)에도 자신을 돌려주고, await 하면 결과를 내는 쿼리 빌더 */
function builder(result: unknown) {
  const stub: Record<string, unknown> = {}
  for (const method of ['from', 'groupBy', 'orderBy', 'limit']) {
    stub[method] = vi.fn(() => stub)
  }
  stub.where = vi.fn((condition: unknown) => {
    whereConditions.push(condition)
    return stub
  })
  stub.innerJoin = vi.fn((...args: unknown[]) => {
    innerJoinCalls.push(args)
    return stub
  })
  stub.leftJoin = vi.fn((...args: unknown[]) => {
    leftJoinCalls.push(args)
    return stub
  })
  stub.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return stub
}

/** 패널이 실행하는 4개 쿼리의 결과를 순서대로 큐에 넣는다 */
function queueQueries(results: unknown[]) {
  const select = vi.mocked(db.select)
  select.mockReset()
  for (const result of results) {
    select.mockReturnValueOnce(builder(result) as never)
  }
}

/**
 * Drizzle 조건 객체를 훑어 리터럴 값을 전부 모은다.
 * 조립된 where 안에 어떤 컬럼·상수가 들어갔는지 확인하는 용도.
 *
 * SQL 템플릿의 인자는 쿼리 빌드 시점까지 Param으로 감싸이지 않고 원본 그대로
 * queryChunks에 들어가므로, 원시값 청크도 함께 수집한다.
 */
function collectValues(node: unknown, out: unknown[] = []): unknown[] {
  if (node === null || node === undefined) return out
  if (typeof node !== 'object') {
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

describe('skillUsagePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    whereConditions = []
    innerJoinCalls = []
    leftJoinCalls = []
  })

  it('meta가 레지스트리 계약과 일치한다', () => {
    expect(skillUsagePanel.meta.id).toBe('skill-usage')
    expect(skillUsagePanel.meta.visibility).toBe('org')
  })

  it('스킬별 action을 피벗하고 실제 적용 보고 내림차순으로 정렬한다', async () => {
    queueQueries([
      [{
        totalEvents: 61,
        searched: 16,
        loaded: 29,
        applied: 6,
        skipped: 5,
        deployed: 5,
        activeUsers: 5,
        sessions: 7,
      }],
      [
        {
          skillId: 'low-usage',
          name: '적게 쓴 스킬',
          searched: 9,
          loaded: 20,
          applied: 0,
          skipped: 4,
          deployed: 0,
          users: 1,
          lastUsedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        {
          skillId: 'unnamed-skill',
          name: null,
          searched: 2,
          loaded: 3,
          applied: 2,
          skipped: 0,
          deployed: 1,
          users: 2,
          lastUsedAt: new Date('2026-08-03T12:00:00.000Z'),
        },
        {
          skillId: 'top-skill',
          name: '많이 쓴 스킬',
          searched: 5,
          loaded: 6,
          applied: 4,
          skipped: 1,
          deployed: 2,
          users: 3,
          lastUsedAt: new Date('2026-08-05T09:30:00.000Z'),
        },
      ],
      [
        { date: '2026-08-04', events: 20 },
        { date: '2026-08-05', events: 22 },
      ],
      [
        {
          id: 'dusty-skill',
          name: '안 쓰는 스킬',
          lastUsedAt: new Date('2026-01-10T00:00:00.000Z'),
          usageSessions: 2,
          totalUnused: 73,
        },
      ],
    ])

    const result = await skillUsagePanel.load({ days: 30, isAdmin: false })

    expect(result.status).toBe('ok')
    expect(result.data).not.toBeNull()

    const data = result.data!
    expect(data.totalEvents).toBe(61)
    expect(data.meaningfulUses).toBe(6)
    expect(data.activeUsers).toBe(5)
    expect(data.sessions).toBe(7)
    expect(data.actionTotals).toEqual({ search: 16, load: 29, apply: 6, skip: 5, deploy: 5 })

    // applied: top-skill 4 > unnamed-skill 2 > low-usage 0
    expect(data.skills.map((s) => s.skillId)).toEqual(['top-skill', 'unnamed-skill', 'low-usage'])
    expect(result.highlights).toEqual([
      { label: '실제 적용 보고', value: '6', hint: '건', periodLinked: true },
      { label: '실제 사용 구성원', value: '5', hint: '명', periodLinked: true },
    ])

    expect(data.skills[0]).toEqual({
      skillId: 'top-skill',
      name: '많이 쓴 스킬',
      searched: 5,
      loaded: 6,
      applied: 4,
      skipped: 1,
      deployed: 2,
      users: 3,
      lastUsedAt: '2026-08-05T09:30:00.000Z',
    })

    // 카탈로그 이름이 비어 있으면 skillId를 그대로 표시명으로 쓴다
    expect(data.skills[1].name).toBe('unnamed-skill')

    // 이벤트가 없는 날도 0으로 채워 연속된 축을 만든다
    expect(data.daily).toHaveLength(30)
    expect(data.daily.find((day) => day.date === '2026-08-04')).toEqual({ date: '2026-08-04', events: 20 })
    expect(data.daily.find((day) => day.date === '2026-08-05')).toEqual({ date: '2026-08-05', events: 22 })
    expect(data.daily.every((day) => Number.isInteger(day.events))).toBe(true)
    expect(data.totalUnusedSkills).toBe(73)
    expect(data.unusedSkills).toEqual([
      {
        id: 'dusty-skill',
        name: '안 쓰는 스킬',
        lastUsedAt: '2026-01-10T00:00:00.000Z',
        usageSessions: 2,
      },
    ])
  })

  it('count가 문자열로 와도 숫자로 환산한다', async () => {
    queueQueries([
      [{
        totalEvents: '11',
        searched: '4',
        loaded: '3',
        applied: '2',
        skipped: '1',
        deployed: '1',
        activeUsers: '2',
        sessions: '3',
      }],
      [
        {
          skillId: 'string-counts',
          name: null,
          searched: '4',
          loaded: '3',
          applied: '2',
          skipped: '1',
          deployed: '0',
          users: '2',
          lastUsedAt: '2026-08-02T00:00:00.000Z',
        },
      ],
      [],
      [],
    ])

    const data = (await skillUsagePanel.load({ days: 7, isAdmin: false })).data!

    expect(data.totalEvents).toBe(11)
    expect(data.meaningfulUses).toBe(2)
    expect(data.activeUsers).toBe(2)
    expect(data.sessions).toBe(3)
    expect(data.skills[0].loaded).toBe(3)
    expect(data.skills[0].users).toBe(2)
    expect(data.skills[0].lastUsedAt).toBe('2026-08-02T00:00:00.000Z')
  })

  it('이벤트가 0건이면 error가 아니라 빈 데이터로 응답한다', async () => {
    queueQueries([
      [{ totalEvents: 0, searched: 0, loaded: 0, applied: 0, skipped: 0, deployed: 0, activeUsers: 0, sessions: 0 }],
      [],
      [],
      [
        {
          id: 'never-used',
          name: '한 번도 안 쓴 스킬',
          lastUsedAt: null,
          usageSessions: 0,
          totalUnused: 1,
        },
      ],
    ])

    const result = await skillUsagePanel.load({ days: 30, isAdmin: false })

    expect(result.status).toBe('ok')
    const data = result.data!
    expect(data.totalEvents).toBe(0)
    expect(data.meaningfulUses).toBe(0)
    expect(data.activeUsers).toBe(0)
    expect(data.sessions).toBe(0)
    expect(data.skills).toEqual([])
    expect(data.totalUnusedSkills).toBe(1)
    expect(data.unusedSkills).toEqual([
      {
        id: 'never-used',
        name: '한 번도 안 쓴 스킬',
        lastUsedAt: null,
        usageSessions: 0,
      },
    ])
    // 활동이 없어도 축은 유지된다 — 전 구간이 0으로 채워진다
    expect(data.daily).toHaveLength(30)
    expect(data.daily.every((day) => day.events === 0)).toBe(true)
  })

  it('상위 50개까지만 내려준다', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      skillId: `skill-${i}`,
      name: `스킬 ${i}`,
      searched: 0,
      loaded: i,
      applied: 0,
      skipped: 0,
      deployed: 0,
      users: 1,
      lastUsedAt: null,
    }))

    queueQueries([[{ totalEvents: 60, activeUsers: 1, sessions: 1 }], rows, [], []])

    const data = (await skillUsagePanel.load({ days: 30, isAdmin: false })).data!

    expect(data.skills).toHaveLength(50)
    expect(data.skills[0].skillId).toBe('skill-59')
    expect(data.skills[0].lastUsedAt).toBeNull()
  })

  describe('단일 GPTers 카탈로그 집계', () => {
    /** where 조건 순서: 0=요약 1=스킬피벗 2=일자별 3=미사용스킬 */
    const TOTALS_WHERE = 0
    const SKILL_PIVOT_WHERE = 1
    const DAILY_WHERE = 2
    const UNUSED_SKILLS_WHERE = 3

    async function loadPanel() {
      queueQueries([[{ totalEvents: 1, activeUsers: 1, sessions: 1 }], [], [], []])
      const result = await skillUsagePanel.load({ days: 30, isAdmin: false })
      expect(result.status).toBe('ok')
      return result
    }

    it('스킬 이벤트를 읽는 쿼리는 모두 카탈로그를 innerJoin한다', async () => {
      await loadPanel()

      // leftJoin이면 카탈로그에 없는(= 가시성 판정 불가) skill_id가 집계에 섞인다
      expect(leftJoinCalls).toHaveLength(0)
      // 요약 · 스킬 피벗 · 일자별
      expect(innerJoinCalls).toHaveLength(3)
    })

    it('카탈로그를 읽는 모든 쿼리가 legacy scope 필드를 무시한다', async () => {
      await loadPanel()

      // 요약 타일과 표가 서로 다른 모집단이면 화면의 숫자가 어긋난다
      for (const index of [TOTALS_WHERE, SKILL_PIVOT_WHERE, DAILY_WHERE, UNUSED_SKILLS_WHERE]) {
        const values = collectValues(whereConditions[index])

        expect(values).not.toContain('catalog_items.org_id')
        expect(values).not.toContain('catalog_items.visibility')
      }
    })

    it('세션 수를 별도 쿼리로 세지 않는다', async () => {
      await loadPanel()

      // 세션을 mcp_sessions에서 따로 세면 조직 범위·익명 세션 취급이 달라져
      // 옆 타일과 모집단이 어긋난다. 요약 쿼리 안에서 함께 센다.
      expect(whereConditions).toHaveLength(4)
      expect(innerJoinCalls).toHaveLength(3)
    })

    it('일자별 실제 사용 추이는 적용 보고만 센다', async () => {
      await loadPanel()

      const values = collectValues(whereConditions[DAILY_WHERE])
      expect(values).toContain('apply')
      expect(values).not.toContain('load')
      expect(values).not.toContain('search')
      expect(values).not.toContain('skip')
      expect(values).not.toContain('deploy')
    })
  })

  it('쿼리가 실패하면 throw하지 않고 error 상태를 반환한다', async () => {
    vi.mocked(db.select).mockReset()
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error('connection refused')
    })

    const result = await skillUsagePanel.load({ days: 30, isAdmin: false })

    expect(result.status).toBe('error')
    expect(result.data).toBeNull()
    expect(result.message).toBeTruthy()
    expect(result.meta.id).toBe('skill-usage')
  })

  it('쿼리가 reject되어도 error 상태를 반환한다', async () => {
    vi.mocked(db.select).mockReset()
    vi.mocked(db.select).mockReturnValue(builder(Promise.reject(new Error('timeout'))) as never)

    const result = await skillUsagePanel.load({ days: 30, isAdmin: false })

    expect(result.status).toBe('error')
    expect(result.data).toBeNull()
  })
})
