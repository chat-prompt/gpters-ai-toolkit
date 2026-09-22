/** Read-only projections of authenticated persisted observation batches. */
import { z } from 'zod'
import { agentObservabilitySchema, OBSERVABILITY_BOUNDS, OBSERVATION_FAILURE_REASONS, type AgentObservability, type BootstrapObservation, type ObservationFailureReason } from './agent-observability-contract'
const sourceSchema=z.enum(['claude-code','codex','openclaw','hermes'])
export const observationQuerySchema = z.object({
  days: z.enum(['7','30','90']).default('7'),
  agentId: z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,99}$/).optional(),
  source: z.enum(['claude-code','codex','openclaw','hermes']).optional(),
  endUtc: z.string().datetime().optional(), changeAt: z.string().datetime().optional(),
  comparisonHours: z.coerce.number().int().min(1).max(1080).optional(),
}).strict().superRefine((value,ctx)=>{
  if ((value.changeAt !== undefined || value.comparisonHours !== undefined) &&
      (!value.changeAt || !value.comparisonHours || !value.agentId || !value.source)) ctx.addIssue({code:z.ZodIssueCode.custom,message:'Comparison requires exact stream, change time and duration'})
})
export type ObservationQuery = z.infer<typeof observationQuerySchema>
/** Histogram/count metrics that are summed and compared; boot-file health has its own reducer. */
export type ObservationMetric = Exclude<keyof AgentObservability['metrics'], 'bootstrap' | 'probeFirstTurnTokens'>
export type ObservationHistogram = NonNullable<AgentObservability['metrics']['firstTurnTokens']>
export const OBSERVATION_METRICS: ObservationMetric[] = ['firstTurnTokens','peakContextTokens','toolResultChars','compactionEvents','readGuardAllow','readGuardDeny']
export interface ObservationRow {
  batchId: string; agentId: string; windowStart: Date | string; windowEnd: Date | string; collectedAt: Date | string
  collection: unknown
}
/** Boot-file health merged over a period; `promptSessions` counts the snapshots whose prompt size was reported. */
export type BootstrapSummary = BootstrapObservation & { promptSessions?: number }
export interface ObservationSummary {
  startUtc: string; endUtc: string; windows: number; coveredMs: number; completeWindow: boolean
  metrics: Omit<AgentObservability['metrics'],'bootstrap'> & { bootstrap?: BootstrapSummary | null }; metricCapabilities: AgentObservability['metricCapabilities']
}
export interface ObservationStream {
  agentId: string; source: AgentObservability['source']; adapterVersion: string
  latestAt: string; summary: ObservationSummary; points: Array<{startUtc:string;endUtc:string;metrics:AgentObservability['metrics'];metricCapabilities:AgentObservability['metricCapabilities']}>
  pointsTruncated: boolean; excludedOverlaps: number; conflictingWindows: number
}
export interface ObservationComparison {
  agentId: string; source: string; adapterVersion: string; changeAt: string; durationHours: number
  before: ObservationSummary; after: ObservationSummary
  metrics: Record<ObservationMetric,{comparable:boolean;beforeSamples:number;afterSamples:number;delta:number|null}>
  reason: 'observed-comparison' | 'incomplete-evidence'; causalClaim: false
}
export interface AgentObservationData {
  startUtc: string; endUtc: string; generatedAt: string; streams: ObservationStream[]; comparison: ObservationComparison|null
  coverage: {streamLimit:50;totalStreams:number;truncated:boolean;rowLimit:number;rowsTruncated:boolean;invalidRows:number;legacyRows:number;duplicateWindows:number;excludedBoundaryWindows:number
    /** Windows a collector sent without observability for a timing reason, per agent/source/reason (unique batches) */
    observationFailures?:Array<{agentId:string;source:string;reason:ObservationFailureReason;windows:number}>
    /** Unique failed windows per agent/source regardless of reason (a window stored with two reasons counts once) */
    observationFailureTotals?:Array<{agentId:string;source:string;windows:number}>}
}
const emptyMetrics = ():AgentObservability['metrics']=>({firstTurnTokens:null,peakContextTokens:null,toolResultChars:null,compactionEvents:null,readGuardAllow:null,readGuardDeny:null})
const emptyCapabilities = ():AgentObservability['metricCapabilities']=>({firstTurnTokens:'uncollected',peakContextTokens:'uncollected',toolResultChars:'uncollected',compactionEvents:'uncollected',readGuardAllow:'uncollected',readGuardDeny:'uncollected'})
const iso=(date:Date|string)=>new Date(date).toISOString()
function mergeHistogram(values:ObservationHistogram[]):ObservationHistogram {
  const result:ObservationHistogram={bounds:[...OBSERVABILITY_BOUNDS],counts:Array(OBSERVABILITY_BOUNDS.length+1).fill(0),count:0,sum:0,min:null,max:null}
  for(const item of values){
    result.count+=item.count;result.sum+=item.sum
    item.counts.forEach((count,index)=>{result.counts[index]+=count})
    if(item.min!==null)result.min=result.min===null?item.min:Math.min(result.min,item.min)
    if(item.max!==null)result.max=result.max===null?item.max:Math.max(result.max,item.max)
  }
  if(!Number.isSafeInteger(result.count)||!Number.isSafeInteger(result.sum)||result.counts.some(v=>!Number.isSafeInteger(v)))throw new Error('Observation aggregation overflow')
  return result
}
export function observationRange(query:ObservationQuery,now=new Date()){
  const end=query.endUtc?new Date(query.endUtc):now
  if(!Number.isFinite(end.getTime())||end.getTime()>now.getTime())throw new Error('조회 종료 시각은 현재 이전이어야 합니다')
  const start=new Date(end.getTime()-Number(query.days)*86400000)
  if(query.changeAt&&query.comparisonHours){
    const change=Date.parse(query.changeAt),duration=query.comparisonHours*3600000
    if(change-duration<start.getTime()||change+duration>end.getTime())throw new Error('동일 길이의 비교 구간이 조회 기간 안에 있어야 합니다')
  }
  return {start,end}
}
/** Boot-file health across windows: counts add up, sizes take the maximum and the latest snapshot. */
function mergeBootstrap(values:BootstrapObservation[]):BootstrapSummary {
  const withSize=values.filter(v=>v.sessions>0),last=withSize.at(-1)
  const sum=(key:'sessions'|'truncatedSessions'|'nearLimitSessions'|'warningSessions')=>{
    const total=values.reduce((a,v)=>a+v[key],0)
    if(!Number.isSafeInteger(total))throw new Error('Observation aggregation overflow')
    return total
  }
  const merged:BootstrapSummary={sessions:sum('sessions'),truncatedSessions:sum('truncatedSessions'),nearLimitSessions:sum('nearLimitSessions'),warningSessions:sum('warningSessions'),
    largestFileCharsMax:withSize.length?Math.max(...withSize.map(v=>v.largestFileCharsMax!)):null,largestFileCharsLatest:last?.largestFileCharsLatest??null,fileCharsLimit:last?.fileCharsLimit??null}
  // Prompt sizes merge over the windows that report them (newer collectors), with their own snapshot count, so the
  // average never divides by snapshots whose prompt was not measured.
  const withPrompt=withSize.filter(v=>typeof v.promptCharsSum==='number'),lastPrompt=withPrompt.at(-1)
  if(lastPrompt){
    const promptSum=withPrompt.reduce((a,v)=>a+v.promptCharsSum!,0),promptSessions=withPrompt.reduce((a,v)=>a+v.sessions,0)
    if(!Number.isSafeInteger(promptSum)||!Number.isSafeInteger(promptSessions))throw new Error('Observation aggregation overflow')
    Object.assign(merged,{promptCharsLatest:lastPrompt.promptCharsLatest,promptCharsMax:Math.max(...withPrompt.map(v=>v.promptCharsMax!)),promptCharsSum:promptSum,promptSessions,
      projectContextCharsLatest:lastPrompt.projectContextCharsLatest,toolSchemaCharsLatest:lastPrompt.toolSchemaCharsLatest})
  }
  return merged
}
function summarize(observations:AgentObservability[],start:number,end:number,forceIncomplete=false):ObservationSummary {
  const selected=observations.filter(o=>Date.parse(o.window.startUtc)>=start&&Date.parse(o.window.endUtc)<=end)
  let cursor=start,coveredMs=0,gap=false
  for(const o of selected){const a=Date.parse(o.window.startUtc),b=Date.parse(o.window.endUtc);if(a!==cursor)gap=true;cursor=b;coveredMs+=b-a}
  const completeWindow=!forceIncomplete&&!gap&&cursor===end&&selected.length>0
  const metrics=emptyMetrics(),metricCapabilities=emptyCapabilities()
  for(const key of OBSERVATION_METRICS){
    const values=selected.map(o=>o.metrics[key]).filter(v=>v!==null)
    const capabilities=selected.map(o=>o.metricCapabilities[key])
    if(!values.length){metricCapabilities[key]=capabilities.length&&capabilities.every(c=>c==='unsupported')?'unsupported':'uncollected';continue}
    const capability=capabilities.every(c=>c==='supported')&&!forceIncomplete?'supported':'incomplete'
    metricCapabilities[key]=capability
    if(typeof values[0]==='number'){
      const value=(values as number[]).reduce((a,b)=>a+b,0)
      if(!Number.isSafeInteger(value))throw new Error('Observation aggregation overflow')
      ;(metrics as Record<string,unknown>)[key]=value
    }else (metrics as Record<string,unknown>)[key]=mergeHistogram(values as ObservationHistogram[])
  }
  // Boot-file health appears only when some window reported it; older windows simply lack it.
  const reported=selected.filter(o=>o.metricCapabilities.bootstrap!==undefined)
  if(reported.length){
    const values=reported.map(o=>o.metrics.bootstrap).filter((v):v is BootstrapObservation=>v!==null&&v!==undefined)
    const capabilities=reported.map(o=>o.metricCapabilities.bootstrap)
    // A reported 'incomplete' without a value stays incomplete; it is not the same as never collected.
    metricCapabilities.bootstrap=!values.length?(capabilities.every(c=>c==='unsupported')?'unsupported':capabilities.some(c=>c==='incomplete')?'incomplete':'uncollected')
      :capabilities.every(c=>c==='supported')&&reported.length===selected.length&&!forceIncomplete?'supported':'incomplete'
    metrics.bootstrap=values.length?mergeBootstrap(values):null
  }
  // The daily boot probe appears only when some window reported it (collectors configured for it).
  const probed=selected.filter(o=>o.metricCapabilities.probeFirstTurnTokens!==undefined)
  if(probed.length){
    const values=probed.map(o=>o.metrics.probeFirstTurnTokens).filter((v):v is ObservationHistogram=>v!==null&&v!==undefined)
    const capabilities=probed.map(o=>o.metricCapabilities.probeFirstTurnTokens)
    metricCapabilities.probeFirstTurnTokens=!values.length?(capabilities.every(c=>c==='unsupported')?'unsupported':capabilities.some(c=>c==='incomplete')?'incomplete':'uncollected')
      // Windows from before the probe was configured did not measure it: they are not missing probe data.
      :capabilities.every(c=>c==='supported')&&!forceIncomplete?'supported':'incomplete'
    metrics.probeFirstTurnTokens=values.length?mergeHistogram(values):null
  }
  return {startUtc:new Date(start).toISOString(),endUtc:new Date(end).toISOString(),windows:selected.length,coveredMs,completeWindow,metrics,metricCapabilities}
}
/** Bounds before summation; excludes overlapping/conflicting windows rather than double-counting. */
export function projectObservationTrends(rows:ObservationRow[],query:ObservationQuery,now=new Date(),rowsTruncated=false):AgentObservationData {
  const {start,end}=observationRange(query,now)
  const coverage:AgentObservationData['coverage']={streamLimit:50,totalStreams:0,truncated:false,rowLimit:20000,rowsTruncated,invalidRows:0,legacyRows:0,duplicateWindows:0,excludedBoundaryWindows:0}
  const grouped=new Map<string,{agentId:string;source:AgentObservability['source'];adapterVersion:string;latestAt:string;byWindow:Map<string,AgentObservability|null>;conflictingWindows:number}>()
  const failures=new Map<string,{agentId:string;source:string;reason:ObservationFailureReason;windows:Set<string>}>()
  for(const row of rows){
    const collection=row.collection&&typeof row.collection==='object'&&!Array.isArray(row.collection)?row.collection as Record<string,unknown>:null
    if(!collection?.observability){
      // A window sent without observability for a fixed timing reason is counted, never shown as observed zero.
      const reason=collection?.observabilityFailure,source=collection?.source
      if(reason===undefined){coverage.legacyRows++;continue}
      // Stored rows are re-validated like observations: an unknown reason or source is invalid, not legacy.
      if(!OBSERVATION_FAILURE_REASONS.includes(reason as ObservationFailureReason)||!sourceSchema.safeParse(source).success){coverage.invalidRows++;continue}
      if((query.agentId&&row.agentId!==query.agentId)||(query.source&&source!==query.source))continue
      let from:string,to:string
      try{from=iso(row.windowStart);to=iso(row.windowEnd)}catch{coverage.invalidRows++;continue}
      // A failure row outside the range is skipped quietly: it has no observation that could make a summary incomplete.
      if(Date.parse(from)<start.getTime()||Date.parse(to)>end.getTime())continue
      const key=JSON.stringify([row.agentId,source,reason])
      const entry=failures.get(key)??{agentId:row.agentId,source:source as string,reason:reason as ObservationFailureReason,windows:new Set<string>()}
      // Counted per window like observations, so a replay by another collector instance is not a second window.
      entry.windows.add(JSON.stringify([from,to]));failures.set(key,entry)
      continue
    }
    if(collection.observabilityFailure!==undefined){coverage.invalidRows++;continue}
    const parsed=agentObservabilitySchema.safeParse(collection.observability)
    if(!parsed.success){coverage.invalidRows++;continue}
    const o=parsed.data
    let from:string,to:string,collected:string
    try{from=iso(row.windowStart);to=iso(row.windowEnd);collected=iso(row.collectedAt)}catch{coverage.invalidRows++;continue}
    if(o.agentId!==row.agentId||o.source!==collection.source||o.window.startUtc!==from||o.window.endUtc!==to||o.receipts.some(r=>Date.parse(r.atUtc)>Date.parse(collected))){coverage.invalidRows++;continue}
    if((query.agentId&&o.agentId!==query.agentId)||(query.source&&o.source!==query.source))continue
    if(Date.parse(from)<start.getTime()||Date.parse(to)>end.getTime()){coverage.excludedBoundaryWindows++;continue}
    const key=JSON.stringify([o.agentId,o.source,o.provenance.adapterVersion]),windowKey=JSON.stringify([from,to])
    const group=grouped.get(key)??{agentId:o.agentId,source:o.source,adapterVersion:o.provenance.adapterVersion,latestAt:collected,byWindow:new Map(),conflictingWindows:0}
    if(collected>group.latestAt)group.latestAt=collected
    if(group.byWindow.has(windowKey)){
      const previous=group.byWindow.get(windowKey)
      // Receipts can differ while metrics replay: compare only metric observations and capabilities.
      if(previous&&JSON.stringify([previous.metrics,previous.metricCapabilities])===JSON.stringify([o.metrics,o.metricCapabilities]))coverage.duplicateWindows++
      else{group.byWindow.set(windowKey,null);group.conflictingWindows++}
    }else group.byWindow.set(windowKey,o)
    grouped.set(key,group)
  }
  coverage.totalStreams=grouped.size;coverage.truncated=grouped.size>50
  coverage.observationFailures=[...failures.values()].map(f=>({agentId:f.agentId,source:f.source,reason:f.reason,windows:f.windows.size}))
    .sort((a,b)=>a.agentId.localeCompare(b.agentId)||a.source.localeCompare(b.source)||a.reason.localeCompare(b.reason))
  const totals=new Map<string,{agentId:string;source:string;windows:Set<string>}>()
  for(const f of failures.values()){const key=JSON.stringify([f.agentId,f.source]),entry=totals.get(key)??{agentId:f.agentId,source:f.source,windows:new Set<string>()};for(const w of f.windows)entry.windows.add(w);totals.set(key,entry)}
  coverage.observationFailureTotals=[...totals.values()].map(t=>({agentId:t.agentId,source:t.source,windows:t.windows.size})).sort((a,b)=>a.agentId.localeCompare(b.agentId)||a.source.localeCompare(b.source))
  const result:AgentObservationData={startUtc:start.toISOString(),endUtc:end.toISOString(),generatedAt:now.toISOString(),streams:[],comparison:null,coverage}
  for(const group of [...grouped.values()].sort((a,b)=>b.latestAt.localeCompare(a.latestAt)||a.agentId.localeCompare(b.agentId)||a.source.localeCompare(b.source)||Number(b.adapterVersion)-Number(a.adapterVersion)).slice(0,50)){
    const candidates=[...group.byWindow.values()].filter((o):o is AgentObservability=>o!==null).sort((a,b)=>a.window.startUtc.localeCompare(b.window.startUtc)||a.window.endUtc.localeCompare(b.window.endUtc))
    const overlap=new Set<number>()
    // Sorted windows: mark every member of an overlap cluster, including containment.
    let clusterEnd=-Infinity,cluster:number[]=[]
    for(let i=0;i<candidates.length;i++){
      const from=Date.parse(candidates[i].window.startUtc),to=Date.parse(candidates[i].window.endUtc)
      if(from<clusterEnd){cluster.push(i);for(const index of cluster)overlap.add(index);clusterEnd=Math.max(clusterEnd,to)}
      else{cluster=[i];clusterEnd=to}
    }
    const observations=candidates.filter((_,i)=>!overlap.has(i)),incomplete=rowsTruncated||coverage.invalidRows>0||coverage.excludedBoundaryWindows>0||group.conflictingWindows>0||overlap.size>0
    const summary=summarize(observations,start.getTime(),end.getTime(),incomplete)
    result.streams.push({agentId:group.agentId,source:group.source,adapterVersion:group.adapterVersion,latestAt:group.latestAt,summary,
      points:observations.slice(-200).map(o=>({startUtc:o.window.startUtc,endUtc:o.window.endUtc,metrics:o.metrics,metricCapabilities:o.metricCapabilities})),
      pointsTruncated:observations.length>200,excludedOverlaps:overlap.size,conflictingWindows:group.conflictingWindows})
    // Use the latest observed adapter for this pair, even if its comparison is
    // incomplete. Falling back to older complete metrics would hide an upgrade.
    if(!result.comparison&&query.changeAt&&query.comparisonHours&&query.agentId===group.agentId&&query.source===group.source){
      const change=Date.parse(query.changeAt),duration=query.comparisonHours*3600000
      const before=summarize(observations,change-duration,change,incomplete),after=summarize(observations,change,change+duration,incomplete)
      const metrics={} as ObservationComparison['metrics']
      for(const key of OBSERVATION_METRICS){
        const a=before.metrics[key],b=after.metrics[key],beforeSamples=typeof a==='number'?before.windows:a?.count??0,afterSamples=typeof b==='number'?after.windows:b?.count??0
        const comparable=before.completeWindow&&after.completeWindow&&before.metricCapabilities[key]==='supported'&&after.metricCapabilities[key]==='supported'&&beforeSamples>0&&afterSamples>0&&a!==null&&b!==null
        const mean=(v:number|ObservationHistogram|null)=>typeof v==='number'?v:v&&v.count?v.sum/v.count:null
        metrics[key]={comparable,beforeSamples,afterSamples,delta:comparable?mean(b)!-mean(a)!:null}
      }
      result.comparison={agentId:group.agentId,source:group.source,adapterVersion:group.adapterVersion,changeAt:new Date(change).toISOString(),durationHours:query.comparisonHours,before,after,metrics,
        reason:Object.values(metrics).every(m=>m.comparable)?'observed-comparison':'incomplete-evidence',causalClaim:false}
    }
  }
  return result
}
export async function loadAgentObservations(query:ObservationQuery,now=new Date()):Promise<AgentObservationData>{
  const {start,end}=observationRange(query,now)
  const [{db,axAgentTelemetryBatches:table},{and,gte,lte,eq,sql,desc}]=await Promise.all([import('@gpters/db'),import('drizzle-orm')])
  const rows=await db.select({batchId:table.batchId,agentId:table.agentId,windowStart:table.windowStart,windowEnd:table.windowEnd,collectedAt:table.collectedAt,collection:table.collection}).from(table)
    .where(and(gte(table.windowEnd,start),lte(table.windowStart,end),query.agentId?eq(table.agentId,query.agentId):undefined,
      query.source?sql`${table.collection}->>'source' = ${query.source}`:undefined,sql`(${table.collection} ? 'observability' OR ${table.collection} ? 'observabilityFailure')`))
    .orderBy(desc(table.collectedAt)).limit(20001)
  return projectObservationTrends(rows.slice(0,20000),query,now,rows.length>20000)
}

/** One agent/source's daily boot probe series, compact enough for an MCP panel read */
export interface BootProbeSeries {
  agentId: string; source: string; adapterVersion: string
  /** Period capability of the probe metric */
  capability: AgentObservability['metricCapabilities']['firstTurnTokens']
  /** Windows that measured at least one probe, oldest first: window end, probe count and their summed first-turn tokens */
  points: Array<{ endUtc: string; count: number; sum: number }>
  /** Windows in the period whose probe was incomplete (missing, not zero), oldest first */
  incompleteWindows: string[]
  /** Listed windows that measured the probe (a measured window without a probe is a real zero) */
  measuredWindows: number
  /** Only the latest 200 windows are listed; older windows of the period are summarized but not listed */
  pointsTruncated: boolean
}
/**
 * Boot probe series per stream that reported the probe, for readers such as a nightly report.
 *
 * @param data - Projected observation data
 * @returns Streams with a probe capability, each with its measured and incomplete windows
 */
export function summarizeBootProbes(data:AgentObservationData):BootProbeSeries[] {
  return data.streams.filter(stream=>stream.summary.metricCapabilities.probeFirstTurnTokens!==undefined).map(stream=>({
    agentId:stream.agentId,source:stream.source,adapterVersion:stream.adapterVersion,
    capability:stream.summary.metricCapabilities.probeFirstTurnTokens!,
    points:stream.points.flatMap(point=>point.metrics.probeFirstTurnTokens?.count?[{endUtc:point.endUtc,count:point.metrics.probeFirstTurnTokens.count,sum:point.metrics.probeFirstTurnTokens.sum}]:[]),
    incompleteWindows:stream.points.filter(point=>point.metricCapabilities.probeFirstTurnTokens==='incomplete').map(point=>point.endUtc),
    measuredWindows:stream.points.filter(point=>point.metricCapabilities.probeFirstTurnTokens==='supported').length,
    pointsTruncated:stream.pointsTruncated,
  }))
}
