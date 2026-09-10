'use client'
import { useEffect, useState } from 'react'
import styles from './AgentObservationPanel.module.css'
import type { AgentObservationData, ObservationMetric, ObservationSummary } from '@/lib/features/ax'

const metrics: Array<{key:ObservationMetric;label:string;unit:string}>=[
  {key:'firstTurnTokens',label:'첫 턴 입력',unit:'토큰'},
  {key:'peakContextTokens',label:'세션·구간 최대 입력',unit:'토큰'},
  {key:'toolResultChars',label:'도구 결과',unit:'자'},
  {key:'compactionEvents',label:'컴팩션',unit:'건'},
  {key:'readGuardAllow',label:'읽기 허용',unit:'건'},
  {key:'readGuardDeny',label:'읽기 거절',unit:'건'},
]
const capabilityText={supported:'관측',unsupported:'미지원',uncollected:'미수집',incomplete:'불완전'}
const number=(value:number)=>value.toLocaleString('ko-KR',{maximumFractionDigits:1})
const when=(value:string)=>new Date(value).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})
function MetricValue({summary,metric}:{summary:ObservationSummary;metric:typeof metrics[number]}){
  const value=summary.metrics[metric.key],capability=summary.metricCapabilities[metric.key]
  return <div className="min-w-0 rounded border border-[var(--border-subtle)] p-3">
    <p className="text-xs text-[var(--text-secondary)]">{metric.label}</p>
    <p className="mt-1 break-words text-sm font-semibold text-[var(--text-primary)]">{value===null?capabilityText[capability]:typeof value==='number'?`${number(value)} ${metric.unit}`:value.count?`평균 ${number(value.sum/value.count)} ${metric.unit}`:'관측 표본 없음'}</p>
    <p className="mt-1 text-xs text-[var(--text-secondary)]">{capabilityText[capability]} · {typeof value==='number'?`${summary.windows}개 수집 구간`:value?`표본 ${number(value.count)}개`:'표본 미확인'}</p>
  </div>
}
export function AgentObservationPanel({days=7,agentId='all'}:{days?:7|30|90;agentId?:string}){
  return <ObservationPanelContent key={`${days}:${agentId}`} days={days} agentId={agentId}/>
}
function ObservationPanelContent({days,agentId}:{days:7|30|90;agentId:string}){
  const [result,setResult]=useState<{key:string;data:AgentObservationData|null;error:string}|null>(null)
  const [retry,setRetry]=useState(0)
  const [stream,setStream]=useState(''),[changeAt,setChangeAt]=useState(''),[hours,setHours]=useState(''),[comparison,setComparison]=useState<{agentId:string;source:string;changeAt:string;comparisonHours:string}|null>(null)
  const params=new URLSearchParams({days:String(days)})
  if(agentId!=='all')params.set('agentId',agentId)
  if(comparison)for(const [key,value]of Object.entries(comparison))params.set(key,value)
  const requestKey=params.toString(),loading=result?.key!==requestKey,data=result?.key===requestKey?result.data:null,error=result?.key===requestKey?result.error:''
  useEffect(()=>{
    const controller=new AbortController()
    fetch(`/api/ax/agent-observations?${requestKey}`,{signal:controller.signal,cache:'no-store'}).then(async response=>{
      if(!response.ok)throw new Error(response.status===403?'관리자만 관측 지표를 볼 수 있습니다.':response.status===400?'동일 길이의 비교 구간이 현재 조회 기간 안에 있는지 확인하세요.':'관측 지표를 불러오지 못했습니다.')
      return response.json() as Promise<AgentObservationData>
    }).then(value=>{if(!controller.signal.aborted)setResult({key:requestKey,data:value,error:''})}).catch(reason=>{if(!controller.signal.aborted)setResult({key:requestKey,data:null,error:reason instanceof Error?reason.message:'조회에 실패했습니다.'})})
    return()=>controller.abort()
  },[requestKey,retry])
  const selected=data?.streams.find(row=>JSON.stringify([row.agentId,row.source])===stream)
  return <section aria-labelledby="agent-observation-heading" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id="agent-observation-heading" className="text-sm font-semibold text-[var(--text-primary)]" title="수집기가 보낸 구간별 관측입니다. 첫 턴은 전체 이력이 확인된 세션만 포함합니다. 최대 입력은 세션·수집 구간의 최대이며 전체 생애 최대가 아닙니다. 표본과 결측을 확인하세요.">실행 관측 지표 ⓘ</h3>
      <span className="text-xs text-[var(--text-secondary)]">최근 {days}일 · 조회 전용</span>
    </div>
    {loading&&<p role="status" className="text-sm text-[var(--text-secondary)]">관측 지표를 불러오는 중입니다.</p>}
    {error&&<div role="alert" className={`space-y-3 text-sm ${styles.attention}`}><p>{error}</p><div className="flex flex-wrap gap-3"><button type="button" onClick={()=>{setResult(null);setRetry(value=>value+1)}} className="rounded border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]">다시 시도</button>{comparison&&<button type="button" onClick={()=>setComparison(null)} className="rounded border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]">비교 해제</button>}</div></div>}
    {data&&<>
      {(data.coverage.truncated||data.coverage.rowsTruncated)&&<p className={`text-xs ${styles.attention}`}>조회 한도에 도달했습니다. {data.coverage.totalStreams}개 관측 그룹 중 최근 {data.streams.length}개를 표시합니다.{data.coverage.rowsTruncated?' 원본 배치도 일부만 조회되어 비교 근거가 불완전합니다.':''}</p>}
      {(data.coverage.invalidRows>0||data.coverage.excludedBoundaryWindows>0)&&<p className="text-xs text-[var(--text-secondary)]">검증되지 않은 배치 {data.coverage.invalidRows}개 · 조회 경계를 걸친 배치 {data.coverage.excludedBoundaryWindows}개 제외</p>}
      {!data.streams.length?<p className="py-4 text-sm text-[var(--text-secondary)]">이 기간에 적재된 실행 관측 지표가 없습니다. 수집기 연동 후 새 보고부터 표시됩니다.</p>:<>
        <div className="space-y-4">{data.streams.map(row=><article key={`${row.agentId}:${row.source}:${row.adapterVersion}`} className="rounded-lg border border-[var(--border-subtle)] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h4 className="break-all text-sm font-medium text-[var(--text-primary)]">{row.agentId} · {row.source}</h4><span className="text-xs text-[var(--text-secondary)]">관측 규격 {row.adapterVersion} · 최근 수집 {when(row.latestAt)}</span></div>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">{row.summary.windows}개 구간 · {row.summary.completeWindow?'조회 기간 전체 관측':'조회 기간에 빈 구간 있음'}{row.excludedOverlaps||row.conflictingWindows?` · 겹침 ${row.excludedOverlaps}개 / 충돌 ${row.conflictingWindows}개 제외`:''}</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(metric=><MetricValue key={metric.key} summary={row.summary} metric={metric}/>)}</div>
          <details className="mt-3 text-xs text-[var(--text-secondary)]"><summary className="cursor-pointer">수집 구간별 표본 보기</summary>
            {row.pointsTruncated&&<p className="mt-2">상세 목록은 최근 200개 구간입니다. 위 합계는 검증된 전체 구간을 포함합니다.</p>}
            <div className="mt-2 max-h-64 overflow-auto"><table className="w-full min-w-[34rem] text-left"><thead><tr><th className="p-2">수집 구간</th><th className="p-2">첫 턴 평균 (표본)</th><th className="p-2">최대 입력 평균 (표본)</th><th className="p-2">도구 결과 평균 (표본)</th></tr></thead><tbody>{row.points.map(point=><tr key={`${point.startUtc}:${point.endUtc}`} className="border-t border-[var(--border-subtle)]"><td className="p-2">{when(point.startUtc)} ~ {when(point.endUtc)}</td>{(['firstTurnTokens','peakContextTokens','toolResultChars'] as const).map(key=><td key={key} className="p-2">{point.metrics[key]?.count?`${number(point.metrics[key]!.sum/point.metrics[key]!.count)} (${point.metrics[key]!.count})`:'—'} · {capabilityText[point.metricCapabilities[key]]}</td>)}</tr>)}</tbody></table></div>
          </details>
        </article>)}</div>
        <form className="rounded-lg border border-[var(--border-subtle)] p-4" onSubmit={event=>{
          event.preventDefault();if(!selected||!changeAt||!hours)return
          const at=new Date(changeAt);if(!Number.isFinite(at.getTime()))return
          setComparison({agentId:selected.agentId,source:selected.source,changeAt:at.toISOString(),comparisonHours:hours})
        }}>
          <h4 className="text-sm font-medium text-[var(--text-primary)]">변경 시각 전후 비교</h4>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">같은 에이전트·소스에서 같은 길이의 인접 구간을 비교합니다. 관측된 차이가 변경의 효과를 입증하지는 않습니다.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs text-[var(--text-secondary)]">에이전트·소스<select required aria-label="관측 비교 에이전트·소스" value={stream} onChange={e=>setStream(e.target.value)} className="mt-1 block w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-2"><option value="">선택하세요</option>{data.streams.map(row=><option key={`${row.agentId}:${row.source}`} value={JSON.stringify([row.agentId,row.source])}>{row.agentId} · {row.source}</option>)}</select></label>
            <label className="text-xs text-[var(--text-secondary)]">변경 시각 (현지 시간)<input required aria-label="관측 변경 시각" type="datetime-local" step="0.001" value={changeAt} onChange={e=>setChangeAt(e.target.value)} className="mt-1 block w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-2"/></label>
            <label className="text-xs text-[var(--text-secondary)]">변경 전·후 각각 (시간)<input required aria-label="관측 비교 구간 시간" type="number" min="1" max={days*12} step="1" value={hours} onChange={e=>setHours(e.target.value)} className="mt-1 block w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-2"/></label>
          </div>
          <div className="mt-3 flex gap-3"><button type="submit" disabled={loading||!selected} className="rounded border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] disabled:opacity-40">비교 조회</button>{comparison&&<button type="button" onClick={()=>setComparison(null)} className="text-xs text-[var(--text-secondary)]">비교 해제</button>}</div>
        </form>
        {data.comparison&&<div className="rounded-lg border border-[var(--border-subtle)] p-4">
          <h4 className="text-sm font-medium text-[var(--text-primary)]">{data.comparison.agentId} · {data.comparison.source} · 전후 각각 {data.comparison.durationHours}시간</h4>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">변경 시각 {when(data.comparison.changeAt)} · {data.comparison.reason==='incomplete-evidence'?'일부 지표에 결측·불완전 구간 또는 표본 부족이 있어 차이를 계산하지 않았습니다.':'관측된 차이이며 인과관계를 판정하지 않습니다.'}</p>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[30rem] text-left text-xs text-[var(--text-secondary)]"><thead><tr><th className="p-2">지표</th><th className="p-2">변경 전 표본</th><th className="p-2">변경 후 표본</th><th className="p-2">차이 (후 − 전)</th></tr></thead><tbody>{metrics.map(metric=>{
            const result=data.comparison!.metrics[metric.key]
            return <tr key={metric.key} className="border-t border-[var(--border-subtle)]"><td className="p-2">{metric.label}{['firstTurnTokens','peakContextTokens','toolResultChars'].includes(metric.key)?' 평균':' 합계'}</td><td className="p-2">{result.beforeSamples}</td><td className="p-2">{result.afterSamples}</td><td className="p-2">{result.comparable&&result.delta!==null?`${result.delta>0?'+':''}${number(result.delta)} ${metric.unit}`:'근거 부족'}</td></tr>
          })}</tbody></table></div>
        </div>}
      </>}
    </>}
  </section>
}
