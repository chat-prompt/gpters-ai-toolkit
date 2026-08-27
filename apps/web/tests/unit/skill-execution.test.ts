import { beforeEach, describe, expect, it, vi } from 'vitest'

let insertCount = 0
let eventInserted = true

function insertBuilder() {
  const isEventInsert = insertCount++ % 2 === 1
  const chain: Record<string, unknown> = {}
  chain.values = vi.fn(() => chain)
  chain.onConflictDoNothing = vi.fn(() => chain)
  chain.returning = vi.fn(() => Promise.resolve(
    isEventInsert && eventInserted ? [{ eventId: 'event-id' }] : []
  ))
  chain.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
    Promise.resolve([]).then(resolve, reject)
  return chain
}

function updateBuilder() {
  const chain: Record<string, unknown> = {}
  chain.set = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.returning = vi.fn(() => Promise.resolve([{ attemptId: 'attempt-id' }]))
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
    vi.clearAllMocks()
  })

  it('새 완료 이벤트일 때만 true를 반환한다', async () => {
    expect(await recordSkillExecutionAttempt({ sessionId: 'session', report })).toBe(true)
  })

  it('같은 eventId 재전송이면 false를 반환해 파생 지표 중복을 막는다', async () => {
    eventInserted = false
    expect(await recordSkillExecutionAttempt({ sessionId: 'session', report })).toBe(false)
  })
})
