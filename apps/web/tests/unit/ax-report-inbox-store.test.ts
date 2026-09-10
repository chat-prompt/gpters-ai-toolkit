// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('@gpters/db', () => ({ db: { execute: mocks.execute } }))
import { deliverReportInboxNotice, enrollStoredReportInbox, prepareInboxEnvelope, processReportInboxes, validateReportInboxOrigin } from '../../../../packages/lib/src/features/ax/report-inbox-store'
import type { InboxEnvelope } from '../../../../packages/lib/src/features/ax/report-inbox-store'
import { advanceReportInbox, enrollReportInbox } from '../../../../infra/agent-reports/inbox'
import type { IncidentCase } from '../../../../packages/lib/src/features/ax/incident-review'

const now = '2026-01-01T02:00:00.000Z'
const id = 'report_' + 'a'.repeat(32)
const input = { reportId: id, channelId: 'C000000001', threadTs: '1767229200.000001', expiresAt: '2026-01-20T00:00:00.000Z', threadConfirmed: true as const }
const enrollment = { ...input, serverOrigin: 'https://toolkit.example.org' }
const snapshot = { id, revision: 2, state: 'needs-info', pendingReview: false, reviews: [{ at: now, action: 'needs-info', reason: 'Please add reproduction details.', evidenceRef: 'private:example' }] }
const report = { id, revision: 2, state: 'needs-info', history: snapshot.reviews, report: { orgId: 'example-org', issueUrl: 'https://example.slack.com/archives/C000000001/p1767229200000001', pendingReview: false } } as unknown as IncidentCase
const pending = () => advanceReportInbox(enrollReportInbox(enrollment, now), snapshot, now)
const row = (record: InboxEnvelope = { state: enrollReportInbox(enrollment, now) }) => ({ id, revision: 0, registration: { orgId: 'example-org' }, record })
const result = (rows: unknown[]) => ({ rows })
const acceptedFetch = () => vi.fn().mockResolvedValueOnce(Response.json({ ok: true, messages: [{ ts: input.threadTs }] })).mockResolvedValueOnce(Response.json({ ok: true, ts: '1767232900.000001', channel: input.channelId, message: { thread_ts: input.threadTs } }))

beforeEach(() => {
  mocks.execute.mockReset()
  vi.stubEnv('AX_REPORT_INBOX_ENABLED', 'true'); vi.stubEnv('AX_REPORT_INBOX_DELIVERY_ENABLED', 'true')
  vi.stubEnv('AX_INCIDENT_ORG_ID', 'example-org'); vi.stubEnv('AX_INCIDENT_SLACK_HOST', 'example.slack.com')
  vi.stubEnv('AX_REPORT_INBOX_CHANNEL_IDS', input.channelId); vi.stubEnv('AX_MONITOR_SLACK_TOKEN', 'private-example-token')
})
afterEach(() => vi.unstubAllEnvs())

describe('explicit report inbox enrollment', () => {
  it('requires same org, allowed original channel and a root no later than the problem reply', () => {
    expect(() => validateReportInboxOrigin(input, report, 'example-org')).not.toThrow()
    expect(() => validateReportInboxOrigin(input, report, 'other-org')).toThrow('허용')
    expect(() => validateReportInboxOrigin({ ...input, channelId: 'C000000002' }, report, 'example-org')).toThrow('허용')
    expect(() => validateReportInboxOrigin({ ...input, threadTs: '1767239200.000001' }, report, 'example-org')).toThrow('루트')
  })
  it('registers only an existing scoped report and refuses silent reenrollment', async () => {
    mocks.execute.mockResolvedValueOnce(result([{ record: report }])).mockResolvedValueOnce(result([{ id }]))
    expect(await enrollStoredReportInbox(input, enrollment.serverOrigin, 'operator', now)).toMatchObject({ id, status: 'watching' })
    mocks.execute.mockResolvedValueOnce(result([{ record: report }])).mockResolvedValueOnce(result([]))
    await expect(enrollStoredReportInbox(input, enrollment.serverOrigin, 'operator', now)).rejects.toThrow('이미 등록')
    mocks.execute.mockResolvedValueOnce(result([]))
    await expect(enrollStoredReportInbox(input, enrollment.serverOrigin, 'operator', now)).rejects.toThrow('찾지 못')
  })
})

describe('thread-only inbox delivery', () => {
  it('verifies the original root and sends inert text with a stable client ID and no broadcast', async () => {
    const notice = pending().pending!
    const fetcher = acceptedFetch()
    expect(await deliverReportInboxNotice(notice, fetcher)).toEqual({ status: 'accepted', receipt: '1767232900.000001' })
    const body = JSON.parse(fetcher.mock.calls[1][1].body)
    expect(body).toMatchObject({ channel: input.channelId, thread_ts: input.threadTs, mrkdwn: false, parse: 'none', reply_broadcast: false, link_names: false })
    const retry = acceptedFetch(); await deliverReportInboxNotice(notice, retry)
    expect(JSON.parse(retry.mock.calls[1][1].body).client_msg_id).toBe(body.client_msg_id)
    expect(JSON.stringify(body)).not.toContain('private-example-token')
  })
  it('never falls back to a channel post if the root is missing or belongs to another thread', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true, messages: [{ ts: '1767232900.000001' }] }))
    expect(await deliverReportInboxNotice(pending().pending!, fetcher)).toMatchObject({ status: 'blocked' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('holds uncertain post results, but allows rate-limited requests to retry', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, messages: [{ ts: input.threadTs }] })).mockRejectedValueOnce(new Error('timeout with private details'))
    expect(await deliverReportInboxNotice(pending().pending!, fetcher)).toEqual({ status: 'uncertain', reason: 'delivery-uncertain' })
    const limited = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, messages: [{ ts: input.threadTs }] })).mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '120' } }))
    expect(await deliverReportInboxNotice(pending().pending!, limited)).toMatchObject({ status: 'retry', retryAfterSeconds: 120 })
  })
  it('treats a success without an exact thread receipt as uncertain', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, messages: [{ ts: input.threadTs }] })).mockResolvedValueOnce(Response.json({ ok: true, ts: '1767232900.000001', channel: input.channelId }))
    expect(await deliverReportInboxNotice(pending().pending!, fetcher)).toMatchObject({ status: 'uncertain', reason: 'receipt-scope-unverified' })
  })
})

describe('durable bounded claim and receipt processing', () => {
  it('turns abandoned claims into uncertainty instead of automatically resending', () => {
    const state = pending()
    const current: InboxEnvelope = { state, delivery: { noticeId: state.pending!.id, status: 'claimed', claimToken: 'example', claimedAt: now } }
    expect(prepareInboxEnvelope(current, state, '2026-01-01T02:02:00Z').delivery?.status).toBe('uncertain')
    expect(prepareInboxEnvelope(current, { ...state, pending: undefined }, now).delivery).toBeUndefined()
  })
  it('persists the claim before sending and acknowledges only after a scoped provider receipt', async () => {
    mocks.execute.mockResolvedValueOnce(result([row()])).mockResolvedValueOnce(result([{ record: report }]))
      .mockResolvedValueOnce(result([{ revision: 1 }])).mockResolvedValueOnce(result([{ revision: report.revision }])).mockResolvedValueOnce(result([{ revision: 2 }]))
    const fetcher = acceptedFetch()
    expect(await processReportInboxes({ now, fetcher })).toMatchObject({ checked: 1, accepted: 1, pending: 1, errors: 0 })
    expect(mocks.execute).toHaveBeenCalledTimes(5)
    expect(fetcher.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.execute.mock.invocationCallOrder[2])
    expect(mocks.execute.mock.invocationCallOrder[4]).toBeGreaterThan(fetcher.mock.invocationCallOrder[1])
  })
  it('never sends after losing the claim CAS or a changed source revision', async () => {
    mocks.execute.mockResolvedValueOnce(result([row()])).mockResolvedValueOnce(result([{ record: report }])).mockResolvedValueOnce(result([]))
    const fetcher = vi.fn()
    expect(await processReportInboxes({ now, fetcher })).toMatchObject({ accepted: 0 })
    expect(fetcher).not.toHaveBeenCalled()
    mocks.execute.mockResolvedValueOnce(result([row()])).mockResolvedValueOnce(result([{ record: report }])).mockResolvedValueOnce(result([{ revision: 1 }])).mockResolvedValueOnce(result([]))
    await processReportInboxes({ now, fetcher })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('keeps uncertain notices durable and does not resend them on the next run', async () => {
    const state = pending()
    const record: InboxEnvelope = { state, delivery: { noticeId: state.pending!.id, status: 'uncertain', claimToken: 'example', claimedAt: now } }
    mocks.execute.mockResolvedValueOnce(result([row(record)])).mockResolvedValueOnce(result([{ record: report }])).mockResolvedValueOnce(result([{ revision: 1 }]))
    const fetcher = vi.fn()
    expect(await processReportInboxes({ now, fetcher })).toMatchObject({ uncertain: 1, accepted: 0 })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('supports shadow mode and a completely disabled worker without sending', async () => {
    vi.stubEnv('AX_REPORT_INBOX_DELIVERY_ENABLED', 'false')
    mocks.execute.mockResolvedValueOnce(result([row()])).mockResolvedValueOnce(result([{ record: report }])).mockResolvedValueOnce(result([{ revision: 1 }]))
    const fetcher = vi.fn()
    expect(await processReportInboxes({ now, fetcher })).toMatchObject({ pending: 1, accepted: 0 })
    expect(fetcher).not.toHaveBeenCalled()
    mocks.execute.mockClear(); vi.stubEnv('AX_REPORT_INBOX_ENABLED', 'false')
    expect(await processReportInboxes({ now, fetcher })).toMatchObject({ checked: 0 })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
})
