/**
 * `report_usage` MCP 도구 테스트 (서버 수신 쪽)
 *
 * 이 도구가 지켜야 하는 두 가지를 검증한다.
 * 1. 팀원 이름은 인증 세션에서만 나온다 — 클라이언트가 실어 보낸 이름은 무시된다.
 * 2. (팀원, 클라이언트, 구간)이 같으면 덮어쓴다 — 재실행해도 행이 늘지 않는다.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDb, mockUsers, mockAxClientUsage } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  mockUsers: { id: 'id', name: 'name', email: 'email' },
  mockAxClientUsage: {
    id: 'id',
    memberName: 'memberName',
    client: 'client',
    periodStart: 'periodStart',
  },
}))

vi.mock('@gpters/db', () => ({
  db: mockDb,
  catalogItems: {},
  users: mockUsers,
  suggestions: {},
  axClientUsage: mockAxClientUsage,
}))

vi.mock('drizzle-orm', () => ({
  ilike: vi.fn(),
  // setup.ts의 정리 루틴이 쓴다 — 빠지면 테스트마다 경고가 찍힌다
  like: vi.fn(),
  or: vi.fn(),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  sql: vi.fn(),
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
import { reportUsage, executeTool } from '../../../../packages/lib/src/mcp/handlers'

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
    limit: vi.fn().mockResolvedValue(result),
  }
}

/**
 * 사용자 조회 → 기존 행 조회 순서로 select를 답하게 만든다
 *
 * @param user - users 테이블 조회 결과 (없으면 빈 배열)
 * @param existingRows - 레코드마다의 기존 행 조회 결과
 */
function stubSelect(user: unknown[], existingRows: unknown[][]) {
  const queue = [user, ...existingRows]
  mockDb.select.mockImplementation(() => selectChain(queue.shift() ?? []))
}

/** insert/update가 값을 삼키도록 준비하고, 넘어온 값을 모아 준다 */
function stubWrites() {
  const insertedValues: Record<string, unknown>[] = []
  const updatedValues: Record<string, unknown>[] = []

  mockDb.insert.mockImplementation(() => ({
    values: vi.fn().mockImplementation(async (values: Record<string, unknown>) => {
      insertedValues.push(values)
    }),
  }))
  mockDb.update.mockImplementation(() => ({
    set: vi.fn().mockImplementation((values: Record<string, unknown>) => {
      updatedValues.push(values)
      return { where: vi.fn().mockResolvedValue(undefined) }
    }),
  }))

  return { insertedValues, updatedValues }
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

      await reportUsage({ records: [] }, 'user-1')

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
    })

    it('같은 (팀원, 클라이언트, 구간)이 있으면 update 한다 — 행이 늘지 않는다', async () => {
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

      const response = await executeTool('report_usage', { records: [] }, 'user-1')

      expect(response.isError).toBe(true)
      expect(JSON.parse(response.content[0].text).success).toBe(false)
    })
  })
})
