'use client'

import { formatDateTime } from './format'

/** Query freshness is independent of the source's collection freshness. */
export function AxRefreshStatus({ panels, hidden, offline, now, onRefresh }: {
  panels: Array<{ title: string; queriedAt?: number | null; refreshing?: boolean; fetchError?: string | null; wrongPeriod: boolean; result?: unknown }>
  hidden: boolean
  offline: boolean
  now: number
  onRefresh: () => void
}) {
  const errors = panels.filter(panel => panel.fetchError)
  const busy = panels.some(panel => panel.refreshing)
  const complete = panels.every(panel => panel.queriedAt != null)
  const oldest = complete ? Math.min(...panels.map(panel => panel.queriedAt!)) : null
  const stale = oldest !== null && now - oldest >= 120_000
  const wrongPeriod = panels.some(panel => panel.wrongPeriod)
  const label = offline ? '네트워크 연결 끊김' : errors.length ? '갱신 실패'
    : hidden ? '자동 갱신 일시정지' : busy ? '조회 중' : stale ? '화면 데이터 오래됨' : '1분마다 자동 갱신'
  const warning = offline || errors.length > 0 || stale || wrongPeriod
  return (
    <div className="mt-5 flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs" aria-label="대시보드 갱신 상태">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span role="status" className={warning ? 'text-[color-mix(in_srgb,var(--accent-orange)_75%,var(--text-primary))]' : 'text-[var(--text-secondary)]'}>{label}</span>
        <span className="text-[var(--text-secondary)]" title="현재 화면에 필요한 항목 중 가장 오래된 서버 조회 성공 시각입니다. 원천 수집 시각은 각 항목에서 확인합니다.">
          마지막 서버 조회 {oldest === null ? '미완료' : formatDateTime(new Date(oldest).toISOString())}
        </span>
        {(errors.length > 0 || wrongPeriod) && <span className="text-[color-mix(in_srgb,var(--accent-orange)_75%,var(--text-primary))]">
          {wrongPeriod ? '기간 변경 미완료 · 이전 기간 데이터 포함' : panels.some(panel => panel.result) ? '마지막으로 받은 데이터 표시 중' : '표시할 데이터를 받지 못했습니다'}
        </span>}
        {errors.length > 0 && <span className="w-full text-[var(--text-secondary)]" role="alert">
          {errors.map(panel => `${panel.title}: ${panel.fetchError}`).join(' · ')}
        </span>}
      </div>
      <button type="button" onClick={onRefresh} disabled={busy || offline}
        className="shrink-0 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-[var(--text-secondary)] hover:border-[var(--border-hover)] disabled:opacity-50">
        지금 새로고침
      </button>
    </div>
  )
}
