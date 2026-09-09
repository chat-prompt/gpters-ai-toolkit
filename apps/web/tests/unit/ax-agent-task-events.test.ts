import { describe, expect, it } from 'vitest'
import { agentTaskEventSchema, buildAgentTaskTraces, limitAgentTaskTraces } from '../../../../packages/lib/src/features/ax/agent-task-events'
import { validateAgentTelemetryBatch } from '../../../../packages/lib/src/features/ax/agent-telemetry-contract'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const event = { taskId:'11111111-1111-4111-8111-111111111111', eventId:'22222222-2222-4222-8222-222222222222', attemptId:'33333333-3333-4333-8333-333333333333', phase:'search', status:'succeeded', evidence:'api', atUtc:'2026-08-26T01:00:00.000Z' }
const start = new Date('2026-08-26T00:00:00Z'), end = new Date('2026-08-27T00:00:00Z')
const row = (agentId='test-agent')=>({agentId,runtime:{collectorVersion:'0.7.14'},collection:{source:'codex',taskEvents:[event]}})
describe('agent task evidence',()=>{
 it('deduplicates retries without merging different agents',()=>{
  const traces=buildAgentTaskTraces([row(),row(),row('other-agent')],start,end)
  expect(traces).toHaveLength(2); expect(traces[0].events).toHaveLength(1); expect(traces[0].tokens).toBeNull()
 })
 it('rejects raw text and invalid metrics',()=>{
  expect(agentTaskEventSchema.safeParse({...event,prompt:'private'}).success).toBe(false)
  expect(agentTaskEventSchema.safeParse({...event,metrics:{contextInputTokens:-1}}).success).toBe(false)
 })
 it('filters exact event times and preserves unknown phases without inventing delivery',()=>{
  expect(buildAgentTaskTraces([row()],end,new Date('2026-08-28'))).toEqual([])
  const trace=buildAgentTaskTraces([row()],start,end)[0]
  expect(trace.events.some(e=>e.phase==='delivery')).toBe(false)
 })
 it('accepts result-only tool batches and optional events, preserving old batches',()=>{
  const fixture=JSON.parse(readFileSync(resolve(process.cwd(),'../../infra/ax-local/fixtures/agent-telemetry-bbodoong.json'),'utf8'))
  expect(validateAgentTelemetryBatch(fixture).ok).toBe(true)
  expect(validateAgentTelemetryBatch({...fixture, tools:[{name:'Read',calls:0,failures:1,results:2}],collection:{...fixture.collection,taskEvents:[event]}}).ok).toBe(true)
  expect(validateAgentTelemetryBatch({...fixture, tools:[{name:'Read',calls:0,failures:3,results:2}]}).ok).toBe(false)
 })
})

it('orders a same-millisecond terminal event after its parent despite UUID order', () => {
 const started = {...event, status: 'started', eventId: '99999999-9999-4999-8999-999999999999'}
 const failed = {...event, status: 'failed', eventId: '00000001-0000-4000-8000-000000000001', parentEventId: started.eventId}
 const trace = buildAgentTaskTraces([{...row(), collection: {source:'codex', taskEvents:[failed, started]}}],start,end)[0]
 expect(trace.events.map(e => e.status)).toEqual(['started','failed'])
})
it('keeps the low-volume agent available after another agent produces 100 tasks', () => {
 const many = Array.from({length:101}, (_, i) => ({...row(i === 100 ? 'quiet' : 'busy'), collection: {source:'codex', taskEvents:[{...event, taskId:`${String(i).padStart(8,'0')}-1111-4111-8111-111111111111`}]}}))
 expect(buildAgentTaskTraces(many,start,end).filter(t=>t.agentId==='quiet')).toHaveLength(1)
})
it('keeps parent-linked retry order and terminates on malformed cycles', () => {
 const failed={...event,status:'failed',eventId:'99999999-9999-4999-8999-999999999999'}
 const retry={...event,status:'started',parentEventId:failed.eventId}
 const trace=buildAgentTaskTraces([{...row(),collection:{source:'codex',taskEvents:[retry,failed]}}],start,end)[0]
 expect(trace.events.map(e=>e.status)).toEqual(['failed','started'])
 expect(buildAgentTaskTraces([{...row(),collection:{source:'codex',taskEvents:[{...failed,parentEventId:retry.eventId},retry]}}],start,end)[0].events).toHaveLength(2)
})

it('bounds each stream separately and discloses records omitted from the view', () => {
 const base=buildAgentTaskTraces([row()],start,end)[0]
 const view=limitAgentTaskTraces([...Array.from({length:101},(_,i)=>({...base,taskId:`task-${i}`})),{...base,agentId:'quiet'}])
 expect(view.traces).toHaveLength(101)
 expect(view.traces.some(t=>t.agentId==='quiet')).toBe(true)
 expect(view.coverage.truncatedStreams).toEqual([{agentId:'test-agent',source:'codex',total:101,returned:100}])
})
