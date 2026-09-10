/** Pure durable inbox transitions. The caller owns storage, polling and delivery. */
import { createHash } from 'node:crypto'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const idPattern = /^report_[a-f0-9]{32}$/
const stampPattern = /^\d{10,14}\.\d{6}$/
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const iso = (value: number) => new Date(value).toISOString()
function time(value: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error('Valid inbox timestamp required')
  return parsed
}

export interface ReportInboxEnrollment {
  reportId: string
  serverOrigin: string
  /** Resolved original thread; never infer a root from the problem reply timestamp. */
  channelId: string
  threadTs: string
  expiresAt: string
}
export interface ReportInboxSnapshot {
  id: string
  revision: number
  state: string
  pendingReview: boolean
  reviews: Array<{ at: string; action: string; reason: string; evidenceRef: string }>
}
export interface ReportInboxNotice {
  id: string
  reportId: string
  questionId: string
  kind: 'needs-info' | 'reminder' | 'handoff'
  destination: 'original-thread' | 'operator'
  channelId: string
  threadTs: string
  dashboardUrl: string
  reason: string
  sequence: number
  createdAt: string
}
export interface ReportInboxState {
  version: 1
  enrollment: ReportInboxEnrollment
  status: 'watching' | 'closed' | 'handed-off'
  lastRevision: number
  nextPollAt: string
  question?: { id: string; reason: string; acknowledgedCount: number; nextNoticeAt: string }
  pending?: ReportInboxNotice
}

/** Enrollment is explicit; this does not install a watcher or widen Slack recipients. */
export function enrollReportInbox(enrollment: ReportInboxEnrollment, now: string): ReportInboxState {
  const at = time(now), expires = time(enrollment.expiresAt)
  const origin = new URL(enrollment.serverOrigin)
  if (!idPattern.test(enrollment.reportId) || !/^[CGD][A-Z0-9]{8,20}$/.test(enrollment.channelId)
    || !stampPattern.test(enrollment.threadTs) || origin.origin !== enrollment.serverOrigin || origin.protocol !== 'https:'
    || expires <= at || expires > at + 30 * DAY) throw new Error('Explicit scoped enrollment with expiry within 30 days required')
  return { version: 1, enrollment: { ...enrollment }, status: 'watching', lastRevision: 0, nextPollAt: iso(at) }
}

function notice(state: ReportInboxState, kind: ReportInboxNotice['kind'], now: string): ReportInboxNotice {
  const question = state.question!
  const sequence = question.acknowledgedCount
  const { reportId, channelId, threadTs, serverOrigin } = state.enrollment
  return {
    id: `report-inbox_${fingerprint([reportId, channelId, threadTs, question.id, kind, sequence])}`,
    reportId, questionId: question.id, kind, destination: kind === 'handoff' ? 'operator' : 'original-thread',
    channelId, threadTs, dashboardUrl: `${serverOrigin}/en/ax?panel=agent-incidents&incident=${reportId}`,
    reason: question.reason, sequence, createdAt: now,
  }
}

/**
 * Call after an authenticated own-report GET. Persist the result and outbox in
 * one CAS/transaction before delivery. A failed GET must not be passed as a
 * fabricated snapshot. An older snapshot cannot cancel a newer pending notice.
 */
export function advanceReportInbox(current: ReportInboxState, snapshot: ReportInboxSnapshot, now: string): ReportInboxState {
  const at = time(now)
  if (snapshot.id !== current.enrollment.reportId || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1
    || typeof snapshot.pendingReview !== 'boolean' || !['candidate', 'reviewing', 'needs-info', 'confirmed', 'false-positive', 'fixed', 'verified'].includes(snapshot.state)) {
    throw new Error('Unexpected own-report snapshot')
  }
  if (current.status !== 'watching' || snapshot.revision < current.lastRevision) return current
  const next = structuredClone(current)
  next.lastRevision = snapshot.revision
  next.nextPollAt = iso(at + 5 * MINUTE)

  // Agent evidence awaits a human; it cannot resolve the case, but stops nudges.
  if (snapshot.state !== 'needs-info' || snapshot.pendingReview) {
    delete next.question
    delete next.pending
    if (['verified', 'false-positive'].includes(snapshot.state) && !snapshot.pendingReview) next.status = 'closed'
  } else {
    const index = snapshot.reviews.map(review => review.action).lastIndexOf('needs-info')
    const review = snapshot.reviews[index]
    if (!review || !review.reason.trim() || review.reason.length > 2000 || time(review.at) > at) throw new Error('Review request evidence required')
    const questionId = fingerprint([index, review.at, review.action, review.reason, review.evidenceRef])
    if (next.question?.id !== questionId) {
      next.question = { id: questionId, reason: review.reason, acknowledgedCount: 0, nextNoticeAt: iso(at) }
      delete next.pending
    }
  }

  if (at >= time(next.enrollment.expiresAt)) {
    if (next.status === 'closed') return next
    next.question ??= { id: 'watch-expired', reason: 'Report watch expired; explicit operator handoff required.', acknowledgedCount: 0, nextNoticeAt: iso(at) }
    // Never send an overdue reminder after the enrollment expires.
    if (next.pending?.kind !== 'handoff') next.pending = notice(next, 'handoff', iso(at))
  } else if (next.question && !next.pending && at >= time(next.question.nextNoticeAt)) {
    // Initial request + at most three reminders; after another day, hand off.
    const kind = next.question.acknowledgedCount === 0 ? 'needs-info' : next.question.acknowledgedCount < 4 ? 'reminder' : 'handoff'
    next.pending = notice(next, kind, iso(at))
  }
  return next
}

/** Only an actual provider receipt acknowledges delivery. Failed/uncertain sends keep the same pending ID. */
export function acknowledgeReportInbox(current: ReportInboxState, noticeId: string, now: string): ReportInboxState {
  const at = time(now)
  if (!current.pending || current.pending.id !== noticeId) return current
  if (at < time(current.pending.createdAt)) throw new Error('Receipt cannot precede notice')
  const next = structuredClone(current)
  if (next.pending!.kind === 'handoff') next.status = 'handed-off'
  else {
    next.question!.acknowledgedCount++
    next.question!.nextNoticeAt = iso(at + DAY)
  }
  delete next.pending
  return next
}
