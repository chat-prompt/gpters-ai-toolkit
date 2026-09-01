import { beforeEach, describe, expect, it, vi } from 'vitest'

let insertCount = 0
let eventInserted = true
let attemptInserted = true
let attemptInsertValues: Record<string, unknown> | undefined
let updateResults: Array<Array<Record<string, string>>> = []

function insertBuilder() {
  const isEventInsert = insertCount++ % 2 === 1
  const chain: Record<string, unknown> = {}
  chain.values = vi.fn((values: Record<string, unknown>) => {
    if (!isEventInsert) attemptInsertValues = values
    return chain
  })
  chain.onConflictDoNothing = vi.fn(() => chain)
  chain.returning = vi.fn(() => Promise.resolve(isEventInsert
    ? eventInserted ? [{ eventId: 'event-id' }] : []
    : attemptInserted ? [{ attemptId: 'attempt-id' }] : []
  ))
  chain.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
    Promise.resolve([]).then(resolve, reject)
  return chain
}

function updateBuilder() {
  const chain: Record<string, unknown> = {}
  chain.set = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.returning = vi.fn(() => Promise.resolve(updateResults.shift() ?? [{ attemptId: 'attempt-id' }]))
  return chain
}

vi.mock('@gpters/db', () => ({
  db: {
    insert: vi.fn(() => insertBuilder()),
    update: vi.fn(() => updateBuilder()),
  },
  axSkillExecutionAttempts: {
    attemptId: 'attempt_id',
    source: 'source',
    skillId: 'skill_id',
    agent: 'agent',
    agentId: 'agent_id',
    completedAt: 'completed_at',
  },
  axSkillExecutionEvents: { eventId: 'event_id' },
}))

vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

const { recordSkillExecutionAttempt } = await import(
  '../../../../packages/lib/src/analytics/skill-execution'
)

const report = {
  eventId: '22222222-2222-4222-8222-222222222222',
  attemptId: '11111111-1111-4111-8111-111111111111',
  journeyId: null,
  source: 'aitk' as const,
  skillId: 'review-helper',
  skillVersion: '1.0.0',
  agent: 'codex' as const,
  agentId: 'codex',
  status: 'success' as const,
  failureStage: null,
  errorCode: null,
  validation: { method: 'test' as const, passed: true, summary: '단위 테스트 통과' },
  userAccepted: null,
  occurredAt: '2026-08-27T00:00:00.000Z',
}

describe('recordSkillExecutionAttempt', () => {
  beforeEach(() => {
    insertCount = 0
    eventInserted = true
    attemptInserted = true
    attemptInsertValues = undefined
    updateResults = []
    vi.clearAllMocks()
  })

  it('새 attempt의 최초 완료일 때 true를 반환한다', async () => {
    expect(await recordSkillExecutionAttempt({ sessionId: 'session', report })).toBe(true)
  })

  it('같은 eventId 재전송이면 false를 반환해 파생 지표 중복을 막는다', async () => {
    eventInserted = false
    expect(await recordSkillExecutionAttempt({ sessionId: 'session', report })).toBe(false)
  })

  it('시작된 attempt의 최초 완료를 원자적으로 선점하면 true를 반환한다', async () => {
    attemptInserted = false
    updateResults = [[{ attemptId: 'attempt-id' }], [{ attemptId: 'attempt-id' }]]
    expect(await recordSkillExecutionAttempt({ sessionId: 'session', report })).toBe(true)
  })

  it('완료된 attempt를 새 eventId로 보완해도 파생 apply를 다시 만들지 않는다', async () => {
    attemptInserted = false
    updateResults = [[], [{ attemptId: 'attempt-id' }]]
    expect(await recordSkillExecutionAttempt({ sessionId: 'session', report })).toBe(false)
  })

  it('transport session 없이도 journey가 있는 실행 시도를 저장한다', async () => {
    const journeyId = '44444444-4444-4444-8444-444444444444'
    expect(await recordSkillExecutionAttempt({
      sessionId: null,
      report: { ...report, journeyId },
    })).toBe(true)
    expect(attemptInsertValues).toEqual(expect.objectContaining({ sessionId: null, journeyId }))
  })
})
