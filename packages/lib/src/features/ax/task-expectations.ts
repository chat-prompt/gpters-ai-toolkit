/** Explicit work plans. Registration is neither execution nor independent verification. */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { MonitorObservation, MonitorReceiptExpectation } from './monitor-types'

const utc = z.string().datetime().refine(value => new Date(value).toISOString() === value)
const source = z.enum(['claude-code', 'codex', 'openclaw', 'hermes'])
const phase = z.enum(['execution', 'verification', 'delivery'])
const scope = { source, taskId: z.string().uuid(), attemptId: z.string().uuid(), phase }
export const expectationRegistrationSchema = z.object({ action: z.literal('register'), ...scope,
  scheduledFor: utc, deadlineAt: utc, evidence: z.enum(['process', 'api']),
}).strict().refine(value => value.phase !== 'delivery' || value.evidence === 'api')
export const expectationMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('cancel'), id: z.string().regex(/^expect_[a-f0-9]{64}$/), revision: z.number().int().positive(), operationId: z.string().uuid(), reason: z.enum(['no-longer-needed', 'replaced-by-new-attempt', 'operator-request']) }).strict(),
  z.object({ action: z.literal('defer'), id: z.string().regex(/^expect_[a-f0-9]{64}$/), revision: z.number().int().positive(), operationId: z.string().uuid(), deadlineAt: utc, reason: z.enum(['dependency-delay', 'rescheduled', 'operator-request']) }).strict(),
])
export const expectationCommandSchema = z.union([expectationRegistrationSchema, expectationMutationSchema])
export type ExpectationRegistration = z.infer<typeof expectationRegistrationSchema>
export type ExpectationMutation = z.infer<typeof expectationMutationSchema>
export type ExpectationPrincipal = { orgId: string; agentId: string }
export interface ExpectationReceipt { eventId: string; at: string; evidence: 'process' | 'api' }
export interface TaskExpectation extends Omit<ExpectationRegistration, 'action'>, ExpectationPrincipal {
  id: string; revision: number; state: 'active' | 'cancelled' | 'completed'; createdAt: string; updatedAt: string
  registrationDigest: string; originalDeadlineAt: string; overdueBeforeChange?: string; receipt?: ExpectationReceipt
  history: Array<{ operationId: string; digest: string; action: 'cancel' | 'defer'; at: string; reason: string; previousDeadlineAt: string }>
}
export class ExpectationConflict extends Error {}
export class ExpectationInputError extends Error {}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function expectationId(principal: ExpectationPrincipal, input: Pick<ExpectationRegistration, 'source' | 'taskId' | 'attemptId' | 'phase'>) {
  return `expect_${digest([principal.orgId, principal.agentId, input.source, input.taskId, input.attemptId, input.phase])}`
}
function futureDeadline(deadlineAt: string, now: string) {
  if (Date.parse(deadlineAt) <= Date.parse(now) || Date.parse(deadlineAt) > Date.parse(now) + 30 * 86400000) throw new ExpectationInputError('Deadline must be in the next 30 days')
}
export function createTaskExpectation(principal: ExpectationPrincipal, raw: ExpectationRegistration, now: string): TaskExpectation {
  const input = expectationRegistrationSchema.parse(raw)
  futureDeadline(input.deadlineAt, now)
  if (Date.parse(input.scheduledFor) < Date.parse(now) || Date.parse(input.scheduledFor) >= Date.parse(input.deadlineAt)) throw new ExpectationInputError('Register before the planned start and deadline')
  const { action: _action, ...fields } = input
  return { ...fields, ...principal, id: expectationId(principal, input), revision: 1, state: 'active', createdAt: now, updatedAt: now, originalDeadlineAt: input.deadlineAt, registrationDigest: digest(input), history: [] }
}
export function registrationMatches(current: TaskExpectation, input: ExpectationRegistration) { return current.registrationDigest === digest(expectationRegistrationSchema.parse(input)) }
export function changeTaskExpectation(current: TaskExpectation, raw: ExpectationMutation, now: string): { record: TaskExpectation; replayed: boolean } {
  const input = expectationMutationSchema.parse(raw), hash = digest(input)
  const previous = current.history.find(item => item.operationId === input.operationId)
  if (previous) {
    if (previous.digest !== hash) throw new ExpectationConflict('Operation ID already has different content')
    return { record: current, replayed: true }
  }
  if (input.id !== current.id || input.revision !== current.revision) throw new ExpectationConflict('Expectation changed; read its current revision')
  if (current.state !== 'active') throw new ExpectationConflict('Cancelled or completed expectations are immutable; use a new attempt')
  if (current.history.length >= 100) throw new ExpectationConflict('Expectation change limit reached')
  if (input.action === 'defer') {
    futureDeadline(input.deadlineAt, now)
    if (Date.parse(input.deadlineAt) <= Date.parse(current.deadlineAt)) throw new ExpectationInputError('A deferred deadline must move forward')
  }
  return { replayed: false, record: { ...current, revision: current.revision + 1, updatedAt: now,
    state: input.action === 'cancel' ? 'cancelled' : 'active', deadlineAt: input.action === 'defer' ? input.deadlineAt : current.deadlineAt,
    ...(Date.parse(now) > Date.parse(current.deadlineAt) ? { overdueBeforeChange: current.overdueBeforeChange ?? current.deadlineAt } : {}),
    history: [...current.history, { operationId: input.operationId, digest: hash, action: input.action, at: now, reason: input.reason, previousDeadlineAt: current.deadlineAt }],
  } }
}
/** A receipt from another attempt/phase/source or before registration cannot fulfill this plan. */
export function reconcileTaskExpectation(current: TaskExpectation, observations: MonitorObservation[], now: string): TaskExpectation {
  const matching = observations.filter(({ agentId, source, event }) => agentId === current.agentId && source === current.source && event.taskId === current.taskId && event.attemptId === current.attemptId && event.phase === current.phase && event.status === 'succeeded' && event.evidence === current.evidence && Date.parse(event.atUtc) >= Date.parse(current.createdAt) && Date.parse(event.atUtc) <= Date.parse(now))
    .map(({ event }) => ({ eventId: event.eventId, at: event.atUtc, evidence: current.evidence }))
  const receipt = [...(current.receipt ? [current.receipt] : []), ...matching].sort((a, b) => a.at.localeCompare(b.at) || a.eventId.localeCompare(b.eventId))[0]
  if (!receipt || (current.receipt && receipt.eventId === current.receipt.eventId)) return current
  // Cancellation remains terminal even if delayed telemetry corrects its past
  // timing. Store the receipt without changing the operator's cancelled state.
  return { ...current, receipt, state: current.state === 'cancelled' ? 'cancelled' : 'completed', revision: current.revision + 1, updatedAt: now }
}
export function projectTaskExpectation(record: TaskExpectation): MonitorReceiptExpectation {
  // A late change request is an audit fact, not proof execution was late. An
  // earlier on-time receipt can arrive after cancellation/defer and correct the
  // missed-deadline interpretation without deleting that change history.
  const changedAfterDeadline = record.overdueBeforeChange && (!record.receipt || record.receipt.at > record.overdueBeforeChange) ? record.overdueBeforeChange : undefined
  const missedDeadlineAt = changedAfterDeadline ?? (record.receipt && record.receipt.at > record.deadlineAt ? record.deadlineAt : undefined)
  return { id: record.id, agentId: record.agentId, source: record.source, taskId: record.taskId, attemptId: record.attemptId, phase: record.phase,
    deadlineAt: record.deadlineAt, requiredEvidence: 'reported', cancelled: record.state === 'cancelled',
    receipt: record.receipt ? { at: record.receipt.at, evidence: record.receipt.evidence, independentlyVerified: false } : null,
    registration: { id: record.id, revision: record.revision, scheduledFor: record.scheduledFor, state: record.state, originalDeadlineAt: record.originalDeadlineAt, missedDeadlineAt },
  }
}

/** Index events once; a large batch must not turn projection into plans × events work. */
export function reconcileTaskExpectations(records: TaskExpectation[], observations: MonitorObservation[], now: string) {
  const key = (agentId: string, source: string, taskId: string, attemptId: string, phase: string, evidence: string) => JSON.stringify([agentId,source,taskId,attemptId,phase,evidence])
  const byScope = new Map<string, MonitorObservation[]>()
  for (const observation of observations) {
    const event = observation.event
    if (event.status !== 'succeeded') continue
    const id = key(observation.agentId,observation.source,event.taskId,event.attemptId,event.phase,event.evidence)
    const items = byScope.get(id) ?? []; items.push(observation); byScope.set(id,items)
  }
  return records.map(record => reconcileTaskExpectation(record,byScope.get(key(record.agentId,record.source,record.taskId,record.attemptId,record.phase,record.evidence)) ?? [],now))
}
