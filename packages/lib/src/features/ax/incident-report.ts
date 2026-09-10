/** Agent submissions are claims for human review, not synthetic telemetry events. */
import { z } from 'zod'
const shortText = z.string().trim().min(1).max(2000)
const slackUserId = z.string().regex(/^[UW][A-Z0-9]{8,20}$/)
const slackTimestamp = z.string().regex(/^\d{10,14}\.\d{6}$/)
export const incidentReactionSchema = z.object({
  eventId: z.string().regex(/^Ev[A-Za-z0-9]{6,50}$/),
  teamId: z.string().regex(/^T[A-Z0-9]{8,20}$/),
  channelId: z.string().regex(/^[CGD][A-Z0-9]{8,20}$/),
  messageTs: slackTimestamp, threadTs: slackTimestamp,
  eventTs: slackTimestamp, userId: slackUserId,
  name: z.string().regex(/^[a-z0-9_+-]{1,64}$/),
}).strict()
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
  issueUrl: slackPermalinkSchema, approvalUrl: slackPermalinkSchema.optional(),
  requestedBy: slackUserId,
  initiation: z.enum(['user-requested','agent-proposed-approved','reaction-requested']),
  reaction: incidentReactionSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.initiation !== 'reaction-requested') {
    if (!value.approvalUrl || value.reaction) ctx.addIssue({code:'custom',message:'Text requests require an approval message and no reaction metadata'})
    return
  }
  if (!value.reaction || value.approvalUrl) {
    ctx.addIssue({code:'custom',message:'Reaction requests require event metadata, not a fabricated approval message'})
    return
  }
  const reaction = value.reaction
  if (reaction.userId !== value.requestedBy) ctx.addIssue({code:'custom',message:'Reaction actor mismatch'})
  if (Number(reaction.threadTs) > Number(reaction.messageTs)) ctx.addIssue({code:'custom',message:'Thread must precede the reacted message'})
  if (Number(reaction.messageTs) > Number(reaction.eventTs)) ctx.addIssue({code:'custom',message:'Reaction must follow the message'})
  try {
    if (new URL(value.issueUrl).pathname !== `/archives/${reaction.channelId}/p${reaction.messageTs.replace('.','')}`) ctx.addIssue({code:'custom',message:'Link must identify the reacted message, not the thread root'})
  } catch { ctx.addIssue({code:'custom',message:'Invalid issue link'}) }
}).transform(value => ({ ...value, issueUrl: normalizeSlackLink(value.issueUrl), ...(value.approvalUrl ? {approvalUrl: normalizeSlackLink(value.approvalUrl)} : {}) }))
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
/** Opt-in intake only; metadata remains agent-attested, never a final approval. */
export function allowedReactionReport(input: IncidentReportSubmission): boolean {
  if (input.initiation !== 'reaction-requested') return true
  const reaction = input.reaction
  const includes = (key:string,value:string) => (process.env[key] ?? '').split(',').map(v=>v.trim()).filter(Boolean).includes(value)
  return process.env.AX_INCIDENT_REACTION_REPORTS_ENABLED === 'true' && !!reaction &&
    reaction.teamId === process.env.AX_INCIDENT_SLACK_TEAM_ID &&
    includes('AX_INCIDENT_REACTION_NAMES',reaction.name) &&
    includes('AX_INCIDENT_REACTION_CHANNEL_IDS',reaction.channelId) &&
    includes('AX_INCIDENT_REACTION_REQUESTER_IDS',reaction.userId)
}
/** The internal admin check still applies at every HTTP entry point. */
export function isIncidentReviewer(userId?: string | null): boolean {
  return !!userId && (process.env.AX_INCIDENT_REVIEWER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean).includes(userId)
}
