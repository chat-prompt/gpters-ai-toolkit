import { describe, expect, it } from 'vitest'
import { applyIncidentAction, incidentKey, incidentStats, projectIncidentCases } from '../../../../packages/lib/src/features/ax/incident-review'
import type { IncidentInput, IncidentCase, IncidentAction } from '../../../../packages/lib/src/features/ax/incident-review'
import type { AxAgentTaskEvent } from '../../../../packages/lib/src/features/ax/agent-task-events'

const start = '2026-01-01T00:00:00.000Z', failedAt = '2026-01-02T00:00:00.000Z', appliedAt = '2026-01-03T00:00:00.000Z', end = '2026-01-05T00:00:00.000Z'
function input(events: Array<Partial<AxAgentTaskEvent>> = [{}]): IncidentInput {
  return { start, end, coverage: { limitPerStream: 100, truncatedStreams: [] }, traces: [{ agentId: 'example', source: 'codex', versions: [], taskId: 'task', tokens: null, startedAt: failedAt, updatedAt: failedAt,
    events: events.map((e,i) => ({ taskId: 'task', attemptId: `attempt-${i}`, eventId: `event-${i}`, phase: 'execution', evidence: 'process', status: 'failed', atUtc: failedAt, ...e })) }] }
}
function action(c: IncidentCase, kind: IncidentAction['action'], extra: Partial<IncidentAction> = {}): IncidentAction {
  return { id: c.id, revision: c.revision, days: 7, action: kind, reason: 'Reviewed receipt', evidenceRef: 'private:test', ...extra }
}
function fixed() {
  const data = input()
  let c = projectIncidentCases(data, [])[0]
  c = applyIncidentAction(c, data, action(c,'confirmed'), 'user-1')
  return applyIncidentAction(c, data, action(c,'fixed',{ appliedAt, changeRef:'commit:example',rollbackRef:'private:rollback' }), 'user-1')
}
describe('incident review lifecycle', () => {
  it('deduplicates replay and separates sources, phases and evidence', () => {
    const data = input([{}, {eventId:'event-0'}, {evidence:'api'}, {phase:'delivery'}])
    const cases = projectIncidentCases(data, [])
    expect(cases).toHaveLength(3)
    expect(cases.find(c => c.phase === 'execution' && c.evidence === 'process')?.failureCount).toBe(1)
    expect(new Set(cases.map(incidentKey)).size).toBe(3)
  })
  it('requires a confirmed failure and actual change references', () => {
    const data = input(), c = projectIncidentCases(data, [])[0]
    expect(() => applyIncidentAction(c,data,action(c,'fixed'), 'operator')).toThrow('확정')
    expect(() => applyIncidentAction(c,data,{...action(c,'confirmed'),revision:10}, 'operator')).toThrow('다른 검토자')
    expect(() => applyIncidentAction(c,data,action(c,'confirmed'), '')).toThrow('인증')
  })
  it('records change, then requires a human to accept the observed retest window', () => {
    const c = fixed(), after = input([{status:'succeeded',atUtc:'2026-01-04T00:00:00.000Z'}])
    expect(c.change?.baseline.failed).toBe(1)
    expect(() => applyIncidentAction(c,after,action(c,'verified'), 'reviewer')).toThrow('근거가 부족')
    const verified = applyIncidentAction(c,after,action(c,'verified',{minimumSamples:1}), 'reviewer')
    expect(verified.state).toBe('verified'); expect(verified.history).toHaveLength(3)
    expect(verified.verification?.stats.terminal).toBe(1)
  })
  it.each(['missing','truncated','empty','unresolved','failure','window'] as const)('blocks verification with %s evidence', reason => {
    const c = fixed(), after = input([{status:'succeeded',atUtc:'2026-01-04T00:00:00.000Z'}])
    if (reason === 'missing') after.coverage = undefined
    if (reason === 'truncated') after.coverage!.truncatedStreams = [{agentId:'example',source:'codex',total:101,returned:100}]
    if (reason === 'empty') after.traces = []
    if (reason === 'unresolved') after.traces[0].events[0].status = 'started'
    if (reason === 'failure') after.traces[0].events[0].status = 'failed'
    if (reason === 'window') after.start = '2026-01-04T00:00:00.000Z'
    expect(() => applyIncidentAction(c,after,action(c,'verified',{minimumSamples:1}), 'reviewer')).toThrow('근거가 부족')
  })
  it('deduplicates attempts and never treats a retry success as removal of the failure', () => {
    const data = input([{}, {attemptId:'attempt-0',status:'succeeded'}]), c = projectIncidentCases(data,[])[0]
    expect(incidentStats(c,data)).toMatchObject({failed:1,terminal:1})
  })
  it('reopens new post-change failures without mutating the stored decision on read', () => {
    const saved = fixed()
    const [projected] = projectIncidentCases(input([{atUtc:'2026-01-04T00:00:00.000Z'}]), [saved])
    expect(projected.state).toBe('reviewing'); expect(projected.recurrence).toBe(true)
    expect(saved.state).toBe('fixed')
    expect(projectIncidentCases(input(),[saved])[0].state).toBe('fixed')
    expect(projectIncidentCases({...input(),traces:[]},[saved])[0].change).toEqual(saved.change)
  })
  it('reopens false positives for a new identity at the same timestamp, not replay', () => {
    const data = input(), c = projectIncidentCases(data,[])[0]
    const saved = applyIncidentAction(c,data,action(c,'false-positive'),'reviewer')
    expect(projectIncidentCases(data,[saved])[0].state).toBe('false-positive')
    expect(projectIncidentCases(input([{eventId:'new'}]),[saved])[0].state).toBe('reviewing')
  })
  it('keeps window boundaries half-open and excludes unrelated streams from retest', () => {
    expect(projectIncidentCases(input([{atUtc:end}]),[])).toEqual([])
    const c = fixed(), after = input([{status:'succeeded',atUtc:appliedAt,evidence:'api'}])
    expect(incidentStats(c,after,appliedAt).terminal).toBe(0)
  })
})
