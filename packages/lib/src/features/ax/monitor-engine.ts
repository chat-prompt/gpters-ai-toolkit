import { createHash } from 'node:crypto'
import { agentTaskEventSchema } from './agent-task-events'
import type { MonitorCandidate, MonitorCondition, MonitorInput, MonitorOutboxItem, MonitorResult, MonitorState } from './monitor-types'
export { monitorHeartbeat } from './monitor-health'

const REMINDER_MS = 24 * 60 * 60 * 1000
const CLOSED_STATES = new Set(['false-positive', 'fixed', 'verified'])

function key(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}
export function monitorEventIdentity(agentId: string, source: string, event: MonitorInput['observations'][number]['event']) {
  return { key: key([agentId, source, event.eventId]), digest: key([agentTaskEventSchema.parse(event)]) }
}
function time(value: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error('Invalid monitor timestamp')
  return parsed
}
function position(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error('Invalid monitor position')
  return BigInt(value)
}
export function emptyMonitorState(): MonitorState {
  return { schemaVersion: 1, cursor: '0', seenEvents: {}, candidates: {}, conditions: {}, lastSuccessAt: null }
}
/** Keep exactly the registered-collector contract used by the AX activity panel. */
export function monitorCollectorStaleAfterMs(intervalSeconds?: number | null): number {
  return intervalSeconds && Number.isFinite(intervalSeconds) && intervalSeconds > 0
    ? Math.max(5 * 60 * 1000, intervalSeconds * 2 * 1000) : 12 * 60 * 60 * 1000
}

/**
 * Pure projection. Commit state, all processed batch receipts and the outbox in
 * one CAS transaction. Input must contain every event from each claimed batch.
 * Never paginate through the dashboard's latest-100 task view.
 *
 * v1 retains all event identities and cases: pages bound work per invocation,
 * not history. Partition/archive only with a durable event uniqueness ledger.
 */
export function reduceMonitor(input: MonitorInput): MonitorResult {
  if (input.state.schemaVersion !== 1) throw new Error('Unsupported monitor schema')
  const now = time(input.now)
  const state = structuredClone(input.state)
  const outbox: MonitorOutboxItem[] = []
  let previous = position(state.cursor)
  const seenPositions = new Set<string>()

  const ensureCandidate = (id: string, base: Pick<MonitorCandidate, 'kind' | 'agentId' | 'source'> & Partial<MonitorCandidate>): MonitorCandidate => {
    return state.candidates[id] ??= { id, state: 'candidate', firstObservedAt: input.now,
      lastObservedAt: input.now, lastEventAt: null, eventCount: 0, observationActive: true,
      needsReview: false, ...base }
  }
  const updateCondition = (candidate: MonitorCandidate, active: boolean) => {
    const old = state.conditions[candidate.id]
    candidate.observationActive = active
    if (active) {
      if (!old || !old.active) {
        state.conditions[candidate.id] = { active: true, episode: (old?.episode ?? 0) + 1,
          openedAt: input.now, lastNotificationAt: null, reminder: 0, openingQueued: false }
      }
    } else if (old?.active) {
      old.active = false
    }
  }

  // Sorting by ingest position handles out-of-order input without relying on
  // user clocks, UUID ordering or a timestamp cursor that loses late arrivals.
  const ordered = [...input.observations].sort((a, b) => position(a.position) < position(b.position) ? -1 : position(a.position) > position(b.position) ? 1 : 0)
  for (const observation of ordered) {
    const atPosition = position(observation.position)
    if (atPosition <= position(input.state.cursor)) continue
    if (seenPositions.has(atPosition.toString())) throw new Error('Duplicate monitor position')
    seenPositions.add(atPosition.toString())
    // Positions are assigned contiguously by the transactional batch reader.
    if (atPosition !== previous + BigInt(1)) throw new Error('Monitor position gap')
    previous = atPosition
    const event = agentTaskEventSchema.parse(observation.event)
    const { key: eventKey, digest: eventDigest } = monitorEventIdentity(observation.agentId, observation.source, event)
    if (state.seenEvents[eventKey]) {
      if (state.seenEvents[eventKey] !== eventDigest) throw new Error('Conflicting monitor event identity')
      continue
    }
    state.seenEvents[eventKey] = eventDigest
    if (event.status !== 'failed') continue
    const id = key(['task-failure', observation.agentId, observation.source, event.taskId, event.attemptId, event.phase, event.evidence])
    const candidate = ensureCandidate(id, { kind: 'task-failure', agentId: observation.agentId,
      source: observation.source, taskId: event.taskId, attemptId: event.attemptId,
      phase: event.phase, evidence: event.evidence })
    candidate.eventCount++
    candidate.lastObservedAt = input.now
    if (!candidate.lastEventAt || time(event.atUtc) >= time(candidate.lastEventAt)) {
      candidate.lastEventAt = event.atUtc
      candidate.eventId = event.eventId
    }
    // Never overwrite a person's closed decision. New post-review evidence is
    // separately flagged for review; delayed pre-review history is not recurrence.
    if (CLOSED_STATES.has(candidate.state) && candidate.lastReviewedAt && time(event.atUtc) > time(candidate.lastReviewedAt)) {
      candidate.needsReview = true
    }
    updateCondition(candidate, !CLOSED_STATES.has(candidate.state) || candidate.needsReview)
  }
  state.cursor = previous.toString()

  for (const collector of input.collectors) {
    const id = key(['collector-stale', collector.agentId, collector.source, collector.collectorId])
    const last = collector.lastSuccessAt ?? collector.registeredAt
    const isStale = collector.enabled && now - time(last) > monitorCollectorStaleAfterMs(collector.intervalSeconds)
    if (!isStale && !state.candidates[id]) continue
    const candidate = ensureCandidate(id, { kind: 'collector-stale', agentId: collector.agentId, source: collector.source })
    candidate.lastObservedAt = input.now
    candidate.lastEventAt = collector.lastSuccessAt
    // Collector list is an authoritative independent snapshot, not task absence.
    updateCondition(candidate, isStale)
  }

  for (const expectation of input.receiptExpectations) {
    const id = key(['missing-receipt', expectation.agentId, expectation.source, expectation.id])
    const received = expectation.receipt !== null && time(expectation.receipt.at) <= now &&
      (expectation.requiredEvidence === 'reported' || (expectation.receipt.independentlyVerified && expectation.receipt.evidence !== 'self-reported'))
    const overdue = !expectation.cancelled && now > time(expectation.deadlineAt) && !received
    if (!input.caughtUp && overdue) continue
    if (!overdue && !state.candidates[id] && !expectation.registration?.missedDeadlineAt) continue
    const candidate = ensureCandidate(id, { kind: 'missing-receipt', agentId: expectation.agentId,
      source: expectation.source, taskId: expectation.taskId, attemptId: expectation.attemptId,
      phase: expectation.phase, evidence: expectation.receipt?.evidence })
    candidate.lastObservedAt = input.now
    if (expectation.registration) {
      candidate.expectation = { ...expectation.registration, deadlineAt: expectation.deadlineAt, receiptAt: expectation.receipt?.at ?? null }
      candidate.lastEventAt = expectation.receipt?.at ?? null
      candidate.evidence = expectation.receipt?.evidence
      if (overdue && CLOSED_STATES.has(candidate.state) && candidate.lastReviewedAt && time(expectation.deadlineAt) > time(candidate.lastReviewedAt)) candidate.needsReview = true
    }
    // Do not declare a missing receipt while the ingestion backlog may contain it.
    updateCondition(candidate, overdue && (!CLOSED_STATES.has(candidate.state) || candidate.needsReview))
  }

  // Human decisions suppress task symptoms without asserting execution success.
  for (const candidate of Object.values(state.candidates)) {
    if (candidate.kind === 'task-failure' && CLOSED_STATES.has(candidate.state) && !candidate.needsReview) {
      updateCondition(candidate, false)
    }
  }

  const recipient = input.policy.enabled ? input.policy.humanRecipientId?.trim() : undefined
  if (recipient) {
    const queue = (candidate: MonitorCandidate, condition: MonitorCondition, kind: MonitorOutboxItem['kind']) => {
      const reminderIndex = kind === 'reminder' ? condition.reminder : 0
      outbox.push({ id: key([candidate.id, condition.episode, kind, reminderIndex, recipient]),
        candidateId: candidate.id, episode: condition.episode, kind, queuedAt: input.now,
        recipient: { kind: 'human-dm', id: recipient },
        payload: { kind: candidate.kind, agentId: candidate.agentId, source: candidate.source,
          phase: candidate.phase, evidence: candidate.evidence, state: candidate.state, needsReview: candidate.needsReview } })
    }
    for (const [id, condition] of Object.entries(state.conditions)) {
      const candidate = state.candidates[id]
      if (input.policy.allowedAgentIds && !input.policy.allowedAgentIds.includes(candidate.agentId)) continue
      if (condition.active && !condition.openingQueued) {
        queue(candidate, condition, 'first')
        condition.openingQueued = true
        condition.lastNotificationAt = input.now
      } else if (condition.active && condition.lastNotificationAt && now - time(condition.lastNotificationAt) >= REMINDER_MS) {
        condition.reminder++
        queue(candidate, condition, 'reminder')
        condition.lastNotificationAt = input.now
      } else if (!condition.active && condition.openingQueued && input.caughtUp) {
        queue(candidate, condition, 'recovery')
        condition.openingQueued = false
      }
    }
  }
  state.lastSuccessAt = input.now
  return { state, outbox }
}
