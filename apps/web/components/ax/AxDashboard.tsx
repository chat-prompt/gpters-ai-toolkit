'use client'

/**
 * 사내 AX 대시보드 화면
 *
 * 맨 위에 핵심 수치 밴드를 두고, 아래를 벤토 그리드로 채운다.
 * 기간 탭은 기간 연동 항목만 갱신하고, 조회는 항목별로 따로 한다 —
 * 하나가 실패해도 나머지는 그대로 보이게 하기 위함이다.
 */

import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import type { AxOverviewData, AxPanelHighlight, AxPanelMeta, AxPanelResult, AxSharedSkillsData } from '@/lib/features/ax'
import { getAxPanelView } from './panels'
import { AxPanelBoundary } from './AxPanelBoundary'
import { formatCount, formatUpdatedAt } from './format'

/** 조회 기간(일) — API가 허용하는 값과 같아야 한다 */
const DAY_OPTIONS = [7, 30, 90] as const

/** 조회 기간 타입 */
type AxDays = (typeof DAY_OPTIONS)[number]

/** 기본 조회 기간 */
const DEFAULT_DAYS: AxDays = 7

/** 상단 8개 수치를 사람·사용·비용 4개와 운영 자산 4개로 나누는 고정 순서 */
const SNAPSHOT_HIGHLIGHT_ORDER = [
  '전체 구성원',
  '주간 활성',
  '주간 토큰 소비량',
  '월 구독 비용',
  '팀 스킬',
  '에이전트 스킬',
  '운영 사이트',
  '활성 구독',
] as const

/**
 * 최상위 탭은 업무 영역(요약·스킬·클라이언트·배포 사이트),
 * 실제 데이터 패널은 그 안의 보조 보기로 묶는다.
 */

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
  // parentId가 있는 패널은 독립 데이터 소스지만, 화면에서는 부모 패널 안의 보조 보기다.
  const topLevelPanels = panels.filter((panel) => !panel.parentId)
  const firstTopLevelId = topLevelPanels[0]?.id ?? ''
  const [days, setDays] = useState<AxDays>(DEFAULT_DAYS)
  const [states, setStates] = useState<Record<string, PanelState>>({})
  // 최상위 업무 영역과 그 안의 보조 보기를 따로 기억한다.
  const [activeRootId, setActiveRootId] = useState<string>(firstTopLevelId)
  const [activePanelId, setActivePanelId] = useState<string>(firstTopLevelId)
  // 패널별 진행 중인 요청. 새 요청이 뜨면 이전 것을 끊어, 늦게 온 응답이
  // 이미 바뀐 기간의 화면에 얹히는 일을 막는다
  const requestsRef = useRef(new Map<string, AbortController>())

  const loadPanel = useCallback(async (
    panelId: string,
    targetDays: number,
    forceRefresh = false
  ) => {
    requestsRef.current.get(panelId)?.abort()
    const request = new AbortController()
    requestsRef.current.set(panelId, request)

    setStates((prev) => ({
      ...prev,
      [panelId]: { loading: true, fetchError: null, result: prev[panelId]?.result ?? null },
    }))

    try {
      const query = new URLSearchParams({ days: String(targetDays) })
      if (forceRefresh) query.set('refresh', '1')
      const response = await fetch(`/api/ax/${panelId}?${query.toString()}`, {
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

  // panels 배열은 렌더마다 새 객체라 요청에 필요한 메타만 문자열로 굳혀 의존성으로 쓴다.
  // usesPeriod까지 포함해야 패널의 기간 계약이 바뀌었을 때 초기 조회를 다시 잡는다.
  const panelRequestKey = JSON.stringify(
    panels.map((panel) => ({ id: panel.id, usesPeriod: panel.usesPeriod }))
  )
  // 패널 구성 변경 효과는 days 변경만으로 재실행되면 안 되므로 최신 값은 ref에서 읽는다.
  const selectedDaysRef = useRef<AxDays>(days)
  const previousPeriodContextRef = useRef({ panelRequestKey, days })

  // 아래 패널 구성 효과보다 먼저 선언해, 두 값이 한 렌더에서 함께 바뀌어도 최신 기간을 쓴다.
  useEffect(() => {
    selectedDaysRef.current = days
  }, [days])

  // 최초 진입이나 볼 수 있는 패널 구성이 바뀌면 전체를 한 번 조회한다.
  useEffect(() => {
    const panelConfigs = JSON.parse(panelRequestKey) as Array<{
      id: string
      usesPeriod: boolean
    }>

    for (const panel of panelConfigs) {
      // 패널마다 독립 요청 — 하나가 느리거나 실패해도 나머지를 막지 않는다
      void loadPanel(panel.id, selectedDaysRef.current)
    }
  }, [panelRequestKey, loadPanel])

  // 기간만 바뀌면 usesPeriod=true 패널만 갱신한다.
  // 고정 스냅샷을 재요청하면 기간과 무관한 값이 토글 직후 달라질 수 있고,
  // 무거운 외부 API 호출도 불필요하게 반복된다.
  useEffect(() => {
    const previous = previousPeriodContextRef.current
    previousPeriodContextRef.current = { panelRequestKey, days }

    // 첫 렌더와 패널 구성 변경은 위 효과가 전체를 조회한다.
    if (previous.panelRequestKey !== panelRequestKey || previous.days === days) return

    const panelConfigs = JSON.parse(panelRequestKey) as Array<{
      id: string
      usesPeriod: boolean
    }>
    for (const panel of panelConfigs) {
      if (panel.usesPeriod) void loadPanel(panel.id, days)
    }
  }, [panelRequestKey, days, loadPanel])

  // 의존성 변경 때마다 전체 요청을 끊으면, 기간 전환 중인 고정 패널 요청이
  // 재시작되지 않은 채 사라진다. 실제로 화면을 떠날 때만 정리한다.
  useEffect(() => {
    const requests = requestsRef.current
    return () => {
      for (const request of requests.values()) request.abort()
    }
  }, [])

  if (topLevelPanels.length === 0) {
    return <p className="mt-16 text-[var(--text-secondary)]">아직 볼 수 있는 항목이 없습니다.</p>
  }

  // 각 항목이 올린 핵심 수치를 기간 연동 여부로 나눈다.
  // 스냅샷 수치는 맨 위 고정 타일로, 기간 연동 수치는 기간 선택 옆 인라인으로 간다.
  const highlights = panels.flatMap((panel) => states[panel.id]?.result?.highlights ?? [])
  const periodHighlights = highlights.filter((highlight) => highlight.periodLinked)
  const snapshotHighlights = highlights
    .filter((highlight) => !highlight.periodLinked)
    .sort((a, b) => {
      const aIndex = SNAPSHOT_HIGHLIGHT_ORDER.indexOf(
        a.label as (typeof SNAPSHOT_HIGHLIGHT_ORDER)[number]
      )
      const bIndex = SNAPSHOT_HIGHLIGHT_ORDER.indexOf(
        b.label as (typeof SNAPSHOT_HIGHLIGHT_ORDER)[number]
      )
      return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) -
        (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex)
    })
  const anyLoading = panels.some((panel) => !states[panel.id] || states[panel.id]?.loading)

  // 잔디밭 두 장 — 사람(aitk 스킬 사용)과 에이전트(bbopters-shared 커밋).
  // 둘 다 기간 선택과 무관한 365일 고정 창이다
  const grassDaily =
    (states['overview']?.result?.data as AxOverviewData | null)?.grassDaily ?? null
  const sharedResult = states['shared-skills']?.result
  const agentGrassDaily =
    (sharedResult?.data as AxSharedSkillsData | null)?.commitDaily ?? null
  // 패널은 정상인데 커밋 통계만 아직 없는 상태 — 잔디가 말없이 사라지면 안 된다
  const agentGrassPending = sharedResult?.status === 'ok' && agentGrassDaily === null

  const activeRoot = topLevelPanels.find((panel) => panel.id === activeRootId) ?? topLevelPanels[0]
  const nestedPanels = [
    activeRoot,
    ...panels.filter((panel) => panel.parentId === activeRoot.id),
  ]
  const active = nestedPanels.find((panel) => panel.id === activePanelId) ?? activeRoot

  return (
    <>
      <SnapshotTiles
        highlights={snapshotHighlights}
        loading={anyLoading && snapshotHighlights.length === 0}
      />

      <GrassCard
        daily={grassDaily}
        label="일별 팀 스킬 로드·적용 보고 — 건"
        info="검색 노출은 제외합니다. 로드와 적용 보고는 독립 신호이므로 합계가 실제 작업 횟수와 같지는 않습니다."
        loading={anyLoading && grassDaily === null}
      />
      {/* 에이전트 활동은 실행 이벤트가 붙기 전까지 저장소 커밋을 프록시로 쓴다 — 라벨이 그 사실을 밝힌다 */}
      {agentGrassPending ? (
        <div className="mt-3 rounded-2xl border border-dashed border-[var(--border-hover)] px-6 py-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
            일별 에이전트 활동(bbopters-shared 커밋)
          </p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            커밋 활동 데이터를 지금은 가져오지 못했습니다. 잠시 후 자동으로 다시 시도합니다.
          </p>
        </div>
      ) : (
        <GrassCard
          daily={agentGrassDaily}
          label="일별 에이전트 활동(bbopters-shared 커밋)"
          info="실제 스킬 실행 집계가 아닙니다. 에이전트들이 워크로그·산출물을 커밋하는 저장소의 커밋 수로 활동 리듬을 간접 추정한 값입니다. 실행 이벤트 수집(DEV-4221)이 붙으면 실측으로 교체됩니다."
          loading={false}
        />
      )}

      <div className="mt-10 flex items-end justify-between gap-4 flex-wrap border-b border-[var(--border-subtle)]">
        <nav className="flex items-center gap-1 -mb-px" role="tablist" aria-label="대시보드 영역">
          {topLevelPanels.map((panel) => {
            const selected = panel.id === activeRoot.id
            return (
              <button
                key={panel.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`ax-panel-${panel.id}`}
                id={`ax-root-tab-${panel.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => {
                  setActiveRootId(panel.id)
                  setActivePanelId(panel.id)
                }}
                onKeyDown={(event) => handleTabKey(
                  event,
                  topLevelPanels.map((item) => item.id),
                  panel.id,
                  (panelId) => {
                    setActiveRootId(panelId)
                    setActivePanelId(panelId)
                  }
                )}
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

        <div className="ml-auto flex items-center justify-end gap-4 pb-1.5 flex-wrap">
          {/* 기간을 바꾸면 변하는 수치는 기간 선택 옆에서만 말한다 —
              선택 UI가 없는 탭에서 보여주면 어느 기간의 값인지 알 수 없다 */}
          {active.usesPeriod && periodHighlights.length > 0 && (
            <p className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
              {periodHighlights
                .map((highlight) => `${highlight.label} ${highlight.value}${highlight.hint ? ` ${highlight.hint}` : ''}`)
                .join(' · ')}
            </p>
          )}
          {active.usesPeriod && <PeriodControl value={days} onChange={setDays} />}
        </div>
      </div>

      {!isAdmin && (
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          개인 정보가 포함된 항목은 관리자에게만 보입니다.
        </p>
      )}

      {nestedPanels.length > 1 && (
        <NestedPanelNav
          parentId={activeRoot.id}
          panels={nestedPanels}
          activeId={active.id}
          onChange={setActivePanelId}
        />
      )}

      <div
        className="mt-8"
        id={`ax-panel-${active.id}`}
        role="tabpanel"
        aria-labelledby={nestedPanels.length > 1
          ? `ax-view-tab-${active.id}`
          : `ax-root-tab-${active.id}`}
      >
        <AxPanelView
          key={active.id}
          meta={active}
          state={states[active.id]}
          days={days}
          onRetry={() => loadPanel(active.id, days)}
          onRefresh={isAdmin && active.id === 'skill-diff'
            ? () => loadPanel(active.id, days, true)
            : undefined}
        />
      </div>
    </>
  )
}

/**
 * 고정 스냅샷 타일 — 기간 선택과 무관한 핵심 수치를 맨 위에 크게 둔다
 *
 * @param highlights - periodLinked가 아닌 수치 목록
 * @param loading - 아직 아무 수치도 도착하지 않았는지
 */
function SnapshotTiles({
  highlights,
  loading,
}: {
  highlights: AxPanelHighlight[]
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--border-subtle)] rounded-2xl overflow-hidden">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((slot) => (
          <div key={slot} className="bg-[var(--bg-primary)] px-5 py-6">
            <div className="ax-shimmer h-3 w-16 rounded" />
            <div className="ax-shimmer mt-3 h-8 w-20 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (highlights.length === 0) return null

  return (
    <div className="ax-reveal grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--border-subtle)] rounded-2xl overflow-hidden">
      {highlights.map((highlight, index) => (
        // 서로 다른 패널이 같은 라벨을 올릴 수 있으므로 라벨만으로 키를 만들지 않는다
        <div key={`${highlight.label}-${index}`} className="bg-[var(--bg-primary)] px-5 py-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {highlight.label}
          </p>
          <p className="mt-2.5 flex items-baseline gap-1.5">
            <span className="font-mono text-[1.75rem] md:text-[2rem] leading-none tabular-nums tracking-tight text-[var(--text-primary)]">
              {highlight.value}
            </span>
            {highlight.hint && (
              <span className="font-mono text-xs text-[var(--text-muted)]">{highlight.hint}</span>
            )}
          </p>
        </div>
      ))}
      {/* 줄이 다 안 차면 빈 칸을 채워 경계색이 구멍처럼 비치지 않게 한다 */}
      {Array.from({ length: (2 - (highlights.length % 2)) % 2 }, (_, slot) => (
        <div key={`fill-sm-${slot}`} className="md:hidden bg-[var(--bg-primary)]" />
      ))}
      {Array.from({ length: (4 - (highlights.length % 4)) % 4 }, (_, slot) => (
        <div key={`fill-md-${slot}`} className="hidden md:block bg-[var(--bg-primary)]" />
      ))}
    </div>
  )
}

/**
 * 잔디밭 카드 — 최근 365일의 일별 활동을 전체 폭으로 펼친다
 *
 * 기간 선택과 무관한 고정 윈도우다. 날짜가 지나면 창이 최신 쪽으로 굴러간다.
 *
 * @param daily - 성과 요약 패널의 365일 고정 일별 시리즈
 * @param loading - 아직 데이터가 도착하지 않았는지
 */
function GrassCard({
  daily,
  label,
  info,
  loading,
}: {
  daily: AxOverviewData['grassDaily'] | null
  label: string
  /** 라벨 옆 ? 아이콘에 띄울 주석 — 프록시 지표처럼 해석 주의가 필요할 때 */
  info?: string
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="mt-3 rounded-2xl border border-[var(--border-subtle)] px-6 py-6">
        <div className="ax-shimmer h-3 w-24 rounded" />
        <div className="ax-shimmer mt-3 h-[95px] rounded" />
      </div>
    )
  }

  if (!daily || daily.length === 0) return null

  return (
    <div className="ax-reveal mt-3 rounded-2xl border border-[var(--border-subtle)] px-6 py-6">
      <ActivityGrass daily={daily} label={label} info={info} />
    </div>
  )
}

/** 잔디밭 색 농도 단계 수 */
const GRASS_LEVELS = 4

/** 잔디 툴팁의 요일 표기 */
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

/**
 * YYYY-MM-DD(KST 날짜 키)의 요일 인덱스 (0=일)
 *
 * 날짜 문자열 자체가 이미 KST 달력 날짜이므로, 시간대 개입 없이
 * 그 날짜의 요일만 구하면 된다 — UTC로 파싱하면 그렇게 된다.
 *
 * @param date - YYYY-MM-DD
 * @returns 0(일)~6(토)
 */
function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

/**
 * 일별 스킬 사용 잔디밭 — 깃허브 잔디 문법으로 매일의 활동량을 한눈에
 *
 * 열 하나가 실제 달력 한 주다: 위가 일요일, 아래가 토요일.
 * 첫 주·마지막 주의 창 밖 날짜는 빈 자리로 두어 요일이 어긋나지 않게 한다.
 * 농도는 창 내 최댓값 대비 상대값이라, 조용한 팀에서도 패턴이 보인다.
 *
 * @param daily - 일별 이벤트 수 (빈 날은 0으로 채워져 내려온다)
 */
function ActivityGrass({
  daily,
  label,
  info,
}: {
  daily: AxOverviewData['grassDaily']
  label: string
  info?: string
}) {
  const [tip, setTip] = useState<{ left: number; top: number; text: string } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const max = Math.max(1, ...daily.map((point) => point.events))
  const total = daily.reduce((sum, point) => sum + point.events, 0)
  const first = daily[0]
  const last = daily[daily.length - 1]

  // 요일 정렬: 창 시작일의 요일만큼 앞을 비우고, 마지막 주의 남은 요일도 비운다
  const leading = first ? weekdayOf(first.date) : 0
  const cells: Array<(typeof daily)[number] | null> = [
    ...Array.from({ length: leading }, () => null),
    ...daily,
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const weekCount = cells.length / 7

  /** 이벤트 수 → 0(없음)~4(최대) 농도 */
  const level = (events: number): number => {
    if (events === 0) return 0
    return Math.min(GRASS_LEVELS, Math.max(1, Math.ceil((events / max) * GRASS_LEVELS)))
  }

  /** 농도 → 칸 스타일. 0은 빈 칸 톤, 1~4는 브랜드색 불투명도 */
  const cellStyle = (events: number): CSSProperties => {
    const grade = level(events)
    if (grade === 0) return { background: 'var(--bg-tertiary)' }
    return { background: 'var(--brand-primary)', opacity: 0.25 + (grade / GRASS_LEVELS) * 0.75 }
  }

  /** 칸에 마우스가 올라오면 카드 기준 좌표로 툴팁을 띄운다 */
  const showTip = (event: ReactMouseEvent<HTMLElement>, point: { date: string; events: number }) => {
    const wrap = wrapRef.current
    if (!wrap) return
    const cell = event.currentTarget.getBoundingClientRect()
    const base = wrap.getBoundingClientRect()
    setTip({
      left: cell.left - base.left + cell.width / 2,
      top: cell.top - base.top,
      text: `${point.date} (${WEEKDAY_LABELS[weekdayOf(point.date)]}) · ${formatCount(point.events)}건`,
    })
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
          {label} · 최근 {daily.length}일
          {info && (
            <span className="group relative inline-flex">
              <span
                className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-[var(--border-hover)] text-[10px] leading-none text-[var(--text-muted)]"
                aria-label={info}
                role="img"
              >
                ?
              </span>
              <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 hidden w-72 -translate-x-1/2 whitespace-normal rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-[11px] normal-case leading-relaxed tracking-normal text-[var(--text-secondary)] shadow-md group-hover:block">
                {info}
              </span>
            </span>
          )}
        </p>
        <p className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
          {formatCount(total)}건 · 최대 {formatCount(max)}건/일
        </p>
      </div>

      <div className="mt-3 overflow-x-auto pb-1">
        {/* 카드 폭을 꽉 채우는 유동 격자 — 세로로 일(위)~토(아래) 채운 뒤 다음 주 열로 넘어간다 */}
        <div
          className="grid min-w-[560px] gap-[3px]"
          style={{
            gridTemplateColumns: `repeat(${weekCount}, minmax(0, 1fr))`,
            gridTemplateRows: 'repeat(7, auto)',
            gridAutoFlow: 'column',
          }}
          onMouseLeave={() => setTip(null)}
        >
          {cells.map((point, index) =>
            point === null ? (
              // 창 밖 날짜(첫 주 앞·마지막 주 뒤) — 자리만 지킨다
              <span key={`pad-${index}`} className="w-full rounded-[2px]" style={{ aspectRatio: '1' }} />
            ) : (
              <span
                key={point.date}
                className="w-full rounded-[2px]"
                style={{ aspectRatio: '1', ...cellStyle(point.events) }}
                onMouseEnter={(event) => showTip(event, point)}
              />
            )
          )}
        </div>
        <div className="mt-2 flex items-center justify-between font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
          <span>{first?.date}</span>
          <span>세로줄 = 한 주 (위 일요일 → 아래 토요일)</span>
          <span>{last?.date}</span>
        </div>
      </div>

      {/* 커스텀 툴팁 — 브라우저 기본 title은 뜨기까지 1초쯤 걸려 없는 것처럼 보인다 */}
      {tip && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-1 font-mono text-[11px] tabular-nums text-[var(--text-primary)] shadow-md"
          style={{ left: tip.left, top: tip.top - 6 }}
          role="status"
        >
          {tip.text}
        </div>
      )}
    </div>
  )
}

/** 부모 패널 안에서만 보이는 두 번째 깊이의 보기 이름 */
const ROOT_VIEW_LABELS: Record<string, string> = {
  'skill-usage': '구성원 사용',
  'client-usage': '구성원별 사용량',
}

/**
 * 같은 업무 영역의 독립 데이터 패널을 작은 세그먼트 컨트롤로 묶는다.
 * API·권한·오류 격리는 유지하되 최상위 탭 수만 줄이는 정보 구조다.
 */
function NestedPanelNav({
  parentId,
  panels,
  activeId,
  onChange,
}: {
  parentId: string
  panels: AxPanelMeta[]
  activeId: string
  onChange: (panelId: string) => void
}) {
  return (
    <div
      className="mt-5 inline-flex items-center gap-0.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1"
      role="tablist"
      aria-label={`${panels[0]?.title ?? '항목'} 세부 보기`}
    >
      {panels.map((panel) => {
        const selected = panel.id === activeId
        const label = panel.id === parentId
          ? (ROOT_VIEW_LABELS[parentId] ?? panel.title)
          : panel.title
        return (
          <button
            key={panel.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`ax-panel-${panel.id}`}
            id={`ax-view-tab-${panel.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(panel.id)}
            onKeyDown={(event) => handleTabKey(
              event,
              panels.map((item) => item.id),
              panel.id,
              onChange
            )}
            className={`rounded-full px-4 py-1.5 text-xs transition-colors ${
              selected
                ? 'bg-[var(--text-primary)] font-medium text-[var(--bg-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** WAI-ARIA 탭 패턴: 방향키·Home·End로 선택과 초점을 함께 옮긴다. */
function handleTabKey(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  ids: string[],
  activeId: string,
  onChange: (panelId: string) => void
) {
  const currentIndex = ids.indexOf(activeId)
  if (currentIndex < 0) return

  let targetIndex: number | null = null
  if (event.key === 'ArrowRight') targetIndex = (currentIndex + 1) % ids.length
  if (event.key === 'ArrowLeft') targetIndex = (currentIndex - 1 + ids.length) % ids.length
  if (event.key === 'Home') targetIndex = 0
  if (event.key === 'End') targetIndex = ids.length - 1
  if (targetIndex === null) return

  event.preventDefault()
  onChange(ids[targetIndex])
  const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  tabs?.[targetIndex]?.focus()
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
 * @param onRefresh - 캐시를 우회한 관리자 수동 갱신 핸들러
 */
function AxPanelView({
  meta,
  state,
  days,
  onRetry,
  onRefresh,
}: {
  meta: AxPanelMeta
  state: PanelState | undefined
  days: number
  onRetry: () => void
  onRefresh?: () => void
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
        <div className="flex shrink-0 items-center gap-3 pt-0.5">
          {marks.length > 0 && (
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
              {marks.join(' · ')}
            </p>
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={state?.loading}
              className="rounded-full border border-[var(--border-subtle)] px-3 py-1 font-mono text-[10px] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              {state?.loading ? '비교 중' : '최신 비교'}
            </button>
          )}
        </div>
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
  if (data === null || typeof data !== 'object') return false
  if ('syncedAt' in data) {
    const value = (data as { syncedAt: unknown }).syncedAt
    if (typeof value === 'string' || value === null) return true
  }
  if ('freshness' in data) {
    const freshness = (data as { freshness?: { comparedAt?: unknown } }).freshness
    return typeof freshness?.comparedAt === 'string'
  }
  return false
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
