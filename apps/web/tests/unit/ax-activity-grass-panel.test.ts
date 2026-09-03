/**
 * AX 대시보드 — 장기 활동(잔디) 패널 테스트
 *
 * db는 모킹하고, 365일 고정 윈도우·코호트 집계 정의·병렬 조회를 검증한다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@gpters/db', () => ({
  db: { select: vi.fn() },
  skillEvents: {
    skillId: 'skill_events.skill_id',
    journeyId: 'skill_events.journey_id',
    sessionId: 'skill_events.session_id',
    userId: 'skill_events.user_id',
    action: 'skill_events.action',
    createdAt: 'skill_events.created_at',
  },
  catalogItems: { id: 'catalog_items.id' },
  axAgentTelemetryBatches: {
    agentId: 'ax_agent_telemetry_batches.agent_id',
    windowStart: 'ax_agent_telemetry_batches.window_start',
    windowEnd: 'ax_agent_telemetry_batches.window_end',
    turns: 'ax_agent_telemetry_batches.turns',
  },
}))

vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

const { activityGrassPanel } = await import('../../../../packages/lib/src/features/ax/activity-grass')
const { db } = await import('@gpters/db')

/** where 조건과 select 컬럼을 기록하는 쿼리 빌더 */
let whereConditions: unknown[] = []
function builder(result: unknown) {
  const stub: Record<string, unknown> = {}
  for (const method of ['from', 'innerJoin', 'groupBy', 'orderBy']) stub[method] = vi.fn(() => stub)
  stub.where = vi.fn((condition: unknown) => { whereConditions.push(condition); return stub })
  stub.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return stub
}

/** Drizzle sql 템플릿을 사람이 읽을 수 있는 문자열로 편다 — 컬럼은 이름, 리터럴은 값으로 */
function sqlText(node: unknown): string {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node
  if (typeof node !== 'object') return String(node)
  const record = node as Record<string, unknown>
  if (Array.isArray(record.queryChunks)) return record.queryChunks.map(sqlText).join('')
  if (Array.isArray(record.value)) return record.value.map(sqlText).join('')
  if (Array.isArray(node)) return node.map(sqlText).join('')
  if (typeof record.name === 'string') return record.name
  if ('value' in record) return sqlText(record.value)
  return ''
}

function collectValues(node: unknown, out: unknown[] = []): unknown[] {
  if (node === null || node === undefined) return out
  if (typeof node !== 'object') { out.push(node); return out }
  if (node instanceof Date) { out.push(node); return out }
  const record = node as Record<string, unknown>
  if (Array.isArray(record.queryChunks)) { for (const chunk of record.queryChunks) collectValues(chunk, out); return out }
  if (Array.isArray(node)) { for (const item of node) collectValues(item, out); return out }
  if ('value' in record) collectValues(record.value, out)
  return out
}

function queueQueries(results: unknown[]) {
  const select = vi.mocked(db.select)
  select.mockReset()
  for (const result of results) select.mockReturnValueOnce(builder(result) as never)
}

describe('activityGrassPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    whereConditions = []
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-19T03:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('탭으로 노출하지 않는 기간 비연동 패널이다', () => {
    expect(activityGrassPanel.meta.id).toBe('activity-grass')
    expect(activityGrassPanel.meta.usesPeriod).toBe(false)
    expect(activityGrassPanel.meta.hidden).toBe(true)
    expect(activityGrassPanel.meta.visibility).toBe('org')
  })

  it('오늘 포함 365일 고정 윈도우로 두 잔디를 채운다', async () => {
    queueQueries([
      [{ date: '2026-08-18', directApplied: 9, appliedAfterLoad: 3, loads: 20, linkableLoads: 15 }],
      [{ date: '2026-08-18', turns: 43, agents: 2 }],
    ])

    const result = await activityGrassPanel.load({ days: 7, isAdmin: false })
    expect(result.status).toBe('ok')
    const data = result.data!

    expect(data.grassDaily).toHaveLength(365)
    expect(data.grassDaily[0]?.date).toBe('2025-08-20')
    expect(data.grassDaily.at(-1)?.date).toBe('2026-08-19')
    expect(data.grassDaily.find((d) => d.date === '2026-08-18')).toEqual({
      date: '2026-08-18',
      events: 12,
      loads: 20,
      linkableLoads: 15,
      directApplied: 9,
      appliedAfterLoad: 3,
    })
    expect(data.agentGrassDaily).toHaveLength(365)
    expect(data.agentGrassDaily.find((d) => d.date === '2026-08-18')).toEqual({
      date: '2026-08-18',
      events: 43,
      agents: 2,
    })
    // 활동이 없는 날은 0으로 채운다
    expect(data.grassDaily.find((d) => d.date === '2026-08-17')).toMatchObject({ events: 0, loads: 0 })
  })

  it('count가 문자열로 와도 숫자로 환산한다', async () => {
    queueQueries([
      [{ date: '2026-08-18', directApplied: '2', appliedAfterLoad: '1', loads: '8', linkableLoads: '6' }],
      [{ date: '2026-08-18', turns: '17', agents: '1' }],
    ])
    const data = (await activityGrassPanel.load({ days: 7, isAdmin: false })).data!
    expect(data.grassDaily.find((d) => d.date === '2026-08-18')).toMatchObject({
      events: 3, loads: 8, linkableLoads: 6, directApplied: 2, appliedAfterLoad: 1,
    })
    expect(data.agentGrassDaily.find((d) => d.date === '2026-08-18')).toMatchObject({ events: 17, agents: 1 })
  })

  it('연결 가능 로드와 로드 후 적용은 사용자×흐름×스킬 코호트로 세고, 활동 에이전트는 턴이 있는 batch만 센다', async () => {
    queueQueries([[], []])
    await activityGrassPanel.load({ days: 7, isAdmin: false })

    const columns = vi.mocked(db.select).mock.calls.map((call) => call[0] as Record<string, unknown>)
    const normalize = (node: unknown) => sqlText(node)
      .replace(/\b(skill_events|ax_agent_telemetry_batches)\./g, '')
      .replace(/\s+/g, ' ')
    const linkable = normalize(columns[0].linkableLoads)
    const converted = normalize(columns[0].appliedAfterLoad)
    expect(linkable).toMatch(/count\(distinct \( user_id, coalesce\(journey_id, session_id\), skill_id \)\)/)
    expect(linkable).toContain('coalesce(journey_id, session_id) is not null')
    expect(linkable).toContain('user_id is not null')
    expect(converted).toMatch(/count\(distinct \( user_id, coalesce\(journey_id, session_id\), skill_id \)\)/)
    expect(converted).toContain('user_id is not null')
    expect(converted).toContain("applied.action = 'apply'")
    expect(converted).toContain('applied.created_at >= created_at')
    expect(normalize(columns[1].agents)).toContain('filter (where turns > 0)')

    // 두 쿼리 모두 365일 경계가 있고, 스킬 잔디는 로드·적용만 본다
    expect(whereConditions).toHaveLength(2)
    const skillValues = collectValues(whereConditions[0])
    expect(skillValues.some((value) => value instanceof Date)).toBe(true)
    expect(skillValues).toContain('load')
    expect(skillValues).toContain('apply')
    expect(skillValues).not.toContain('search')
    const agentValues = collectValues(whereConditions[1])
    expect(agentValues.some((value) => value instanceof Date)).toBe(true)
    expect(agentValues).not.toContain('apply')
  })

  it('두 잔디 쿼리를 순서대로 기다리지 않고 동시에 보낸다', async () => {
    let release: (() => void) | null = null
    const gate = new Promise<void>((resolve) => { release = resolve })
    const select = vi.mocked(db.select)
    select.mockReset()
    const slow = builder([]) as Record<string, unknown>
    slow.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      gate.then(() => []).then(resolve, reject)
    select.mockReturnValueOnce(slow as never)
    select.mockReturnValueOnce(builder([]) as never)

    const pending = activityGrassPanel.load({ days: 7, isAdmin: false })
    await Promise.resolve()
    expect(select).toHaveBeenCalledTimes(2)
    release!()
    expect((await pending).status).toBe('ok')
  })

  it('쿼리가 실패하면 throw하지 않고 error 상태를 반환한다', async () => {
    vi.mocked(db.select).mockReset()
    vi.mocked(db.select).mockImplementation(() => { throw new Error('connection refused') })
    const result = await activityGrassPanel.load({ days: 7, isAdmin: false })
    expect(result.status).toBe('error')
    expect(result.data).toBeNull()
  })
})
