// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { db, closeDatabase } from '@gpters/db'
import { sql } from 'drizzle-orm'
import { saveTaskExpectation, readOwnTaskExpectation } from '../../../../packages/lib/src/features/ax/task-expectation-store'
import { commitMonitor, runAgentMonitor, readAgentMonitor } from '../../../../packages/lib/src/features/ax/monitor-store'
import type { ExpectationRegistration } from '../../../../packages/lib/src/features/ax/task-expectations'
import { emptyMonitorState } from '../../../../packages/lib/src/features/ax/monitor-engine'
const enabled=process.env.RUN_ISOLATED_EXPECTATION_TESTS==='true'
if(enabled){const url=new URL(process.env.TEST_DATABASE_URL??'');if(url.hostname!=='127.0.0.1'||url.port!=='55443'||url.pathname!=='/ax_task_expectations_test'||process.env.DATABASE_DRIVER!=='postgres-js')throw Error('Dedicated disposable expectation database required')}
const agent={orgId:'expectation-test',agentId:'example-agent'},base='2026-01-01T00:00:00.000Z'
function input():ExpectationRegistration{return {action:'register',source:'codex',taskId:randomUUID(),attemptId:randomUUID(),phase:'execution',evidence:'process',scheduledFor:'2026-01-01T00:10:00.000Z',deadlineAt:'2026-01-01T01:00:00.000Z'}}
describe.skipIf(!enabled)('durable explicit expectations on a disposable PostgreSQL',()=>{
 beforeAll(async()=>{
  expect((await db.execute(sql`SELECT current_database() AS name`)).rows[0].name).toBe('ax_task_expectations_test')
  expect((await db.execute(sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`)).rows[0].n).toBe(0)
  await db.execute(sql`CREATE TABLE ax_agent_telemetry_batches(batch_id text primary key,agent_id text not null,runtime jsonb not null,collection jsonb not null,created_at timestamptz not null default now())`)
  await db.execute(sql`CREATE TABLE ax_agent_telemetry_collectors(collector_id text primary key,agent_id text,source text,created_at timestamptz,last_success_at timestamptz,interval_seconds int,is_active boolean)`)
  for(const file of ['0040_ax_incident_reviews.sql','0041_ax_agent_monitoring.sql','0042_ax_task_expectations.sql'])for(const statement of readFileSync(new URL('../../../../packages/db/drizzle/'+file,import.meta.url),'utf8').split('--> statement-breakpoint').filter(value=>value.trim()))await db.execute(sql.raw(statement))
  vi.stubEnv('AX_MONITOR_ENABLED','true');vi.stubEnv('AX_INCIDENT_ORG_ID',agent.orgId);vi.stubEnv('AX_MONITOR_AGENT_IDS',agent.agentId);vi.stubEnv('AX_TASK_EXPECTATIONS_ENABLED','true');vi.stubEnv('AX_MONITOR_ALERTS_ENABLED','false')
 })
 afterAll(async()=>{vi.unstubAllEnvs();await closeDatabase()})
 it('atomically registers once under concurrent retries and does not cross tenant/agent boundaries',async()=>{
  const request=input();const results=await Promise.all([saveTaskExpectation(agent,request,base),saveTaskExpectation(agent,request,base)])
  expect(results.filter(result=>!result!.replayed)).toHaveLength(1)
  expect(results[0]!.record.id).toBe(results[1]!.record.id)
  expect(await readOwnTaskExpectation({...agent,orgId:'other'},results[0]!.record.id)).toBeNull()
  expect(await readOwnTaskExpectation({...agent,agentId:'other'},results[0]!.record.id)).toBeNull()
  await expect(saveTaskExpectation(agent,{...request,deadlineAt:'2026-01-01T02:00:00.000Z'},base)).rejects.toThrow('different content')
 })
 it('invalidates older monitor snapshots on cancellation and replays the same operation safely',async()=>{
  const created=(await saveTaskExpectation(agent,input(),base))!.record
  const snapshot=await db.execute(sql`SELECT revision,record FROM ax_monitor_state WHERE id=${agent.orgId}`)
  const change={action:'cancel' as const,id:created.id,revision:created.revision,operationId:randomUUID(),reason:'operator-request' as const}
  expect((await saveTaskExpectation(agent,change,'2026-01-01T00:01:00.000Z'))!.record.state).toBe('cancelled')
  expect(await commitMonitor(agent.orgId,Number(snapshot.rows[0].revision),emptyMonitorState(),['must-not-consume'],[],[])).toBe(false)
  expect((await db.execute(sql`SELECT count(*)::int AS n FROM ax_monitor_processed_batches WHERE batch_id='must-not-consume'`)).rows[0].n).toBe(0)
  expect((await saveTaskExpectation(agent,change,'2026-01-01T00:02:00.000Z'))!.replayed).toBe(true)
 })
 it('projects absence without a telemetry batch, then commits late exact success with ingestion acknowledgment',async()=>{
  const request=input(),created=(await saveTaskExpectation(agent,request,base))!.record
  const first=await runAgentMonitor();expect(first.processedBatches).toBe(0)
  const candidate=(await readAgentMonitor())!.candidates.find(item=>item.expectation?.id===created.id)
  expect(candidate).toMatchObject({kind:'missing-receipt',eventCount:0,observationActive:true})
  const event={taskId:request.taskId,attemptId:request.attemptId,eventId:randomUUID(),phase:'execution',status:'succeeded',evidence:'process',atUtc:'2026-01-01T02:00:00.000Z'}
  await db.execute(sql`INSERT INTO ax_agent_telemetry_batches(batch_id,agent_id,runtime,collection) VALUES('late-success',${agent.agentId},'{}',${JSON.stringify({source:'codex',taskEvents:[event]})}::jsonb)`)
  expect((await runAgentMonitor()).processedBatches).toBe(1)
  expect(await readOwnTaskExpectation(agent,created.id)).toMatchObject({state:'completed',revision:2,receipt:{eventId:event.eventId}})
  expect((await readAgentMonitor())!.candidates.find(item=>item.id===candidate!.id)).toMatchObject({state:'candidate',observationActive:false,expectation:{state:'completed'}})
  expect((await runAgentMonitor()).processedBatches).toBe(0)
  expect((await readOwnTaskExpectation(agent,created.id))!.revision).toBe(2)
 })
 it('rolls back completion, batch acknowledgment and projection together on a failing write',async()=>{
  const created=(await saveTaskExpectation(agent,input(),base))!.record
  const snapshot=(await db.execute(sql`SELECT revision,record FROM ax_monitor_state WHERE id=${agent.orgId}`)).rows[0]
  const completed={...created,state:'completed' as const,revision:2,receipt:{eventId:randomUUID(),at:'2026-01-01T02:00:00.000Z',evidence:'process' as const}}
  await expect(commitMonitor(agent.orgId,Number(snapshot.revision),snapshot.record as ReturnType<typeof emptyMonitorState>,['atomic-rollback'],[],[{id:null} as never],[],[{previousRevision:1,record:completed}])).rejects.toThrow()
  expect((await readOwnTaskExpectation(agent,created.id))!.state).toBe('active')
  expect((await db.execute(sql`SELECT count(*)::int AS n FROM ax_monitor_processed_batches WHERE batch_id='atomic-rollback'`)).rows[0].n).toBe(0)
  expect(await commitMonitor(agent.orgId,Number(snapshot.revision),snapshot.record as ReturnType<typeof emptyMonitorState>,['bad-revision'],[],[],[],[{previousRevision:99,record:completed}])).toBe(false)
  expect((await readOwnTaskExpectation(agent,created.id))!.revision).toBe(1)
 })
 it('retains a historical missed deadline cancelled before the first monitor tick',async()=>{
  const created=(await saveTaskExpectation(agent,input(),base))!.record
  await saveTaskExpectation(agent,{action:'cancel',id:created.id,revision:1,operationId:randomUUID(),reason:'operator-request'},'2026-01-01T02:00:00.000Z')
  await runAgentMonitor()
  expect((await readAgentMonitor())!.candidates.find(candidate=>candidate.expectation?.id===created.id)).toMatchObject({state:'candidate',observationActive:false,expectation:{state:'cancelled',missedDeadlineAt:created.deadlineAt}})
 })
 it('enforces revision CAS when cancellation and defer race',async()=>{
  const created=(await saveTaskExpectation(agent,input(),base))!.record
  const now='2026-01-01T00:05:00.000Z'
  const results=await Promise.allSettled([saveTaskExpectation(agent,{action:'cancel',id:created.id,revision:1,operationId:randomUUID(),reason:'operator-request'},now),saveTaskExpectation(agent,{action:'defer',id:created.id,revision:1,operationId:randomUUID(),reason:'dependency-delay',deadlineAt:'2026-01-01T03:00:00.000Z'},now)])
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1)
  const stored=(await readOwnTaskExpectation(agent,created.id))!;expect(stored.revision).toBe(2);expect(stored.history).toHaveLength(1)
 })
})
