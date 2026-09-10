import { describe, expect, it } from 'vitest'
import { monitorOperationalHealth } from '../../../../packages/lib/src/features/ax/monitor-health'
const now='2026-01-01T01:00:00.000Z'
const healthy={lastSuccessAt:'2026-01-01T00:55:00.000Z',backlog:1,oldestUnprocessedAt:'2026-01-01T00:59:00.000Z',deferredBacklog:0}
describe('monitor queue age health',()=>{
 it('accepts recent normal ingestion and retains old empty-queue endpoint compatibility',()=>{
  expect(monitorOperationalHealth(healthy,now)).toBe(true)
  expect(monitorOperationalHealth({...healthy,oldestUnprocessedAt:'2026-01-01T00:45:00.000Z'},now)).toBe(true)
  expect(monitorOperationalHealth({lastSuccessAt:now,backlog:0},now)).toBe(true)
 })
 it.each([
  {oldestUnprocessedAt:'2026-01-01T00:44:59.999Z'},
  {oldestUnprocessedAt:'2026-01-01T01:00:00.001Z'},
  {oldestUnprocessedAt:null},{oldestUnprocessedAt:undefined},{oldestUnprocessedAt:'invalid'},
  {deferredBacklog:1},{deferredBacklog:null},{deferredBacklog:undefined},
  {lastSuccessAt:'2026-01-01T00:44:59.999Z'},{lastSuccessAt:'2026-01-01T01:00:00.001Z'},
  {backlog:null},{backlog:-1},{backlog:1.5},
  {backlog:0,oldestUnprocessedAt:null,deferredBacklog:1},
 ])('fails closed for stale, deferred or incomplete state %j',fields=>{
  expect(monitorOperationalHealth({...healthy,...fields},now)).toBe(false)
 })
 it('does not equate a fresh scheduler heartbeat with progress on the oldest pending batch',()=>{
  expect(monitorOperationalHealth({...healthy,lastSuccessAt:'2026-01-01T01:19:00.000Z'},'2026-01-01T01:20:00.000Z')).toBe(false)
 })
})
