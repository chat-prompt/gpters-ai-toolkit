/** Adapter boundary: preserve exact event metadata before invoking a model.
 * This function does not authenticate Slack, call a model, or write a report.
 */
import { incidentReactionSchema, slackPermalinkSchema } from '../../packages/lib/src/features/ax/incident-report'

export interface SlackReactionEnvelope {
  event_id: string
  team_id: string
  event: {
    type: string; user: string; reaction: string; event_ts: string
    item: {type: string; channel: string; ts: string}
  }
}
export interface ReactionCapturePolicy {
  workspaceHost: string; teamId: string; channelIds: string[]
  requesterIds: string[]; reactionNames: string[]
}
export function captureSlackReaction(
  envelope: SlackReactionEnvelope,
  // Must be resolved by the authenticated adapter, never inferred from message text.
  actor: {id:string;isBot:boolean;active:boolean},
  message: {channelId:string;messageTs:string;threadTs:string},
  policy: ReactionCapturePolicy,
) {
  const event = envelope.event
  if (event.type !== 'reaction_added' || event.item.type !== 'message') return null
  if (envelope.team_id !== policy.teamId || actor.id !== event.user || actor.isBot || !actor.active ||
    !policy.requesterIds.includes(actor.id) || !policy.channelIds.includes(event.item.channel) ||
    !policy.reactionNames.includes(event.reaction)) return null
  if (message.channelId !== event.item.channel || message.messageTs !== event.item.ts) throw new Error('Reacted message context mismatch')
  if (!/^[a-z0-9-]+\.slack\.com$/.test(policy.workspaceHost)) throw new Error('Invalid Slack workspace host')
  const reaction = incidentReactionSchema.parse({eventId:envelope.event_id,teamId:envelope.team_id,
    channelId:event.item.channel,messageTs:event.item.ts,threadTs:message.threadTs,
    eventTs:event.event_ts,userId:event.user,name:event.reaction})
  if (Number(reaction.threadTs) > Number(reaction.messageTs) || Number(reaction.messageTs) > Number(reaction.eventTs)) throw new Error('Invalid reaction event order')
  const issueUrl = slackPermalinkSchema.parse(`https://${policy.workspaceHost}/archives/${reaction.channelId}/p${reaction.messageTs.replace('.','')}`)
  return {initiation:'reaction-requested' as const,requestedBy:reaction.userId,issueUrl,reaction}
}
