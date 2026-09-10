// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureSlackReaction } from '../../../../infra/agent-reports/slack-reaction'
import { allowedReactionReport, incidentReportSchema } from '../../../../packages/lib/src/features/ax/incident-report'
import { createReportCase, reportId } from '../../../../packages/lib/src/features/ax/incident-report-store'

const envelope={event_id:'Ev000000001',team_id:'T000000001',event:{type:'reaction_added',user:'U000000001',reaction:'rage',event_ts:'1767229400.000001',item:{type:'message',channel:'D000000001',ts:'1767229300.000001'}}}
const actor={id:'U000000001',isBot:false,active:true}
const message={channelId:'D000000001',messageTs:'1767229300.000001',threadTs:'1767229200.000001'}
const policy={workspaceHost:'example.slack.com',teamId:'T000000001',channelIds:['D000000001'],requesterIds:['U000000001'],reactionNames:['rage']}
const details={title:'Synthetic example',summary:'Synthetic feedback',expected:'Expected behavior',actual:'Observed behavior',source:'unknown',category:'quality',occurredAt:'2026-01-01T00:00:00Z'}
const submission=()=>incidentReportSchema.parse({...details,...captureSlackReaction(envelope,actor,message,policy)})
afterEach(()=>vi.unstubAllEnvs())
describe('reaction intake metadata',()=>{
  it('preserves the exact reply identity, actor and event without fabricating text approval',()=>{
    const report=submission()
    expect(report.issueUrl).toBe('https://example.slack.com/archives/D000000001/p1767229300000001')
    expect(report.reaction?.threadTs).toBe(message.threadTs)
    expect(report.reaction?.eventId).toBe(envelope.event_id)
    expect(report.requestedBy).toBe(actor.id);expect(report.approvalUrl).toBeUndefined()
  })
  it('does not treat removed reactions, bots, foreign channels or unknown users as requests',()=>{
    expect(captureSlackReaction({...envelope,event:{...envelope.event,type:'reaction_removed'}},actor,message,policy)).toBeNull()
    for(const a of [{...actor,isBot:true},{...actor,active:false},{...actor,id:'U000000002'}]) expect(captureSlackReaction(envelope,a,message,policy)).toBeNull()
    for(const p of [{...policy,channelIds:[]},{...policy,requesterIds:[]},{...policy,reactionNames:[]},{...policy,teamId:'T000000002'}]) expect(captureSlackReaction(envelope,actor,message,p)).toBeNull()
  })
  it('fails on missing or mismatched exact-message context instead of guessing the root',()=>{
    expect(()=>captureSlackReaction(envelope,actor,{...message,messageTs:message.threadTs},policy)).toThrow('mismatch')
    expect(()=>captureSlackReaction(envelope,actor,{...message,threadTs:'1767229500.000001'},policy)).toThrow('order')
  })
  it('rejects invented approval, mismatched actor, root permalink and future reaction',()=>{
    const report=submission()
    for(const patch of [{approvalUrl:report.issueUrl},{requestedBy:'U000000002'},{reaction:undefined},{issueUrl:report.issueUrl.replace('9300000001','9200000001')}]) expect(incidentReportSchema.safeParse({...report,...patch}).success).toBe(false)
    expect(()=>createReportCase({agentId:'example',orgId:'org-1'},report,'2026-01-01T00:00:00Z')).toThrow('미래')
  })
  it('fails closed until a team, emoji and explicit requester are enrolled',()=>{
    const report=submission();expect(allowedReactionReport(report)).toBe(false)
    vi.stubEnv('AX_INCIDENT_REACTION_REPORTS_ENABLED','true');vi.stubEnv('AX_INCIDENT_SLACK_TEAM_ID',policy.teamId);vi.stubEnv('AX_INCIDENT_REACTION_NAMES','rage');vi.stubEnv('AX_INCIDENT_REACTION_REQUESTER_IDS',actor.id);vi.stubEnv('AX_INCIDENT_REACTION_CHANNEL_IDS',message.channelId)
    expect(allowedReactionReport(report)).toBe(true)
    vi.stubEnv('AX_INCIDENT_REACTION_REQUESTER_IDS','U000000002');expect(allowedReactionReport(report)).toBe(false)
  })
  it('keeps one problem identity across different reaction deliveries on the same message',()=>{
    const first=submission(),second={...first,reaction:{...first.reaction!,eventId:'Ev000000002',eventTs:'1767229500.000001'}}
    const principal={agentId:'example',orgId:'org-1'}
    expect(reportId(principal,first.issueUrl)).toBe(reportId(principal,second.issueUrl))
    const record=createReportCase(principal,first,'2026-01-02T00:00:00Z')
    expect(record.state).toBe('candidate');expect(record.failureCount).toBe(0);expect(record.report?.reaction?.userId).toBe(actor.id)
  })
})
