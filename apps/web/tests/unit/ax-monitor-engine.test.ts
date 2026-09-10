import { describe, expect, it } from 'vitest'
import { emptyMonitorState, monitorCollectorStaleAfterMs, monitorHeartbeat, reduceMonitor } from '../../../../packages/lib/src/features/ax/monitor-engine'
import { runMonitorTransaction } from '../../../../packages/lib/src/features/ax/monitor-transaction'
import type { MonitorInput, MonitorObservation, MonitorReceiptExpectation, MonitorState } from '../../../../packages/lib/src/features/ax/monitor-types'

const at = '2026-01-03T00:00:00Z'
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
function observation(n = 1, overrides: Partial<MonitorObservation['event']> = {}): MonitorObservation {
  return { position: String(n), agentId: 'example-agent', source: 'codex', event: {
    taskId: uuid(1), eventId: uuid(n), attemptId: uuid(2), phase: 'execution', status: 'failed',
    evidence: 'process', atUtc: '2026-01-01T01:00:00Z', ...overrides,
  } }
}
function input(overrides: Partial<MonitorInput> = {}): MonitorInput {
  return { state: emptyMonitorState(), observations: [], collectors: [], receiptExpectations: [],
    now: at, policy: { enabled: true, humanRecipientId: 'example-human' }, caughtUp: true, ...overrides }
}
function receipt(overrides: Partial<MonitorReceiptExpectation> = {}): MonitorReceiptExpectation {
  return { id: 'expectation-a', agentId: 'example-agent', source: 'codex', taskId: uuid(1), attemptId: uuid(2),
    phase: 'delivery', deadlineAt: '2026-01-02T00:00:00Z', requiredEvidence: 'independent', receipt: null, ...overrides }
}

describe('central monitor projection', () => {
  it('processes more than 100 tasks and late event times with a server ingest cursor', () => {
    const first = reduceMonitor(input({ observations: Array.from({ length: 250 }, (_, i) => observation(i + 1, { taskId: uuid(1000 + i) })) }))
    expect(Object.keys(first.state.candidates)).toHaveLength(250)
    expect(first.state.cursor).toBe('250')
    const late = reduceMonitor(input({ state: first.state, observations: [observation(251, { atUtc: '2025-12-01T00:00:00Z', taskId: uuid(9000) })] }))
    expect(late.state.cursor).toBe('251')
    expect(Object.keys(late.state.candidates)).toHaveLength(251)
    expect(late.outbox).toHaveLength(1)
  })

  it('deduplicates replayed event IDs across batches and sorts input by ingest position', () => {
    const result = reduceMonitor(input({ observations: [observation(2, { eventId: uuid(1) }), observation(1)] }))
    expect(result.state.cursor).toBe('2')
    expect(Object.values(result.state.candidates)[0].eventCount).toBe(1)
    expect(result.outbox.map(item => item.kind)).toEqual(['first'])
    expect(reduceMonitor(input({ state: result.state, observations: [observation(1)] })).outbox).toEqual([])
  })

  it('rejects gaps, conflicting duplicates and invalid events without mutating input state', () => {
    const original = input({ observations: [observation(2)] })
    expect(() => reduceMonitor(original)).toThrow('gap')
    expect(original.state).toEqual(emptyMonitorState())
    expect(() => reduceMonitor(input({ observations: [observation(1), observation(1)] }))).toThrow('Duplicate')
    expect(() => reduceMonitor(input({ observations: [observation(1), observation(2, { eventId: uuid(1), status: 'succeeded' })] }))).toThrow('Conflicting')
    expect(() => reduceMonitor(input({ observations: [observation(1, { eventId: 'invalid' })] }))).toThrow()
  })

  it('keeps API, process and self-reported failure evidence separate and does not infer failures from absence', () => {
    const result = reduceMonitor(input({ observations: [observation(1), observation(2, { evidence: 'api' }), observation(3, { evidence: 'self-reported' }), observation(4, { status: 'started', phase: 'task' })] }))
    expect(Object.values(result.state.candidates).map(item => item.evidence).sort()).toEqual(['api', 'process', 'self-reported'])
    expect(Object.values(result.state.candidates).every(item => item.state === 'candidate')).toBe(true)
    expect(reduceMonitor(input()).state.candidates).toEqual({})
  })

  it('queues one first alert, 24 hour reminders and one recovery per episode', () => {
    const collectors = [{ collectorId: 'collector-a', agentId: 'example-agent', source: 'codex' as const, registeredAt: '2026-01-01T00:00:00Z', lastSuccessAt: '2026-01-01T01:00:00Z', intervalSeconds: 3600, enabled: true }]
    const first = reduceMonitor(input({ collectors }))
    expect(first.outbox.map(item => item.kind)).toEqual(['first'])
    const early = reduceMonitor(input({ collectors, state: first.state, now: '2026-01-03T23:59:59Z' }))
    expect(early.outbox).toEqual([])
    const reminder = reduceMonitor(input({ collectors, state: early.state, now: '2026-01-04T00:00:00Z' }))
    expect(reminder.outbox.map(item => item.kind)).toEqual(['reminder'])
    const recoveredCollectors = [{ ...collectors[0], lastSuccessAt: '2026-01-04T00:00:00Z' }]
    const recovery = reduceMonitor(input({ collectors: recoveredCollectors, state: reminder.state, now: '2026-01-04T00:01:00Z' }))
    expect(recovery.outbox.map(item => item.kind)).toEqual(['recovery'])
    const repeated = reduceMonitor(input({ collectors: recoveredCollectors, state: recovery.state, now: '2026-01-04T00:02:00Z' }))
    expect(repeated.outbox).toEqual([])
    const again = reduceMonitor(input({ collectors: recoveredCollectors, state: repeated.state, now: '2026-01-05T00:00:00Z' }))
    expect(again.outbox[0].episode).toBe(2)
    expect(new Set([...first.outbox, ...reminder.outbox, ...recovery.outbox, ...again.outbox].map(item => item.id)).size).toBe(4)
    expect(Object.values(recovery.state.candidates)[0].state).toBe('candidate')
  })

  it('uses exact collector grace boundaries, including newly registered waiting collectors', () => {
    expect(monitorCollectorStaleAfterMs(60)).toBe(300000)
    expect(monitorCollectorStaleAfterMs(3600)).toBe(7200000)
    expect(monitorCollectorStaleAfterMs(null)).toBe(43200000)
    const collector = { collectorId: 'new', agentId: 'example-agent', source: 'codex' as const, registeredAt: at, lastSuccessAt: null, intervalSeconds: 60, enabled: true }
    expect(reduceMonitor(input({ collectors: [collector], now: '2026-01-03T00:05:00Z' })).outbox).toEqual([])
    expect(reduceMonitor(input({ collectors: [collector], now: '2026-01-03T00:05:00.001Z' })).outbox).toHaveLength(1)
  })

  it('requires an explicit deadline and matching receipt provenance, postponing absence while catching up', () => {
    expect(reduceMonitor(input({ receiptExpectations: [receipt()], caughtUp: false })).state.candidates).toEqual({})
    expect(reduceMonitor(input({ receiptExpectations: [receipt({ deadlineAt: at })] })).outbox).toEqual([])
    const missing = reduceMonitor(input({ receiptExpectations: [receipt()] }))
    expect(missing.outbox[0].payload.kind).toBe('missing-receipt')
    const self = receipt({ receipt: { at: '2026-01-02T01:00:00Z', evidence: 'self-reported', independentlyVerified: true } })
    const insufficient = reduceMonitor(input({ state: missing.state, receiptExpectations: [self] }))
    expect(Object.values(insufficient.state.conditions)[0].active).toBe(true)
    const actual = receipt({ receipt: { at: '2026-01-02T01:00:00Z', evidence: 'api', independentlyVerified: true } })
    const recovery = reduceMonitor(input({ state: insufficient.state, receiptExpectations: [actual] }))
    expect(recovery.outbox.map(item => item.kind)).toEqual(['recovery'])
    expect(Object.values(recovery.state.candidates)[0].state).toBe('candidate')
  })

  it('does not treat omitted collectors or expectations as evidence of recovery', () => {
    const first = reduceMonitor(input({ receiptExpectations: [receipt()] }))
    const missingPage = reduceMonitor(input({ state: first.state, caughtUp: false }))
    expect(Object.values(missingPage.state.conditions)[0].active).toBe(true)
    expect(missingPage.outbox).toEqual([])
  })

  it('preserves human decisions and flags only genuinely newer evidence for further review', () => {
    const first = reduceMonitor(input({ observations: [observation(1)] }))
    const candidate = Object.values(first.state.candidates)[0]
    candidate.state = 'verified'
    candidate.lastReviewedAt = '2026-01-02T00:00:00Z'
    const late = reduceMonitor(input({ state: first.state, observations: [observation(2)] }))
    expect(late.state.candidates[candidate.id].state).toBe('verified')
    expect(late.state.candidates[candidate.id].needsReview).toBe(false)
    const fresh = reduceMonitor(input({ state: late.state, observations: [observation(3, { atUtc: '2026-01-02T01:00:00Z' })] }))
    expect(fresh.state.candidates[candidate.id].state).toBe('verified')
    expect(fresh.state.candidates[candidate.id].needsReview).toBe(true)
    expect(fresh.outbox[0].kind).toBe('first')
  })

  it('does not send or consume first notification when human recipient policy is absent', () => {
    const first = reduceMonitor(input({ observations: [observation(1)], policy: { enabled: true } }))
    expect(first.outbox).toEqual([])
    expect(Object.values(first.state.conditions)[0].openingQueued).toBe(false)
    const enabled = reduceMonitor(input({ state: first.state }))
    expect(enabled.outbox[0].recipient).toEqual({ kind: 'human-dm', id: 'example-human' })
  })

  it('exposes heartbeat waiting, stale after 15 minutes and future clock skew', () => {
    expect(monitorHeartbeat(null, at)).toBe('waiting')
    expect(monitorHeartbeat(at, '2026-01-03T00:15:00Z')).toBe('healthy')
    expect(monitorHeartbeat(at, '2026-01-03T00:15:00.001Z')).toBe('stale')
    expect(monitorHeartbeat(at, '2026-01-02T00:00:00Z')).toBe('clock-skew')
  })
})

describe('monitor persistence contract', () => {
  it('concurrent workers atomically claim a page once and retry against current state', async () => {
    let revision = 0
    let state: MonitorState = emptyMonitorState()
    let processed = false
    const outbox = new Map()
    const persistence = {
      async load() {
        return { revision: String(revision), input: input({ state: structuredClone(state), observations: processed ? [] : [observation(1)] }), claim: ['batch-a'] }
      },
      async commit(snapshot: { revision: string }, result: ReturnType<typeof reduceMonitor>) {
        if (snapshot.revision !== String(revision)) return false
        revision++
        state = result.state
        processed = true
        result.outbox.forEach(item => outbox.set(item.id, item))
        return true
      },
    }
    await Promise.all([runMonitorTransaction(persistence, { now: at, policy: input().policy }), runMonitorTransaction(persistence, { now: at, policy: input().policy })])
    expect(state.cursor).toBe('1')
    expect(Object.values(state.candidates)[0].eventCount).toBe(1)
    expect(outbox.size).toBe(1)
    expect(revision).toBe(2)
  })

  it('does not claim data or advance heartbeat after an invalid page or failed CAS', async () => {
    let commits = 0
    const persistence = { async load() { return { revision: '1', input: input({ observations: [observation(2)] }), claim: [] } }, async commit() { commits++; return false } }
    await expect(runMonitorTransaction(persistence, { now: at, policy: input().policy })).rejects.toThrow('gap')
    expect(commits).toBe(0)
    persistence.load = async () => ({ revision: '1', input: input(), claim: [] })
    await expect(runMonitorTransaction(persistence, { now: at, policy: input().policy, maxAttempts: 2 })).rejects.toThrow('contention')
    expect(commits).toBe(2)
  })
})
