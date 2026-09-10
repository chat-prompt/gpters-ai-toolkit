import type { AxAgentTaskEvent } from './agent-task-events'

export type MonitorCaseState = 'candidate' | 'needs-info' | 'reviewing' | 'confirmed' | 'false-positive' | 'fixed' | 'verified'
export type MonitorSource = 'claude-code' | 'codex' | 'openclaw' | 'hermes'
export type MonitorKind = 'task-failure' | 'collector-stale' | 'missing-receipt'
export interface MonitorCandidate {
  id: string
  kind: MonitorKind
  agentId: string
  source: MonitorSource
  taskId?: string
  attemptId?: string
  /** Latest observed event identity for linking the existing private incident case. */
  eventId?: string
  phase?: AxAgentTaskEvent['phase']
  evidence?: AxAgentTaskEvent['evidence']
  /** Operator decision, never automatically confirmed, fixed or verified. */
  state: MonitorCaseState
  firstObservedAt: string
  lastObservedAt: string
  lastEventAt: string | null
  eventCount: number
  observationActive: boolean
  needsReview: boolean
  lastReviewedAt?: string
}
export interface MonitorCondition {
  active: boolean
  episode: number
  openedAt: string
  lastNotificationAt: string | null
  reminder: number
  /** Recovery is emitted only if an opening alert was queued in this episode. */
  openingQueued: boolean
}
export interface MonitorState {
  schemaVersion: 1
  /** Local monotonic position assigned under the persistence CAS, not event time. */
  cursor: string
  seenEvents: Record<string, string>
  candidates: Record<string, MonitorCandidate>
  conditions: Record<string, MonitorCondition>
  lastSuccessAt: string | null
}
export interface MonitorObservation {
  position: string
  agentId: string
  source: MonitorSource
  event: AxAgentTaskEvent
}
export interface MonitorCollector {
  collectorId: string
  agentId: string
  source: MonitorSource
  registeredAt: string
  lastSuccessAt: string | null
  intervalSeconds: number | null
  /** Removed/revoked collectors must be passed with enabled=false for recovery. */
  enabled: boolean
}
export interface MonitorReceiptExpectation {
  id: string
  agentId: string
  source: MonitorSource
  taskId: string
  attemptId: string
  phase: 'verification' | 'delivery'
  /** Only explicit deadlines establish a missing-receipt condition. */
  deadlineAt: string
  requiredEvidence: 'reported' | 'independent'
  receipt: { at: string; evidence: AxAgentTaskEvent['evidence']; independentlyVerified: boolean } | null
  cancelled?: boolean
}
export interface MonitorPolicy {
  enabled: boolean
  allowedAgentIds?: string[]
  /** Configured human recipient only; there is deliberately no default recipient. */
  humanRecipientId?: string
}
export interface MonitorOutboxItem {
  id: string
  candidateId: string
  episode: number
  kind: 'first' | 'reminder' | 'recovery'
  queuedAt: string
  recipient: { kind: 'human-dm'; id: string }
  /** Minimal metadata only; no transcript, secret, command or arbitrary text. */
  payload: Pick<MonitorCandidate, 'kind' | 'agentId' | 'source' | 'phase' | 'evidence' | 'state' | 'needsReview'>
}
export interface MonitorInput {
  state: MonitorState
  observations: MonitorObservation[]
  collectors: MonitorCollector[]
  receiptExpectations: MonitorReceiptExpectation[]
  now: string
  policy: MonitorPolicy
  /** False while more unprocessed batches remain: absence cannot trigger recovery. */
  caughtUp: boolean
}
export interface MonitorResult {
  state: MonitorState
  outbox: MonitorOutboxItem[]
}
export type MonitorCapability = 'observed' | 'incomplete' | 'unavailable'
export interface MonitorDashboardData {
  lastSuccessAt: string | null
  checkedAt: string
  backlog: number
  alertsPending: number
  /** Delivery may have happened; do not automatically resend these alerts. */
  alertsUncertain?: number
  alertsBlocked?: number
  candidates: MonitorCandidate[]
  capabilities: { taskEvents: MonitorCapability; independentReceipts: MonitorCapability }
  /** UI subset limits are visible; never confuse this with the processed backlog. */
  totalCandidates?: number
}
