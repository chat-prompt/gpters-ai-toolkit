// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IncidentCase } from '../../../../packages/lib/src/features/ax/incident-review'
import type { MonitorCandidate, MonitorOutboxItem } from '../../../../packages/lib/src/features/ax/monitor-types'
const mocks=vi.hoisted(()=>({execute:vi.fn(),config:vi.fn()}))
vi.mock('@gpters/db',()=>({db:{execute:mocks.execute}}))
vi.mock('../../../../packages/lib/src/features/ax/monitor-store',()=>({monitorConfiguration:mocks.config}))
import { deliverOperatorAlert } from '../../../../packages/lib/src/features/ax/monitor-notifications'
import { monitorNoticeBeforeSend } from '../../../../packages/lib/src/features/ax/monitor-outbox'

const env={AX_MONITOR_ALERTS_ENABLED:'true',AX_MONITOR_SLACK_TOKEN:'synthetic-token',AX_MONITOR_SLACK_USER:'U000000001'}
const opened=()=>Response.json({ok:true,channel:{id:'D000000001'}})
const accepted=()=>Response.json({ok:true,ts:'1789000000.000001'})
const candidate:MonitorCandidate={id:'candidate-a',kind:'task-failure',agentId:'example-agent',source:'codex',phase:'execution',evidence:'process',state:'candidate',firstObservedAt:'2026-01-01T00:00:00Z',lastObservedAt:'2026-01-03T00:00:00Z',lastEventAt:'2026-01-02T00:00:00Z',eventCount:1,observationActive:true,needsReview:false}
const notice:MonitorOutboxItem={id:'notice-a',candidateId:candidate.id,episode:1,kind:'first',queuedAt:'2026-01-03T00:00:00Z',recipient:{kind:'human-dm',id:env.AX_MONITOR_SLACK_USER},payload:{kind:candidate.kind,agentId:candidate.agentId,source:candidate.source,state:'candidate',needsReview:false}}
function review(state:IncidentCase['state']='confirmed'):IncidentCase {
  return {id:'case-a',revision:2,agentId:candidate.agentId,source:'codex',phase:'execution',evidence:'process',state,
    createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-03T00:00:00Z',lastFailureAt:candidate.lastEventAt!,lastFailureIds:['event'],failureCount:1,examples:[],
    history:[{at:'2026-01-03T00:00:00Z',actor:'operator',action:state,reason:'Synthetic review',evidenceRef:'private:fixture'}],
    change:{appliedAt:'2026-01-01T00:00:00Z',reference:'fixture',rollbackRef:'fixture',baseline:{start:'2025-12-31T00:00:00Z',end:'2026-01-01T00:00:00Z',failed:1,terminal:1,unresolved:0,complete:true}}}
}
function installReads(current:()=>IncidentCase,lease:Record<string,unknown>={status:'sending',claim_id:'claim-a',claimed_until:'2099-01-01T00:00:00Z'}) {
  let index=0
  mocks.execute.mockImplementation(async()=>{
    const stage=index++%3
    return {rows:stage===0?[lease]:stage===1?[{record:{conditions:{[candidate.id]:{active:true,episode:1}},candidates:{[candidate.id]:candidate}}}]:[{record:current()}]}
  })
}
beforeEach(()=>{
  vi.resetAllMocks()
  Object.entries(env).forEach(([key,value])=>vi.stubEnv(key,value))
  mocks.config.mockReturnValue({id:'monitor-a',agents:['example-agent']})
})
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers()})

describe('latest pre-send decision',()=>{
  it('rechecks a human dismissal made while Slack DM opening was in progress',async()=>{
    let current=review()
    installReads(()=>current)
    const check=()=>monitorNoticeBeforeSend(notice,notice.id,'claim-a','monitor-a')
    expect(await check()).toEqual({status:'allow'})
    const fetcher=vi.fn().mockImplementationOnce(async()=>{current=review('false-positive');return opened()})
    const result=await deliverOperatorAlert(notice.id,'fixture',fetcher,env,{beforeSend:check})
    expect(result).toMatchObject({status:'cancelled',reason:'human-review-closed'})
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0]).toContain('conversations.open')
    expect(mocks.execute).toHaveBeenCalledTimes(6)
  })
  it('uses the latest false-positive decision instead of a stale change timestamp',async()=>{
    installReads(()=>review('false-positive'))
    expect(await monitorNoticeBeforeSend(notice,notice.id,'claim-a','monitor-a')).toMatchObject({status:'cancel',reason:'human-review-closed'})
  })
  it('retains the applied change cutoff for genuinely newer fixed/verified evidence',async()=>{
    for(const state of ['fixed','verified'] as const){
      mocks.execute.mockReset();installReads(()=>review(state))
      expect(await monitorNoticeBeforeSend(notice,notice.id,'claim-a','monitor-a')).toEqual({status:'allow'})
    }
  })
  it('cancels revoked scope, changed recipient and expired or replaced claims',async()=>{
    mocks.config.mockReturnValue({id:'monitor-a',agents:['another-agent']})
    expect((await monitorNoticeBeforeSend(notice,notice.id,'claim-a','monitor-a')).status).toBe('cancel')
    expect(mocks.execute).not.toHaveBeenCalled()
    mocks.config.mockReturnValue({id:'monitor-a',agents:['example-agent']})
    expect((await monitorNoticeBeforeSend({...notice,recipient:{kind:'human-dm',id:'U000000002'}},notice.id,'claim-a','monitor-a')).status).toBe('cancel')
    for(const lease of [{status:'sending',claim_id:'old-claim',claimed_until:'2099-01-01T00:00:00Z'},{status:'sending',claim_id:'claim-a',claimed_until:'2020-01-01T00:00:00Z'},{status:'uncertain',claim_id:'claim-a',claimed_until:'2099-01-01T00:00:00Z'}]){
      mocks.execute.mockReset();installReads(()=>review(),lease)
      expect(await monitorNoticeBeforeSend(notice,notice.id,'claim-a','monitor-a')).toMatchObject({status:'cancel',reason:'claim-no-longer-active'})
    }
  })
})

describe('bounded notification send',()=>{
  it('runs its final guard after DM resolution and before the single message POST',async()=>{
    const order:string[]=[]
    const fetcher=vi.fn().mockImplementationOnce(async()=>{order.push('open');return opened()}).mockImplementationOnce(async()=>{order.push('post');return accepted()})
    const result=await deliverOperatorAlert('notice','fixture',fetcher,env,{beforeSend:async()=>{order.push('guard');return {status:'allow'}}})
    expect(result.status).toBe('accepted');expect(order).toEqual(['open','guard','post'])
  })
  it('retries known pre-send DB failures without a message POST',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(opened())
    expect(await deliverOperatorAlert('notice','fixture',fetcher,env,{beforeSend:async()=>{throw new Error('private database unavailable')}})).toMatchObject({status:'retry',reason:'pre-send-check-unavailable'})
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('bounds an unresponsive final check and does not send after it eventually resolves',async()=>{
    vi.useFakeTimers()
    let resolve!:(value:{status:'allow'})=>void
    const guard=new Promise<{status:'allow'}>(done=>{resolve=done})
    const fetcher=vi.fn().mockResolvedValueOnce(opened())
    const result=deliverOperatorAlert('notice','fixture',fetcher,env,{beforeSend:()=>guard})
    await vi.advanceTimersByTimeAsync(2001)
    expect(await result).toMatchObject({status:'retry',reason:'pre-send-check-unavailable'})
    resolve({status:'allow'});await Promise.resolve()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('stops before POST when DM or final check consumed the remaining time budget',async()=>{
    let now=0
    const slowOpen=vi.fn().mockImplementation(async()=>{now=15000;return opened()})
    expect(await deliverOperatorAlert('notice','fixture',slowOpen,env,{now:()=>now,deadlineAt:25000})).toMatchObject({status:'retry',reason:'insufficient-send-budget'})
    expect(slowOpen).toHaveBeenCalledTimes(1)
    now=0
    const fetcher=vi.fn().mockResolvedValueOnce(opened())
    expect(await deliverOperatorAlert('notice','fixture',fetcher,env,{now:()=>now,deadlineAt:25000,beforeSend:async()=>{now=16000;return {status:'allow'}}})).toMatchObject({status:'retry',reason:'insufficient-send-budget'})
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('preserves uncertainty once POST was attempted, and cancels mutated configuration before POST',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(opened()).mockRejectedValueOnce(new Error('response lost'))
    expect((await deliverOperatorAlert('notice','fixture',fetcher,env,{beforeSend:async()=>({status:'allow'})})).status).toBe('uncertain')
    const changed={...env},noPost=vi.fn().mockResolvedValueOnce(opened())
    expect(await deliverOperatorAlert('notice','fixture',noPost,changed,{beforeSend:async()=>{changed.AX_MONITOR_SLACK_USER='U000000002';return {status:'allow'}}})).toMatchObject({status:'cancelled',reason:'delivery-configuration-changed'})
    expect(noPost).toHaveBeenCalledTimes(1)
  })
})
