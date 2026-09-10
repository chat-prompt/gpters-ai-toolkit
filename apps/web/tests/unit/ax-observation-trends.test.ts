import { describe,expect,it } from 'vitest'
import { observationQuerySchema,observationRange,projectObservationTrends,type ObservationRow } from '../../../../packages/lib/src/features/ax/observation-trends'
import { OBSERVABILITY_BOUNDS,type AgentObservability } from '../../../../packages/lib/src/features/ax/agent-observability-contract'
const now=new Date('2026-01-08T00:00:00.000Z'),start='2026-01-03T00:00:00.000Z',change='2026-01-04T00:00:00.000Z',end='2026-01-05T00:00:00.000Z'
const query=observationQuerySchema.parse({days:'7',agentId:'example-agent',source:'codex',changeAt:change,comparisonHours:'24'})
function histogram(value=100){const counts=Array(OBSERVABILITY_BOUNDS.length+1).fill(0);counts[OBSERVABILITY_BOUNDS.findIndex(b=>value<=b)]=1;return {bounds:[...OBSERVABILITY_BOUNDS],counts,count:1,sum:value,min:value,max:value}}
const counters={filesExpected:1,filesRead:1,recordsRead:1,parseFailures:0,unsupportedRecords:0,missingTimestamps:0,duplicates:0,rotatedFiles:0}
export function observation(a=start,b=change,value=100):AgentObservability{return {schemaVersion:1,agentId:'example-agent',source:'codex',window:{startUtc:a,endUtc:b},capabilities:{runtimeReceipts:'uncollected',cliMetrics:'supported',readGuard:'supported'},receipts:[],
 metrics:{firstTurnTokens:histogram(value),peakContextTokens:histogram(value),toolResultChars:histogram(value),compactionEvents:0,readGuardAllow:1,readGuardDeny:0},
 metricCapabilities:{firstTurnTokens:'supported',peakContextTokens:'supported',toolResultChars:'supported',compactionEvents:'supported',readGuardAllow:'supported',readGuardDeny:'supported'},
 provenance:{adapterVersion:'1',cli:counters,readGuard:counters,runtime:{recordsRead:0,unmatchedRecords:0,unsupportedRecords:0,missingTimestamps:0,duplicates:0,conflicts:0}}}}
export function observationRow(o=observation(),batchId='batch'):ObservationRow{return {batchId,agentId:o.agentId,windowStart:o.window.startUtc,windowEnd:o.window.endUtc,collectedAt:o.window.endUtc,collection:{source:o.source,observability:o}}}
describe('persisted observation projection',()=>{
 it('validates same-scope adjacent equal windows and computes mean difference from histogram totals',()=>{
  const data=projectObservationTrends([observationRow(),observationRow(observation(change,end,80),'after')],query,now)
  expect(data.comparison?.before.completeWindow).toBe(true);expect(data.comparison?.after.completeWindow).toBe(true)
  expect(data.comparison?.metrics.firstTurnTokens).toEqual({comparable:true,beforeSamples:1,afterSamples:1,delta:-20});expect(data.comparison?.causalClaim).toBe(false)
  expect(data.streams[0].summary.metrics.firstTurnTokens?.count).toBe(2)
 })
 it('deduplicates repeated windows per agent/source without mixing another stream',()=>{
  const other={...observation(),agentId:'other-agent'}
  const data=projectObservationTrends([observationRow(),observationRow(),observationRow(other)],observationQuerySchema.parse({days:'7'}),now)
  expect(data.streams).toHaveLength(2);expect(data.coverage.duplicateWindows).toBe(1);expect(data.streams.every(s=>s.summary.metrics.firstTurnTokens?.count===1)).toBe(true)
 })
 it('excludes conflicting identical windows, partial overlap and containment',()=>{
  const conflict=projectObservationTrends([observationRow(),observationRow(observation(start,change,80))],query,now)
  expect(conflict.streams[0].conflictingWindows).toBe(1);expect(conflict.comparison?.metrics.firstTurnTokens.comparable).toBe(false)
  const overlap=projectObservationTrends([observationRow(observation(start,end)),observationRow(observation(change,end))],query,now)
  expect(overlap.streams[0].excludedOverlaps).toBe(2);expect(overlap.streams[0].summary.windows).toBe(0)
 })
 it('cannot claim an effect from incomplete, missing or gap-crossing observations',()=>{
  const incomplete=observation(change,end);incomplete.metricCapabilities.firstTurnTokens='incomplete'
  const data=projectObservationTrends([observationRow(),observationRow(incomplete)],query,now)
  expect(data.comparison?.metrics.firstTurnTokens.delta).toBeNull();expect(data.comparison?.reason).toBe('incomplete-evidence')
  const missing=observation(change,end);missing.metrics.firstTurnTokens=null;missing.metricCapabilities.firstTurnTokens='uncollected'
  expect(projectObservationTrends([observationRow(),observationRow(missing)],query,now).comparison?.metrics.firstTurnTokens.afterSamples).toBe(0)
  const gap=observation('2026-01-04T01:00:00.000Z',end)
  expect(projectObservationTrends([observationRow(),observationRow(gap)],query,now).comparison?.after.completeWindow).toBe(false)
 })
 it('rejects raw payload fields and scope mismatch; legacy is not observed zero',()=>{
  const invalid=observationRow();(invalid.collection as Record<string,unknown>).observability={...observation(),prompt:'secret'}
  const mismatch={...observationRow(),agentId:'another'}
  const data=projectObservationTrends([invalid,mismatch,{...observationRow(),collection:{source:'codex'}}],query,now)
  expect(data.streams).toHaveLength(0);expect(data.coverage.invalidRows).toBe(2);expect(data.coverage.legacyRows).toBe(1);expect(data.comparison).toBeNull()
 })
 it('caps 50 streams explicitly and marks row-truncated comparisons incomplete',()=>{
  const rows=Array.from({length:51},(_,i)=>observationRow({...observation(),agentId:`agent-${i}`}))
  const data=projectObservationTrends(rows,observationQuerySchema.parse({days:'7'}),now)
  expect(data.streams).toHaveLength(50);expect(data.coverage.totalStreams).toBe(51);expect(data.coverage.truncated).toBe(true)
  expect(projectObservationTrends([observationRow(),observationRow(observation(change,end))],query,now,true).comparison?.metrics.firstTurnTokens.comparable).toBe(false)
 })
 it('only displays the last 200 detail points while preserving aggregate sample count',()=>{
  const rows=Array.from({length:201},(_,i)=>{const a=new Date(Date.parse(start)+i*60000).toISOString(),b=new Date(Date.parse(start)+(i+1)*60000).toISOString();return observationRow(observation(a,b),String(i))})
  const data=projectObservationTrends(rows,observationQuerySchema.parse({days:'7'}),now)
  expect(data.streams[0].points).toHaveLength(200);expect(data.streams[0].pointsTruncated).toBe(true);expect(data.streams[0].summary.metrics.firstTurnTokens?.count).toBe(201)
 })
 it('validates strict query, future end and comparison fit instead of silently changing it',()=>{
  expect(observationQuerySchema.safeParse({days:'8'}).success).toBe(false);expect(observationQuerySchema.safeParse({days:'7',unknown:'x'}).success).toBe(false)
  expect(observationQuerySchema.safeParse({days:'7',changeAt:change}).success).toBe(false)
  expect(()=>observationRange({...query,endUtc:'2027-01-01T00:00:00Z'},now)).toThrow()
  expect(()=>observationRange({...query,comparisonHours:1000},now)).toThrow()
 })
})
