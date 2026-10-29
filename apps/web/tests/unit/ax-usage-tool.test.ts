/**
 * `report_usage` MCP 도구 테스트 (서버 수신 쪽)
 *
 * 이 도구가 지켜야 하는 두 가지를 검증한다.
 * 1. 팀원 이름은 인증 세션에서만 나온다 — 클라이언트가 실어 보낸 이름은 무시된다.
 * 2. (인증 사용자, 클라이언트, 구간)이 같으면 덮어쓴다 — 재실행해도 행이 늘지 않는다.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDb, mockUsers, mockAxClientUsage, mockAxSubscriptions, mockAxUsageCollectorState, mockAxUsageLimitWindows } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  mockUsers: { id: 'id', name: 'name', email: 'email' },
  mockAxClientUsage: {
    id: 'id',
    userId: 'userId',
    memberName: 'memberName',
    client: 'client',
    periodStart: 'periodStart',
  },
  mockAxUsageCollectorState: { userId: 'collector.userId' },
  mockAxSubscriptions: { ownerName: 'sub.ownerName', vendor: 'sub.vendor', accountKey: 'sub.accountKey', status: 'sub.status' },
  mockAxUsageLimitWindows: { userId: 'window.userId', client: 'window.client', resetsAt: 'window.resetsAt', maxUsedPercent: 'window.max', lastSeenAt: 'window.lastSeenAt' },
}))

vi.mock('@gpters/db', () => ({
  db: mockDb,
  catalogItems: {},
  users: mockUsers,
  suggestions: {},
  axClientUsage: mockAxClientUsage,
  axUsageCollectorState: mockAxUsageCollectorState,
  axSubscriptions: mockAxSubscriptions,
  axUsageLimitWindows: mockAxUsageLimitWindows,
}))

vi.mock('drizzle-orm', () => ({
  ilike: vi.fn(),
  // setup.ts의 정리 루틴이 쓴다 — 빠지면 테스트마다 경고가 찍힌다
  like: vi.fn(),
  or: vi.fn(),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  sql: vi.fn(),
  gt: vi.fn(),
  inArray: vi.fn(),
  desc: vi.fn(),
}))

vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

// `@/lib/mcp/handlers`는 배럴을 거치므로 무관한 모듈까지 끌어온다. 계약 테스트와 같이
// 구현 파일을 직접 가리켜 모의 대상을 이 파일에서 만지는 것만으로 좁힌다.
import { carryLimit, reportUsage, executeTool } from '../../../../packages/lib/src/mcp/handlers'

/** 검증을 통과하는 최소 레코드 */
function record(overrides: Record<string, unknown> = {}) {
  return {
    client: 'codex',
    planRaw: 'prolite',
    plan: 'ChatGPT Pro (lite)',
    periodStart: '2026-07-31T00:00:00.000Z',
    periodEnd: '2026-08-07T00:00:00.000Z',
    inputTokens: 100,
    outputTokens: 50,
    cachedTokens: 850,
    sessions: 3,
    models: { 'gpt-5.6-sol': 1000 },
    limitUsedPercent: 43,
    limitResetsAt: '2026-08-13T00:48:51.000Z',
    ...overrides,
  }
}

/** Claude Code 레코드 — 한도 정보가 존재하지 않는 쪽 */
function claudeRecord(overrides: Record<string, unknown> = {}) {
  return record({
    client: 'claude-code',
    planRaw: 'default_claude_max_20x',
    plan: 'Claude Max 20x',
    models: { 'claude-opus-5': 2000 },
    limitUsedPercent: null,
    limitResetsAt: null,
    ...overrides,
  })
}

/** `db.select(...).from(...).where(...).limit(...)` 체인 */
function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    // 진행 중 회차 조회는 orderBy 에서 끝난다
    orderBy: vi.fn().mockResolvedValue(result),
    limit: vi.fn().mockResolvedValue(result),
  }
}

/**
 * 사용자 조회 → 레코드마다 (진행 중 회차 조회, 기존 행 조회) 순서로 select를 답하게 만든다
 *
 * @param user - users 테이블 조회 결과 (없으면 빈 배열)
 * @param existingRows - 레코드마다의 기존 행 조회 결과
 * @param windows - 레코드마다의 진행 중 회차 조회 결과 (생략하면 없음)
 */
function stubSelect(user: unknown[], existingRows: unknown[][], windows: unknown[][] = []) {
  const queue = [user, ...existingRows.flatMap((rows, i) => [windows[i] ?? [], rows])]
  mockDb.select.mockImplementation(() => selectChain(queue.shift() ?? []))
}

/** insert/update가 값을 삼키도록 준비하고, 넘어온 값을 모아 준다 */
function stubWrites() {
  const insertedValues: Record<string, unknown>[] = []
  const updatedValues: Record<string, unknown>[] = []
  const collectorValues: Record<string, unknown>[] = []
  const windowValues: Record<string, unknown>[] = []

  mockDb.insert.mockImplementation((table: unknown) => ({
    values: vi.fn().mockImplementation((values: Record<string, unknown>) => {
      if (table === mockAxUsageLimitWindows) {
        windowValues.push(values)
        return { onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) }
      }
      if (table === mockAxUsageCollectorState) {
        collectorValues.push(values)
        return { onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) }
      }
      insertedValues.push(values)
      return Promise.resolve(undefined)
    }),
  }))
  mockDb.update.mockImplementation(() => ({
    set: vi.fn().mockImplementation((values: Record<string, unknown>) => {
      updatedValues.push(values)
      return { where: vi.fn().mockResolvedValue(undefined) }
    }),
  }))

  return { insertedValues, updatedValues, collectorValues, windowValues }
}

describe('report_usage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('인증', () => {
    it('userId가 없으면 저장하지 않는다', async () => {
      const writes = stubWrites()
      const result = await reportUsage({ records: [record()] }, undefined)

      expect(result.success).toBe(false)
      expect(result.error).toContain('인증')
      expect(writes.insertedValues).toHaveLength(0)
    })

    it('users에 없는 userId면 저장하지 않는다', async () => {
      stubSelect([], [])
      const writes = stubWrites()

      const result = await reportUsage({ records: [record()] }, 'ghost-user')

      expect(result.success).toBe(false)
      expect(writes.insertedValues).toHaveLength(0)
    })

    it('memberName은 인증 사용자에서 나온다 — 클라이언트가 보낸 이름은 무시된다', async () => {
      stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [[]])
      const writes = stubWrites()

      const result = await reportUsage(
        { records: [record({ memberName: '남의이름' })], memberName: '남의이름' },
        'user-1'
      )

      expect(result.success).toBe(true)
      expect(result.memberName).toBe('현진우')
      expect(writes.insertedValues[0].userId).toBe('user-1')
      expect(writes.insertedValues[0].memberName).toBe('현진우')
    })

    it('이름이 비어 있으면 이메일 로컬파트를 쓴다', async () => {
      stubSelect([{ name: null, email: 'primadonna@gpters.org' }], [[]])
      stubWrites()

      const result = await reportUsage({ records: [record()] }, 'user-1')

      expect(result.memberName).toBe('primadonna')
    })
  })

  describe('검증', () => {
    it('검증 실패 사유를 그대로 돌려준다', async () => {
      const writes = stubWrites()

      const result = await reportUsage(
        { records: [record({ client: 'cursor' })] },
        'user-1'
      )

      expect(result.success).toBe(false)
      expect(result.errors?.some((e) => e.includes('client'))).toBe(true)
      expect(writes.insertedValues).toHaveLength(0)
    })

    it('검증은 사용자 조회보다 먼저 한다 — 잘못된 본문으로 DB를 건드리지 않는다', async () => {
      stubWrites()

      await reportUsage({ records: 'invalid' }, 'user-1')

      expect(mockDb.select).not.toHaveBeenCalled()
    })
  })

  describe('upsert', () => {
    it('기존 행이 없으면 insert 한다', async () => {
      stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [[]])
      const writes = stubWrites()

      const result = await reportUsage({ records: [record()] }, 'user-1')

      expect(result).toMatchObject({ success: true, inserted: 1, updated: 0 })
      expect(writes.insertedValues).toHaveLength(1)
      expect(writes.updatedValues).toHaveLength(0)
      expect(writes.collectorValues).toHaveLength(1)
    })

    it('계정 키를 저장하고, 보내지 않은 옛 보고는 null로 둔다 (EDU-11835)', async () => {
      stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [[]])
      const writes = stubWrites()
      await reportUsage({ records: [record({ accountKey: 'b'.repeat(64) })] }, 'user-1')
      expect(writes.insertedValues[0].accountKey).toBe('b'.repeat(64))

      stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [[]])
      const old = stubWrites()
      await reportUsage({ records: [record()] }, 'user-1')
      expect(old.insertedValues[0].accountKey).toBeNull()
    })

    it('사용량이 없어도 사용자별 수집기 점검 상태를 upsert 한다', async () => {
      stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [])
      const writes = stubWrites()

      const result = await reportUsage({ records: [] }, 'user-1')

      expect(result).toMatchObject({ success: true, inserted: 0, updated: 0 })
      expect(writes.insertedValues).toHaveLength(0)
      expect(writes.collectorValues[0]).toMatchObject({
        userId: 'user-1',
        memberName: '현진우',
        clients: [],
        recordCount: 0,
      })
    })

    it('한도 연결 상태는 보냈을 때만 점검 상태에 싣는다 — 옛 aitk 보고가 이전 값을 지우지 않는다', async () => {
      const capture = { statusline: 'aitk', autoSetup: 'unchanged', autoSetupAt: null, snapshotAt: '2026-10-19T09:00:00.000Z' }
      stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [])
      let writes = stubWrites()
      await reportUsage({ records: [], limitCapture: capture }, 'user-1')
      // 서버가 받은 시각을 붙여 둔다 — 옛 aitk 보고 뒤에도 언제 관측한 상태인지 구분한다
      expect(writes.collectorValues[0]).toMatchObject({ limitCapture: { ...capture, observedAt: expect.any(String) } })

      stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [])
      writes = stubWrites()
      await reportUsage({ records: [] }, 'user-1')
      expect(writes.collectorValues[0]).not.toHaveProperty('limitCapture')
    })

    it('같은 (인증 사용자, 클라이언트, 구간)이 있으면 update 한다 — 행이 늘지 않는다', async () => {
      stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [[{ id: 'row-1' }]])
      const writes = stubWrites()

      const result = await reportUsage({ records: [record()] }, 'user-1')

      expect(result).toMatchObject({ success: true, inserted: 0, updated: 1 })
      expect(writes.insertedValues).toHaveLength(0)
      expect(writes.updatedValues).toHaveLength(1)
    })

    it('두 클라이언트를 한 번에 보내면 각각 한 행씩 만든다', async () => {
      stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [[], []])
      const writes = stubWrites()

      const result = await reportUsage(
        { records: [record(), claudeRecord()] },
        'user-1'
      )

      expect(result).toMatchObject({ success: true, inserted: 2 })
      expect(writes.insertedValues.map((v) => v.client)).toEqual(['codex', 'claude-code'])
    })
  })

  describe('한도 필드', () => {
    it('Claude Code의 없는 한도를 0으로 채우지 않는다', async () => {
      stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [[]])
      const writes = stubWrites()

      await reportUsage({ records: [claudeRecord()] }, 'user-1')

      expect(writes.insertedValues[0].limitUsedPercent).toBeNull()
      expect(writes.insertedValues[0].limitResetsAt).toBeNull()
    })

    it('Codex의 한도는 numeric 문자열로 넣는다', async () => {
      stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [[]])
      const writes = stubWrites()

      await reportUsage({ records: [record({ limitUsedPercent: 43 })] }, 'user-1')

      expect(writes.insertedValues[0].limitUsedPercent).toBe('43.00')
      expect(writes.insertedValues[0].limitResetsAt).toBeInstanceOf(Date)
    })
  })

  describe('주간 한도 회차', () => {
    it('초기화 전 보고는 회차 최댓값 테이블에 올린다 — 하루 단위 행이 덮여도 남는다', async () => {
      stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [[]])
      const writes = stubWrites()

      await reportUsage({ records: [record({ limitUsedPercent: 43, limitResetsAt: '2099-01-01T00:00:00.000Z' })] }, 'user-1')

      expect(writes.windowValues).toEqual([expect.objectContaining({
        userId: 'user-1', client: 'codex', memberName: '현진우', maxUsedPercent: '43.00',
        // 회차가 처음 생길 때의 사용률(0048) — 초기화 시각만 옮겨 간 회차를 가를 때 쓴다
        firstUsedPercent: '43.00',
        resetsAt: new Date('2099-01-01T00:00:00.000Z'),
      })])
    })

    it('공용 구독 계정 키로 온 보고는 사람 회차에 올리지 않고 하루 단위 행의 한도도 이어받지 않는다 (EDU-11835)', async () => {
      const SHARED = 'c'.repeat(64)
      const queue: unknown[][] = [
        [{ name: '현진우', email: 'primadonna@gpters.org' }],
        // 공용 구독 조회 — where 에서 끝난다
        [{ ownerName: '공용(support)', vendor: 'OpenAI', accountKey: SHARED }, { ownerName: '현진우', vendor: 'OpenAI', accountKey: null }],
        // 기존 행 조회(진행 중 회차 조회는 하지 않는다)
        [],
      ]
      mockDb.select.mockImplementation(() => {
        const result = queue.shift() ?? []
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockImplementation(() => Object.assign(Promise.resolve(result), { limit: vi.fn().mockResolvedValue(result), orderBy: vi.fn().mockResolvedValue(result) })) }
      })
      const writes = stubWrites()

      await reportUsage({ records: [record({ limitUsedPercent: 62, limitResetsAt: '2099-01-01T00:00:00.000Z', accountKey: SHARED })] }, 'user-1')

      expect(writes.windowValues).toHaveLength(0)
      expect(writes.insertedValues[0]).toMatchObject({ accountKey: SHARED, limitUsedPercent: '62.00' })
      expect(queue).toHaveLength(0)
    })

    it('공용 구독 조회에 실패하면 계정 키를 실은 보고는 사람 회차에 올리지 않는다(사용량은 저장)', async () => {
      const queue: unknown[][] = [[{ name: '현진우', email: 'primadonna@gpters.org' }], 'fail' as never, []]
      mockDb.select.mockImplementation(() => {
        const result = queue.shift() ?? []
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockImplementation(() => result === ('fail' as never)
          ? Promise.reject(new Error('db down'))
          : Object.assign(Promise.resolve(result), { limit: vi.fn().mockResolvedValue(result), orderBy: vi.fn().mockResolvedValue(result) })) }
      })
      const writes = stubWrites()

      const result = await reportUsage({ records: [record({ limitUsedPercent: 43, limitResetsAt: '2099-01-01T00:00:00.000Z', accountKey: 'd'.repeat(64) })] }, 'user-1')

      expect(result).toMatchObject({ success: true, inserted: 1 })
      expect(writes.windowValues).toHaveLength(0)
    })

    it('공용이 아닌 계정 키는 평소처럼 사람 회차에 올린다', async () => {
      const queue: unknown[][] = [
        [{ name: '현진우', email: 'primadonna@gpters.org' }],
        [{ ownerName: '공용(support)', vendor: 'OpenAI', accountKey: 'c'.repeat(64) }],
        [], [],
      ]
      mockDb.select.mockImplementation(() => {
        const result = queue.shift() ?? []
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockImplementation(() => Object.assign(Promise.resolve(result), { limit: vi.fn().mockResolvedValue(result), orderBy: vi.fn().mockResolvedValue(result) })) }
      })
      const writes = stubWrites()

      await reportUsage({ records: [record({ limitUsedPercent: 43, limitResetsAt: '2099-01-01T00:00:00.000Z', accountKey: 'd'.repeat(64) })] }, 'user-1')

      expect(writes.windowValues).toHaveLength(1)
    })

    it('초기화 시각이 지난 보고·한도 없는 보고는 올리지 않는다', async () => {
      stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [[], []])
      const writes = stubWrites()

      await reportUsage({ records: [record(), claudeRecord()] }, 'user-1')

      expect(writes.windowValues).toHaveLength(0)
    })

    it('여러 날 레코드가 같은 회차를 실으면 최댓값 하나만 올린다', async () => {
      stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [[], []])
      const writes = stubWrites()
      const resetsAt = '2099-01-01T00:00:00.000Z'

      await reportUsage({ records: [
        record({ limitUsedPercent: 30, limitResetsAt: resetsAt }),
        record({ periodStart: '2026-08-01T00:00:00.000Z', periodEnd: '2026-08-08T00:00:00.000Z', limitUsedPercent: 70, limitResetsAt: resetsAt }),
      ] }, 'user-1')

      expect(writes.windowValues).toHaveLength(1)
      expect(writes.windowValues[0].maxUsedPercent).toBe('70.00')
    })

    it('받은 뒤 DB 처리 중에 초기화 시각을 넘겨도 초기화 전 보고로 남긴다', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      try {
        vi.setSystemTime(new Date('2026-10-19T09:59:59.000Z'))
        const queue: unknown[][] = [[{ name: '현진우', email: 'primadonna@gpters.org' }], []]
        mockDb.select.mockImplementation(() => {
          // 사용자·기존 행 조회가 끝날 즈음 초기화 시각(10:00)을 넘긴다
          vi.setSystemTime(new Date('2026-10-19T10:00:05.000Z'))
          return selectChain(queue.shift() ?? [])
        })
        const writes = stubWrites()

        await reportUsage({ records: [record({ limitUsedPercent: 90, limitResetsAt: '2026-10-19T10:00:00.000Z' })] }, 'user-1')

        expect(writes.windowValues).toEqual([expect.objectContaining({
          maxUsedPercent: '90.00',
          lastReportedAt: new Date('2026-10-19T09:59:59.000Z'),
          lastSeenAt: new Date('2026-10-19T09:59:59.000Z'),
        })])
      } finally {
        vi.useRealTimers()
      }
    })

    it('회차 기록이 실패해도(테이블 적용 전) 사용량 보고는 성공한다', async () => {
      stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [[]])
      const writes = stubWrites()
      const insert = mockDb.insert.getMockImplementation()!
      mockDb.insert.mockImplementation((table: unknown) => table === mockAxUsageLimitWindows
        ? { values: () => ({ onConflictDoUpdate: vi.fn().mockRejectedValue(new Error('relation does not exist')) }) }
        : insert(table))

      const result = await reportUsage({ records: [record({ limitResetsAt: '2099-01-01T00:00:00.000Z' })] }, 'user-1')

      expect(result).toMatchObject({ success: true, inserted: 1 })
      expect(writes.collectorValues).toHaveLength(1)
    })
  })

  describe('executeTool 배선', () => {
    it('report_usage 이름으로 호출된다', async () => {
      stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [[]])
      stubWrites()

      const response = await executeTool('report_usage', { records: [record()] }, 'user-1')

      expect(response.isError).toBeFalsy()
      expect(JSON.parse(response.content[0].text)).toMatchObject({
        success: true,
        memberName: '현진우',
        inserted: 1,
      })
    })

    it('실패는 isError로 표시된다', async () => {
      stubWrites()

      const response = await executeTool(
        'report_usage',
        { records: [record({ client: 'cursor' })] },
        'user-1'
      )

      expect(response.isError).toBe(true)
      expect(JSON.parse(response.content[0].text).success).toBe(false)
    })
  })
})

describe('carryLimit — 하루 단위 행의 한도를 진행 중 회차 최댓값으로', () => {
  // 실제 시각보다 늘 뒤여야 진행 중 회차로 읽힌다 — 날짜를 박아 두면 그날이 지나 깨진다(10/23)
  const resetsAt = new Date('2099-10-22T20:00:00.000Z')
  const window = { resetsAt, maxUsedPercent: '35.00' }
  const row = (limitUsedPercent: string | null, limitResetsAt: Date | null = resetsAt) => ({ limitUsedPercent, limitResetsAt })

  it('같은 회차에서 낮은 값(예전 세션)은 최댓값으로 올린다', () => {
    expect(carryLimit(row('29.00'), window)).toEqual(row('35.00'))
  })

  it('한도 없이 온 보고(세션 시작 직후)는 진행 중 회차 값으로 채운다', () => {
    expect(carryLimit(row(null, null), window)).toEqual(row('35.00'))
  })

  it('더 높은 값, 다른 회차 값, 진행 중 회차가 없는 경우는 그대로 둔다', () => {
    expect(carryLimit(row('40.00'), window)).toEqual(row('40.00'))
    const next = new Date(resetsAt.getTime() + 7 * 86_400_000)
    expect(carryLimit(row('2.00', next), window)).toEqual(row('2.00', next))
    expect(carryLimit(row(null, null), undefined)).toEqual(row(null, null))
  })

  it('초기화 시각이 몇 초 흔들려도 같은 회차로 보고, 더 높은 새 값은 낮추지 않는다', () => {
    const jitter = new Date(resetsAt.getTime() - 3_000)
    expect(carryLimit(row('40.00', jitter), window)).toEqual(row('40.00', jitter))
    expect(carryLimit(row('30.00', jitter), window)).toEqual(row('35.00'))
  })

  it('진행 중 회차는 1시간 안에서 흔들린 행들의 최댓값이다', async () => {
    const jitter = new Date(resetsAt.getTime() - 3_000)
    stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [[{ id: 'row-1' }]], [[
      { resetsAt, maxUsedPercent: '30.00' },
      { resetsAt: jitter, maxUsedPercent: '40.00' },
    ]])
    const writes = stubWrites()

    await reportUsage({ records: [claudeRecord()] }, 'user-1')

    expect(writes.updatedValues[0]).toMatchObject({ limitUsedPercent: '40.00', limitResetsAt: resetsAt })
  })

  it('흔들린 행 하나가 먼저 만료돼도(두 초기화 시각 사이 수신) 그 값을 최댓값에 넣고, 모두 만료됐으면 채우지 않는다', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(resetsAt.getTime() + 1_000))
      const later = new Date(resetsAt.getTime() + 3_000)
      stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [[{ id: 'row-1' }]], [[
        { resetsAt: later, maxUsedPercent: '40.00' },
        { resetsAt, maxUsedPercent: '80.00' },
      ]])
      const writes = stubWrites()
      await reportUsage({ records: [claudeRecord()] }, 'user-1')
      expect(writes.updatedValues[0]).toMatchObject({ limitUsedPercent: '80.00', limitResetsAt: later })

      vi.setSystemTime(new Date(later.getTime() + 1_000))
      stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [[{ id: 'row-1' }]], [[
        { resetsAt: later, maxUsedPercent: '40.00' },
      ]])
      const after = stubWrites()
      await reportUsage({ records: [claudeRecord()] }, 'user-1')
      expect(after.updatedValues[0]).toMatchObject({ limitUsedPercent: null })
    } finally {
      vi.useRealTimers()
    }
  })

  it('조기 초기화 뒤 옛 머신이 지난 회차 값을 보내도 새 회차 값으로 둔다', () => {
    const old = new Date('2026-10-21T20:00:00.000Z')
    expect(carryLimit(row('95.00', old), { resetsAt, maxUsedPercent: '12.00' })).toEqual(row('12.00'))
  })

  it('진행 중 회차를 읽지 못해도 보고는 채우지 않은 값으로 저장한다', async () => {
    const queue: unknown[][] = [[{ name: '현진우', email: 'primadonna@gpters.org' }]]
    let call = 0
    mockDb.select.mockImplementation(() => {
      call++
      // 두 번째 select(진행 중 회차)만 실패시킨다
      if (call === 2) return { from: () => ({ where: () => ({ orderBy: () => Promise.reject(new Error('relation does not exist')) }) }) }
      return selectChain(queue.shift() ?? [])
    })
    const writes = stubWrites()

    const result = await reportUsage({ records: [claudeRecord({ limitUsedPercent: 12, limitResetsAt: resetsAt.toISOString() })] }, 'user-1')

    expect(result.success).toBe(true)
    expect(writes.insertedValues[0]).toMatchObject({ limitUsedPercent: '12.00' })
  })

  it('report_usage 는 회차 기록을 먼저 갱신하고, 덮어쓸 행에 최댓값을 싣는다', async () => {
    stubSelect([{ name: '현진우', email: 'primadonna@gpters.org' }], [[{ id: 'row-1' }]], [[window]])
    const writes = stubWrites()

    const result = await reportUsage({ records: [claudeRecord()] }, 'user-1')

    expect(result.success).toBe(true)
    expect(writes.updatedValues[0]).toMatchObject({ limitUsedPercent: '35.00', limitResetsAt: resetsAt })
  })
})
