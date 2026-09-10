/** Review observed failure symptoms; never infer an independently verified incident. */
import { z } from 'zod'
import type { AxAgentTaskEvent, AxAgentTaskTrace } from './agent-task-events'
import type { AxAgentActivityData } from './types'

export type IncidentState = 'candidate' | 'reviewing' | 'confirmed' | 'false-positive' | 'fixed' | 'verified'
export interface IncidentScope { agentId: string; source: string; phase: AxAgentTaskEvent['phase']; evidence: AxAgentTaskEvent['evidence'] }
export interface IncidentStats {
  start: string; end: string; failed: number; terminal: number; unresolved: number; complete: boolean
}
export interface IncidentCase extends IncidentScope {
  id: string; revision: number; state: IncidentState; createdAt: string; updatedAt: string
  lastFailureAt: string; lastFailureIds: string[]; failureCount: number
  examples: Array<{ taskId: string; eventId: string; atUtc: string }>
  history: Array<{ at: string; actor: string; action: string; reason: string; evidenceRef: string }>
  change?: { appliedAt: string; reference: string; rollbackRef: string; baseline: IncidentStats }
  verification?: { stats: IncidentStats; minimumSamples: number }
  recurrence?: boolean
}
export interface IncidentInput {
  traces: AxAgentTaskTrace[]; coverage: AxAgentActivityData['taskTraceCoverage']; start: string; end: string
}
export interface IncidentReviewData {
  cases: IncidentCase[]; start: string; end: string; sourceAvailable: boolean; truncated: boolean
  evaluations: Record<string, IncidentStats>; storageReady: boolean
}
const note = z.string().trim().min(1).max(2000)
export const incidentActionSchema = z.object({
  id: z.string().min(1).max(1000), revision: z.number().int().nonnegative(),
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  action: z.enum(['reviewing', 'confirmed', 'false-positive', 'fixed', 'verified']),
  reason: note, evidenceRef: note,
  appliedAt: z.string().datetime().optional(), changeRef: note.optional(), rollbackRef: note.optional(),
  minimumSamples: z.number().int().min(1).max(10000).optional(),
}).strict()
export type IncidentAction = z.infer<typeof incidentActionSchema>

export function incidentKey(scope: IncidentScope): string {
  return JSON.stringify([scope.agentId, scope.source, scope.phase, scope.evidence])
}
function eventsFor(scope: IncidentScope, input: IncidentInput) {
  const seen = new Set<string>()
  return input.traces.filter(t => t.agentId === scope.agentId && t.source === scope.source)
    .flatMap(t => t.events).filter(e => {
      const at = Date.parse(e.atUtc)
      if (e.phase !== scope.phase || e.evidence !== scope.evidence || at < Date.parse(input.start) || at >= Date.parse(input.end) || seen.has(e.eventId)) return false
      seen.add(e.eventId)
      return true
    })
}
export function incidentStats(scope: IncidentScope, input: IncidentInput, start = input.start, end = input.end): IncidentStats {
  const attempts = new Map<string, Set<string>>()
  for (const e of eventsFor(scope, input)) {
    if (Date.parse(e.atUtc) < Date.parse(start) || Date.parse(e.atUtc) >= Date.parse(end)) continue
    const key = `${e.taskId}:${e.attemptId}`
    const states = attempts.get(key) ?? new Set<string>()
    states.add(e.status); attempts.set(key, states)
  }
  const statuses = [...attempts.values()]
  const failed = statuses.filter(s => s.has('failed')).length
  const terminal = statuses.filter(s => s.has('failed') || s.has('succeeded')).length
  const unresolved = statuses.filter(s => !s.has('failed') && !s.has('succeeded') && !s.has('skipped')).length
  const complete = !!input.coverage && !input.coverage.truncatedStreams.some(s => s.agentId === scope.agentId && s.source === scope.source)
    && Date.parse(start) >= Date.parse(input.start) && Date.parse(end) <= Date.parse(input.end) && Date.parse(start) < Date.parse(end)
  return { start, end, failed, terminal, unresolved, complete }
}

/** Pure projection. Reading a dashboard never changes the durable ledger. */
export function projectIncidentCases(input: IncidentInput, saved: IncidentCase[]): IncidentCase[] {
  const result = new Map(saved.map(c => [c.id, structuredClone(c)]))
  const scopes = new Map<string, IncidentScope>()
  for (const trace of input.traces) for (const event of trace.events) {
    if (event.status !== 'failed') continue
    const scope = { agentId: trace.agentId, source: trace.source, phase: event.phase, evidence: event.evidence }
    scopes.set(incidentKey(scope), scope)
  }
  for (const [id, scope] of scopes) {
    const failures = eventsFor(scope, input).filter(e => e.status === 'failed').sort((a, b) => Date.parse(b.atUtc) - Date.parse(a.atUtc) || a.eventId.localeCompare(b.eventId))
    if (!failures.length) continue
    const latest = failures[0].atUtc
    const latestIds = failures.filter(e => Date.parse(e.atUtc) === Date.parse(latest)).map(e => e.eventId)
    const previous = result.get(id)
    const newFailure = previous && (Date.parse(latest) > Date.parse(previous.lastFailureAt) ||
      (Date.parse(latest) === Date.parse(previous.lastFailureAt) && latestIds.some(id => !previous.lastFailureIds.includes(id))))
    const recurrence = !!(previous && newFailure && ['fixed', 'verified', 'false-positive'].includes(previous.state) &&
      (!previous.change || Date.parse(latest) >= Date.parse(previous.change.appliedAt)))
    result.set(id, {
      ...scope, id, revision: 0, state: 'candidate', createdAt: input.end, updatedAt: input.end, history: [],
      ...previous,
      // Stored evidence stays available when old events fall outside the rolling query.
      lastFailureAt: previous && Date.parse(previous.lastFailureAt) > Date.parse(latest) ? previous.lastFailureAt : latest,
      lastFailureIds: previous && Date.parse(previous.lastFailureAt) > Date.parse(latest) ? previous.lastFailureIds
        : previous && Date.parse(previous.lastFailureAt) === Date.parse(latest) ? [...new Set([...previous.lastFailureIds, ...latestIds])] : latestIds,
      failureCount: failures.length,
      examples: failures.slice(0, 5).map(({ taskId, eventId, atUtc }) => ({ taskId, eventId, atUtc })),
      ...(recurrence ? { state: 'reviewing' as const, recurrence: true } : {}),
    })
  }
  const priority: Record<IncidentState, number> = { candidate: 0, reviewing: 1, confirmed: 2, fixed: 3, verified: 4, 'false-positive': 5 }
  return [...result.values()].sort((a,b) => priority[a.state] - priority[b.state] || Date.parse(b.lastFailureAt) - Date.parse(a.lastFailureAt) || a.id.localeCompare(b.id))
}

/** A human decision is required even when an observed retest contains no failures. */
export function applyIncidentAction(current: IncidentCase, input: IncidentInput, action: IncidentAction, actor: string): IncidentCase {
  if (current.id !== action.id || current.revision !== action.revision) throw new Error('다른 검토자가 변경했습니다. 새로고침 후 다시 확인하세요')
  if (!actor.trim()) throw new Error('검토자 인증이 필요합니다')
  const next = structuredClone(current)
  if (['reviewing', 'confirmed', 'false-positive'].includes(action.action)) {
    if (!['candidate', 'reviewing', 'confirmed'].includes(current.state)) throw new Error('열린 후보만 판정할 수 있습니다')
  } else if (action.action === 'fixed') {
    if (current.state !== 'confirmed' || !action.appliedAt || !action.changeRef || !action.rollbackRef) throw new Error('확정된 사고에 수정 시각·변경·롤백 근거를 입력하세요')
    const applied = Date.parse(action.appliedAt)
    if (applied > Date.parse(input.end) || applied <= Date.parse(current.lastFailureAt) || applied <= Date.parse(input.start)) throw new Error('수정 시각은 마지막 실패 이후이며 조회 범위 안이어야 합니다')
    const baseline = incidentStats(current, input, input.start, action.appliedAt)
    if (!baseline.failed) throw new Error('수정 전 실패 근거가 있는 조회 기간을 선택하세요')
    next.change = { appliedAt: action.appliedAt, reference: action.changeRef, rollbackRef: action.rollbackRef, baseline }
    delete next.verification
  } else {
    if (current.state !== 'fixed' || !current.change || current.recurrence) throw new Error('수정된 사고만 재검증할 수 있습니다')
    const stats = incidentStats(current, input, current.change.appliedAt)
    const minimumSamples = action.minimumSamples ?? 10
    if (!stats.complete || stats.failed || stats.unresolved || stats.terminal < minimumSamples) throw new Error('재검증 근거가 부족합니다. 조회 누락·실패·미종료 작업과 표본 수를 확인하세요')
    next.verification = { stats, minimumSamples }
  }
  if (next.recurrence) next.history.push({ at: input.end, actor: 'observation', action: 'possible-recurrence', reason: '새 실패가 관측되어 재검토가 필요합니다', evidenceRef: 'task-events' })
  next.history.push({ at: input.end, actor, action: action.action, reason: action.reason, evidenceRef: action.evidenceRef })
  next.revision++; next.state = action.action; next.updatedAt = input.end; delete next.recurrence
  return next
}
