/**
 * AX 대시보드 — 클라이언트 사용량 패널 테스트
 *
 * db는 모킹하고, 다음 네 가지를 검증한다:
 * 1. 클라이언트별·모델별 집계가 맞는지
 * 2. 한도를 안 주는 클라이언트(Claude Code)가 0이 아니라 null로 남는지
 * 3. isAdmin이 아닐 때 팀원별 상세(members)가 노출되지 않는지
 * 4. 여러 수집 구간이 섞여 있을 때 가장 최근 구간만 집계해 이중 계상을 막는지
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@gpters/db', () => ({
  db: { select: vi.fn() },
  axClientUsage: { name: 'ax_client_usage', periodStart: 'period_start' },
}))

vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const { clientUsagePanel } = await import('../../../../packages/lib/src/features/ax/usage')
const { db } = await import('@gpters/db')

/** 어떤 체이닝에도 자신을 돌려주고, await 하면 결과를 내는 쿼리 빌더 */
function builder(result: unknown) {
  const stub: Record<string, unknown> = {}
  for (const method of ['from', 'where', 'orderBy', 'limit']) {
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

const THIS_WEEK = new Date('2026-08-01T00:00:00Z')
const LAST_WEEK = new Date('2026-07-25T00:00:00Z')

const row = (overrides: Record<string, unknown> = {}) => ({
  memberName: '진우',
  client: 'codex',
  planRaw: 'prolite',
  plan: 'ChatGPT Pro (lite)',
  periodStart: THIS_WEEK,
  periodEnd: new Date('2026-08-08T00:00:00Z'),
  inputTokens: 100,
  outputTokens: 50,
  cachedTokens: 850,
  sessions: 3,
  models: { 'gpt-5.6-sol': 1000 },
  limitUsedPercent: '34.00',
  limitResetsAt: new Date('2026-08-13T00:00:00Z'),
  syncedAt: new Date('2026-08-06T09:00:00Z'),
  ...overrides,
})

const ADMIN = { days: 30, isAdmin: true, orgId: null }
const MEMBER = { days: 30, isAdmin: false, orgId: null }

describe('clientUsagePanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('수집 데이터가 없으면 오류가 아니라 not_configured로 응답한다', async () => {
    queueRows([])
    const result = await clientUsagePanel.load(ADMIN)

    expect(result.status).toBe('not_configured')
    expect(result.data).toBeNull()
  })

  it('클라이언트별로 토큰·세션·인원을 집계한다', async () => {
    queueRows([
      row({ memberName: '진우', client: 'codex' }),
      row({
        memberName: '다혜',
        client: 'codex',
        inputTokens: 200,
        outputTokens: 100,
        cachedTokens: 700,
        sessions: 2,
        limitUsedPercent: '50.00',
      }),
    ])

    const result = await clientUsagePanel.load(ADMIN)
    expect(result.status).toBe('ok')

    const codex = result.data!.byClient.find((c) => c.client === 'codex')!
    expect(codex.members).toBe(2)
    expect(codex.sessions).toBe(5)
    expect(codex.totalTokens).toBe(2000)
    // 34 + 50 의 평균
    expect(codex.avgLimitUsedPercent).toBe(42)
  })

  it('Claude Code는 한도를 보고하지 않으므로 null로 남고 reportsLimit이 false다', async () => {
    queueRows([
      row({
        client: 'claude-code',
        plan: 'Claude Max 20x',
        limitUsedPercent: null,
        limitResetsAt: null,
        models: { 'claude-opus-5': 1000 },
      }),
    ])

    const result = await clientUsagePanel.load(ADMIN)
    const claude = result.data!.byClient.find((c) => c.client === 'claude-code')!

    expect(claude.reportsLimit).toBe(false)
    // 0이 아니라 null이어야 한다 — 0은 "한도를 안 썼다"로 읽힌다
    expect(claude.avgLimitUsedPercent).toBeNull()
    expect(claude.avgLimitUsedPercent).not.toBe(0)
    expect(result.data!.members![0].limitUsedPercent).toBeNull()
  })

  it('관리자가 아니면 팀원별 상세를 내려주지 않는다', async () => {
    queueRows([row(), row({ memberName: '다혜' })])

    const result = await clientUsagePanel.load(MEMBER)

    expect(result.data!.members).toBeNull()
    // 집계는 전원에게 보인다
    expect(result.data!.byClient.length).toBeGreaterThan(0)
    expect(JSON.stringify(result.data)).not.toContain('진우')
  })

  it('구간이 섞여 있으면 최근 구간만 집계해 이중 계상을 막는다', async () => {
    queueRows([
      row({ periodStart: THIS_WEEK, cachedTokens: 850 }),
      row({ memberName: '진우', periodStart: LAST_WEEK, cachedTokens: 9999 }),
    ])

    const result = await clientUsagePanel.load(ADMIN)

    // 지난주 행이 더해지면 안 된다
    expect(result.data!.totalTokens).toBe(1000)
    expect(result.data!.members).toHaveLength(1)
    expect(result.data!.periodStart).toBe(THIS_WEEK.toISOString())
  })

  it('모델별 사용량을 내림차순으로 합산한다', async () => {
    queueRows([
      row({ models: { 'gpt-5.6-sol': 300, 'claude-opus-5': 100 } }),
      row({ memberName: '다혜', models: { 'claude-opus-5': 500 } }),
    ])

    const result = await clientUsagePanel.load(ADMIN)

    expect(result.data!.byModel).toEqual([
      { model: 'claude-opus-5', tokens: 600 },
      { model: 'gpt-5.6-sol', tokens: 300 },
    ])
  })

  it('조회 실패 시 오류 상태로 응답한다', async () => {
    vi.mocked(db.select).mockReset()
    vi.mocked(db.select).mockImplementationOnce(() => {
      throw new Error('연결 끊김')
    })

    const result = await clientUsagePanel.load(ADMIN)

    expect(result.status).toBe('error')
    expect(result.data).toBeNull()
  })
})
