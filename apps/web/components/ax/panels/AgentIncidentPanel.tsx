'use client'
import { useRef, useState } from 'react'
import type { IncidentCase, IncidentReviewData, IncidentState, IncidentAction } from '@/lib/features/ax'
import type { AxPanelViewProps } from './types'
import { formatDateTime } from '../format'

const labels: Record<IncidentState, string> = { candidate: '검토 전', reviewing: '검토 중', 'needs-info':'추가 확인 요청', confirmed: '사고 확정', 'false-positive': '오탐', fixed: '수정됨', verified: '재검증 완료' }
const phases: Record<string, string> = { task: '작업', execution: '실행', verification: '검증', delivery: '전달', tool: '도구', 'read-guard': '읽기 제한', search: '검색', 'search-skip': '검색 생략', 'skill-load': '스킬 로드', 'execution-report': '실행 보고', compaction: '컴팩션' }
const evidenceLabels = { api: 'API 관측', process: '프로세스 관측', 'self-reported': '자체 보고' }
const field = 'w-full rounded-lg border border-[var(--border-hover)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]'
const button = 'rounded-lg border border-[var(--border-hover)] px-3 py-2 text-sm text-[var(--text-primary)] disabled:opacity-50'

export function AgentIncidentPanel({ data, days, selection, onSelectionChange }: AxPanelViewProps<IncidentReviewData>) {
  const [agent, setAgent] = useState('all')
  const [state, setState] = useState(selection ? 'all' : 'open')
  const [localSelected, setLocalSelected] = useState<string | null>(null)
  const selected = selection ?? localSelected
  const setSelected = (id:string) => { if(onSelectionChange)onSelectionChange(id);else setLocalSelected(id) }
  const [saved, setSaved] = useState<Record<string, IncidentCase>>({})
  const cases = data.cases.map(c => saved[c.id] && saved[c.id].revision > c.revision && !c.recurrence ? saved[c.id] : c)
  const filtered = cases.filter(c => (agent === 'all' || c.agentId === agent) &&
    (state === 'all' || state === 'open' ? state === 'all' || !!c.report?.pendingReview || !['verified', 'false-positive'].includes(c.state) : c.state === state))
  const active = cases.find(c => c.id === selected)
  return <section className="space-y-5" aria-label="문제 검토">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-xl font-semibold">문제 후보와 조치</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">검토 필요 {cases.filter(c => c.report?.pendingReview || ['candidate', 'reviewing', 'needs-info', 'confirmed'].includes(c.state)).length}건 · 재검증 대기 {cases.filter(c => c.state === 'fixed').length}건</p></div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="문제 에이전트" className={field + ' w-auto'} value={agent} onChange={e => setAgent(e.target.value)}><option value="all">전체 에이전트</option>{[...new Set(cases.map(c => c.agentId))].map(id => <option key={id}>{id}</option>)}</select>
        <select aria-label="문제 상태" className={field + ' w-auto'} value={state} onChange={e => setState(e.target.value)}><option value="open">미완료</option><option value="all">전체 상태</option>{Object.entries(labels).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select>
      </div>
    </div>
    <p className="text-xs text-[var(--text-secondary)]" title="이벤트 후보는 같은 소스·단계·근거의 실패를 묶습니다. 슬랙 보고는 요청별로 접수하며, 에이전트의 보고와 독립적인 실행 근거를 구분합니다. 원문과 인증정보는 복사하지 마세요.">슬랙 보고와 관측된 실패를 검토하고, 지정된 사람이 최종 판정합니다. ⓘ</p>
    {(!data.sourceAvailable || data.truncated) && <p role="status" className="rounded-lg border border-[var(--border-hover)] p-3 text-sm text-[color-mix(in_srgb,var(--accent-orange)_75%,var(--text-primary))]">{!data.sourceAvailable ? '작업 이벤트를 확인할 수 없습니다. 슬랙 보고와 저장된 검토는 계속 확인할 수 있습니다.' : '일부 작업 조회가 누락되거나 범위가 잘렸습니다. 후보 목록이 전체 실패를 뜻하지 않습니다.'}</p>}
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-2">
        {!filtered.length && <p className="rounded-xl border border-[var(--border-subtle)] p-6 text-sm text-[var(--text-secondary)]">조건에 맞는 후보가 없습니다. 전체 업무의 정상 판정을 뜻하지 않습니다.</p>}
        {filtered.map(c => <button key={c.id} onClick={() => setSelected(c.id)} aria-pressed={c.id === selected} className={`w-full rounded-xl border p-4 text-left ${c.id === selected ? 'border-[var(--text-primary)] bg-[var(--bg-secondary)]' : 'border-[var(--border-subtle)]'}`}>
          <span className="flex flex-wrap justify-between gap-2"><strong className="break-words">{c.report?.title ?? `${c.agentId} · ${phases[c.phase]}`}</strong><span className="text-sm">{c.recurrence ? '재발 후보' : labels[c.state]}</span></span>
          <span className="mt-2 block text-sm text-[var(--text-secondary)]">{c.report ? `${c.agentId} · 슬랙 보고` : `${c.source} · ${evidenceLabels[c.evidence]}`}{c.report?.pendingReview && c.report.supplements.length > 0 ? ' · 새 보완 자료' : ''}</span>
          <span className="mt-2 block text-xs text-[var(--text-secondary)]">{c.report ? '보고된 발생 시각' : '마지막 실패'} {formatDateTime(c.lastFailureAt)} · {c.revision ? '기록 저장됨' : '아직 저장되지 않은 후보'}</span>
        </button>)}
      </div>
      {active ? <IncidentDetail key={active.id} record={active} data={data} days={days} onSaved={c => setSaved(prev => ({ ...prev, [c.id]: c }))}/> : <div className="rounded-xl border border-dashed border-[var(--border-hover)] p-6 text-sm text-[var(--text-secondary)]">후보를 선택하면 관측 근거와 검토 이력이 표시됩니다.</div>}
    </div>
  </section>
}

function IncidentDetail({ record, data, days, onSaved }: { record: IncidentCase; data: IncidentReviewData; days: number; onSaved: (record: IncidentCase) => void }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [reason, setReason] = useState('')
  const [evidenceRef, setEvidenceRef] = useState('')
  const appliedAtInput = useRef<HTMLInputElement>(null)
  const [changeRef, setChangeRef] = useState('')
  const [rollbackRef, setRollbackRef] = useState('')
  const [minimumSamples, setMinimumSamples] = useState(10)
  const stats = record.state === 'verified' ? record.verification?.stats : data.evaluations[record.id]
  async function save(action: IncidentAction['action']) {
    const appliedAt = appliedAtInput.current?.value ?? ''
    if (!reason.trim() || !evidenceRef.trim()) { setMessage('판정 이유와 근거 링크 또는 기록 위치를 입력하세요'); return }
    if (action === 'fixed' && (!appliedAt || !changeRef.trim() || !rollbackRef.trim())) { setMessage('수정 시각·변경·롤백 근거를 입력하세요'); return }
    setBusy(true); setMessage('')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30000)
    try {
      const response = await fetch('/api/ax/incident-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ id: record.id, revision: record.revision, days, action, reason, evidenceRef,
          ...(action === 'fixed' ? { appliedAt: new Date(appliedAt).toISOString(), changeRef, rollbackRef } : {}),
          ...(action === 'verified' ? { minimumSamples } : {}),
        }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message ?? '저장 실패')
      onSaved(result.record); setMessage('검토 기록을 저장했습니다'); setReason(''); setEvidenceRef('')
    } catch (error) { setMessage(error instanceof Error && error.name !== 'AbortError' ? error.message : '응답을 확인하지 못했습니다. 새로고침으로 저장 여부를 확인하세요') }
    finally { clearTimeout(timer); setBusy(false) }
  }
  const open = ['candidate', 'reviewing', 'needs-info', 'confirmed'].includes(record.state)
  const reopen = !!record.report?.pendingReview && ['fixed','verified','false-positive'].includes(record.state)
  return <article aria-label="후보 상세" className="min-w-0 space-y-4 rounded-xl border border-[var(--border-hover)] bg-[var(--bg-secondary)] p-5">
    <h3 className="font-semibold break-words">{record.report?.title ?? `${record.agentId} · ${phases[record.phase]}`} <span className="ml-2 inline-block whitespace-nowrap text-sm">{labels[record.state]}</span></h3>
    <p className="text-sm text-[var(--text-secondary)]">{record.source === 'unknown' ? '실행 환경 미확인' : record.source} · {evidenceLabels[record.evidence]} · 업무 유형 미분류</p>
    {record.report ? <ReportEvidence record={record}/> : <details><summary className="cursor-pointer text-sm">실패 근거 보기 ({record.examples.length}개 예시)</summary><ul className="mt-2 space-y-2 text-xs text-[var(--text-secondary)]">{record.examples.map(e => <li key={e.eventId} className="break-all">{formatDateTime(e.atUtc)}<br/>작업 {e.taskId}<br/>이벤트 {e.eventId}</li>)}</ul></details>}
    {record.change && <div className="space-y-2 text-sm"><p>수정 적용 {formatDateTime(record.change.appliedAt)}</p><p className="break-all">변경: {record.change.reference}</p><p className="break-all">롤백: {record.change.rollbackRef}</p>{!record.report && <p>수정 전 실패 {record.change.baseline.failed}/{record.change.baseline.terminal}회</p>}</div>}
    {stats && !record.report && <div className="rounded-lg border border-[var(--border-hover)] p-3 text-sm"><p>수정 후 실패 {stats.failed}/{stats.terminal}회 · 미종료 {stats.unresolved}회</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{formatDateTime(stats.start)} – {formatDateTime(stats.end)} · {stats.complete ? '조회 범위 확보' : '조회 근거 불완전'}</p></div>}
    {record.state === 'verified' && <p className="text-sm text-[var(--text-secondary)]">{record.report ? '검토자가 연결된 재검증 근거를 확인하고 승인했습니다.' : '검토자가 해당 관측 기간을 승인했습니다.'} 전체 업무의 성공이나 영구 해결을 보장하지 않습니다.</p>}
    <details open={record.history.length > 0}><summary className="cursor-pointer text-sm">검토 이력 ({record.history.length})</summary><ol className="mt-3 space-y-3 text-sm">{record.history.map((h,i) => <li key={i} className="border-l border-[var(--border-hover)] pl-3"><p>{h.action === 'reported' ? '에이전트 접수' : labels[h.action as IncidentState] ?? '재발 후보 관측'} · {formatDateTime(h.at)}</p><p className="mt-1 whitespace-pre-wrap break-words">{h.reason}</p><p className="break-all text-xs text-[var(--text-secondary)]">근거 <EvidenceLink value={h.evidenceRef}/> · 기록자 {h.actor}</p></li>)}</ol></details>
    {data.canReview === false && <p className="text-sm text-[var(--text-secondary)]">지정된 최종 검토자만 판정을 저장할 수 있습니다.</p>}
    {data.canReview !== false && (open || reopen || record.state === 'fixed') && <div className="space-y-3 border-t border-[var(--border-hover)] pt-4">
      <label className="block text-sm">판정 이유<textarea className={field + ' mt-1'} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} placeholder="확인한 사실과 판단을 짧게 기록"/></label>
      <label className="block text-sm">근거 링크 또는 기록 위치<input className={field + ' mt-1'} maxLength={2000} value={evidenceRef} onChange={e => setEvidenceRef(e.target.value)} placeholder="실패를 확인한 Slack 스레드·내부 문서 링크"/></label>
      {record.state === 'confirmed' && <div className="space-y-3"><label className="block text-sm">수정 적용 시각<input ref={appliedAtInput} type="datetime-local" className={field + ' mt-1'}/></label><label className="block text-sm">변경 참조<input className={field + ' mt-1'} maxLength={2000} value={changeRef} onChange={e => setChangeRef(e.target.value)} placeholder="commit:revision 또는 비공개 변경 기록"/></label><label className="block text-sm">롤백 참조<input className={field + ' mt-1'} maxLength={2000} value={rollbackRef} onChange={e => setRollbackRef(e.target.value)}/></label></div>}
      {record.state === 'fixed' && (record.report ? <p className="text-sm">에이전트의 수정 후 재검증 보고와 연결된 근거를 확인하고 승인하세요.</p> : <label className="block text-sm">재검증 최소 표본<input type="number" min={1} max={10000} className={field + ' mt-1'} value={minimumSamples} onChange={e => setMinimumSamples(Number(e.target.value))}/><span className="mt-1 block text-xs text-[var(--text-secondary)]">같은 소스·단계·근거의 종료 시도 수입니다. 재검증 시 서버에서 다시 계산합니다.</span></label>)}
      <div className="flex flex-wrap gap-2">
        {(open || reopen) && <button className={button} disabled={busy} onClick={() => save('reviewing')}>검토 중으로</button>}
        {open && <><button className={button} disabled={busy} onClick={() => save('needs-info')}>추가 확인 요청</button><button className={button} disabled={busy} onClick={() => save('confirmed')}>사고 확정</button><button className={button} disabled={busy} onClick={() => save('false-positive')}>오탐으로 판정</button></>}
        {record.state === 'confirmed' && <button className={button} disabled={busy} onClick={() => save('fixed')}>수정 기록 저장</button>}
        {record.state === 'fixed' && <button className={button} disabled={busy || (!record.report && !data.sourceAvailable)} onClick={() => save('verified')}>재검증 후 승인</button>}
      </div>
    </div>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </article>
}

function EvidenceLink({value,label}:{value:string;label?:string}) {
  const safe = /^https:\/\/[a-z0-9-]+\.slack\.com\/archives\/[CGD][A-Z0-9]+\/p[0-9]{16,20}(?:\?[^\s]*)?$/.test(value)
  return safe ? <a href={value} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">{label ?? 'Slack 근거 열기 ↗'}</a> : <span className="break-all">{value}</span>
}
function ReportEvidence({record}:{record:IncidentCase}) {
  const report = record.report!
  return <div className="space-y-4 text-sm">
    <p className="whitespace-pre-wrap break-words">{report.summary}</p>
    <dl className="space-y-2"><dt className="font-medium">기대 결과</dt><dd className="whitespace-pre-wrap break-words text-[var(--text-secondary)]">{report.expected}</dd><dt className="font-medium">실제 결과</dt><dd className="whitespace-pre-wrap break-words text-[var(--text-secondary)]">{report.actual}</dd>{report.reproduction && <><dt className="font-medium">재현 조건</dt><dd className="whitespace-pre-wrap break-words text-[var(--text-secondary)]">{report.reproduction}</dd></>}</dl>
    <div className="flex flex-wrap gap-3"><EvidenceLink value={report.issueUrl} label="문제 대화 열기 ↗"/><EvidenceLink value={report.approvalUrl} label="보고 요청·승인 메시지 ↗"/></div>
    <p className="text-xs text-[var(--text-secondary)]">보고자 {report.reporterAgentId} · 요청자 {report.requestedBy} (에이전트가 전달한 정보)<br/>슬랙 승인 원문은 검토자가 링크에서 확인합니다. 작업 ID {report.taskId ?? '미연결'}</p>
    {report.supplements.length > 0 && <div className="space-y-3 border-t border-[var(--border-hover)] pt-3"><h4 className="font-medium">에이전트 보완 자료</h4>{report.supplements.map(s => <div key={s.updateId}><p>{s.kind === 'retest-result' ? '재검증 보고' : s.kind === 'fix-result' ? '수정 결과 보고' : '추가 근거'} · {formatDateTime(s.at)}</p><p className="whitespace-pre-wrap break-words text-[var(--text-secondary)]">{s.summary}</p>{s.outcome && <p>보고 결과: {s.outcome === 'passed' ? '통과' : s.outcome === 'failed' ? '실패' : '판정 불가'} · {formatDateTime(s.testedAt ?? null)}</p>}<EvidenceLink value={s.evidenceUrl}/></div>)}</div>}
  </div>
}
