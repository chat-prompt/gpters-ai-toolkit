// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { acknowledgeReportInbox, advanceReportInbox, enrollReportInbox } from '../../../../infra/agent-reports/inbox'
import type { ReportInboxSnapshot, ReportInboxState } from '../../../../infra/agent-reports/inbox'
import { createReportCase, appendReportSupplement } from '../../../../packages/lib/src/features/ax/incident-report-store'
import { applyIncidentAction } from '../../../../packages/lib/src/features/ax/incident-review'
import type { IncidentCase } from '../../../../packages/lib/src/features/ax/incident-review'

const start = '2026-01-01T01:00:00.000Z'
const id = 'report_' + 'a'.repeat(32)
const enrollment = { reportId: id, serverOrigin: 'https://toolkit.example.org', channelId: 'C000000001', threadTs: '1767229200.000001', expiresAt: '2026-01-31T01:00:00.000Z' }
const request: ReportInboxSnapshot = { id, revision: 2, state: 'needs-info', pendingReview: false,
  reviews: [{ at: start, action: 'needs-info', reason: 'Please provide the reproduction conditions.', evidenceRef: 'private:review' }] }
const day = (n: number) => new Date(Date.parse(start) + n * 86_400_000).toISOString()
const persisted = (state: ReportInboxState): ReportInboxState => JSON.parse(JSON.stringify(state))

describe('bounded durable report inbox', () => {
  it('requires explicit thread metadata, matching report ID and bounded expiry', () => {
    expect(() => enrollReportInbox({ ...enrollment, expiresAt: day(31) }, start)).toThrow('expiry')
    expect(() => enrollReportInbox({ ...enrollment, threadTs: 'unknown' }, start)).toThrow('scoped')
    expect(() => advanceReportInbox(enrollReportInbox(enrollment, start), { ...request, id: 'report_' + 'b'.repeat(32) }, start)).toThrow('snapshot')
  })

  it('survives process restarts and uncertain delivery without changing notice or thread', () => {
    const first = advanceReportInbox(enrollReportInbox(enrollment, start), request, start)
    expect(first.pending).toMatchObject({ kind: 'needs-info', channelId: enrollment.channelId, threadTs: enrollment.threadTs, destination: 'original-thread' })
    const retried = advanceReportInbox(persisted(first), request, day(0.5))
    expect(retried.pending).toEqual(first.pending)
    const acked = acknowledgeReportInbox(retried, first.pending!.id, day(0.5))
    expect(acknowledgeReportInbox(acked, first.pending!.id, day(0.6))).toBe(acked)
    expect(advanceReportInbox(acked, request, day(1)).pending).toBeUndefined()
    expect(advanceReportInbox(acked, request, day(1.5)).pending?.kind).toBe('reminder')
  })

  it('sends at most three daily reminders, then one operator handoff without catch-up bursts', () => {
    let state = enrollReportInbox(enrollment, start)
    const kinds: string[] = []
    for (let d = 0; d < 5; d++) {
      state = advanceReportInbox(persisted(state), request, day(d))
      kinds.push(state.pending!.kind)
      state = acknowledgeReportInbox(state, state.pending!.id, day(d))
    }
    expect(kinds).toEqual(['needs-info', 'reminder', 'reminder', 'reminder', 'handoff'])
    expect(state.status).toBe('handed-off')
    expect(advanceReportInbox(state, request, day(10))).toBe(state)
    let delayed = advanceReportInbox(enrollReportInbox(enrollment, start), request, start)
    delayed = acknowledgeReportInbox(delayed, delayed.pending!.id, start)
    delayed = advanceReportInbox(delayed, request, day(10))
    expect(delayed.pending?.sequence).toBe(1)
    delayed = acknowledgeReportInbox(delayed, delayed.pending!.id, day(10))
    expect(advanceReportInbox(delayed, request, day(10.1)).pending).toBeUndefined()
  })

  it('cancels queued nudges when evidence arrives and ignores stale snapshots and receipts', () => {
    const first = advanceReportInbox(enrollReportInbox(enrollment, start), request, start)
    const answered = advanceReportInbox(first, { ...request, revision: 3, pendingReview: true }, day(0.1))
    expect(answered.pending).toBeUndefined()
    expect(answered.status).toBe('watching')
    expect(advanceReportInbox(answered, request, day(1))).toBe(answered)
    expect(acknowledgeReportInbox(answered, first.pending!.id, day(1))).toBe(answered)
    const again = advanceReportInbox(answered, { ...request, revision: 4, reviews: [...request.reviews, { ...request.reviews[0], at: day(1), reason: 'Please include the document revision.' }] }, day(1))
    expect(again.pending?.id).not.toBe(first.pending?.id)
    expect(again.pending?.sequence).toBe(0)
  })

  it('hands off expired watches even without an open question and closes only on human disposition', () => {
    const candidate = { ...request, revision: 1, state: 'candidate', pendingReview: true, reviews: [] }
    const state = enrollReportInbox({ ...enrollment, expiresAt: day(1) }, start)
    expect(advanceReportInbox(state, candidate, day(1)).pending?.kind).toBe('handoff')
    const awaitingReview = advanceReportInbox(state, { ...candidate, state: 'verified', pendingReview: true }, start)
    expect(awaitingReview.status).toBe('watching')
    const closed = advanceReportInbox(state, { ...candidate, state: 'verified', pendingReview: false }, start)
    expect(closed.status).toBe('closed')
    expect(closed.pending).toBeUndefined()
  })

  it('rejects future or missing reviewer evidence instead of inventing a question', () => {
    const state = enrollReportInbox(enrollment, start)
    expect(() => advanceReportInbox(state, { ...request, reviews: [] }, start)).toThrow('evidence')
    expect(() => advanceReportInbox(state, { ...request, reviews: [{ ...request.reviews[0], at: day(1) }] }, start)).toThrow('evidence')
  })

  it('connects real report and human review transitions without treating an agent answer as final', () => {
    const issueUrl = 'https://example.slack.com/archives/C000000001/p1767229200000001'
    let record = createReportCase({ agentId: 'example', orgId: 'example-org' }, {
      title: 'Synthetic report', summary: 'Wrong document section', expected: 'Current section', actual: 'Old section',
      source: 'unknown', category: 'quality', occurredAt: '2026-01-01T00:00:00Z', issueUrl, approvalUrl: issueUrl,
      requestedBy: 'U000000001', initiation: 'user-requested',
    }, start)
    const snapshot = (value: IncidentCase): ReportInboxSnapshot => ({ id: value.id, revision: value.revision, state: value.state, pendingReview: value.report!.pendingReview, reviews: value.history.filter(h => h.action !== 'reported') })
    let inbox = enrollReportInbox({ ...enrollment, reportId: record.id }, start)
    const decide = (action: 'needs-info' | 'confirmed' | 'false-positive', at: string) => {
      record = applyIncidentAction(record, { start, end: at, traces: [], coverage: undefined }, { id: record.id, revision: record.revision, days: 7, action, reason: 'Human reviewed the evidence', evidenceRef: issueUrl }, 'reviewer')
    }
    decide('needs-info', day(0.1))
    inbox = advanceReportInbox(inbox, snapshot(record), day(0.1))
    expect(inbox.pending?.kind).toBe('needs-info')
    const note = { updateId: '00000000-0000-4000-8000-000000000001', kind: 'context' as const, summary: 'Document revision supplied', evidenceUrl: issueUrl }
    record = appendReportSupplement(record, note, day(0.2))
    expect(appendReportSupplement(record, note, day(0.3))).toBe(record)
    expect(() => appendReportSupplement(record, { ...note, summary: 'Changed retry' }, day(0.3))).toThrow('updateId')
    inbox = advanceReportInbox(inbox, snapshot(record), day(0.2))
    expect(inbox.pending).toBeUndefined()
    expect(record.state).toBe('needs-info')
    decide('false-positive', day(0.3))
    expect(advanceReportInbox(inbox, snapshot(record), day(0.3)).status).toBe('closed')
  })
})
