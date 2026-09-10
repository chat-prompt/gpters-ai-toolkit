import { readRegisteredTaskExpectations } from './task-expectation-store'
import { reconcileTaskExpectations, projectTaskExpectation } from './task-expectations'
import type { TaskExpectation } from './task-expectations'
import { db } from '@gpters/db'
import { sql } from 'drizzle-orm'
import { emptyMonitorState, reduceMonitor, monitorEventIdentity } from './monitor-engine'
import { agentTaskEventSchema, buildAgentTaskTraces } from './agent-task-events'
import { projectIncidentCases, incidentKey } from './incident-review'
import { agentObservabilitySchema } from './agent-observability-contract'
import type { IncidentCase } from './incident-review'
import type { MonitorState, MonitorObservation, MonitorCollector, MonitorOutboxItem, MonitorDashboardData, MonitorSource, MonitorReceiptExpectation } from './monitor-types'

const sources = new Set(['claude-code','codex','openclaw','hermes'])
export function monitorConfiguration() {
  const id=process.env.AX_INCIDENT_ORG_ID
  const agents=(process.env.AX_MONITOR_AGENT_IDS??'').split(',').map(s=>s.trim()).filter(Boolean)
  if(process.env.AX_MONITOR_ENABLED!=='true'||!id||!agents.length||agents.some(a=>! /^[a-z0-9][a-z0-9._:-]{0,99}$/.test(a))) return null
  return {id,agents}
}
/** One PostgreSQL statement commits projection, consumption and outbox together. */
export async function commitMonitor(id:string, revision:number, state:MonitorState, batches:string[], outbox:MonitorOutboxItem[], candidates:IncidentCase[], deferred:Array<{batchId:string;reason:string;retryAfter:string}>=[], expectationChanges:Array<{previousRevision:number;record:TaskExpectation}>=[]) {
  const result=await db.execute(sql`
    WITH changed AS (
      UPDATE ax_monitor_state SET revision=revision+1, record=${JSON.stringify(state)}::jsonb,
        last_success_at=${state.lastSuccessAt}::timestamptz, updated_at=now()
      WHERE id=${id} AND revision=${revision}
      ${expectationChanges.length ? sql`AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(${JSON.stringify(expectationChanges)}::jsonb) AS change(value) LEFT JOIN ax_task_expectations e ON e.id=change.value->'record'->>'id' AND e.org_id=${id} WHERE e.revision IS DISTINCT FROM (change.value->>'previousRevision')::int)` : sql``}
      RETURNING id
    ), consumed AS (
      INSERT INTO ax_monitor_processed_batches(monitor_id,batch_id)
      SELECT changed.id, value FROM changed CROSS JOIN jsonb_array_elements_text(${JSON.stringify(batches)}::jsonb)
      ON CONFLICT DO NOTHING
    ), notices AS (
      INSERT INTO ax_monitor_outbox(id,monitor_id,payload)
      SELECT value->>'id',changed.id,value FROM changed CROSS JOIN jsonb_array_elements(${JSON.stringify(outbox)}::jsonb)
      ON CONFLICT DO NOTHING
    ), deferred_rows AS (
      INSERT INTO ax_monitor_deferred_batches(monitor_id,batch_id,reason,retry_after)
      SELECT changed.id,value->>'batchId',value->>'reason',(value->>'retryAfter')::timestamptz FROM changed CROSS JOIN jsonb_array_elements(${JSON.stringify(deferred)}::jsonb)
      ON CONFLICT(monitor_id,batch_id) DO UPDATE SET reason=excluded.reason,retry_after=excluded.retry_after
    ), clear_deferred AS (
      DELETE FROM ax_monitor_deferred_batches d USING changed WHERE d.monitor_id=changed.id AND d.batch_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(batches)}::jsonb))
    ) ${expectationChanges.length ? sql`, completed_expectations AS (
      UPDATE ax_task_expectations e SET revision=(change.value->'record'->>'revision')::int,record=change.value->'record',updated_at=now()
      FROM changed, jsonb_array_elements(${JSON.stringify(expectationChanges)}::jsonb) AS change(value)
      WHERE e.id=change.value->'record'->>'id' AND e.org_id=changed.id AND e.revision=(change.value->>'previousRevision')::int
    )` : sql``}, cases AS (
      INSERT INTO ax_incident_reviews(id,revision,record)
      SELECT value->>'id',1,jsonb_set(value,'{revision}','1'::jsonb) FROM changed CROSS JOIN jsonb_array_elements(${JSON.stringify(candidates)}::jsonb)
      ON CONFLICT DO NOTHING
    ) SELECT id FROM changed`)
  return result.rows.length===1
}
export async function runAgentMonitor() {
  const config=monitorConfiguration();if(!config)throw new Error('Monitor not configured')
  await db.execute(sql`INSERT INTO ax_monitor_state(id,record) VALUES(${config.id},${JSON.stringify(emptyMonitorState())}::jsonb) ON CONFLICT DO NOTHING`)
  for(let retry=0;retry<3;retry++) {
    const stored=await db.execute(sql`SELECT revision,record FROM ax_monitor_state WHERE id=${config.id}`)
    const row=stored.rows[0] as {revision:number;record:MonitorState & {receiptExpectations?:Record<string,MonitorReceiptExpectation>;receiptFacts?:Record<string,NonNullable<MonitorReceiptExpectation['receipt']>>}}
    const registered=process.env.AX_TASK_EXPECTATIONS_ENABLED==='true'?await readRegisteredTaskExpectations(config.id,config.agents,Object.values(row.record.candidates).flatMap(candidate=>candidate.expectation?[candidate.expectation.id]:[])):[]
    const reviews=await db.execute(sql`SELECT id,record FROM ax_incident_reviews WHERE record->>'agentId' IN (SELECT jsonb_array_elements_text(${JSON.stringify(config.agents)}::jsonb))`)
    const reviewMap=new Map(reviews.rows.map(r=>[String(r.id),r.record as unknown as IncidentCase]))
    const hydrateReviews=(state:MonitorState)=>{
      for(const candidate of Object.values(state.candidates)) {
        if(candidate.kind!=='task-failure'||!candidate.phase||!candidate.evidence)continue
        const review=reviewMap.get(incidentKey({agentId:candidate.agentId,source:candidate.source,phase:candidate.phase,evidence:candidate.evidence}))
        if(!review)continue
        candidate.state=review.state
        const reviewedAt=review.history.at(-1)?.at
        const threshold=review.state==='false-positive'?reviewedAt:(review.change?.appliedAt??reviewedAt)
        candidate.lastReviewedAt=threshold
        candidate.needsReview=!!(candidate.lastEventAt&&threshold&&Date.parse(candidate.lastEventAt)>Date.parse(threshold)&&['false-positive','fixed','verified'].includes(review.state))
      }
    }
    hydrateReviews(row.record)
    const page=await db.execute(sql`SELECT batch_id,agent_id,runtime,collection FROM ax_agent_telemetry_batches b
      WHERE agent_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(config.agents)}::jsonb))
      AND NOT EXISTS(SELECT 1 FROM ax_monitor_processed_batches p WHERE p.monitor_id=${config.id} AND p.batch_id=b.batch_id)
      AND NOT EXISTS(SELECT 1 FROM ax_monitor_deferred_batches d WHERE d.monitor_id=${config.id} AND d.batch_id=b.batch_id AND d.retry_after>now())
      ORDER BY created_at,batch_id LIMIT 201`)
    let caughtUp=page.rows.length<=200
    const batches=page.rows.slice(0,200) as Array<{batch_id:string;agent_id:string;runtime:unknown;collection:{source?:string;taskEvents?:unknown[];observability?:unknown}}>
    const now=new Date().toISOString();let position=BigInt(row.record.cursor)
    const observations:MonitorObservation[]=[]
    const expectations={...(row.record.receiptExpectations??{})}
    const receiptFacts={...(row.record.receiptFacts??{})}
    const deferred:Array<{batchId:string;reason:string;retryAfter:string}>=[]
    const processed:string[]=[]
    const seenDigests={...row.record.seenEvents}
    for(const batch of batches) {
      try {
        if(!sources.has(batch.collection.source??''))throw new Error('invalid')
        const events=(batch.collection.taskEvents??[]).map(raw=>agentTaskEventSchema.parse(raw))
        const dates=events.map(event=>Date.parse(event.atUtc))
        if(batch.collection.observability){const o=agentObservabilitySchema.parse(batch.collection.observability);if(o.agentId!==batch.agent_id||o.source!==batch.collection.source)throw new Error('invalid');dates.push(...o.receipts.map(r=>Date.parse(r.atUtc)));for(const r of o.receipts){if(r.kind==='scheduler')continue;events.push(agentTaskEventSchema.parse({taskId:r.taskId,attemptId:r.attemptId,eventId:r.receiptId,atUtc:r.atUtc,phase:r.kind==='process'?'execution':'delivery',status:r.status,evidence:r.kind==='process'?'process':'api',...(r.durationMs===undefined?{}:{durationMs:r.durationMs})}))}}
        const future=Math.max(0,...dates)
        if(future>Date.parse(now)){deferred.push({batchId:batch.batch_id,reason:'clock-ahead',retryAfter:new Date(Math.min(future,Date.parse(now)+86400000)).toISOString()});continue}
        const batchDigests:Record<string,string>={}
        for(const event of events){const identity=monitorEventIdentity(batch.agent_id,batch.collection.source!,event);const prior=batchDigests[identity.key]??seenDigests[identity.key];if(prior&&prior!==identity.digest)throw new Error('conflicting-event');batchDigests[identity.key]=identity.digest}
        Object.assign(seenDigests,batchDigests)
      } catch {deferred.push({batchId:batch.batch_id,reason:'invalid-stored-batch',retryAfter:new Date(Date.parse(now)+86400000).toISOString()});continue}
      processed.push(batch.batch_id)
      if(!sources.has(batch.collection.source??''))throw new Error('Unsupported stored source')
      if(batch.collection.observability) {
        const observation=agentObservabilitySchema.parse(batch.collection.observability)
        if(observation.agentId!==batch.agent_id||observation.source!==batch.collection.source)throw new Error('Stored observation scope mismatch')
        for(const receipt of observation.receipts) {
          if(Date.parse(receipt.atUtc)>Date.parse(now))throw new Error('Stored receipt clock is ahead')
          if(receipt.kind==='scheduler')continue
          const phase=receipt.kind==='process'?'execution':'delivery'
          observations.push({position:String(++position),agentId:batch.agent_id,source:observation.source,event:{taskId:receipt.taskId,attemptId:receipt.attemptId,eventId:receipt.receiptId,atUtc:receipt.atUtc,phase,status:receipt.status,evidence:receipt.kind==='process'?'process':'api',...(receipt.durationMs===undefined?{}:{durationMs:receipt.durationMs})}})
          if(phase==='delivery') {
            const id=JSON.stringify([batch.agent_id,observation.source,receipt.taskId,receipt.attemptId])
            const prior=expectations[id]
            if(receipt.status==='succeeded')receiptFacts[id]={at:receipt.atUtc,evidence:'api',independentlyVerified:false}
            if(receipt.expectedDeadlineUtc||prior)expectations[id]={id,agentId:batch.agent_id,source:observation.source,taskId:receipt.taskId,attemptId:receipt.attemptId,phase:'delivery',deadlineAt:prior?.deadlineAt??receipt.expectedDeadlineUtc!,requiredEvidence:'reported',receipt:receiptFacts[id]??prior?.receipt??null}
          }
        }
      }
      for(const raw of batch.collection.taskEvents??[]) {
        const event=agentTaskEventSchema.parse(raw)
        if(Date.parse(event.atUtc)>Date.parse(now))throw new Error('Stored event clock is ahead')
        observations.push({position:String(++position),agentId:batch.agent_id,source:batch.collection.source as MonitorSource,event})
      }
    }
    const records=await db.execute(sql`SELECT collector_id,agent_id,source,created_at,last_success_at,interval_seconds,is_active FROM ax_agent_telemetry_collectors
      WHERE agent_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(config.agents)}::jsonb))`)
    const collectors=records.rows.filter(r=>sources.has(String(r.source))).map(r=>({collectorId:String(r.collector_id),agentId:String(r.agent_id),source:r.source as MonitorSource,
      registeredAt:new Date(r.created_at as string).toISOString(),lastSuccessAt:r.last_success_at?new Date(r.last_success_at as string).toISOString():null,
      intervalSeconds:Number(r.interval_seconds),enabled:Boolean(r.is_active)})) satisfies MonitorCollector[]
    const deferredCount=await db.execute(sql`SELECT count(*)::int AS count FROM ax_monitor_deferred_batches d JOIN ax_agent_telemetry_batches b USING(batch_id) WHERE monitor_id=${config.id} AND b.agent_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(config.agents)}::jsonb)) AND batch_id NOT IN (SELECT jsonb_array_elements_text(${JSON.stringify(processed)}::jsonb))`)
    caughtUp=caughtUp&&deferred.length===0&&Number(deferredCount.rows[0].count)===0
    const expectationChanges:Array<{previousRevision:number;record:TaskExpectation}>=[]
    const explicit=reconcileTaskExpectations(registered,observations,now).map((next,index)=>{if(next!==registered[index])expectationChanges.push({previousRevision:registered[index].revision,record:next});return projectTaskExpectation(next)})
    const projected=reduceMonitor({state:row.record,observations,collectors,receiptExpectations:[...Object.values(expectations),...explicit],now,caughtUp,
      policy:{enabled:false}})
    hydrateReviews(projected.state)
    const result=reduceMonitor({state:projected.state,observations:[],collectors:[],receiptExpectations:[],now,caughtUp,
      policy:{allowedAgentIds:config.agents,enabled:process.env.AX_MONITOR_ALERTS_ENABLED==='true',humanRecipientId:process.env.AX_MONITOR_SLACK_USER}})
    Object.assign(result.state,{receiptExpectations:expectations,receiptFacts})
    const traces=buildAgentTaskTraces(observations.map(o=>({agentId:o.agentId,runtime:{collectorVersion:'monitor'},collection:{source:o.source,taskEvents:[o.event]}})),new Date(0),new Date(now))
    const candidates=projectIncidentCases({traces,start:new Date(0).toISOString(),end:now,coverage:{limitPerStream:100,truncatedStreams:[]}},[])
    if(await commitMonitor(config.id,Number(row.revision),result.state,processed,result.outbox,candidates,deferred,expectationChanges))return {processedBatches:processed.length,deferredBatches:deferred.length,events:observations.length,queued:result.outbox.length,caughtUp}
  }
  throw new Error('Concurrent monitor update; retry next tick')
}
export async function readAgentMonitor():Promise<MonitorDashboardData|null> {
  const config=monitorConfiguration();if(!config)return null
  const stored=await db.execute(sql`SELECT record,last_success_at FROM ax_monitor_state WHERE id=${config.id}`)
  const state=stored.rows[0]?.record as MonitorState|undefined
  const counts=await db.execute(sql`SELECT
    (SELECT count(*)::int FROM ax_agent_telemetry_batches b WHERE agent_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(config.agents)}::jsonb)) AND NOT EXISTS(SELECT 1 FROM ax_monitor_processed_batches p WHERE p.monitor_id=${config.id} AND p.batch_id=b.batch_id)) AS backlog,
    (SELECT count(*)::int FROM ax_monitor_outbox WHERE monitor_id=${config.id} AND status IN ('pending','sending')) AS pending,
    (SELECT count(*)::int FROM ax_monitor_outbox WHERE monitor_id=${config.id} AND status='uncertain') AS uncertain,
    (SELECT count(*)::int FROM ax_monitor_outbox WHERE monitor_id=${config.id} AND status='blocked') AS blocked`)
  const candidates=Object.values(state?.candidates??{}).sort((a,b)=>b.lastObservedAt.localeCompare(a.lastObservedAt))
  return {lastSuccessAt:state?.lastSuccessAt??null,checkedAt:new Date().toISOString(),backlog:Number(counts.rows[0].backlog),alertsPending:Number(counts.rows[0].pending),alertsUncertain:Number(counts.rows[0].uncertain),alertsBlocked:Number(counts.rows[0].blocked),
    candidates:candidates.slice(0,100),totalCandidates:candidates.length,capabilities:{taskEvents:state?.cursor!=='0'&&state?'observed':'unavailable',independentReceipts:'unavailable'}}
}
