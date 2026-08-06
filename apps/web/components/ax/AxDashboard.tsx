'use client'

/**
 * 사내 AX 대시보드 화면
 *
 * 맨 위에 핵심 수치 밴드를 두고, 아래를 벤토 그리드로 채운다.
 * 기간 탭 하나로 모든 항목을 함께 갱신하되 조회는 항목별로 따로 한다 —
 * 하나가 실패해도 나머지는 그대로 보이게 하기 위함이다.
 */

import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import type { AxPanelHighlight, AxPanelMeta, AxPanelResult } from '@/lib/features/ax'
import { getAxPanelView } from './panels'
import { AxPanelBoundary } from './AxPanelBoundary'
import { formatUpdatedAt } from './format'

/** 조회 기간(일) — API가 허용하는 값과 같아야 한다 */
const DAY_OPTIONS = [7, 30, 90] as const

/** 조회 기간 타입 */
type AxDays = (typeof DAY_OPTIONS)[number]

/** 기본 조회 기간 */
const DEFAULT_DAYS: AxDays = 30

/** 탭 하나 = 항목 하나. 여러 표를 한 화면에 겹쳐 놓지 않는다 */

/** 패널 하나의 조회 상태 */
interface PanelState {
  /** 조회 중 여부 */
  loading: boolean
  /** 네트워크·서버 오류 메시지. 패널 자체의 error 상태와는 구분된다 */
  fetchError: string | null
  /** 패널 응답 */
  result: AxPanelResult | null
}

/**
 * AxDashboard props
 */
export interface AxDashboardProps {
  /** 서버에서 판정한, 이 사용자가 볼 수 있는 패널 목록 */
  panels: AxPanelMeta[]
  /** 관리자 여부 — 개인 정보가 포함된 항목의 표시 기준 */
  isAdmin: boolean
}

/**
 * 사내 AX 대시보드
 *
 * @param panels - 서버에서 미리 구한 패널 메타 목록
 * @param isAdmin - 관리자 여부
 */
export function AxDashboard({ panels, isAdmin }: AxDashboardProps) {
  const [days, setDays] = useState<AxDays>(DEFAULT_DAYS)
  const [states, setStates] = useState<Record<string, PanelState>>({})
  // 화면에 띄울 항목. 조회는 전부 하되(맨 위 밴드가 모든 수치를 쓴다) 표는 하나만 보인다
  const [activeId, setActiveId] = useState<string>(panels[0]?.id ?? '')
  // 패널별 진행 중인 요청. 새 요청이 뜨면 이전 것을 끊어, 늦게 온 응답이
  // 이미 바뀐 기간의 화면에 얹히는 일을 막는다
  const requestsRef = useRef(new Map<string, AbortController>())

  const loadPanel = useCallback(async (panelId: string, targetDays: number) => {
    requestsRef.current.get(panelId)?.abort()
    const request = new AbortController()
    requestsRef.current.set(panelId, request)

    setStates((prev) => ({
      ...prev,
      [panelId]: { loading: true, fetchError: null, result: prev[panelId]?.result ?? null },
    }))

    try {
      const response = await fetch(`/api/ax/${panelId}?days=${targetDays}`, {
        signal: request.signal,
      })
      if (!response.ok) {
        throw new Error('데이터를 불러오지 못했습니다')
      }
      const result = (await response.json()) as AxPanelResult
      if (request.signal.aborted) return
      setStates((prev) => ({ ...prev, [panelId]: { loading: false, fetchError: null, result } }))
    } catch (error) {
      // 우리가 끊은 요청은 오류가 아니다 — 뒤이은 요청이 화면을 채운다
      if (request.signal.aborted) return
      const message = error instanceof Error ? error.message : '데이터를 불러오지 못했습니다'
      setStates((prev) => ({
        ...prev,
        [panelId]: { loading: false, fetchError: message, result: null },
      }))
    }
  }, [])

  // panels 배열은 렌더마다 새 객체라 id 목록을 문자열로 굳혀 의존성으로 쓴다
  const panelIdKey = panels.map((panel) => panel.id).join('|')

  useEffect(() => {
    const requests = requestsRef.current

    for (const panelId of panelIdKey.split('|').filter(Boolean)) {
      // 패널마다 독립 요청 — 하나가 느리거나 실패해도 나머지를 막지 않는다
      void loadPanel(panelId, days)
    }

    // 화면을 떠나면 남은 요청을 끊는다
    return () => {
      for (const request of requests.values()) request.abort()
    }
  }, [panelIdKey, days, loadPanel])

  if (panels.length === 0) {
    return <p className="mt-16 text-[var(--text-secondary)]">아직 볼 수 있는 항목이 없습니다.</p>
  }

  // 각 항목이 스스로 올린 핵심 수치를 모아 맨 위 밴드를 만든다
  const highlights = panels.flatMap((panel) => states[panel.id]?.result?.highlights ?? [])
  const anyLoading = panels.some((panel) => !states[panel.id] || states[panel.id]?.loading)

  const active = panels.find((panel) => panel.id === activeId) ?? panels[0]

  return (
    <>
      <HighlightBand highlights={highlights} loading={anyLoading && highlights.length === 0} />

      <div className="mt-10 flex items-end justify-between gap-4 flex-wrap border-b border-[var(--border-subtle)]">
        <nav className="flex items-center gap-1 -mb-px" role="tablist" aria-label="지표 항목">
          {panels.map((panel) => {
            const selected = panel.id === active.id
            return (
              <button
                key={panel.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveId(panel.id)}
                className={`relative px-4 py-2.5 text-sm transition-colors duration-200 ${
                  selected
                    ? 'text-[var(--text-primary)] font-medium'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {panel.title}
                <span
                  className={`absolute inset-x-0 -bottom-px h-0.5 transition-colors duration-200 ${
                    selected ? 'bg-[var(--brand-primary)]' : 'bg-transparent'
                  }`}
                />
              </button>
            )
          })}
        </nav>

        {active.usesPeriod && <PeriodControl value={days} onChange={setDays} />}
      </div>

      {!isAdmin && (
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          개인 정보가 포함된 항목은 관리자에게만 보입니다.
        </p>
      )}

      <div className="mt-8">
        <AxPanelView
          key={active.id}
          meta={active}
          state={states[active.id]}
          days={days}
          onRetry={() => loadPanel(active.id, days)}
        />
      </div>
    </>
  )
}

/**
 * 핵심 수치 밴드 — 각 항목이 올린 숫자를 한 줄로 모은다
 *
 * @param highlights - 패널들이 올린 수치 목록
 * @param loading - 아직 아무 수치도 도착하지 않았는지
 */
function HighlightBand({
  highlights,
  loading,
}: {
  highlights: AxPanelHighlight[]
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--border-subtle)] rounded-2xl overflow-hidden">
        {[0, 1, 2, 3].map((slot) => (
          <div key={slot} className="bg-[var(--bg-primary)] px-6 py-7">
            <div className="ax-shimmer h-3 w-16 rounded" />
            <div className="ax-shimmer mt-3 h-9 w-24 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (highlights.length === 0) return null

  return (
    <div className="ax-reveal grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--border-subtle)] rounded-2xl overflow-hidden">
      {highlights.slice(0, 4).map((highlight) => (
        <div key={highlight.label} className="bg-[var(--bg-primary)] px-6 py-7">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {highlight.label}
          </p>
          <p className="mt-2.5 flex items-baseline gap-1.5">
            <span className="font-mono text-3xl md:text-[2.5rem] leading-none tabular-nums tracking-tight text-[var(--text-primary)]">
              {highlight.value}
            </span>
            {highlight.hint && (
              <span className="font-mono text-xs text-[var(--text-muted)]">{highlight.hint}</span>
            )}
          </p>
        </div>
      ))}
    </div>
  )
}

/**
 * 기간 선택 — 알약 하나가 현재 값을 따라 움직이는 세그먼트 컨트롤
 *
 * @param value - 현재 선택된 기간(일)
 * @param onChange - 기간 변경 핸들러
 */
function PeriodControl({ value, onChange }: { value: AxDays; onChange: (days: AxDays) => void }) {
  return (
    <div
      className="inline-flex items-center gap-0.5 p-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
      role="group"
      aria-label="조회 기간"
    >
      {DAY_OPTIONS.map((option) => {
        const active = value === option
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={active}
            className={`px-4 py-1.5 rounded-full font-mono text-xs tabular-nums transition-all duration-200 active:scale-[0.97] ${
              active
                ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {option}일
          </button>
        )
      })}
    </div>
  )
}

/**
 * 선택된 항목 하나를 넓게 펼친다
 *
 * 카드로 감싸지 않는다 — 한 화면에 하나만 보이므로 경계를 그을 이유가 없다.
 *
 * @param meta - 패널 메타데이터
 * @param state - 조회 상태 (아직 시작 전이면 undefined)
 * @param days - 현재 조회 기간(일)
 * @param onRetry - 재시도 핸들러
 */
function AxPanelView({
  meta,
  state,
  days,
  onRetry,
}: {
  meta: AxPanelMeta
  state: PanelState | undefined
  days: number
  onRetry: () => void
}) {
  const result = state?.result ?? null
  // 자체 갱신 시각을 들고 있는 패널은 조회 시각("방금")을 쓰면 신선도를 속이게 된다
  const ownsFreshness = result !== null && hasOwnSyncTime(result.data)

  const marks = [
    !meta.usesPeriod ? '현재 시점' : null,
    result && !ownsFreshness ? formatUpdatedAt(result.generatedAt) : null,
  ].filter((mark): mark is string => Boolean(mark))

  return (
    <section className="ax-reveal">
      <div className="flex items-start justify-between gap-4 mb-7">
        <p className="text-sm leading-relaxed text-[var(--text-secondary)] max-w-[70ch]">
          {meta.description}
        </p>
        {marks.length > 0 && (
          <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)] pt-0.5">
            {marks.join(' · ')}
          </p>
        )}
      </div>

      {/* 렌더 도중 터지는 예외는 이 카드 안에 가둔다 — 다른 항목은 그대로 남는다 */}
      <AxPanelBoundary
        resetKey={`${meta.id}:${days}`}
        fallback={(reset) => (
          <ErrorNotice
            message="이 항목을 화면에 그리지 못했습니다"
            onRetry={() => {
              reset()
              onRetry()
            }}
          />
        )}
      >
        <AxPanelBody meta={meta} state={state} days={days} onRetry={onRetry} />
      </AxPanelBoundary>

      <p className="mt-6 pt-4 border-t border-[var(--border-subtle)] font-mono text-[10px] text-[var(--text-muted)]">
        {meta.source}
      </p>
    </section>
  )
}

/**
 * 패널 데이터가 자기 갱신 시각(`syncedAt`)을 들고 있는지
 *
 * 수동으로 넘어오는 자료는 조회 시각과 실제 갱신 시각이 다르므로,
 * 그런 패널은 공통 시각 표기를 접고 패널이 직접 기준 시각을 보여준다.
 *
 * @param data - 패널 응답 데이터
 * @returns 자체 갱신 시각을 가진 패널이면 true
 */
function hasOwnSyncTime(data: unknown): boolean {
  if (data === null || typeof data !== 'object' || !('syncedAt' in data)) return false
  const value = (data as { syncedAt: unknown }).syncedAt
  return typeof value === 'string' || value === null
}

/**
 * 패널 본문 — 로딩·미설정·오류·정상을 각각 다르게 보여준다
 *
 * @param meta - 패널 메타데이터
 * @param state - 조회 상태
 * @param days - 현재 조회 기간(일)
 * @param onRetry - 재시도 핸들러
 */
function AxPanelBody({
  meta,
  state,
  days,
  onRetry,
}: {
  meta: AxPanelMeta
  state: PanelState | undefined
  days: number
  onRetry: () => void
}) {
  if (!state || state.loading) {
    return <PanelSkeleton />
  }

  if (state.fetchError) {
    return <ErrorNotice message={state.fetchError} onRetry={onRetry} />
  }

  const result = state.result
  if (!result) {
    return <ErrorNotice message="데이터를 불러오지 못했습니다" onRetry={onRetry} />
  }

  if (result.status === 'not_configured') {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-hover)] px-5 py-8 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          {result.message ?? '데이터 소스가 아직 연결되지 않았습니다'}
        </p>
      </div>
    )
  }

  if (result.status === 'error') {
    return <ErrorNotice message={result.message ?? '데이터를 불러오지 못했습니다'} onRetry={onRetry} />
  }

  if (result.data === null) {
    return <p className="text-sm text-[var(--text-muted)]">표시할 데이터가 없습니다.</p>
  }

  // 컴포넌트는 모듈 단위 맵에서 꺼내므로 참조가 매 렌더 바뀌지 않는다.
  // JSX 태그로 쓰면 린터가 "렌더 중 생성"으로 오인하므로 createElement로 만든다.
  return createElement(getAxPanelView(meta.id), { data: result.data as never, days })
}

/**
 * 로딩 자리표시자 — 실제 배치와 비슷한 모양으로 둔다
 *
 * 원형 스피너 대신 자리를 잡아 두어야 데이터가 도착할 때 화면이 튀지 않는다.
 */
function PanelSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="ax-shimmer h-28 rounded-xl" />
      {[0, 1, 2].map((row) => (
        <div key={row} className="ax-shimmer h-7 rounded-lg" />
      ))}
    </div>
  )
}

/**
 * 오류 안내 + 재시도 버튼
 *
 * @param message - 사용자에게 보여줄 오류 문구
 * @param onRetry - 재시도 핸들러
 */
function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl bg-[var(--bg-tertiary)] px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
      <p className="text-sm text-[var(--text-primary)]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="font-mono text-xs px-3 py-1.5 rounded-full border border-[var(--border-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors active:translate-y-px"
      >
        다시 시도
      </button>
    </div>
  )
}
