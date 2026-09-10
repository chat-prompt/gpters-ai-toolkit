import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { db } from '@gpters/db'
import { acknowledgeReportInbox, advanceReportInbox, enrollReportInbox } from '../../../../../infra/agent-reports/inbox'
import type { ReportInboxNotice, ReportInboxState } from '../../../../../infra/agent-reports/inbox'
import type { IncidentCase } from './incident-review'

export const reportInboxEnrollmentSchema = z.object({
  reportId: z.string().regex(/^report_[a-f0-9]{32}$/), channelId: z.string().regex(/^[CGD][A-Z0-9]{8,20}$/),
  threadTs: z.string().regex(/^\d{10,14}\.\d{6}$/), expiresAt: z.string().datetime(), threadConfirmed: z.literal(true),
}).strict()
export type ReportInboxEnrollmentInput = z.infer<typeof reportInboxEnrollmentSchema>
export type InboxDeliveryResult = { status: 'accepted'; receipt: string } | { status: 'retry' | 'uncertain' | 'blocked'; reason: string; retryAfterSeconds?: number }
export interface InboxEnvelope {
  state: ReportInboxState
  lastReceipt?: { noticeId: string; receipt: string; at: string }
  delivery?: { noticeId: string; status: 'claimed' | InboxDeliveryResult['status']; claimToken: string; claimedAt: string; receipt?: string; retryAt?: string; reason?: string }
}
interface StoredInbox { id: string; revision: number; registration: { orgId: string }; record: InboxEnvelope }
export class ReportInboxInputError extends Error {}
export class ReportInboxConflict extends Error {}
const allowedChannel = (channel: string, env = process.env) => (env.AX_REPORT_INBOX_CHANNEL_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean).includes(channel)
const json = (value: unknown) => JSON.stringify(value)

/** Separate from auth: validates immutable report origin plus the operator's resolved root assertion. */
export function validateReportInboxOrigin(input: ReportInboxEnrollmentInput, report: IncidentCase, orgId: string, env = process.env) {
  if (!orgId || report.id !== input.reportId || !report.report || report.report.orgId !== orgId || !allowedChannel(input.channelId, env)) throw new ReportInboxInputError('허용된 보고와 채널을 확인하세요')
  const origin = new URL(report.report.issueUrl)
  const match = origin.pathname.match(/^\/archives\/([CGD][A-Z0-9]+)\/p(\d{10,14})(\d{6})$/)
  if (origin.hostname !== env.AX_INCIDENT_SLACK_HOST || !match || match[1] !== input.channelId
    || Number(input.threadTs) > Number(`${match[2]}.${match[3]}`)) throw new ReportInboxInputError('원래 문제의 채널과 스레드 루트를 확인하세요')
}

export async function enrollStoredReportInbox(raw: ReportInboxEnrollmentInput, serverOrigin: string, actor: string, now = new Date().toISOString()) {
  const input = reportInboxEnrollmentSchema.parse(raw)
  if (!actor || process.env.AX_REPORT_INBOX_ENABLED !== 'true') throw new ReportInboxInputError('보고 감시 등록이 비활성입니다')
  const rows = await db.execute(sql`SELECT record FROM ax_incident_reviews WHERE id = ${input.reportId} AND record->'report'->>'orgId' = ${process.env.AX_INCIDENT_ORG_ID ?? ''} LIMIT 1`)
  if (!rows.rows[0]) throw new ReportInboxInputError('등록할 보고를 찾지 못했습니다')
  validateReportInboxOrigin(input, rows.rows[0].record as unknown as IncidentCase, process.env.AX_INCIDENT_ORG_ID ?? '')
  let state: ReportInboxState
  try { state = enrollReportInbox({ reportId: input.reportId, serverOrigin, channelId: input.channelId, threadTs: input.threadTs, expiresAt: input.expiresAt }, now) }
  catch { throw new ReportInboxInputError('스레드와 30일 이내의 만료 시각을 확인하세요') }
  const registration = { orgId: process.env.AX_INCIDENT_ORG_ID, actor, registeredAt: now, threadConfirmed: true }
  const inserted = await db.execute(sql`INSERT INTO ax_report_inboxes (id, revision, registration, record) VALUES (${input.reportId}, 0, ${json(registration)}::jsonb, ${json({ state })}::jsonb) ON CONFLICT (id) DO NOTHING RETURNING id`)
  if (!inserted.rows.length) throw new ReportInboxConflict('이미 등록된 보고입니다. 기존 감시 기록을 확인하세요')
  return { id: input.reportId, status: state.status, expiresAt: state.enrollment.expiresAt }
}

/** No destination expansion or top-level fallback. All Slack calls are injectable. */
export async function deliverReportInboxNotice(notice: ReportInboxNotice, fetcher: typeof fetch = fetch, env = process.env): Promise<InboxDeliveryResult> {
  if (notice.destination !== 'original-thread' || !allowedChannel(notice.channelId, env) || !env.AX_MONITOR_SLACK_TOKEN) return { status: 'blocked', reason: 'thread-not-configured' }
  const headers = { Authorization: `Bearer ${env.AX_MONITOR_SLACK_TOKEN}`, 'Content-Type': 'application/json' }
  const base = { headers, redirect: 'error' as const, signal: AbortSignal.timeout(10_000) }
  // Validate the root separately: a reply timestamp is not permission to create a new thread.
  try {
    const query = new URLSearchParams({ channel: notice.channelId, ts: notice.threadTs, limit: '1', inclusive: 'true' })
    const response = await fetcher(`https://slack.com/api/conversations.replies?${query}`, base)
    if (response.status === 429) return { status: 'retry', reason: 'rate-limited', retryAfterSeconds: 60 }
    const result = await response.json() as { ok?: boolean; messages?: Array<{ ts?: string; thread_ts?: string }> }
    const root = result.messages?.[0]
    if (!response.ok || !result.ok || root?.ts !== notice.threadTs || (root.thread_ts && root.thread_ts !== notice.threadTs)) return { status: 'blocked', reason: 'thread-root-unverified' }
  } catch { return { status: 'retry', reason: 'thread-lookup-failed', retryAfterSeconds: 300 } }
  try {
    const hash = createHash('sha256').update(notice.id).digest('hex')
    const clientId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
    const text = `${notice.kind === 'reminder' ? '보고 보완 알림' : '보고 추가 확인 요청'}\n${notice.reason.slice(0, 2000)}\n${notice.dashboardUrl}`
    const response = await fetcher('https://slack.com/api/chat.postMessage', { ...base, signal: AbortSignal.timeout(10_000), method: 'POST',
      body: json({ channel: notice.channelId, thread_ts: notice.threadTs, text, mrkdwn: false, parse: 'none', link_names: false, unfurl_links: false, unfurl_media: false, reply_broadcast: false, client_msg_id: clientId }) })
    if (response.status === 429) return { status: 'retry', reason: 'rate-limited', retryAfterSeconds: Math.min(86400, Math.max(60, Number(response.headers.get('retry-after')) || 60)) }
    if (response.status >= 500) return { status: 'uncertain', reason: 'upstream-uncertain' }
    const result = await response.json() as { ok?: boolean; ts?: string; channel?: string; message?: { thread_ts?: string } }
    if (!response.ok || !result.ok) return { status: 'blocked', reason: 'slack-rejected' }
    if (!/^\d+\.\d+$/.test(result.ts ?? '') || result.channel !== notice.channelId || result.message?.thread_ts !== notice.threadTs) return { status: 'uncertain', reason: 'receipt-scope-unverified' }
    return { status: 'accepted', receipt: result.ts! }
  } catch { return { status: 'uncertain', reason: 'delivery-uncertain' } }
}

/** Safe to repeat; stale claims become uncertain rather than causing automatic duplicate sends. */
export function prepareInboxEnvelope(current: InboxEnvelope, state: ReportInboxState, now: string): InboxEnvelope {
  const next: InboxEnvelope = { state, ...(current.lastReceipt ? { lastReceipt: current.lastReceipt } : {}) }
  if (state.pending && current.delivery?.noticeId === state.pending.id) {
    next.delivery = { ...current.delivery }
    if (next.delivery.status === 'claimed' && Date.parse(now) - Date.parse(next.delivery.claimedAt) >= 120_000) {
      next.delivery.status = 'uncertain'; next.delivery.reason = 'worker-receipt-missing'
    }
  }
  return next
}
async function save(row: StoredInbox, record: InboxEnvelope) {
  const result = await db.execute(sql`UPDATE ax_report_inboxes SET record = ${json(record)}::jsonb, revision = revision + 1, updated_at = now() WHERE id = ${row.id} AND revision = ${row.revision} RETURNING revision`)
  return result.rows[0] ? Number(result.rows[0].revision) : null
}

export async function processReportInboxes(options: { now?: string; fetcher?: typeof fetch; deliverOperator?: (id: string, text: string) => Promise<InboxDeliveryResult> } = {}) {
  const counts = { checked: 0, pending: 0, accepted: 0, uncertain: 0, blocked: 0, errors: 0 }
  if (process.env.AX_REPORT_INBOX_ENABLED !== 'true' || !process.env.AX_INCIDENT_ORG_ID) return counts
  const now = options.now ?? new Date().toISOString()
  const deadline = Date.now() + 40_000
  if (!Number.isFinite(Date.parse(now))) throw new Error('Valid processing time required')
  const rows = await db.execute(sql`SELECT id, revision, registration, record FROM ax_report_inboxes WHERE registration->>'orgId' = ${process.env.AX_INCIDENT_ORG_ID} AND record->'state'->>'status' = 'watching' AND (record->'state'->>'nextPollAt')::timestamptz <= ${now}::timestamptz ORDER BY updated_at, id LIMIT 10`)
  for (const row of rows.rows as unknown as StoredInbox[]) {
    if (Date.now() + 20_000 > deadline) break
    try {
      counts.checked++
      const reports = await db.execute(sql`SELECT record FROM ax_incident_reviews WHERE id = ${row.id} AND record->'report'->>'orgId' = ${row.registration.orgId} LIMIT 1`)
      const report = reports.rows[0]?.record as unknown as IncidentCase | undefined
      if (!report?.report) {
        counts.errors++
        await save(row, { ...row.record, state: { ...row.record.state, nextPollAt: new Date(Date.parse(now) + 300_000).toISOString() } })
        continue
      }
      const state = advanceReportInbox(row.record.state, { id: report.id, revision: report.revision, state: report.state, pendingReview: report.report.pendingReview, reviews: report.history.filter(value => value.action !== 'reported') }, now)
      const envelope = prepareInboxEnvelope(row.record, state, now)
      const pending = state.pending
      const blocked = envelope.delivery && ['claimed', 'uncertain', 'blocked'].includes(envelope.delivery.status)
      const retryWaiting = envelope.delivery?.retryAt && Date.parse(envelope.delivery.retryAt) > Date.parse(now)
      const shouldSend = pending && !blocked && !retryWaiting && process.env.AX_REPORT_INBOX_DELIVERY_ENABLED === 'true'
      if (pending) counts.pending++
      if (shouldSend) envelope.delivery = { noticeId: pending.id, status: 'claimed', claimToken: randomUUID(), claimedAt: options.now ?? new Date().toISOString() }
      const revision = await save(row, envelope)
      if (revision === null) continue // Another worker owns the updated state/claim.
      if (!shouldSend) {
        if (envelope.delivery?.status === 'uncertain') counts.uncertain++
        if (envelope.delivery?.status === 'blocked') counts.blocked++
        continue
      }
      // Recheck source immediately before sending; a newly answered question cancels the claim.
      const latest = await db.execute(sql`SELECT revision FROM ax_incident_reviews WHERE id = ${row.id} AND revision = ${report.revision} LIMIT 1`)
      if (!latest.rows.length) continue // Claim will be cleared by next fresh projection, never sent from stale evidence.
      let result: InboxDeliveryResult
      try {
        result = pending.destination === 'operator'
          ? options.deliverOperator ? await options.deliverOperator(pending.id, `보고 감시 인계\n${pending.reason.slice(0, 2000)}\n${pending.dashboardUrl}`) : { status: 'blocked', reason: 'operator-not-configured' }
          : await deliverReportInboxNotice(pending, options.fetcher)
      } catch { result = { status: 'uncertain', reason: 'adapter-uncertain' } }
      envelope.delivery = { ...envelope.delivery!, status: result.status, ...('receipt' in result ? { receipt: result.receipt } : { reason: result.reason }),
        ...(result.status === 'retry' ? { retryAt: new Date(Date.parse(now) + Math.max(60, Math.min(86400, result.retryAfterSeconds ?? 300)) * 1000).toISOString() } : {}) }
      if (result.status === 'accepted') {
        const receivedAt = options.now ?? new Date().toISOString()
        envelope.state = acknowledgeReportInbox(state, pending.id, receivedAt)
        envelope.lastReceipt = { noticeId: pending.id, receipt: result.receipt, at: receivedAt }
      }
      const acknowledged = await save({ ...row, revision }, envelope)
      if (acknowledged === null) { counts.uncertain++; continue }
      if (result.status === 'accepted') counts.accepted++
      else if (result.status === 'uncertain') counts.uncertain++
      else if (result.status === 'blocked') counts.blocked++
    } catch { counts.errors++ }
  }
  return counts
}
