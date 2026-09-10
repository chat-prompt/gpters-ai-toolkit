// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { incidentReportSchema, incidentSupplementSchema, allowedReportWorkspace } from '../../../../packages/lib/src/features/ax/incident-report'
import { createReportCase, appendReportSupplement, reportId } from '../../../../packages/lib/src/features/ax/incident-report-store'
import { applyIncidentAction } from '../../../../packages/lib/src/features/ax/incident-review'
import type { IncidentAction, IncidentCase, IncidentInput } from '../../../../packages/lib/src/features/ax/incident-review'

const agent={agentId:'example',orgId:'org-1'}
export const submission={title:'Wrong document',summary:'Wrong section was used',expected:'Current section',actual:'Old section',source:'unknown' as const,category:'quality' as const,occurredAt:'2026-01-01T00:00:00Z',issueUrl:'https://example.slack.com/archives/C0000000001/p1767229200000000',approvalUrl:'https://example.slack.com/archives/C0000000001/p1767229260000000',requestedBy:'U0000000001',initiation:'user-requested' as const}
const now='2026-01-05T00:00:00Z'
const input:IncidentInput={start:'2026-01-03T00:00:00Z',end:now,coverage:undefined,traces:[]}
function decide(record:IncidentCase, action:IncidentAction['action'],extra:Partial<IncidentAction>={}) {
  return applyIncidentAction(record,input,{id:record.id,revision:record.revision,days:7,action,reason:'Human reviewed',evidenceRef:submission.approvalUrl,...extra},'reviewer')
}
describe('agent problem reports',()=>{
  it('accepts taskless quality reports without creating fake failed events',()=>{
    const record=createReportCase(agent,incidentReportSchema.parse(submission),now)
    expect(record.state).toBe('candidate'); expect(record.examples).toEqual([]); expect(record.failureCount).toBe(0)
    expect(record.report?.taskId).toBeUndefined(); expect(record.report?.consentEvidence).toBe('agent-attested')
  })
  it('normalizes permalink query tracking and isolates organization/agent identity',()=>{
    const parsed=incidentReportSchema.parse({...submission,issueUrl:submission.issueUrl+'?thread_ts=1767229200.000000&cid=C0000000001'})
    expect(parsed.issueUrl).toBe(submission.issueUrl)
    expect(reportId(agent,parsed.issueUrl)).toBe(reportId(agent,submission.issueUrl))
    expect(reportId({...agent,orgId:'other'},parsed.issueUrl)).not.toBe(reportId(agent,parsed.issueUrl))
  })
  it('rejects missing approval, forged state/identity and non-message links',()=>{
    for(const patch of [{approvalUrl:''},{state:'verified'},{agentId:'other'},{issueUrl:'javascript:alert(1)'},{issueUrl:'https://example.slack.com.evil.org/archives/C0000000001/p1767229200000000'},{issueUrl:'https://example.slack.com/'}])expect(incidentReportSchema.safeParse({...submission,...patch}).success).toBe(false)
    expect(allowedReportWorkspace([submission.issueUrl],'other.slack.com')).toBe(false)
    expect(allowedReportWorkspace([submission.issueUrl],'example.slack.com')).toBe(true)
  })
  it('requires textual request metadata and refuses future occurrence/retest claims',()=>{
    expect(incidentReportSchema.safeParse({...submission,initiation:'reaction'}).success).toBe(false)
    expect(()=>createReportCase(agent,{...submission,occurredAt:'2027-01-01T00:00:00Z'},now)).toThrow('미래')
    expect(incidentSupplementSchema.safeParse({updateId:'00000000-0000-4000-8000-000000000001',kind:'retest-result',summary:'Pass',evidenceUrl:submission.issueUrl}).success).toBe(false)
  })
  it('keeps human decisions unchanged while appending and deduplicating supplements',()=>{
    const c=decide(createReportCase(agent,submission,now),'confirmed')
    const note=incidentSupplementSchema.parse({updateId:'00000000-0000-4000-8000-000000000001',kind:'context',summary:'More evidence',evidenceUrl:submission.issueUrl})
    const next=appendReportSupplement(c,note,now)
    expect(next.state).toBe('confirmed');expect(next.revision).toBe(c.revision+1);expect(next.report?.pendingReview).toBe(true)
    expect(appendReportSupplement(next,note,now)).toBe(next)
    expect(()=>appendReportSupplement(next,{...note,summary:'Changed'},now)).toThrow('updateId')
  })
  it('supports needs-info, fix and human acceptance without relying on telemetry availability',()=>{
    let c=createReportCase(agent,submission,now)
    c=decide(c,'needs-info');expect(c.state).toBe('needs-info')
    c=decide(c,'confirmed'); c=decide(c,'fixed',{appliedAt:'2026-01-02T00:00:00Z',changeRef:'commit:example',rollbackRef:'private:rollback'})
    expect(()=>decide(c,'verified')).toThrow('재검증 보고')
    const note=incidentSupplementSchema.parse({updateId:'00000000-0000-4000-8000-000000000001',kind:'retest-result',summary:'Reproduced after fix',evidenceUrl:submission.issueUrl,testedAt:'2026-01-04T00:00:00Z',outcome:'passed'})
    c=appendReportSupplement(c,note,now);expect(c.state).toBe('fixed')
    const accepted=decide(c,'verified');expect(accepted.verification?.basis).toBe('operator-evidence');expect(accepted.report?.pendingReview).toBe(false)
    const failed=appendReportSupplement(c,{...note,updateId:'00000000-0000-4000-8000-000000000002',testedAt:'2026-01-04T00:00:00.000Z',outcome:'failed'},now)
    expect(()=>decide(failed,'verified')).toThrow('재검증 보고')
    expect(decide(failed,'reviewing').state).toBe('reviewing')
    const more=appendReportSupplement(accepted,{...note,updateId:'00000000-0000-4000-8000-000000000003'},now)
    expect(more.state).toBe('verified');expect(decide(more,'reviewing').state).toBe('reviewing')
  })
})
