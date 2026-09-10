import { readOwnTaskExpectation } from './task-expectation-store'
import { randomUUID } from 'node:crypto'
import { db } from '@gpters/db'
import { sql } from 'drizzle-orm'
import { deliverOperatorAlert, monitorDeliveryConfigured } from './monitor-notifications'
import type { BeforeSendDecision, DeliveryResult } from './monitor-notifications'
import { monitorConfiguration } from './monitor-store'
import { incidentKey } from './incident-review'
import type { IncidentCase } from './incident-review'
import type { MonitorCandidate } from './monitor-types'
import type { MonitorOutboxItem } from './monitor-types'

/** A fresh read narrows the review/send race; it cannot make SQL and Slack atomic. */
export async function monitorNoticeBeforeSend(notice:MonitorOutboxItem,noticeId:string,claimId:string,monitorId:string):Promise<BeforeSendDecision> {
  const config=monitorConfiguration()
  if(!config||config.id!==monitorId||!monitorDeliveryConfigured()||!config.agents.includes(notice.payload.agentId))return {status:'cancel',reason:'monitor-scope-changed'}
  if(notice.recipient?.kind!=='human-dm'||notice.recipient.id!==process.env.AX_MONITOR_SLACK_USER)return {status:'cancel',reason:'recipient-changed'}
  const lease=await db.execute(sql`SELECT status,claim_id,claimed_until FROM ax_monitor_outbox WHERE id=${noticeId} AND monitor_id=${monitorId}`)
  const claimed=lease.rows[0]
  const leaseUntil=claimed?.claimed_until?new Date(claimed.claimed_until as string).getTime():NaN
  if(!claimed||claimed.status!=='sending'||claimed.claim_id!==claimId||!Number.isFinite(leaseUntil)||leaseUntil<=Date.now())return {status:'cancel',reason:'claim-no-longer-active'}
  const latest=await db.execute(sql`SELECT record FROM ax_monitor_state WHERE id=${monitorId}`)
  const state=latest.rows[0]?.record as {conditions?:Record<string,{active:boolean;episode:number}>;candidates?:Record<string,MonitorCandidate>}|undefined
  const condition=state?.conditions?.[notice.candidateId]
  const candidate=state?.candidates?.[notice.candidateId]
  if(!candidate||candidate.agentId!==notice.payload.agentId||candidate.source!==notice.payload.source||!condition||condition.episode!==notice.episode||(notice.kind==='recovery'?condition.active:!condition.active))return {status:'cancel',reason:'observation-changed'}
  if(candidate.expectation) {
    if(process.env.AX_TASK_EXPECTATIONS_ENABLED!=='true')return {status:'cancel',reason:'expectations-disabled'}
    const current=await readOwnTaskExpectation({orgId:monitorId,agentId:candidate.agentId},candidate.expectation.id)
    if(!current||current.source!==candidate.source||current.taskId!==candidate.taskId||current.attemptId!==candidate.attemptId)return {status:'cancel',reason:'expectation-scope-changed'}
    // Cancellation or postponement may commit between the monitor tick and this send.
    if(current.revision!==candidate.expectation.revision)return {status:'cancel',reason:'expectation-revised'}
    const overdue=current.state==='active'&&!current.receipt&&Date.parse(current.deadlineAt)<Date.now()
    if(notice.kind==='recovery'?overdue:!overdue)return {status:'cancel',reason:'expectation-condition-changed'}
  }
  if(candidate.kind==='task-failure'&&candidate.phase&&candidate.evidence) {
    const id=incidentKey({agentId:candidate.agentId,source:candidate.source,phase:candidate.phase,evidence:candidate.evidence})
    const saved=await db.execute(sql`SELECT record FROM ax_incident_reviews WHERE id=${id}`)
    const review=saved.rows[0]?.record as IncidentCase|undefined
    if(review&&['false-positive','fixed','verified'].includes(review.state)) {
      // An old change remains on a subsequently dismissed case. False-positive
      // decisions must use the latest dismissal, not that obsolete change time.
      const decisionAt=review.history.filter(item=>item.action===review.state).at(-1)?.at??review.history.at(-1)?.at
      const cutoff=review.state==='false-positive'?decisionAt:review.change?.appliedAt??decisionAt
      if(!candidate.lastEventAt||!Number.isFinite(Date.parse(candidate.lastEventAt))||!cutoff||!Number.isFinite(Date.parse(cutoff))||Date.parse(candidate.lastEventAt)<=Date.parse(cutoff))return {status:'cancel',reason:'human-review-closed'}
    }
  }
  return {status:'allow'}
}

/** Crash after send must not silently resend: expired claims become uncertain. */
export async function flushMonitorOutbox() {
  const config=monitorConfiguration()
  if(!config||!monitorDeliveryConfigured())return {sent:0,blocked:true}
  await db.execute(sql`UPDATE ax_monitor_outbox SET status='uncertain' WHERE monitor_id=${config.id} AND status='sending' AND claimed_until<now()`)
  let sent=0
  const deadline=Date.now()+30000
  for(let i=0;i<10;i++) {
    if(Date.now()+25000>deadline)break
    const claim=randomUUID()
    const result=await db.execute(sql`UPDATE ax_monitor_outbox SET status='sending',claim_id=${claim},claimed_until=now()+interval '2 minutes',attempts=attempts+1
      WHERE id=(SELECT id FROM ax_monitor_outbox WHERE monitor_id=${config.id} AND status='pending' AND available_at<=now() AND attempts<5 ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id,payload,attempts`)
    const row=result.rows[0];if(!row)break
    const notice=row.payload as unknown as MonitorOutboxItem
    const beforeSend=()=>monitorNoticeBeforeSend(notice,String(row.id),claim,config.id)
    let initial:BeforeSendDecision
    let timer:ReturnType<typeof setTimeout>|undefined
    try{initial=await Promise.race([beforeSend(),new Promise<BeforeSendDecision>((_,reject)=>{timer=setTimeout(()=>reject(new Error('pre-send timeout')),2000)})])}
    catch{initial={status:'retry',reason:'pre-send-check-unavailable'}}
    finally{if(timer)clearTimeout(timer)}
    // Existing queue entries never authorize a new recipient after configuration changes.
    const delivery:DeliveryResult=initial.status==='allow'
      ? await deliverOperatorAlert(String(row.id),`에이전트 감시 · ${notice.kind}\n${notice.payload.kind} · ${notice.payload.agentId} · ${notice.payload.source}\n판정 전 관측입니다. 대시보드의 지속 감시에서 근거를 확인하세요.`,fetch,process.env,{beforeSend,deadlineAt:deadline-1000})
      : {status:initial.status==='cancel'?'cancelled' as const:'retry' as const,reason:initial.reason}
    if(delivery.status==='accepted') {
      await db.execute(sql`UPDATE ax_monitor_outbox SET status='delivered',delivered_at=now(),claimed_until=NULL WHERE id=${String(row.id)} AND claim_id=${claim}`)
      sent++
    }else {
      const status=delivery.status==='cancelled'?'cancelled':delivery.status==='retry'&&Number(row.attempts)<5?'pending':delivery.status==='uncertain'?'uncertain':'blocked'
      const seconds=delivery.status==='retry'?delivery.retryAfterSeconds??300:300
      await db.execute(sql`UPDATE ax_monitor_outbox SET status=${status},available_at=now()+${seconds}*interval '1 second',claimed_until=NULL WHERE id=${String(row.id)} AND claim_id=${claim}`)
    }
  }
  return {sent,blocked:false}
}
