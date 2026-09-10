/** Agent submissions are claims for human review, not synthetic telemetry events. */
import { z } from 'zod'
const shortText = z.string().trim().min(1).max(2000)
export const slackPermalinkSchema = z.string().max(1000).url().refine(value => {
  let url: URL
  try { url = new URL(value) } catch { return false }
  return url.protocol === 'https:' && /^[a-z0-9-]+\.slack\.com$/.test(url.hostname) && !url.username && !url.password && !url.port &&
    /^\/archives\/[CGD][A-Z0-9]+\/p[0-9]{16,20}$/.test(url.pathname)
}, 'Slack message permalink required')
export function normalizeSlackLink(value: string): string {
  const url = new URL(value)
  // The p<timestamp> identifies the exact message; query tracking is not identity.
  return `${url.origin}${url.pathname}`
}
export const incidentReportSchema = z.object({
  title: z.string().trim().min(1).max(160), summary: shortText,
  expected: shortText, actual: shortText, reproduction: z.string().trim().max(2000).optional(),
  source: z.enum(['claude-code','codex','openclaw','hermes','unknown']),
  category: z.enum(['quality','execution','delivery','other']),
  occurredAt: z.string().datetime(), model: z.string().trim().min(1).max(120).optional(), taskId: z.string().uuid().optional(),
  issueUrl: slackPermalinkSchema, approvalUrl: slackPermalinkSchema,
  requestedBy: z.string().regex(/^[UW][A-Z0-9]{8,20}$/),
  initiation: z.enum(['user-requested','agent-proposed-approved']),
}).strict().transform(value => ({ ...value, issueUrl: normalizeSlackLink(value.issueUrl), approvalUrl: normalizeSlackLink(value.approvalUrl) }))
export type IncidentReportSubmission = z.infer<typeof incidentReportSchema>
export const incidentSupplementSchema = z.object({
  updateId: z.string().uuid(), kind: z.enum(['context','fix-result','retest-result']),
  summary: shortText, evidenceUrl: slackPermalinkSchema,
  testedAt: z.string().datetime().optional(), outcome: z.enum(['passed','failed','inconclusive']).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'retest-result' && (!value.testedAt || !value.outcome)) ctx.addIssue({code:'custom',message:'Retest time and outcome required'})
  if (value.kind !== 'retest-result' && (value.testedAt || value.outcome)) ctx.addIssue({code:'custom',message:'Retest fields require retest-result'})
}).transform(value => ({ ...value, evidenceUrl: normalizeSlackLink(value.evidenceUrl) }))
export type IncidentSupplement = z.infer<typeof incidentSupplementSchema>
export interface IncidentReport extends IncidentReportSubmission {
  orgId: string; reporterAgentId: string; inputDigest: string
  consentEvidence: 'agent-attested'; pendingReview: boolean
  supplements: Array<IncidentSupplement & { at: string; digest: string }>
}
export function allowedReportWorkspace(links: string[], host = process.env.AX_INCIDENT_SLACK_HOST): boolean {
  return !!host && /^[a-z0-9-]+\.slack\.com$/.test(host) && links.every(link => new URL(link).hostname === host)
}
/** The internal admin check still applies at every HTTP entry point. */
export function isIncidentReviewer(userId?: string | null): boolean {
  return !!userId && (process.env.AX_INCIDENT_REVIEWER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean).includes(userId)
}
