import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTaskExpectation, changeTaskExpectation, reconcileTaskExpectation, projectTaskExpectation, expectationId, registrationMatches } from '../../../../packages/lib/src/features/ax/task-expectations'
import type { ExpectationRegistration } from '../../../../packages/lib/src/features/ax/task-expectations'
import { emptyMonitorState, reduceMonitor } from '../../../../packages/lib/src/features/ax/monitor-engine'
import type { MonitorObservation } from '../../../../packages/lib/src/features/ax/monitor-types'
const now='2026-01-01T00:00:00.000Z', overdue='2026-01-01T02:00:00.000Z'
const principal={orgId:'example-org',agentId:'example-agent'}
function input():ExpectationRegistration{return {action:'register',source:'codex',taskId:randomUUID(),attemptId:randomUUID(),phase:'delivery',evidence:'api',scheduledFor:'2026-01-01T00:10:00.000Z',deadlineAt:'2026-01-01T01:00:00.000Z'}}
const policy={enabled:true,humanRecipientId:'U000000001'}
describe('explicit task expectations',()=>{
 it('requires a future planned start and explicit bounded deadline, with tenant-scoped stable identity',()=>{
  const value=input(),record=createTaskExpectation(principal,value,now)
  expect(record.id).toBe(expectationId(principal,value));expect(registrationMatches(record,value)).toBe(true)
  expect(expectationId({...principal,orgId:'other'},value)).not.toBe(record.id)
  expect(expectationId(principal,{...value,attemptId:randomUUID()})).not.toBe(record.id)
  expect(()=>createTaskExpectation(principal,{...value,scheduledFor:now,deadlineAt:now},now)).toThrow()
  expect(()=>createTaskExpectation(principal,{...value,scheduledFor:'2025-12-31T23:59:59.000Z'},now)).toThrow()
  expect(()=>createTaskExpectation(principal,{...value,deadlineAt:'2026-03-01T00:00:00.000Z'},now)).toThrow()
 })
 it('detects a deadline with zero events, but never infers missing work without registration or through backlog',()=>{
  const record=createTaskExpectation(principal,input(),now)
  const args={state:emptyMonitorState(),observations:[],collectors:[],receiptExpectations:[projectTaskExpectation(record)],now:overdue,policy,caughtUp:true}
  const result=reduceMonitor(args)
  expect(result.outbox).toHaveLength(1);expect(Object.values(result.state.candidates)[0]).toMatchObject({kind:'missing-receipt',eventCount:0,state:'candidate',expectation:{id:record.id,state:'active'}})
  expect(reduceMonitor({...args,receiptExpectations:[]}).outbox).toHaveLength(0)
  expect(reduceMonitor({...args,caughtUp:false}).outbox).toHaveLength(0)
 })
 it('retains cancellation/defer audit and stable operation retries without reopening or deleting the past',()=>{
  const record=createTaskExpectation(principal,input(),now)
  const defer={action:'defer' as const,id:record.id,revision:record.revision,operationId:randomUUID(),deadlineAt:'2026-01-01T04:00:00.000Z',reason:'dependency-delay' as const}
  const next=changeTaskExpectation(record,defer,overdue).record
  expect(next.overdueBeforeChange).toBe(record.deadlineAt);expect(next.originalDeadlineAt).toBe(record.deadlineAt)
  expect(changeTaskExpectation(next,defer,overdue).replayed).toBe(true)
  expect(()=>changeTaskExpectation(next,{...defer,deadlineAt:'2026-01-01T05:00:00.000Z'},overdue)).toThrow('different content')
  expect(()=>changeTaskExpectation(next,{...defer,operationId:randomUUID()},overdue)).toThrow('revision')
  const cancelled=changeTaskExpectation(next,{action:'cancel',id:next.id,revision:next.revision,operationId:randomUUID(),reason:'replaced-by-new-attempt'},overdue).record
  expect(cancelled.state).toBe('cancelled');expect(cancelled.history).toHaveLength(2)
  expect(()=>changeTaskExpectation(cancelled,{...defer,revision:cancelled.revision,operationId:randomUUID()},overdue)).toThrow('immutable')
 })
 it('does not hide an already missed deadline when cancellation or postponement arrives before the first monitor tick',()=>{
  const record=createTaskExpectation(principal,input(),now)
  for(const action of ['cancel','defer'] as const){
   const command=action==='cancel'?{action,id:record.id,revision:1,operationId:randomUUID(),reason:'operator-request' as const}:{action,id:record.id,revision:1,operationId:randomUUID(),reason:'operator-request' as const,deadlineAt:'2026-01-01T04:00:00.000Z'}
   const next=changeTaskExpectation(record,command,overdue).record
   const result=reduceMonitor({state:emptyMonitorState(),observations:[],collectors:[],receiptExpectations:[projectTaskExpectation(next)],now:overdue,policy,caughtUp:true})
   expect(Object.values(result.state.candidates)).toHaveLength(1)
   expect(Object.values(result.state.candidates)[0]).toMatchObject({state:'candidate',observationActive:false,expectation:{missedDeadlineAt:record.deadlineAt}})
   expect(result.outbox).toHaveLength(0)
  }
 })
 it('accepts only matching successful evidence and leaves an operator disposition intact after late success',()=>{
  const record=createTaskExpectation(principal,input(),now)
  const observation:MonitorObservation={position:'1',agentId:record.agentId,source:record.source,event:{eventId:randomUUID(),taskId:record.taskId,attemptId:record.attemptId,phase:record.phase,status:'succeeded',evidence:'api',atUtc:'2026-01-01T01:30:00.000Z'}}
  for(const changed of [{...observation,agentId:'other'},{...observation,source:'hermes' as const},{...observation,event:{...observation.event,attemptId:randomUUID()}},{...observation,event:{...observation.event,evidence:'self-reported' as const}},{...observation,event:{...observation.event,status:'failed' as const}},{...observation,event:{...observation.event,atUtc:'2025-12-31T23:59:59.000Z'}}])expect(reconcileTaskExpectation(record,[changed],overdue)).toBe(record)
  const completed=reconcileTaskExpectation(record,[observation],overdue)
  expect(completed.state).toBe('completed');expect(completed.receipt?.at).toBe(observation.event.atUtc)
  expect(reconcileTaskExpectation(completed,[observation],overdue)).toBe(completed)
  const before=reduceMonitor({state:emptyMonitorState(),observations:[],collectors:[],receiptExpectations:[projectTaskExpectation(record)],now:overdue,policy,caughtUp:true})
  const candidate=Object.values(before.state.candidates)[0];candidate.state='confirmed'
  const after=reduceMonitor({state:before.state,observations:[],collectors:[],receiptExpectations:[projectTaskExpectation(completed)],now:overdue,policy,caughtUp:true})
  expect(after.state.candidates[candidate.id]).toMatchObject({state:'confirmed',observationActive:false,expectation:{state:'completed'}})
  expect(after.outbox.map(item=>item.kind)).toEqual(['recovery'])
 })
 it('does not use a new attempt success to resolve the old attempt or automatically reactivate a dismissed case',()=>{
  const record=createTaskExpectation(principal,input(),now)
  const before=reduceMonitor({state:emptyMonitorState(),observations:[],collectors:[],receiptExpectations:[projectTaskExpectation(record)],now:overdue,policy,caughtUp:true})
  const candidate=Object.values(before.state.candidates)[0];candidate.state='false-positive';candidate.lastReviewedAt=overdue
  const after=reduceMonitor({state:before.state,observations:[],collectors:[],receiptExpectations:[projectTaskExpectation(record)],now:'2026-01-02T00:00:00.000Z',policy,caughtUp:true})
  expect(after.state.candidates[candidate.id]).toMatchObject({state:'false-positive',needsReview:false,observationActive:false})
 })
})
