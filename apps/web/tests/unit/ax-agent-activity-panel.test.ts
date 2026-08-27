import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@gpters/db', () => ({
  db: { select: vi.fn() },
  axAgentTelemetryBatches: { windowEnd: 'window_end' },
}))

vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

const { agentActivityPanel } = await import('../../../../packages/lib/src/features/ax/agent-activity')
const { db } = await import('@gpters/db')

function builder(result: unknown) {
  const stub: Record<string, unknown> = {}
  for (const method of ['from', 'where']) stub[method] = vi.fn(() => stub)
  stub.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return stub
}

function queueRows(rows: unknown[]) {
  vi.mocked(db.select).mockReset()
  vi.mocked(db.select).mockReturnValueOnce(builder(rows) as never)
}

function usage(inputTokens: number, outputTokens: number, cacheCreationInputTokens: number, cacheReadInputTokens: number, thinkingTokens: number) {
  return { inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens, thinkingTokens, thinkingTokensRelation: 'included-in-output' }
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    agentId: 'bbodoong',
    windowStart: new Date('2026-08-20T00:00:00Z'),
    windowEnd: new Date('2026-08-26T00:00:00Z'),
    collectedAt: new Date('2026-08-26T23:00:00Z'),
    inputTokens: 10,
    outputTokens: 20,
    cacheCreationInputTokens: 30,
    cacheReadInputTokens: 40,
    thinkingTokens: 8,
    thinkingTokensRelation: 'included-in-output',
    sessions: 2,
    turns: 4,
    models: [{ model: 'claude-opus-5', turns: 4, usage: usage(10, 20, 30, 40, 8) }],
    tools: [{ name: 'Bash', calls: 10, failures: 1 }],
    skillLoads: [{ skillId: 'browse', loaded: 2, failed: 0, interrupted: 0 }],
    collection: { source: 'claude-code', recordsRead: 100, parseFailures: 0, unsupportedRecordsSkipped: 2, healthWarnings: [] },
    ...overrides,
  }
}

describe('agentActivityPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-27T00:00:00Z'))
  })

  afterEach(() => vi.useRealTimers())

  it('스킬 업무 영역의 보조 보기로 등록된다', () => {
    expect(agentActivityPanel.meta.parentId).toBe('skill-usage')
  })

  it('source별 batch를 합치되 included thinking을 총 토큰에 중복 합산하지 않는다', async () => {
    queueRows([
      row(),
      row({
        collectedAt: new Date('2026-08-26T22:00:00Z'),
        inputTokens: 1,
        outputTokens: 2,
        cacheCreationInputTokens: 3,
        cacheReadInputTokens: 4,
        thinkingTokens: 1,
        sessions: 1,
        turns: 1,
        models: [{ model: 'gpt-5.6-sol', turns: 1, usage: usage(1, 2, 3, 4, 1) }],
        tools: [{ name: 'CommandExecution', calls: 10, failures: 1 }],
        skillLoads: [],
        collection: { source: 'codex', recordsRead: 50, parseFailures: 1, unsupportedRecordsSkipped: 3, healthWarnings: [] },
      }),
    ])

    const result = await agentActivityPanel.load({ days: 7, isAdmin: false })

    expect(result.status).toBe('ok')
    expect(result.data).toMatchObject({
      totalProcessedTokens: 110,
      sessions: 3,
      turns: 5,
      toolCalls: 20,
      toolFailures: 2,
      collection: { batches: 2, recordsRead: 150, parseFailures: 1, unsupportedRecordsSkipped: 5 },
    })
    expect(result.data!.totalUsage.thinkingTokens).toBe(9)
    expect(result.data!.reporters).toHaveLength(2)
    expect(result.data!.sourceCoverage.find((item) => item.source === 'claude-code')?.status).toBe('reporting')
    expect(result.data!.sourceCoverage.find((item) => item.source === 'codex')?.status).toBe('reporting')
    expect(result.data!.sourceCoverage.find((item) => item.source === 'openclaw')?.status).toBe('alternate')
    expect(result.data!.sourceCoverage.find((item) => item.source === 'hermes')?.status).toBe('missing')
    expect(result.data!.insights.some((item) => item.title.includes('실패율'))).toBe(true)
    expect(result.data!.insights.some((item) => item.title.includes('claude-opus-5 처리 토큰'))).toBe(true)
  })

  it('12시간 넘은 reporter를 stale로 표시한다', async () => {
    queueRows([row({ collectedAt: new Date('2026-08-26T00:00:00Z') })])
    const result = await agentActivityPanel.load({ days: 7, isAdmin: true })
    expect(result.data!.reporters[0]).toMatchObject({ freshness: 'stale', freshnessHours: 24 })
    expect(result.data!.insights.some((item) => item.title === '수집 지연')).toBe(true)
  })

  it('Hermes batch를 reporter와 source coverage에 포함한다', async () => {
    queueRows([row({
      agentId: 'bbokeoter',
      thinkingTokensRelation: 'unknown',
      models: [{ model: 'hermes-3', turns: 4, usage: {
        ...usage(10, 20, 30, 40, 8), thinkingTokensRelation: 'unknown',
      } }],
      tools: [{ name: 'shell', calls: 3, failures: 1 }],
      skillLoads: [],
      collection: { source: 'hermes', recordsRead: 100, parseFailures: 0, unsupportedRecordsSkipped: 0, healthWarnings: [] },
    })])
    const result = await agentActivityPanel.load({ days: 7, isAdmin: false })
    expect(result.data!.reporters[0]).toMatchObject({ agentId: 'bbokeoter', source: 'hermes' })
    expect(result.data!.sourceCoverage.find((item) => item.source === 'hermes')).toMatchObject({
      status: 'reporting', capabilities: { usage: true, tools: true, skills: false },
    })
    expect(result.data!.totalProcessedTokens).toBe(100)
  })

  it('데이터가 없으면 not_configured, 조회 실패면 error다', async () => {
    queueRows([])
    expect((await agentActivityPanel.load({ days: 7, isAdmin: false })).status).toBe('not_configured')

    vi.mocked(db.select).mockReset()
    vi.mocked(db.select).mockImplementationOnce(() => { throw new Error('db down') })
    expect((await agentActivityPanel.load({ days: 7, isAdmin: false })).status).toBe('error')
  })
})
