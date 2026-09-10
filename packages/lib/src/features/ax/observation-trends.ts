/** Read-only projections of authenticated persisted observation batches. */
import { z } from 'zod'
import { agentObservabilitySchema, OBSERVABILITY_BOUNDS, type AgentObservability } from './agent-observability-contract'
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
export type ObservationMetric = keyof AgentObservability['metrics']
export type ObservationHistogram = NonNullable<AgentObservability['metrics']['firstTurnTokens']>
export const OBSERVATION_METRICS: ObservationMetric[] = ['firstTurnTokens','peakContextTokens','toolResultChars','compactionEvents','readGuardAllow','readGuardDeny']
export interface ObservationRow {
  batchId: string; agentId: string; windowStart: Date | string; windowEnd: Date | string; collectedAt: Date | string
  collection: unknown
}
export interface ObservationSummary {
  startUtc: string; endUtc: string; windows: number; coveredMs: number; completeWindow: boolean
  metrics: AgentObservability['metrics']; metricCapabilities: AgentObservability['metricCapabilities']
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
  coverage: {streamLimit:50;totalStreams:number;truncated:boolean;rowLimit:number;rowsTruncated:boolean;invalidRows:number;legacyRows:number;duplicateWindows:number;excludedBoundaryWindows:number}
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
  return {startUtc:new Date(start).toISOString(),endUtc:new Date(end).toISOString(),windows:selected.length,coveredMs,completeWindow,metrics,metricCapabilities}
}
/** Bounds before summation; excludes overlapping/conflicting windows rather than double-counting. */
export function projectObservationTrends(rows:ObservationRow[],query:ObservationQuery,now=new Date(),rowsTruncated=false):AgentObservationData {
  const {start,end}=observationRange(query,now)
  const coverage:AgentObservationData['coverage']={streamLimit:50,totalStreams:0,truncated:false,rowLimit:20000,rowsTruncated,invalidRows:0,legacyRows:0,duplicateWindows:0,excludedBoundaryWindows:0}
  const grouped=new Map<string,{agentId:string;source:AgentObservability['source'];adapterVersion:string;latestAt:string;byWindow:Map<string,AgentObservability|null>;conflictingWindows:number}>()
  for(const row of rows){
    const collection=row.collection&&typeof row.collection==='object'&&!Array.isArray(row.collection)?row.collection as Record<string,unknown>:null
    if(!collection?.observability){coverage.legacyRows++;continue}
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
  const result:AgentObservationData={startUtc:start.toISOString(),endUtc:end.toISOString(),generatedAt:now.toISOString(),streams:[],comparison:null,coverage}
  for(const group of [...grouped.values()].sort((a,b)=>b.latestAt.localeCompare(a.latestAt)||a.agentId.localeCompare(b.agentId)||a.source.localeCompare(b.source)).slice(0,50)){
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
    if(query.changeAt&&query.comparisonHours&&query.agentId===group.agentId&&query.source===group.source){
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
      query.source?sql`${table.collection}->>'source' = ${query.source}`:undefined,sql`${table.collection} ? 'observability'`))
    .orderBy(desc(table.collectedAt)).limit(20001)
  return projectObservationTrends(rows.slice(0,20000),query,now,rows.length>20000)
}
