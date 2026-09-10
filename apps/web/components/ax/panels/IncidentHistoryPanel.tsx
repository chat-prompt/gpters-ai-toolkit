'use client'
import { useEffect, useState } from 'react'
import type { IncidentHistoryPage } from '../../../../../packages/lib/src/features/ax/incident-history'
import { formatDateTime } from '../format'

const labels = { candidate: '검토 전', reviewing: '검토 중', 'needs-info': '추가 확인 요청', confirmed: '사고 확정', 'false-positive': '오탐', fixed: '수정됨', verified: '재검증 완료' }
const field = 'rounded-lg border border-[var(--border-hover)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]'

/** Independent read-only history view; server always rechecks internal administrator access. */
export function IncidentHistoryPanel({ refreshToken }: { refreshToken?: unknown } = {}) {
  const [draftAgent, setDraftAgent] = useState('')
  const [filters, setFilters] = useState({ agent: '', source: '', state: '' })
  const [cursors, setCursors] = useState<Array<string | null>>([null])
  const [page, setPage] = useState<IncidentHistoryPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [settledRefresh, setSettledRefresh] = useState({ token: refreshToken })
  const refreshing = !Object.is(settledRefresh.token, refreshToken)
  const busy = loading || refreshing
  const cursor = cursors[cursors.length - 1]
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const timer = setTimeout(() => controller.abort(), 30_000)
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value)
    if (cursor) query.set('cursor', cursor)
    fetch(`/api/ax/incident-history?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error('저장된 이력을 불러오지 못했습니다. 다시 시도해 주세요.'); return response.json() as Promise<IncidentHistoryPage> })
      .then(result => { if (active) { setPage(result); setError('') } })
      .catch(() => { if (active) { setPage(null); setError('저장된 이력을 불러오지 못했습니다. 다시 시도해 주세요.') } })
      .finally(() => { clearTimeout(timer); if (active) { setLoading(false); setSettledRefresh({ token: refreshToken }) } })
    return () => { active = false; clearTimeout(timer); controller.abort() }
  }, [filters, cursor, refresh, refreshToken])
  function beginLoad() { setLoading(true); setError(''); setPage(null) }
  function filter(key: 'source' | 'state', value: string) { beginLoad(); setFilters(previous => ({ ...previous, [key]: value })); setCursors([null]) }
  return <section aria-label="저장된 문제 이력" className="space-y-4">
    <div><h2 className="text-xl font-semibold">저장된 문제 이력</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">기간 제한 없이 저장된 보고와 검토 기록을 조회합니다. 최근 변경 순으로 50건씩 표시합니다.</p></div>
    <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); beginLoad(); setFilters(previous => ({ ...previous, agent: draftAgent.trim() })); setCursors([null]) }}>
      <label className="flex min-w-0 flex-col gap-1 text-sm">에이전트 ID<input className={field} maxLength={100} pattern="[a-zA-Z0-9_.:\-]*" value={draftAgent} onChange={event => setDraftAgent(event.target.value)} placeholder="전체 에이전트"/></label>
      <label className="flex flex-col gap-1 text-sm">소스<select className={field} value={filters.source} onChange={event => filter('source', event.target.value)}><option value="">전체 소스</option>{['claude-code', 'codex', 'openclaw', 'hermes', 'unknown'].map(source => <option key={source}>{source}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-sm">상태<select className={field} value={filters.state} onChange={event => filter('state', event.target.value)}><option value="">전체 상태</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button className={field} type="submit">조회</button>
      <button className={field} type="button" onClick={() => { beginLoad(); setCursors([null]); setRefresh(value => value + 1) }}>최신 이력</button>
    </form>
    <div className="min-h-64 space-y-2" aria-busy={busy}>
      {busy && <p role="status" className="py-6 text-sm">이력을 불러오는 중입니다.</p>}
      {!refreshing && error && <div role="alert" className="space-y-2 py-6 text-sm"><p>{error}</p><button className={field} onClick={() => { beginLoad(); setRefresh(value => value + 1) }}>다시 시도</button></div>}
      {page?.items.length === 0 && <p className="py-6 text-sm text-[var(--text-secondary)]">조건에 맞는 저장된 기록이 없습니다.</p>}
      {page?.items.map(item => <a key={item.id} href={`?panel=agent-incidents&incident=${encodeURIComponent(item.id)}`} className="block rounded-xl border border-[var(--border-subtle)] p-4 hover:bg-[var(--bg-secondary)]">
        <div className="flex flex-wrap justify-between gap-2"><strong className="min-w-0 break-words">{item.title}</strong><span className="text-sm">{labels[item.state]}{item.pendingReview ? ' · 검토 필요' : ''}</span></div>
        <p className="mt-2 break-words text-sm text-[var(--text-secondary)]">{item.agentId} · {item.source} · {item.kind === 'report' ? 'Slack 보고' : '관측 후보'}</p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">변경 {formatDateTime(item.updatedAt)} · 기록 {item.revision}</p>
      </a>)}
    </div>
    <nav aria-label="이력 페이지" className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
      <button className={field + ' disabled:opacity-50'} disabled={busy || cursors.length === 1} onClick={() => { beginLoad(); setCursors(previous => previous.slice(0, -1)) }}>이전</button>
      <span className="text-sm">{cursors.length} 페이지</span>
      <button className={field + ' disabled:opacity-50'} disabled={busy || !page?.nextCursor} onClick={() => { if (page?.nextCursor) { beginLoad(); setCursors(previous => [...previous, page.nextCursor]) } }}>다음</button>
    </nav>
    <p className="text-xs text-[var(--text-secondary)]">조회 중 변경된 기록은 최신 이력에서 다시 확인할 수 있습니다.</p>
  </section>
}
