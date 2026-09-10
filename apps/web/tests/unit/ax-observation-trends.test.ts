import { describe,expect,it } from 'vitest'
import { observationQuerySchema,observationRange,projectObservationTrends,type ObservationRow } from '../../../../packages/lib/src/features/ax/observation-trends'
import { agentObservabilitySchema,OBSERVABILITY_BOUNDS,type AgentObservability } from '../../../../packages/lib/src/features/ax/agent-observability-contract'
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
 it.each([100,250])('keeps versions 1 and 2 separate for the identical agent/source/window even with value %i',value=>{
  const legacy=observation(),current={...observation(start,change,value),provenance:{...observation().provenance,adapterVersion:'2' as const}}
  const rows=[observationRow(legacy,'version-1'),observationRow(current,'version-2')]
  const data=projectObservationTrends(rows,query,now)
  expect(data.coverage).toMatchObject({totalStreams:2,invalidRows:0,duplicateWindows:0})
  const byVersion=new Map(data.streams.map(stream=>[stream.adapterVersion,stream]))
  expect([...byVersion.keys()].sort()).toEqual(['1','2'])
  for(const [version,expected] of [['1',100],['2',value]] as const){
   expect(byVersion.get(version)).toMatchObject({excludedOverlaps:0,conflictingWindows:0,summary:{windows:1,metrics:{firstTurnTokens:{count:1,sum:expected}}}})
  }
  // Only an additional replay of the same adapter version is deduplicated.
  const replay=projectObservationTrends([...rows,observationRow(current,'version-2-retry')],query,now)
  expect(replay.coverage.duplicateWindows).toBe(1)
  expect(replay.streams.every(stream=>stream.summary.metrics.firstTurnTokens?.count===1)).toBe(true)
 })
 it('never compares the old adapter before-window against the new adapter after-window',()=>{
  const current={...observation(change,end,80),provenance:{...observation().provenance,adapterVersion:'2' as const}}
  const data=projectObservationTrends([observationRow(),observationRow(current,'after-v2')],query,now)
  expect(data.streams).toHaveLength(2)
  expect(data.streams.every(stream=>stream.summary.windows===1)).toBe(true)
  expect(data.comparison?.reason).toBe('incomplete-evidence')
  expect(data.comparison?.metrics.firstTurnTokens).toMatchObject({comparable:false,delta:null})
  expect((data.comparison?.metrics.firstTurnTokens.beforeSamples??0)+(data.comparison?.metrics.firstTurnTokens.afterSamples??0)).toBe(1)
 })
 it.each([false,true])('selects the latest collected adapter once, independent of insertion order (reverse=%s)',reverse=>{
  const v2=(a:string,b:string,value:number)=>({...observation(a,b,value),provenance:{...observation().provenance,adapterVersion:'2' as const}})
  const rows=[observationRow(observation(start,change,100),'old-before'),observationRow(observation(change,end,90),'old-after'),
   {...observationRow(v2(start,change,200),'new-before'),collectedAt:'2026-01-05T01:00:00.000Z'},
   {...observationRow(v2(change,end,150),'new-after'),collectedAt:'2026-01-05T01:00:00.000Z'}]
  const data=projectObservationTrends(reverse?[...rows].reverse():rows,query,now)
  expect(data.comparison?.adapterVersion).toBe('2')
  expect(data.comparison?.metrics.firstTurnTokens).toMatchObject({comparable:true,delta:-50})
  // Equal collection time deterministically prefers the higher known adapter.
  const tied=projectObservationTrends((reverse?[...rows].reverse():rows).map(row=>({...row,collectedAt:end})),query,now)
  expect(tied.comparison?.adapterVersion).toBe('2')
  expect(tied.comparison?.metrics.firstTurnTokens.delta).toBe(-50)
  // Observation recency wins over version rank; the rank is only a tie-breaker.
  const newerLegacy=projectObservationTrends(rows.map(row=>({...row,collectedAt:row.batchId.startsWith('old-')?'2026-01-05T02:00:00.000Z':row.collectedAt})),query,now)
  expect(newerLegacy.comparison?.adapterVersion).toBe('1')
  expect(newerLegacy.comparison?.metrics.firstTurnTokens.delta).toBe(-10)
 })
 it('does not replace a new incomplete version with an older complete comparison',()=>{
  const current={...observation(change,end,80),provenance:{...observation().provenance,adapterVersion:'2' as const}}
  const rows=[observationRow(),observationRow(observation(change,end,90),'old-after'),
   {...observationRow(current,'new-after'),collectedAt:'2026-01-05T01:00:00.000Z'}]
  const data=projectObservationTrends(rows,query,now)
  expect(data.comparison).toMatchObject({adapterVersion:'2',reason:'incomplete-evidence',before:{completeWindow:false},after:{completeWindow:true}})
  expect(data.comparison?.metrics.firstTurnTokens).toMatchObject({comparable:false,beforeSamples:0,afterSamples:1,delta:null})
 })
 it('keeps version 1 readable and rejects unknown version 3 without counting it as observed or legacy',()=>{
  const legacy=observation(),unsupported={...legacy,provenance:{...legacy.provenance,adapterVersion:'3'}}
  expect(agentObservabilitySchema.safeParse(legacy).success).toBe(true)
  expect(agentObservabilitySchema.safeParse(unsupported).success).toBe(false)
  const invalid={...observationRow(),batchId:'unsupported',collection:{source:'codex',observability:unsupported}}
  const data=projectObservationTrends([observationRow(legacy),invalid],query,now)
  expect(data.coverage).toMatchObject({invalidRows:1,legacyRows:0,totalStreams:1,duplicateWindows:0})
  expect(data.streams[0]).toMatchObject({adapterVersion:'1',summary:{windows:1,metrics:{firstTurnTokens:{count:1,sum:100}}}})
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
