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
} from 'react'
import type {
  AxOverviewData,
  AxPanelMeta,
  AxPanelResult,
  AxSkillUsageData,
} from '@/lib/features/ax'
import { getAxPanelView, SkillEventSummary } from './panels'
import { SECTION_LABEL } from './panels/primitives'
import { AxPanelBoundary } from './AxPanelBoundary'
import {
  formatCount,
  formatSampledRate,
  formatUpdatedAt,
  relativeActivityFill,
  tooltipAnchorClass,
} from './format'

/** 조회 기간(일) — API가 허용하는 값과 같아야 한다 */
const DAY_OPTIONS = [7, 30, 90] as const

/** 조회 기간 타입 */
type AxDays = (typeof DAY_OPTIONS)[number]

/** 기본 조회 기간 */
const DEFAULT_DAYS: AxDays = 7

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
  // 패널 본문이 기간 재조회 중 잠시 교체돼도 필터 선택은 대시보드 수준에서 유지한다.
  const [panelSelections, setPanelSelections] = useState<Record<string, string>>({})
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

  // 전역 요약은 사람 중심으로 읽는다. 스킬 이벤트 흐름은 스킬 탭으로 분리하고,
  // 에이전트 지표는 에이전트 활동 세부 보기에서 다룬다.
  const skillUsageData =
    (states['skill-usage']?.result?.data as AxSkillUsageData | null) ?? null
  const overviewData =
    (states['overview']?.result?.data as AxOverviewData | null) ?? null
  const memberActivityLoading = ['overview', 'skill-usage'].some((panelId) =>
    panels.some((panel) => panel.id === panelId) &&
      (!states[panelId] || states[panelId]?.loading)
  )

  const grassDaily = overviewData?.grassDaily ?? null
  const agentGrassDaily = overviewData?.agentGrassDaily ?? null
  // 선택 기간의 상단 차트는 KST 일자별 이벤트 흐름을 쓴다. overview가 없는 제한된
  // 화면·테스트 환경에서는 apply 일별 집계를 모두 직접 적용으로 보아 안전하게 폴백한다.
  const periodApplicationFlow = (grassDaily ?? skillUsageData?.daily.map((point) => ({
    ...point,
    loads: 0,
    linkableLoads: 0,
    directApplied: point.events,
    appliedAfterLoad: 0,
  })) ?? []).slice(-days)

  const activeRoot = topLevelPanels.find((panel) => panel.id === activeRootId) ?? topLevelPanels[0]
  const nestedPanels = [
    activeRoot,
    ...panels.filter((panel) => panel.parentId === activeRoot.id),
  ]
  const active = nestedPanels.find((panel) => panel.id === activePanelId) ?? activeRoot

  return (
    <>
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
        <div className="pb-2">
          <PeriodControl value={days} onChange={setDays} />
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

      {activeRoot.id === 'overview' && (
        <MemberActivityHero
          days={days}
          skillUsage={skillUsageData}
          daily={overviewData?.dailySkillFlow ?? []}
          loading={memberActivityLoading && (!skillUsageData || !overviewData)}
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
        {active.id === 'skill-usage' && skillUsageData && (
          <SkillEventSummary
            totals={skillUsageData.actionTotals}
            totalEvents={skillUsageData.totalEvents}
          />
        )}
        {active.id === 'skill-usage' && (
          <section className="mb-8 mt-8">
            <DailyApplicationFlowChart daily={periodApplicationFlow} days={days} />
          </section>
        )}
        <AxPanelView
          key={active.id}
          meta={active}
          state={states[active.id]}
          days={days}
          onRetry={() => loadPanel(active.id, days)}
          selection={panelSelections[active.id]}
          onSelectionChange={(selection) => setPanelSelections((previous) => ({
            ...previous,
            [active.id]: selection,
          }))}
          onRefresh={isAdmin && active.id === 'skill-diff'
            ? () => loadPanel(active.id, days, true)
            : undefined}
        />
        {active.id === 'overview' && (
          <section className="mt-12 space-y-3" aria-label="사람과 에이전트 장기 사용량">
            <ActivityGrassCard
              daily={grassDaily}
              label="일별 구성원 스킬 활동 · 최근 365일"
              valueLabel="활동"
              kind="member"
              loading={memberActivityLoading && grassDaily === null}
            />
            <ActivityGrassCard
              daily={agentGrassDaily}
              label="일별 에이전트 사용량 · 최근 365일"
              valueLabel="턴"
              kind="agent"
              loading={memberActivityLoading && agentGrassDaily === null}
            />
          </section>
        )}
      </div>

    </>
  )
}

type GrassPoint =
  | AxOverviewData['grassDaily'][number]
  | AxOverviewData['agentGrassDaily'][number]

/** 요약 맨 아래의 최근 365일 활동 잔디 — 기간 토글과 무관한 장기 리듬이다. */
function ActivityGrassCard({
  daily,
  label,
  valueLabel,
  kind,
  loading,
}: {
  daily: GrassPoint[] | null
  label: string
  valueLabel: string
  kind: 'member' | 'agent'
  loading: boolean
}) {
  const [tip, setTip] = useState<{ left: number; top: number; text: string } | null>(null)
  const wrapRef = useRef<HTMLElement>(null)

  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--border-subtle)] px-5 py-5">
        <div className="ax-shimmer h-3 w-32 rounded" />
        <div className="ax-shimmer mt-4 h-28 rounded" />
      </div>
    )
  }

  if (!daily || daily.length === 0) return null

  const first = daily[0]
  const last = daily[daily.length - 1]
  const max = Math.max(1, ...daily.map((point) => point.events))
  const positive = daily.map((point) => point.events).filter((events) => events > 0)
  const min = positive.length > 0 ? Math.min(...positive) : max
  const total = daily.reduce((sum, point) => sum + point.events, 0)
  const leading = first ? weekdayOf(first.date) : 0
  const cells: Array<(typeof daily)[number] | null> = [
    ...Array.from({ length: leading }, () => null),
    ...daily,
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const weekCount = cells.length / 7

  const cellStyle = (events: number): CSSProperties => ({
    background: events > 0
      ? relativeActivityFill(events, min, max)
      : 'var(--bg-tertiary)',
  })

  const showTip = (
    event: { currentTarget: HTMLElement },
    point: GrassPoint
  ) => {
    const wrap = wrapRef.current
    if (!wrap) return
    const cell = event.currentTarget.getBoundingClientRect()
    const base = wrap.getBoundingClientRect()
    const rawLeft = cell.left - base.left + cell.width / 2
    const safeHalfWidth = Math.min(220, base.width / 2)
    setTip({
      left: Math.min(Math.max(rawLeft, safeHalfWidth), base.width - safeHalfWidth),
      top: cell.top - base.top,
      text: grassTooltip(point, kind),
    })
  }

  return (
    <section
      ref={wrapRef}
      className="ax-reveal relative rounded-2xl border border-[var(--border-subtle)] px-5 py-5"
      aria-label={label}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={SECTION_LABEL}>{label}</h3>
        <p className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
          {valueLabel} {formatCount(total)}건 · 최대 {formatCount(max)}건/일
        </p>
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div
          className="grid min-w-[680px] gap-[3px]"
          style={{
            gridTemplateColumns: `repeat(${weekCount}, minmax(0, 1fr))`,
            gridTemplateRows: 'repeat(7, auto)',
            gridAutoFlow: 'column',
          }}
          onMouseLeave={() => setTip(null)}
        >
          {cells.map((point, index) => point === null ? (
            <span key={`pad-${index}`} className="w-full rounded-[2px]" style={{ aspectRatio: '1' }} />
          ) : (
            <button
              key={point.date}
              type="button"
              className="w-full rounded-[2px] outline-none transition-shadow hover:ring-1 hover:ring-[var(--brand-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]"
              style={{ aspectRatio: '1', ...cellStyle(point.events) }}
              data-activity-fill={cellStyle(point.events).background}
              aria-label={grassTooltip(point, kind)}
              onMouseEnter={(event) => showTip(event, point)}
              onFocus={(event) => showTip(event, point)}
              onBlur={() => setTip(null)}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
          <span>{first?.date}</span>
          <span>{last?.date}</span>
        </div>
      </div>

      {tip && (
        <div
          className="pointer-events-none absolute z-20 max-w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-full whitespace-normal rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-center font-mono text-[10px] tabular-nums text-[var(--text-primary)] shadow-lg"
          style={{ left: tip.left, top: tip.top - 6 }}
          aria-hidden
          data-grass-tooltip
        >
          {tip.text}
        </div>
      )}
    </section>
  )
}

/** YYYY-MM-DD 날짜 키의 요일(0=일요일). */
function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

/** 잔디 셀의 접근성 이름과 즉시 툴팁을 같은 문구로 유지한다. */
function grassTooltip(point: GrassPoint, kind: 'member' | 'agent'): string {
  if (kind === 'agent') {
    const agents = 'agents' in point ? point.agents : 0
    return `${point.date} · 턴 ${formatCount(point.events)}건 · 활동 에이전트 ${formatCount(agents)}개`
  }
  const memberPoint = point as AxOverviewData['grassDaily'][number]
  return `${point.date} · 활동 ${formatCount(point.events)}건 · 로드 없이 적용 ${formatCount(memberPoint.directApplied ?? 0)}건 · 로드 후 적용 ${formatCount(memberPoint.appliedAfterLoad ?? 0)}건`
}

/**
 * 기간별 구성원 활동 요약 — 사람의 실제 적용과 활동 리듬만 둔다.
 * 스킬 이벤트와 에이전트 작업량은 각 탭에서 본다.
 */
function MemberActivityHero({
  days,
  skillUsage,
  daily,
  loading,
}: {
  days: AxDays
  skillUsage: AxSkillUsageData | null
  daily: AxOverviewData['dailySkillFlow']
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="mt-8">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[0, 1, 2].map((slot) => <div key={slot} className="ax-shimmer h-20 rounded-xl" />)}
        </div>
        <div className="ax-shimmer mt-6 h-56 rounded-xl" />
      </div>
    )
  }

  const usesPerMember = skillUsage && skillUsage.activeUsers > 0
    ? (skillUsage.meaningfulUses / skillUsage.activeUsers).toLocaleString('ko-KR', {
        maximumFractionDigits: 1,
      })
    : '—'
  const metrics = [
    {
      label: '활성 구성원',
      value: skillUsage ? formatCount(skillUsage.activeUsers) : '—',
      unit: skillUsage ? '명' : '',
      description: '적용 보고를 남긴 사람',
    },
    {
      label: '실제 적용 호출',
      value: skillUsage ? formatCount(skillUsage.meaningfulUses) : '—',
      unit: skillUsage ? '건' : '',
      description: '스킬 apply 보고',
    },
    {
      label: '1인당 적용',
      value: usesPerMember,
      unit: skillUsage ? '건' : '',
      description: '활성 구성원 한 명당 평균 적용 보고',
    },
  ]

  return (
    <section className="ax-reveal mt-8" aria-label="구성원 활동 요약">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {metrics.map((metric, index) => (
          <MetricCard key={metric.label} id={`team-metric-${index}`} {...metric} />
        ))}
      </div>

      <DailyActiveUsersChart daily={daily} days={days} />
    </section>
  )
}

/** KPI 카드 — 카드 전체 폭의 도움말을 수치 아래에 띄운다. */
function MetricCard({
  id,
  label,
  value,
  unit,
  description,
}: {
  id: string
  label: string
  value: string
  unit: string
  description: string
}) {
  const tooltipId = `${id}-description`
  return (
    <div
      className="group relative rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 py-3.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]"
      tabIndex={0}
      aria-describedby={tooltipId}
    >
      <span id={id} className="cursor-help text-xs text-[var(--text-muted)]">{label}</span>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl leading-none tabular-nums tracking-tight text-[var(--text-primary)]">
          {value}
        </span>
        {unit && <span className="text-xs text-[var(--text-muted)]">{unit}</span>}
      </p>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none invisible absolute inset-x-0 top-full z-30 mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-[11px] font-normal leading-relaxed tracking-normal text-[var(--text-secondary)] opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus:visible group-focus:translate-y-0 group-focus:opacity-100"
        style={{ transform: 'translateY(-2px)' }}
      >
        {description}
      </span>
    </div>
  )
}

/** 요약의 일별 실제 사용 인원 — 직접 적용과 로드 후 적용을 합친 고유 사용자 수다. */
function DailyActiveUsersChart({
  daily,
  days,
}: {
  daily: AxOverviewData['dailySkillFlow']
  days: number
}) {
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)
  const rows = daily.slice(-days)
  const counts = rows.map((point) => point.directApplied + point.appliedAfterLoad)
  const max = Math.max(1, ...counts)
  const positiveCounts = counts.filter((count) => count > 0)
  const min = positiveCounts.length > 0 ? Math.min(...positiveCounts) : max
  const hasActivity = counts.some((count) => count > 0)
  const axisIndexes = chartAxisIndexes(rows.length)

  return (
    <div style={{ marginTop: '3.5rem' }}>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
        일별 사용 인원
      </p>
      {!hasActivity ? (
        <div className="mt-5 flex items-center justify-center rounded-xl border border-dashed border-[var(--border-hover)] text-sm text-[var(--text-muted)]" style={{ height: '13rem' }}>
          최근 {days}일의 실제 적용 활동이 없습니다.
        </div>
      ) : (
        <div className="mt-5">
          <div className="flex items-end gap-[3px] border-b border-[var(--border-subtle)] px-1" style={{ height: '13rem' }}>
            {rows.map((point, index) => {
              const users = counts[index] ?? 0
              return (
                <div
                  key={point.date}
                  className="group relative flex h-full min-w-[3px] flex-1 cursor-default items-end focus-visible:outline-none"
                  tabIndex={0}
                  aria-label={`${formatChartDate(point.date)} · 사용 인원 ${formatCount(users)}명`}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseLeave={() => setHighlightedIndex(null)}
                  onFocus={() => setHighlightedIndex(index)}
                  onBlur={() => setHighlightedIndex(null)}
                >
                  <div
                    className="ax-activity-mark relative w-full rounded-t-[4px] transition-shadow duration-150"
                    data-activity-fill={relativeActivityFill(users, min, max)}
                    style={{
                      height: users === 0 ? '2px' : `${Math.max(3, (users / max) * 100)}%`,
                      background: relativeActivityFill(users, min, max),
                      boxShadow: highlightedIndex === index
                        ? '0 0 0 1px var(--bg-primary), 0 0 0 3px var(--brand-secondary)'
                        : 'none',
                    }}
                  >
                    <span className={`pointer-events-none absolute bottom-full z-20 mb-2 hidden whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-1.5 font-mono text-[11px] tabular-nums text-[var(--text-primary)] shadow-lg group-hover:block group-focus:block ${tooltipAnchorClass(index, daily.length)}`}>
                      {formatChartDate(point.date)} · {formatCount(users)}명
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <ChartDateAxis daily={rows} axisIndexes={axisIndexes} />
        </div>
      )}
    </div>
  )
}

/** 선택 기간의 일별 로드·적용 이벤트 흐름 — 사람 수가 아니라 서버 이벤트 수다. */
const FLOW_DIRECT_COLOR = 'color-mix(in srgb, var(--brand-secondary) 62%, var(--bg-tertiary))'
const FLOW_LOAD_COLOR = 'color-mix(in srgb, var(--text-muted) 58%, var(--bg-primary))'
const FLOW_CONVERTED_COLOR = 'var(--accent-orange)'

function DailyApplicationFlowChart({
  daily,
  days,
}: {
  daily: AxOverviewData['grassDaily']
  days: number
}) {
  // 막대는 정적으로 유지하되, 포인터·키보드가 가리킨 날짜의 정보만 연다.
  // CSS group-hover를 쓰면 상위 group과 중첩될 때 모든 툴팁이 열릴 수 있다.
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  // 툴팁은 막대가 아니라 차트 컨테이너 기준으로 한 개만 띄우고 좌우를 컨테이너 안으로 클램프한다.
  // 막대 안에 두면 좁은 화면의 가장자리 막대에서 뷰포트를 넘어 가로 스크롤이 생긴다.
  const [tip, setTip] = useState<{ left: number; top: number; text: string } | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const showTip = (index: number, element: HTMLElement, text: string) => {
    setHoveredIndex(index)
    const wrap = chartRef.current
    if (!wrap) return
    const bar = element.getBoundingClientRect()
    const base = wrap.getBoundingClientRect()
    const rawLeft = bar.left - base.left + bar.width / 2
    const safeHalfWidth = Math.min(220, base.width / 2)
    setTip({
      left: Math.min(Math.max(rawLeft, safeHalfWidth), base.width - safeHalfWidth),
      top: bar.top - base.top,
      text,
    })
  }
  const hideTip = () => {
    setHoveredIndex(null)
    setTip(null)
  }
  const max = Math.max(
    1,
    ...daily.map((point) => (point.directApplied ?? 0) + (point.loads ?? 0))
  )
  const hasActivity = daily.some(
    (point) => (point.directApplied ?? 0) > 0 || (point.loads ?? 0) > 0
  )
  const axisIndexes = chartAxisIndexes(daily.length)
  // 연결 가능 로드는 새 응답에만 있다. 한 날이라도 값이 없으면 분모를 추정하지 않는다.
  const linkableObserved = daily.length > 0 && daily.every((point) => point.linkableLoads !== undefined)
  const totals = daily.reduce(
    (sum, point) => ({
      loads: sum.loads + (point.loads ?? 0),
      linkableLoads: sum.linkableLoads + (point.linkableLoads ?? 0),
      appliedAfterLoad: sum.appliedAfterLoad + (point.appliedAfterLoad ?? 0),
    }),
    { loads: 0, linkableLoads: 0, appliedAfterLoad: 0 }
  )

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
        <p className={SECTION_LABEL}>일별 스킬 활동</p>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-xs text-[var(--text-muted)]" aria-label="일별 스킬 활동 범례">
          <FlowLegend color={FLOW_DIRECT_COLOR} label="로드 없이 적용" />
          <FlowLegend color={FLOW_LOAD_COLOR} label="로드" />
          <FlowLegend color={FLOW_CONVERTED_COLOR} label="로드 후 적용" />
        </div>
      </div>
      {hasActivity && totals.loads > 0 && (
        <FlowDenominatorNote
          loads={totals.loads}
          linkableLoads={linkableObserved ? totals.linkableLoads : null}
          appliedAfterLoad={totals.appliedAfterLoad}
        />
      )}

      {daily.length === 0 || !hasActivity ? (
        <div className="mt-5 flex items-center justify-center rounded-xl border border-dashed border-[var(--border-hover)] text-sm text-[var(--text-muted)]" style={{ height: '13rem' }}>
          최근 {days}일의 로드·적용 활동이 없습니다.
        </div>
      ) : (
        <div className="relative mt-5" ref={chartRef}>
          <div className="flex items-end gap-[3px] border-b border-[var(--border-subtle)] px-1" style={{ height: '13rem' }}>
            {daily.map((point, index) => {
              const directApplied = point.directApplied ?? 0
              const loads = point.loads ?? 0
              const appliedAfterLoad = point.appliedAfterLoad ?? 0
              const total = directApplied + loads
              // 전환율 분모는 연결 가능한 로드다. 구형 응답이면 전체 로드로 물러나되 그 사실을 적는다.
              const linkableLoads = point.linkableLoads
              const conversionBase = linkableLoads ?? loads
              const conversionLabel = linkableLoads === undefined ? '전체 로드' : '연결 가능 로드'
              const conversion = `${conversionLabel} ${formatCount(conversionBase)}건 중 ${formatSampledRate(appliedAfterLoad, conversionBase)}`
              const tooltip = `${formatChartDate(point.date)} · 로드 없이 적용 ${formatCount(directApplied)} · 로드 ${formatCount(loads)} · 로드 후 적용 ${formatCount(appliedAfterLoad)} · ${conversion}`
              return (
                <div
                  key={point.date}
                  className="group relative flex h-full min-w-[3px] flex-1 cursor-default items-end focus-visible:outline-none"
                  tabIndex={0}
                  onMouseEnter={(event) => showTip(index, event.currentTarget, tooltip)}
                  onMouseLeave={hideTip}
                  onFocus={(event) => showTip(index, event.currentTarget, tooltip)}
                  onBlur={hideTip}
                  aria-label={`${formatChartDate(point.date)} · 로드 없이 적용 ${formatCount(directApplied)}건 · 로드 ${formatCount(loads)}건 · 로드 후 적용 ${formatCount(appliedAfterLoad)}건 · ${conversion}`}
                >
                  <div
                    className="relative flex w-full flex-col"
                    data-flow-total={total}
                    style={{
                      height: total === 0 ? '2px' : `${Math.max(3, (total / max) * 100)}%`,
                    }}
                  >
                  {daily.length <= 7 && total > 0 && (
                    <span className={`pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 font-mono text-[10px] tabular-nums text-[var(--text-muted)] ${hoveredIndex === index ? 'invisible' : 'visible'}`}>
                      {formatCount(total)}
                    </span>
                  )}
                  {loads > 0 && total > 0 && (
                    <div
                      className="relative w-full shrink-0 rounded-t-[4px]"
                      data-flow-color={FLOW_LOAD_COLOR}
                      data-flow-segment="load"
                      style={{
                        height: `${(loads / total) * 100}%`,
                        background: FLOW_LOAD_COLOR,
                      }}
                    >
                      <span
                        aria-hidden
                        className="absolute inset-x-0 bottom-0"
                        data-flow-color={FLOW_CONVERTED_COLOR}
                        data-flow-segment="converted"
                        style={{
                          height: `${Math.min(1, appliedAfterLoad / Math.max(1, conversionBase)) * 100}%`,
                          background: FLOW_CONVERTED_COLOR,
                        }}
                      />
                    </div>
                  )}
                  {directApplied > 0 && total > 0 && (
                    <div
                      className={`w-full shrink-0 ${loads === 0 ? 'rounded-t-[4px]' : ''}`}
                      data-flow-color={FLOW_DIRECT_COLOR}
                      data-flow-segment="direct"
                      style={{
                        height: `${(directApplied / total) * 100}%`,
                        background: FLOW_DIRECT_COLOR,
                      }}
                    />
                  )}
                  {total === 0 && (
                    <div className="h-[2px] w-full shrink-0 bg-[var(--border-subtle)] opacity-70" />
                  )}
                  </div>
                </div>
              )
            })}
          </div>
          <ChartDateAxis daily={daily} axisIndexes={axisIndexes} />
          {tip && (
            <span
              aria-hidden
              className="pointer-events-none absolute z-20 max-w-[min(28rem,calc(100%-1rem))] -translate-x-1/2 -translate-y-full whitespace-normal rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-center font-mono text-[11px] tabular-nums leading-relaxed text-[var(--text-primary)] shadow-lg"
              style={{ left: tip.left, top: tip.top - 8 }}
            >
              {tip.text}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * 로드 후 적용 전환율의 분모 신뢰도 — 전체 로드 중 세션·journey로 연결할 수 있는 몫을 먼저 보여준다.
 * 연결 불가 로드는 0건이 아니라 미관측이므로 전환율 분모에서 뺀다.
 */
function FlowDenominatorNote({
  loads,
  linkableLoads,
  appliedAfterLoad,
}: {
  loads: number
  linkableLoads: number | null
  appliedAfterLoad: number
}) {
  const text = linkableLoads === null
    ? `로드 ${formatCount(loads)}건 · 연결 가능 여부 미관측 · 로드 후 적용 ${formatCount(appliedAfterLoad)}건은 전체 로드의 ${formatSampledRate(appliedAfterLoad, loads)}`
    : `로드 ${formatCount(loads)}건 중 연결 가능 ${formatCount(linkableLoads)}건 (${formatSampledRate(linkableLoads, loads)}) · 로드 후 적용 ${formatCount(appliedAfterLoad)}건은 연결 가능 로드의 ${formatSampledRate(appliedAfterLoad, linkableLoads)}`
  return (
    <p
      role="note"
      className="mt-2 font-mono text-[11px] tabular-nums leading-relaxed text-[var(--text-muted)]"
      aria-label="로드 후 적용 전환율 분모"
    >
      {text}
    </p>
  )
}

/** 날짜 수에 따라 겹치지 않을 축 라벨 위치를 고른다. */
function chartAxisIndexes(length: number): Set<number> {
  if (length <= 10) return new Set(Array.from({ length }, (_, index) => index))
  return new Set([
    0,
    Math.floor((length - 1) / 3),
    Math.floor((length - 1) * 2 / 3),
    length - 1,
  ])
}

/** 일별 차트 공통 날짜 축. */
function ChartDateAxis({
  daily,
  axisIndexes,
}: {
  daily: Array<{ date: string }>
  axisIndexes: Set<number>
}) {
  return (
    <div className="relative mt-2 h-4 font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
      {daily.map((point, index) => {
        if (!axisIndexes.has(index)) return null
        const position = daily.length === 1 ? 0 : (index / (daily.length - 1)) * 100
        const translate = index === 0 ? '0' : index === daily.length - 1 ? '-100%' : '-50%'
        return (
          <span key={point.date} className="absolute whitespace-nowrap" style={{ left: `${position}%`, transform: `translateX(${translate})` }}>
            {formatChartDate(point.date, true)}
          </span>
        )
      })}
    </div>
  )
}

/** 일별 활동 범례 한 항목. */
function FlowLegend({
  color,
  label,
}: {
  color: string
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        aria-hidden
        className="h-2.5 w-2.5 rounded-[2px]"
        style={{ background: color }}
      />
      {label}
    </span>
  )
}

/** YYYY-MM-DD를 시간대 파싱 없이 한국어 축 라벨로 바꾼다. */
function formatChartDate(date: string, compact = false): string {
  const [, month, day] = date.split('-')
  if (!month || !day) return date
  return compact ? `${Number(month)}.${Number(day)}` : `${Number(month)}월 ${Number(day)}일`
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
  selection,
  onSelectionChange,
}: {
  meta: AxPanelMeta
  state: PanelState | undefined
  days: number
  onRetry: () => void
  onRefresh?: () => void
  selection?: string
  onSelectionChange?: (selection: string) => void
}) {
  const result = state?.result ?? null
  // 요약과 스킬 구성원 사용은 상단 그래프에서 맥락이 이미 충분히 드러난다.
  // 같은 설명·갱신 시각·내부 출처를 본문에서 되풀이하지 않는다.
  const showPanelChrome = meta.id !== 'overview' && meta.id !== 'skill-usage'
  // 자체 갱신 시각을 들고 있는 패널은 조회 시각("방금")을 쓰면 신선도를 속이게 된다
  const ownsFreshness = result !== null && hasOwnSyncTime(result.data)

  const marks = [
    !meta.usesPeriod ? '현재 시점' : null,
    result && !ownsFreshness ? formatUpdatedAt(result.generatedAt) : null,
  ].filter((mark): mark is string => Boolean(mark))

  return (
    <section className="ax-reveal">
      {showPanelChrome && (
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
      )}

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
        <AxPanelBody
          meta={meta}
          state={state}
          days={days}
          onRetry={onRetry}
          selection={selection}
          onSelectionChange={onSelectionChange}
        />
      </AxPanelBoundary>

      {showPanelChrome && (
        <p className="mt-6 pt-4 border-t border-[var(--border-subtle)] font-mono text-[10px] text-[var(--text-muted)]">
          {meta.source}
        </p>
      )}
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
  selection,
  onSelectionChange,
}: {
  meta: AxPanelMeta
  state: PanelState | undefined
  days: number
  onRetry: () => void
  selection?: string
  onSelectionChange?: (selection: string) => void
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
  return createElement(getAxPanelView(meta.id), {
    data: result.data as never,
    days,
    selection,
    onSelectionChange,
  })
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
