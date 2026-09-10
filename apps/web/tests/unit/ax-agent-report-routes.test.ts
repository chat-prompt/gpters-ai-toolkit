// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { incidentReportSchema, incidentSupplementSchema, allowedReportWorkspace } from '../../../../packages/lib/src/features/ax/incident-report'
const mocks=vi.hoisted(()=>({auth:vi.fn(),submit:vi.fn(),read:vi.fn(),append:vi.fn()}))
class IncidentConflict extends Error {}
class IncidentValidationError extends Error {}
vi.mock('@gpters/lib/security',()=>({authenticateAgent:mocks.auth}))
vi.mock('@/lib/features/ax',()=>({incidentReportSchema,incidentSupplementSchema,allowedReportWorkspace,submitIncidentReport:mocks.submit,readOwnIncidentReport:mocks.read,supplementIncidentReport:mocks.append,IncidentConflict,IncidentValidationError}))
vi.mock('@/lib/utils/rate-limit',()=>({withRateLimit:()=>null,RateLimitPresets:{standard:{}}}))
const {POST}=await import('../../app/api/ax/agent-reports/route')
const {GET,POST:APPEND}=await import('../../app/api/ax/agent-reports/[id]/route')
const agent={agentId:'example',orgId:'org-1',ownerUserId:'owner',allowDeploy:false}
const id='report_'+'a'.repeat(32), token='aia_'+'a'.repeat(64)
const body={title:'Example',summary:'Incorrect result',expected:'Correct result',actual:'Incorrect result',source:'unknown',category:'quality',occurredAt:'2026-01-01T00:00:00Z',issueUrl:'https://example.slack.com/archives/C0000000001/p1767229200000000',approvalUrl:'https://example.slack.com/archives/C0000000001/p1767229260000000',requestedBy:'U0000000001',initiation:'user-requested'}
const context={params:Promise.resolve({id})}
function request(value:unknown=body,credential=token,method='POST') {return new NextRequest('https://toolkit.example.org/api/ax/agent-reports'+(method==='GET'?'/'+id:''),{method,headers:{authorization:'Bearer '+credential,'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(value)})})}
describe('agent report HTTP boundary',()=>{
  beforeEach(()=>{
    vi.stubEnv('AX_INCIDENT_REVIEW_ENABLED','true');vi.stubEnv('AX_INCIDENT_AGENT_REPORTS_ENABLED','true');vi.stubEnv('AX_INCIDENT_ORG_ID','org-1');vi.stubEnv('AX_INCIDENT_SLACK_HOST','example.slack.com')
    for(const mock of Object.values(mocks))mock.mockReset()
    mocks.auth.mockResolvedValue(agent);mocks.submit.mockResolvedValue({record:{id,state:'candidate',revision:1},replayed:false})
  })
  afterEach(()=>vi.unstubAllEnvs())
  it('accepts authenticated reports without deploy permission and returns a review deep link',async()=>{
    const response=await POST(request());expect(response.status).toBe(201)
    const result=await response.json();expect(result.url).toBe(`https://toolkit.example.org/en/ax?panel=agent-incidents&incident=${id}`)
    expect(mocks.submit).toHaveBeenCalledWith(agent,body);expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it.each(['human-token','agt_'+'a'.repeat(64),''])('does not use alternative credentials %s',async credential=>{
    expect((await POST(request(body,credential))).status).toBe(401);expect(mocks.submit).not.toHaveBeenCalled()
  })
  it('rejects revoked credentials, foreign organizations and closed enrollment',async()=>{
    mocks.auth.mockResolvedValueOnce(null);expect((await POST(request())).status).toBe(401)
    mocks.auth.mockResolvedValueOnce({...agent,orgId:'org-2'});expect((await POST(request())).status).toBe(403)
    vi.stubEnv('AX_INCIDENT_AGENT_REPORTS_ENABLED','false');expect((await POST(request())).status).toBe(503)
  })
  it('rejects forged review/agent fields and approval links from another workspace',async()=>{
    expect((await POST(request({...body,state:'verified'}))).status).toBe(400)
    expect((await POST(request({...body,agentId:'other'}))).status).toBe(400)
    expect((await POST(request({...body,approvalUrl:''}))).status).toBe(400)
    expect((await POST(request({...body,approvalUrl:body.approvalUrl.replace('example.slack','outside.slack')}))).status).toBe(400)
    expect(mocks.submit).not.toHaveBeenCalled()
  })
  it('returns replay receipts and conflicts without duplicating reports',async()=>{
    mocks.submit.mockResolvedValueOnce({record:{id,state:'confirmed',revision:2},replayed:true})
    expect((await POST(request())).status).toBe(200)
    mocks.submit.mockRejectedValueOnce(new IncidentConflict('already submitted'))
    expect((await POST(request())).status).toBe(409)
  })
  it('rejects oversized bodies even without a content-length header',async()=>{
    expect((await POST(request({...body,summary:'x'.repeat(17000)})))).toHaveProperty('status',400)
    expect(mocks.submit).not.toHaveBeenCalled()
  })
  it('reads only the authenticated agent scope and does not expose actor IDs or hashes',async()=>{
    mocks.read.mockResolvedValueOnce({id,state:'needs-info',revision:2,history:[{at:'now',actor:'private-user-id',action:'needs-info',reason:'Please reproduce',evidenceRef:body.issueUrl}],report:{pendingReview:false,supplements:[]}})
    const response=await GET(request(null,token,'GET'),context)
    expect(mocks.read).toHaveBeenCalledWith(agent,id)
    const text=await response.text();expect(text).toContain('Please reproduce');expect(text).not.toContain('private-user-id')
    mocks.read.mockResolvedValueOnce(null);expect((await GET(request(null,token,'GET'),context)).status).toBe(404)
  })
  it('supports scoped supplements but never accepts a final decision',async()=>{
    const note={updateId:'00000000-0000-4000-8000-000000000001',kind:'context',summary:'Details',evidenceUrl:body.issueUrl}
    mocks.append.mockResolvedValueOnce({record:{id,state:'confirmed',revision:3},replayed:false})
    expect((await APPEND(request(note),context)).status).toBe(200);expect(mocks.append).toHaveBeenCalledWith(agent,id,note)
    expect((await APPEND(request({...note,state:'verified'}),context)).status).toBe(400)
    mocks.append.mockResolvedValueOnce(null);expect((await APPEND(request(note),context)).status).toBe(404)
  })
})
