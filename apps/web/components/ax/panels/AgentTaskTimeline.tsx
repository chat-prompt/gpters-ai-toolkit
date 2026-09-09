'use client'

import styles from './AgentTaskTimeline.module.css'
import { useState } from 'react'
import type { AxAgentActivityData } from '@/lib/features/ax'

type Trace = NonNullable<AxAgentActivityData['taskTraces']>[number]
const PHASES = { task: '작업', search: '검색', 'search-skip': '검색 건너뜀', 'execution-report': '실행 보고 접수', 'skill-load': '스킬 조회', tool: '도구', execution: '실행', verification: '검증', delivery: '전달', 'read-guard': '읽기 차단', compaction: '컴팩션' }
const STATUS = { started: '진행 중', succeeded: '성공', failed: '실패', skipped: '건너뜀', unknown: '미확인' }
const EVIDENCE = { api: 'API 응답', process: '프로세스 관측', 'self-reported': '자체 보고' }
const color = (status: string) => status === 'failed' ? styles.failure : status === 'succeeded' ? styles.success : 'text-[var(--text-secondary)]'
const time = (date: string) => new Date(date).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
function latest(trace: Trace, phase: string) { return trace.events.filter(event => event.phase === phase).at(-1) }

export function AgentTaskTimeline({ traces, agentId, coverage }: { traces: Trace[]; agentId: string; coverage?: AxAgentActivityData['taskTraceCoverage'] }) {
  const [failuresOnly, setFailuresOnly] = useState(false)
  const [page, setPage] = useState(0)
  const [compareId, setCompareId] = useState('')
  const [source, setSource] = useState('all')
  const scoped = traces.filter(trace => agentId === 'all' || trace.agentId === agentId).filter(trace => source === 'all' || trace.source === source)
  const truncated = coverage?.truncatedStreams.filter(stream => (agentId === 'all' || stream.agentId === agentId) && (source === 'all' || stream.source === source)) ?? []
  const matching = scoped.filter(trace => !failuresOnly || trace.events.some(event => event.status === 'failed'))
  const filtered = matching.slice(0, 100)
  const lastPage = Math.max(0, Math.ceil(filtered.length / 8) - 1)
  const activePage = Math.min(page, lastPage)
  const current = filtered[0]
  const comparison = scoped.find(trace => `${trace.agentId}:${trace.source}:${trace.taskId}` === compareId)
  return <section aria-labelledby="agent-task-timeline-title" className="min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 id="agent-task-timeline-title" className="text-sm font-semibold text-[var(--text-primary)]" title="같은 작업 ID로 연결된 이벤트입니다. API 성공은 스킬 실행·검증·실제 전달 성공과 다릅니다. 작업에 귀속되지 않은 토큰은 배분하지 않습니다.">작업 타임라인 <span className="font-normal text-[var(--text-secondary)]">ⓘ</span></h3>
      <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">소스<select aria-label="작업 소스" value={source} onChange={event => { setSource(event.target.value); setPage(0); setCompareId('') }} className="rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-2"><option value="all">전체 소스</option>{[...new Set(traces.map(trace => trace.source))].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><input type="checkbox" checked={failuresOnly} onChange={event => { setFailuresOnly(event.target.checked); setPage(0) }} />실패 포함 작업만</label>
    </div>
    {truncated.length > 0 && <p className="mt-2 text-xs text-[var(--accent-orange)]">각 에이전트·소스의 최근 {coverage!.limitPerStream}개까지 조회했습니다. 이전 {truncated.reduce((sum, stream) => sum + stream.total - stream.returned, 0)}개는 이 목록과 실패 필터에 포함되지 않습니다.</p>}
    {filtered.length === 0 ? <p className="py-6 text-sm text-[var(--text-secondary)]">{failuresOnly ? '실패가 기록된 작업이 없습니다.' : '아직 연결된 작업 기록이 없습니다. 작업 추적을 적용한 새 실행부터 표시됩니다.'}</p> : <>
      <p className="mt-2 text-xs text-[var(--text-secondary)]">{truncated.length ? '조회된' : '조회 기간 내'} {matching.length}개 중 최근 {filtered.length}개 · 근거가 없으면 미확인입니다.</p>
      <div className={`mt-4 divide-y divide-[var(--border-subtle)] ${filtered.length > 8 ? 'min-h-[40rem]' : ''}`}>
        {filtered.slice(activePage * 8, activePage * 8 + 8).map(trace => <details key={`${trace.agentId}:${trace.source}:${trace.taskId}`} className="py-3">
          <summary className="cursor-pointer text-sm text-[var(--text-primary)]">
            <span className="ml-2 font-mono text-xs break-all">{trace.agentId} · {trace.taskId.slice(0, 8)}</span>
            <span className="ml-3 text-xs text-[var(--text-secondary)]">{trace.source} · {time(trace.updatedAt)}</span>
            <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-5 text-xs">{(['task','search','skill-load','execution','verification','delivery'] as const).map(phase => {
              const event = latest(trace, phase)
              return <span key={phase} className={color(event?.status ?? 'unknown')}>{PHASES[phase]} {phase === 'task' && (!event || event.status === 'started') ? '종료 미관측' : event ? STATUS[event.status] : '미확인'}{event && <small className="ml-1 text-[var(--text-secondary)]">({EVIDENCE[event.evidence]})</small>}</span>
            })}</span>
          </summary>
          <div className="mt-3 pl-5">
            <p className="mb-3 break-all text-xs text-[var(--text-secondary)]">수집기 {trace.versions.join(' → ')} · 작업 토큰 미귀속 · 실행 종료와 전체 작업 완료는 별도입니다 · ID {trace.taskId}</p>
            <ol className="space-y-3 border-l border-[var(--border-subtle)] pl-4">{trace.events.map(event => <li key={event.eventId} className="text-xs">
              <div className="flex flex-wrap gap-x-3 gap-y-1"><time className="text-[var(--text-secondary)]">{time(event.atUtc)}</time><span className={color(event.status)}>{PHASES[event.phase]} · {STATUS[event.status]}</span><span className="text-[var(--text-secondary)]">{EVIDENCE[event.evidence]}{event.durationMs !== undefined ? ` · ${(event.durationMs/1000).toFixed(1)}초` : ''}</span></div>
              <p className="mt-1 text-[var(--text-secondary)]" title={`event ${event.eventId}${event.parentEventId ? ` / parent ${event.parentEventId}` : ''}`}>시도 {event.attemptId.slice(0,8)}{event.parentEventId ? ' · 선행 이벤트 연결' : ''}</p>
              {event.metrics && <p className="mt-1 text-[var(--text-secondary)]">{Object.entries(event.metrics).map(([key,value]) => `${({contextInputTokens:'컨텍스트 토큰',toolResultChars:'도구 결과 글자',readGuardDeniedCount:'읽기 거절',compactionCount:'컴팩션'} as Record<string,string>)[key]} ${value}`).join(' · ')}</p>}
            </li>)}</ol>
          </div>
        </details>)}
      </div>
      <nav aria-label="작업 타임라인 페이지" className="mt-3 flex h-9 items-center justify-between text-xs text-[var(--text-secondary)]"><button disabled={activePage===0} onClick={()=>setPage(activePage-1)} className="disabled:opacity-40">이전</button><span>{activePage+1} / {lastPage+1}</span><button disabled={activePage===lastPage} onClick={()=>setPage(activePage+1)} className="disabled:opacity-40">다음</button></nav>
      {scoped.length > 1 && current && <div className="mt-4">
        <label className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">최근 작업과 비교<select aria-label="비교할 작업" value={compareId} onChange={event=>setCompareId(event.target.value)} className="max-w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-2"><option value="">이전 작업 선택</option>{scoped.filter(trace=>trace!==current).map(trace=><option key={`${trace.agentId}:${trace.source}:${trace.taskId}`} value={`${trace.agentId}:${trace.source}:${trace.taskId}`}>{trace.agentId} · {trace.taskId.slice(0,8)} · {trace.versions.join(', ')}</option>)}</select></label>
        {comparison && <div className="mt-3 grid gap-3 sm:grid-cols-2">{[comparison,current].map((trace,index)=><div key={index} className="rounded border border-[var(--border-subtle)] p-3 text-xs text-[var(--text-secondary)]"><p className="font-medium text-[var(--text-primary)]">{index===0?'선택한 작업':'최근 작업'} · {trace.taskId.slice(0,8)}</p><p className="mt-1">수집기 {trace.versions.join(', ')} · 실패 이벤트 {trace.events.filter(e=>e.status==='failed').length}건</p><p>{(['verification','delivery'] as const).map(phase => { const event = latest(trace, phase); return <span key={phase} className="mr-3 inline-block">{PHASES[phase]} {event ? `${STATUS[event.status]} (${EVIDENCE[event.evidence]})` : '미확인'}</span> })}</p></div>)}</div>}
      </div>}
    </>}
  </section>
}
