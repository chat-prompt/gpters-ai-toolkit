// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db,closeDatabase } from '@gpters/db'
import { commitMonitor,runAgentMonitor,readAgentMonitor } from '../../../../packages/lib/src/features/ax/monitor-store'
import { emptyMonitorState,reduceMonitor } from '../../../../packages/lib/src/features/ax/monitor-engine'
const enabled=process.env.RUN_ISOLATED_MONITOR_TESTS==='true'
if(enabled){const u=new URL(process.env.TEST_DATABASE_URL??'');if(u.hostname!=='127.0.0.1'||u.port!=='55441'||u.pathname!=='/ax_monitor_test_20260910'||process.env.DATABASE_DRIVER!=='postgres-js')throw new Error('Disposable monitor database required')}
describe.skipIf(!enabled)('monitor durable transaction on isolated PostgreSQL',()=>{
 beforeAll(async()=>{
  expect((await db.execute(sql`SELECT current_database() AS name`)).rows[0].name).toBe('ax_monitor_test_20260910')
  await db.execute(sql`DROP SCHEMA public CASCADE`);await db.execute(sql`CREATE SCHEMA public`)
  await db.execute(sql`CREATE TABLE ax_agent_telemetry_batches(batch_id text primary key,agent_id text not null,runtime jsonb not null,collection jsonb not null,created_at timestamptz not null default now())`)
  await db.execute(sql`CREATE TABLE ax_agent_telemetry_collectors(collector_id text primary key,agent_id text,source text,created_at timestamptz,last_success_at timestamptz,interval_seconds int,is_active boolean)`)
  for(const file of ['0040_ax_incident_reviews.sql','0041_ax_agent_monitoring.sql'])for(const stmt of readFileSync(new URL('../../../../packages/db/drizzle/'+file,import.meta.url),'utf8').split('--> statement-breakpoint').filter(s=>s.trim()))await db.execute(sql.raw(stmt))
 })
 afterAll(async()=>{vi.unstubAllEnvs();await closeDatabase()})
 it('CAS commits state/consumption/outbox exactly once and rolls back all on constraint error',async()=>{
  const state=emptyMonitorState(),now=new Date().toISOString()
  await db.execute(sql`INSERT INTO ax_monitor_state(id,record) VALUES('cas',${JSON.stringify(state)}::jsonb)`)
  const event={eventId:randomUUID(),taskId:randomUUID(),attemptId:randomUUID(),phase:'execution' as const,status:'failed' as const,evidence:'process' as const,atUtc:now}
  const reduced=reduceMonitor({state,observations:[{position:'1',agentId:'example',source:'codex',event}],collectors:[],receiptExpectations:[],now,caughtUp:true,policy:{enabled:true,humanRecipientId:'U000000001'}})
  const results=await Promise.all([commitMonitor('cas',0,reduced.state,['batch-1'],reduced.outbox,[]),commitMonitor('cas',0,reduced.state,['batch-1'],reduced.outbox,[])])
  expect(results.filter(Boolean)).toHaveLength(1)
  expect((await db.execute(sql`SELECT count(*)::int AS n FROM ax_monitor_outbox WHERE monitor_id='cas'`)).rows[0].n).toBe(1)
  await expect(commitMonitor('cas',1,reduced.state,['batch-2'],[],[{id:null} as never])).rejects.toThrow()
  expect((await db.execute(sql`SELECT revision FROM ax_monitor_state WHERE id='cas'`)).rows[0].revision).toBe(1)
  expect((await db.execute(sql`SELECT count(*)::int AS n FROM ax_monitor_processed_batches WHERE batch_id='batch-2'`)).rows[0].n).toBe(0)
 })
 it('processes late committed old timestamps and duplicate events without hiding a stream',async()=>{
  vi.stubEnv('AX_MONITOR_ENABLED','true');vi.stubEnv('AX_INCIDENT_ORG_ID','monitor-test');vi.stubEnv('AX_MONITOR_AGENT_IDS','example');vi.stubEnv('AX_MONITOR_ALERTS_ENABLED','false')
  const event={eventId:randomUUID(),taskId:randomUUID(),attemptId:randomUUID(),phase:'execution',status:'failed',evidence:'process',atUtc:'2026-01-01T00:00:00.000Z'}
  const collection={source:'codex',taskEvents:[event]}
  await db.execute(sql`INSERT INTO ax_agent_telemetry_batches VALUES('new','example','{}'::jsonb,${JSON.stringify(collection)}::jsonb,'2026-01-02')`)
  expect((await runAgentMonitor()).events).toBe(1)
  await db.execute(sql`INSERT INTO ax_agent_telemetry_batches VALUES('late','example','{}'::jsonb,${JSON.stringify(collection)}::jsonb,'2026-01-01')`)
  expect((await runAgentMonitor()).processedBatches).toBe(1)
  await closeDatabase()
  const view=await readAgentMonitor()
  expect(view?.backlog).toBe(0);expect(view?.candidates).toHaveLength(1);expect(view?.candidates[0].eventCount).toBe(1)
  expect((await runAgentMonitor()).processedBatches).toBe(0)
 })
 it('defers malformed and conflicting batches without starving later valid batches, and scopes deferral',async()=>{
  vi.stubEnv('AX_INCIDENT_ORG_ID','poison-test');vi.stubEnv('AX_MONITOR_AGENT_IDS','poison-agent')
  const event={eventId:randomUUID(),taskId:randomUUID(),attemptId:randomUUID(),phase:'execution',status:'succeeded',evidence:'process',atUtc:'2026-01-01T00:00:00.000Z'}
  const insert=async(id:string,agent:string,events:unknown[])=>db.execute(sql`INSERT INTO ax_agent_telemetry_batches(batch_id,agent_id,runtime,collection) VALUES(${id},${agent},'{}',${JSON.stringify({source:'codex',taskEvents:events})}::jsonb)`)
  await insert('poison-seed','poison-agent',[event]);await runAgentMonitor()
  await insert('poison-conflict','poison-agent',[{...event,status:'failed'}])
  await insert('poison-malformed','poison-agent',[{}])
  await insert('poison-good','poison-agent',[{...event,eventId:randomUUID(),status:'failed'}])
  const result=await runAgentMonitor()
  expect(result.processedBatches).toBe(1);expect(result.deferredBatches).toBe(2)
  expect((await readAgentMonitor())?.candidates).toHaveLength(1)
  expect((await runAgentMonitor()).processedBatches).toBe(0)
  vi.stubEnv('AX_MONITOR_AGENT_IDS','other-agent')
  await insert('poison-other','other-agent',[{...event,eventId:randomUUID()}])
  expect((await runAgentMonitor()).caughtUp).toBe(true)
 })
 it('preserves acceptance received before its deadline and defers future clocks',async()=>{
  vi.stubEnv('AX_INCIDENT_ORG_ID','receipt-test');vi.stubEnv('AX_MONITOR_AGENT_IDS','receipt-agent')
  const taskId=randomUUID(),attemptId=randomUUID()
  const receipt={receiptId:randomUUID(),taskId,attemptId,kind:'slack-api',status:'succeeded',evidence:'api',claim:'api-accepted',atUtc:'2026-01-01T01:00:00.000Z'}
  const counters={filesExpected:0,filesRead:0,recordsRead:0,parseFailures:0,unsupportedRecords:0,missingTimestamps:0,duplicates:0,rotatedFiles:0}
  const observation={schemaVersion:1,agentId:'receipt-agent',source:'codex',window:{startUtc:'2026-01-01T00:00:00.000Z',endUtc:'2026-01-03T00:00:00.000Z'},capabilities:{runtimeReceipts:'supported',cliMetrics:'uncollected',readGuard:'uncollected'},receipts:[receipt],metrics:{firstTurnTokens:null,peakContextTokens:null,toolResultChars:null,compactionEvents:null,readGuardAllow:null,readGuardDeny:null},metricCapabilities:{firstTurnTokens:'uncollected',peakContextTokens:'uncollected',toolResultChars:'uncollected',compactionEvents:'uncollected',readGuardAllow:'uncollected',readGuardDeny:'uncollected'},provenance:{adapterVersion:'1',cli:counters,readGuard:counters,runtime:{recordsRead:1,unmatchedRecords:0,unsupportedRecords:0,missingTimestamps:0,duplicates:0,conflicts:0}}}
  const insert=async(id:string,observability:unknown)=>db.execute(sql`INSERT INTO ax_agent_telemetry_batches(batch_id,agent_id,runtime,collection) VALUES(${id},'receipt-agent','{}',${JSON.stringify({source:'codex',observability})}::jsonb)`)
  await insert('receipt-first',observation);expect((await runAgentMonitor()).events).toBe(1)
  await insert('deadline-later',{...observation,receipts:[{...receipt,receiptId:randomUUID(),status:'unknown',atUtc:'2026-01-01T00:30:00.000Z',expectedDeadlineUtc:'2026-01-02T00:00:00.000Z'}]})
  expect((await runAgentMonitor()).events).toBe(1)
  expect((await readAgentMonitor())?.candidates).toHaveLength(0)
  const future=new Date(Date.now()+86400000).toISOString()
  await db.execute(sql`INSERT INTO ax_agent_telemetry_batches(batch_id,agent_id,runtime,collection) VALUES('future-clock','receipt-agent','{}',${JSON.stringify({source:'codex',taskEvents:[{eventId:randomUUID(),taskId,attemptId,phase:'execution',status:'failed',evidence:'process',atUtc:future}]})}::jsonb)`)
  expect((await runAgentMonitor()).deferredBatches).toBe(1)
  expect((await readAgentMonitor())?.backlog).toBe(1)
 })
 it('honors a later false-positive review even with an older retained change and late new attempt',async()=>{
  vi.stubEnv('AX_INCIDENT_ORG_ID','review-test');vi.stubEnv('AX_MONITOR_AGENT_IDS','review-agent');vi.stubEnv('AX_MONITOR_ALERTS_ENABLED','true');vi.stubEnv('AX_MONITOR_SLACK_USER','U000000001')
  const event={eventId:randomUUID(),taskId:randomUUID(),attemptId:randomUUID(),phase:'execution',status:'failed',evidence:'process',atUtc:'2026-01-01T11:00:00.000Z'}
  await db.execute(sql`INSERT INTO ax_agent_telemetry_batches(batch_id,agent_id,runtime,collection) VALUES('review-seed','review-agent','{}',${JSON.stringify({source:'codex',taskEvents:[event]})}::jsonb)`)
  await runAgentMonitor()
  const id=JSON.stringify(['review-agent','codex','execution','process'])
  await db.execute(sql`UPDATE ax_incident_reviews SET record=record || ${JSON.stringify({state:'false-positive',history:[{at:'2026-01-01T12:00:00.000Z',actor:'test-human',action:'false-positive',reason:'synthetic review',evidenceRef:'synthetic'}],change:{appliedAt:'2026-01-01T10:00:00.000Z'}})}::jsonb WHERE id=${id}`)
  await db.execute(sql`INSERT INTO ax_agent_telemetry_batches(batch_id,agent_id,runtime,collection) VALUES('review-late','review-agent','{}',${JSON.stringify({source:'codex',taskEvents:[{...event,eventId:randomUUID(),attemptId:randomUUID()}]})}::jsonb)`)
  await runAgentMonitor()
  const candidates=(await readAgentMonitor())!.candidates
  expect(candidates).toHaveLength(2)
  expect(candidates.every(c=>c.state==='false-positive'&&!c.needsReview&&!c.observationActive)).toBe(true)
  const notices=await db.execute(sql`SELECT payload FROM ax_monitor_outbox WHERE monitor_id='review-test'`)
  expect(notices.rows.filter(r=>(r.payload as {kind:string}).kind==='first')).toHaveLength(1)
 })

})
