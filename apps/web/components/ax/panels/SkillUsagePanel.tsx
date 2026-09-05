'use client'

/**
 * AX 대시보드 — 스킬 사용량 패널 본문
 *
 * 화면 전체 폭을 쓰는 본문만 그린다. 제목·설명·출처는 껍데기가 그린다.
 * 전체 이벤트 수·사용자 수는 맨 위 핵심 지표 밴드가 이미 말하므로 여기서 되풀이하지 않는다.
 *
 * 검색·로드·적용 보고와 스킬별 실제 적용 순위를 보여준다.
 * 날짜별 로드·적용 흐름은 대시보드가 이 패널 바로 위의 스킬 전용 차트로 그린다.
 */

import type { AxSkillUsageData, AxSkillUsageRow } from '@/lib/features/ax'
import { useState } from 'react'
import type { AxPanelViewProps } from './types'
import { formatCount, formatDate, formatSampledRate, relativeActivityFill } from '../format'
import { TablePager, usePagedRows } from './TablePager'

/** 한 장에 실을 스킬 수 */
const SKILL_PAGE_SIZE = 20

import { EMPTY_NOTE, META_LINE, SECTION_LABEL, TD, TH, TIP_BOX, TipContent, type TipRow } from './primitives'

/**
 * 스킬 사용량 패널 화면
 *
 * @param data - 스킬 사용량 집계
 * @param days - 조회 기간(일)
 */
export function SkillUsagePanel({ data, days }: AxPanelViewProps<AxSkillUsageData>) {
  return (
    <div className="space-y-10">
      <HumanVsAgentLoads data={data.humanVsAgent} />
      {data.skills.length > 0 ? (
        // 기간을 바꾸면 표를 통째로 다시 태워 첫 장으로 돌린다
        <SkillTable
          key={`${days}:${data.skills.length}`}
          skills={data.skills}
          totalApplied={data.meaningfulUses}
          activeUsers={data.activeUsers}
        />
      ) : (
        <p className={EMPTY_NOTE}>이 기간에 사용된 스킬이 없습니다.</p>
      )}
    </div>
  )
}


/**
 * 막대 축에 놓을 날짜 라벨 — 처음·가운데·끝만.
 *
 * 날짜를 전부 적으면 좁은 폭에서 겹친다. 시간대별 막대가 0·6·12·18·23시만 적는 것과 같은 방식이다.
 *
 * @param dates - YYYY-MM-DD 오름차순
 * @returns M.D 형식 라벨 (중복은 접는다)
 */
function axisLabels(dates: string[]): string[] {
  if (dates.length === 0) return []
  const pick = [dates[0], dates[Math.floor((dates.length - 1) / 2)], dates[dates.length - 1]]
  const short = pick.map((date) => {
    const [, month, day] = date.split('-')
    return `${Number(month)}.${Number(day)}`
  })
  return [...new Set(short)]
}

/**
 * 사람 대 에이전트 스킬 로드 — 하루씩 나란히.
 *
 * **로드끼리만 비교한다.** 에이전트 쪽에는 적용·실행 신호가 없어(수집 배치의 `executions`가 전부 비어 있다)
 * 사람의 "적용"과 견주면 서로 다른 사건을 한 축에 놓는 그림이 된다.
 *
 * 선이 아니라 묶음 막대인 이유: 이 대시보드에 선 차트 관례가 없고, **미관측인 날을 0과 구분해서**
 * 그려야 하는데 선으로는 그 구분이 사라진다.
 */
function HumanVsAgentLoads({ data }: { data: AxSkillUsageData['humanVsAgent'] }) {
  const max = Math.max(1, ...data.daily.map((row) => Math.max(row.human, row.agent ?? 0)))
  const humanTotal = data.daily.reduce((sum, row) => sum + row.human, 0)
  const agentTotal = data.daily.reduce((sum, row) => sum + (row.agent ?? 0), 0)

  return (
    <section>
      <p className={SECTION_LABEL}>사람 대 에이전트 스킬 로드</p>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">
        같은 사건(로드)끼리만 견준다. 에이전트 쪽에는 적용·실행 신호가 없어 사람의 적용과는 비교하지 않는다.
      </p>

      {data.observedDays === 0 ? (
        <p className={`mt-3 ${EMPTY_NOTE}`}>
          이 기간에 스킬 로드를 관측할 수 있는 에이전트 수집기가 없습니다.
        </p>
      ) : (
        <>
          <div className="mt-4 flex h-28 items-end gap-[6px] overflow-x-auto">
            {data.daily.map((row) => (
              // 미관측인 날은 칸 전체를 옅게 칠한다. 막대로 그리면 높이가 곧 값으로 읽혀
              // "관측하지 못했다"가 "이만큼 있었다"로 뒤바뀐다 — 실제 에이전트 값이 하루 0~6이라
              // 어떤 높이를 줘도 진짜 값보다 커 보인다.
              <div
                key={row.date}
                className={`flex h-full min-w-[14px] flex-1 items-end gap-[2px] rounded-t-[2px] ${
                  row.agent === null ? 'bg-[var(--bg-secondary)]' : ''
                }`}
                title={row.agent === null ? `${row.date} · 에이전트 미관측` : undefined}
              >
                <div
                  className="flex-1 rounded-t-[2px] bg-[var(--text-muted)]"
                  style={{ height: `${Math.max(row.human > 0 ? 2 : 0, (row.human / max) * 100)}%` }}
                  title={`${row.date} · 사람 ${formatCount(row.human)}`}
                />
                {row.agent !== null && (
                  <div
                    className="flex-1 rounded-t-[2px] bg-[var(--accent-orange)]"
                    style={{ height: `${Math.max(row.agent > 0 ? 2 : 0, (row.agent / max) * 100)}%` }}
                    title={`${row.date} · 에이전트 ${formatCount(row.agent)}`}
                  />
                )}
              </div>
            ))}
          </div>

          <div className={`mt-2 flex justify-between border-t border-[var(--border-subtle)] pt-2 ${META_LINE}`}>
            {axisLabels(data.daily.map((row) => row.date)).map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>

          <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 ${META_LINE}`}>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-[1px] bg-[var(--text-muted)]" />
              사람 {formatCount(humanTotal)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-[1px] bg-[var(--accent-orange)]" />
              에이전트 {formatCount(agentTotal)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-[1px] bg-[var(--bg-secondary)]" />
              에이전트 미관측
            </span>
          </div>

          {(data.excludedBatches > 0 || data.unobservedBatches > 0) && (
            <p className={`mt-2 ${META_LINE}`}>
              {data.excludedBatches > 0 && `하루 경계를 걸친 배치 ${formatCount(data.excludedBatches)}건 제외`}
              {data.excludedBatches > 0 && data.unobservedBatches > 0 && ' · '}
              {data.unobservedBatches > 0 && `스킬을 못 보는 수집기 배치 ${formatCount(data.unobservedBatches)}건 제외`}
            </p>
          )}
        </>
      )}
    </section>
  )
}

/** 깔때기 한 칸 */
interface FunnelStep {
  label: string
  value: number
  color: string
  /** 직전 단계 — 없으면 경로의 첫 칸 */
  previous?: { label: string; value: number }
  /** 칸 아래 항상 보이는 짧은 보조 문구 */
  hint?: string
  /** 호버 때 덧붙일 행 */
  extraRows?: TipRow[]
}

/** sm 이상에서 단계가 놓이는 격자 행 — 로드·적용이 두 경로에서 같은 행이 되게 한다 */
const FUNNEL_ROW_CLASS: Record<number, string> = {
  2: 'sm:row-start-2',
  3: 'sm:row-start-3',
  4: 'sm:row-start-4',
}

const FUNNEL_SEARCH_COLOR = 'var(--text-muted)'
const FUNNEL_LOAD_COLOR = 'color-mix(in srgb, var(--text-muted) 58%, var(--bg-primary))'
const FUNNEL_APPLY_COLOR = 'var(--accent-orange)'

/**
 * 두 줄 깔때기 — 검색 경로(검색 요청 → 로드 → 적용)와 직접 경로(검색 없는 로드 → 적용).
 *
 * 각 칸의 비율은 직전 단계 대비 전환율이고, 막대 길이도 그 비율이다. 경로의 첫 칸은 기준선이라
 * 값이 있으면 꽉 차고 0이면 비어 있다. 흐름(journey, 없으면 session) ID가 없어 경로를 판정할
 * 수 없는 로드·적용은 막대 없이 마지막 줄에 따로 적고 비율에서 뺀다.
 */
export function SkillEventSummary({
  origins,
  totals,
}: {
  origins: AxSkillUsageData['origins']
  totals: AxSkillUsageData['actionTotals']
}) {
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const { searchRequests, loads, applies } = origins
  const averageResults = searchRequests > 0
    ? (totals.search / searchRequests).toLocaleString('ko-KR', { maximumFractionDigits: 1 })
    : null

  const lanes: Array<{ id: string; label: string; steps: FunnelStep[] }> = [
    {
      id: 'search',
      label: '검색 경로',
      steps: [
        {
          label: '검색 요청',
          value: searchRequests,
          color: FUNNEL_SEARCH_COLOR,
          hint: averageResults === null ? undefined : `평균 검색 결과 ${averageResults}개`,
          extraRows: [{ label: '결과 노출 줄', value: `${formatCount(totals.search)}줄` }],
        },
        {
          label: '로드',
          value: loads.fromSearch,
          color: FUNNEL_LOAD_COLOR,
          previous: { label: '검색 요청', value: searchRequests },
        },
        {
          label: '적용 보고',
          value: applies.fromSearch,
          color: FUNNEL_APPLY_COLOR,
          previous: { label: '로드', value: loads.fromSearch },
        },
      ],
    },
    {
      id: 'direct',
      label: '직접 경로',
      steps: [
        {
          label: '검색 없는 로드',
          value: loads.direct,
          color: FUNNEL_LOAD_COLOR,
        },
        {
          label: '적용 보고',
          value: applies.afterDirectLoad,
          color: FUNNEL_APPLY_COLOR,
          previous: { label: '검색 없는 로드', value: loads.direct },
        },
      ],
    },
  ]

  // 막대는 두 경로가 공유하는 한 자(최댓값 = 경로 첫 단계 중 큰 값)로 그린다.
  // 그래야 직전 단계 대비 100%인 적용 막대가 로드 막대와 같은 길이가 되고, 두 경로의 크기도 견줄 수 있다.
  const scaleMax = Math.max(1, ...lanes.map((lane) => lane.steps[0]?.value ?? 0))

  return (
    <div>
      {/* 두 경로를 좌우 단으로 나누되 같은 종류의 단계(로드·적용)는 같은 행에 맞춘다.
          직접 경로는 검색 단계가 없으므로 첫 행을 비운다. sm 미만에서는 경로별로 세로로 쌓인다.
          단 사이 48px, 행 안쪽 16px, 라벨과 막대 12px — 4px 스케일 */}
      <div className="grid grid-cols-1 gap-x-12 sm:grid-cols-2 sm:grid-rows-[auto_auto_auto_auto]">
        {lanes.map((lane, laneIndex) => {
          // 검색 경로는 2~4행, 직접 경로는 3~4행에 놓아 로드·적용이 같은 행이 된다
          const firstRow = lane.steps.length === 3 ? 2 : 3
          const column = laneIndex === 0 ? 'sm:col-start-1' : 'sm:col-start-2'
          return (
            <div key={lane.id} className="contents">
              <h4 className={`${SECTION_LABEL} ${column} sm:row-start-1 ${laneIndex > 0 ? 'mt-6 sm:mt-0' : ''}`}>
                {lane.label}
              </h4>
              {lane.steps.map((step, stepIndex) => {
                const key = `${lane.id}:${step.label}`
                const active = highlighted === key
                const rate = step.previous ? formatSampledRate(step.value, step.previous.value) : null
                const ratio = Math.min(1, step.value / scaleMax)
                const rows: TipRow[] = [
                  ...(step.previous
                    ? [{ label: `직전 ${step.previous.label} ${formatCount(step.previous.value)}건 중`, value: rate ?? '—' }]
                    : []),
                  ...(step.extraRows ?? []),
                ]
                const title = `${step.label} ${formatCount(step.value)}건`
                const label = [
                  `${lane.label} · ${title}`,
                  ...(step.previous ? [`직전 ${step.previous.label} ${formatCount(step.previous.value)}건 중 ${rate}`] : []),
                  ...(step.hint ? [step.hint] : []),
                  ...(step.extraRows ?? []).map((row) => `${row.label} ${row.value}`),
                ].join(' · ')
                // Tailwind는 정적 클래스만 생성하므로 행 번호를 문자열 조립 대신 매핑한다
                const rowClass = FUNNEL_ROW_CLASS[firstRow + stepIndex] ?? ''
                // 경로의 첫 칸은 제목 바로 아래라 선이 없다. 단, 직접 경로의 첫 칸은 sm 이상에서 로드 행과 나란하므로 선을 맞춘다.
                const divider = stepIndex > 0
                  ? 'border-t border-[var(--border-subtle)]'
                  : (firstRow > 2 ? 'sm:border-t sm:border-[var(--border-subtle)]' : '')
                return (
                  <div
                    key={key}
                    role="group"
                    className={`relative py-4 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)] ${column} ${rowClass} ${stepIndex === 0 ? (firstRow > 2 ? 'mt-4 sm:mt-0' : 'mt-4') : ''} ${divider}`}
                    tabIndex={0}
                    aria-label={label}
                    onMouseEnter={() => setHighlighted(key)}
                    onMouseLeave={() => setHighlighted(null)}
                    onFocus={() => setHighlighted(key)}
                    onBlur={() => setHighlighted(null)}
                  >
                    <div className="flex items-baseline justify-between gap-6">
                      <p className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-secondary)]">
                        <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: step.color }} />
                        {step.label}
                        {rate !== null && <span className={`ml-1 ${META_LINE}`}>→ {rate}</span>}
                      </p>
                      <p className="shrink-0 whitespace-nowrap font-mono text-xl tabular-nums leading-none text-[var(--text-primary)]">{formatCount(step.value)}</p>
                    </div>
                    <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                      <span
                        data-funnel-bar={step.label}
                        className="block h-full rounded-full"
                        style={{
                          width: `${ratio * 100}%`,
                          // 0이 아닌 값은 최소 2px로 남겨 존재만은 보이게 한다
                          minWidth: step.value > 0 ? '2px' : undefined,
                          background: step.color,
                          boxShadow: active
                            ? '0 0 0 1px var(--bg-primary), 0 0 0 3px var(--brand-secondary)'
                            : 'none',
                        }}
                      />
                    </div>
                    {step.hint && <p className={`mt-2 ${META_LINE}`}>{step.hint}</p>}
                    {active && rows.length > 0 && (
                      <div aria-hidden data-funnel-tooltip className={`${TIP_BOX} absolute inset-x-0 top-full z-10 mt-1 w-max max-w-full`}>
                        <TipContent title={title} rows={rows} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      <p className="mt-6 text-xs leading-relaxed text-[var(--text-secondary)]" role="note" aria-label="연결 불가">
        <span className={META_LINE}>
          연결 불가 · 로드 {formatCount(loads.unlinkable)}건 · 적용 {formatCount(applies.unlinkable)}건
          {applies.withoutLoad > 0 && ` · 로드 없이 적용 ${formatCount(applies.withoutLoad)}건`}
        </span>
        {' '}세션 ID가 없어 경로를 판정할 수 없는 보고라 위 비율에서 뺐습니다.
      </p>
    </div>
  )
}

/**
 * 스킬 표 — 순위·집계·마지막 사용을 한 표에서 본다
 *
 * 스킬 이름 칸 안에만 사용량 비례 막대를 깔아, 숫자 칸을 침범하지 않으면서도
 * 표를 읽지 않고 순위 차이가 보이게 한다.
 *
 * @param skills - 실제 적용 보고 내림차순으로 정렬된 스킬 목록
 */
function SkillTable({
  skills,
  totalApplied,
  activeUsers,
}: {
  skills: AxSkillUsageRow[]
  totalApplied: number
  activeUsers: number
}) {
  const [highlightedSkillId, setHighlightedSkillId] = useState<string | null>(null)
  const [showCoverageHelp, setShowCoverageHelp] = useState(false)
  const { rows: shown, pager } = usePagedRows(skills, SKILL_PAGE_SIZE)
  // 막대 기준은 어느 장을 보든 1위로 고정한다 — 장을 넘길 때 막대 길이가 바뀌면 안 된다
  const max = Math.max(1, ...skills.map(activity))
  const positiveValues = skills.map(activity).filter((value) => value > 0)
  const min = positiveValues.length > 0 ? Math.min(...positiveValues) : max

  return (
    <div>
      <div className="relative mb-3 inline-flex items-center gap-2">
        <p className={SECTION_LABEL}>스킬별 실제 적용</p>
        <button
          type="button"
          className="cursor-help rounded-full px-1 font-mono text-[11px] text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]"
          aria-label="스킬 적용 집계 범위 안내"
          aria-describedby="skill-application-coverage-help"
          onMouseEnter={() => setShowCoverageHelp(true)}
          onMouseLeave={() => setShowCoverageHelp(false)}
          onFocus={() => setShowCoverageHelp(true)}
          onBlur={() => setShowCoverageHelp(false)}
        >
          ?
        </button>
        {showCoverageHelp && (
          <span
            id="skill-application-coverage-help"
            role="tooltip"
            className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-72 max-w-[calc(100vw-3rem)] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-2 text-[11px] font-normal leading-relaxed tracking-normal text-[var(--text-secondary)] shadow-lg"
          >
            명시적인 적용 보고만 집계합니다. 로컬에서 다시 실행했지만 보고하지 않은 횟수는 0이 아니라 미관측입니다.
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className={`text-right ${TH} w-12`}>순위</th>
              <th className={`text-left ${TH} w-[56%]`}>스킬</th>
              <th className={`text-right ${TH}`}>활성 사용자 중 적용</th>
              <th className={`text-right ${TH}`}>마지막 사용</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {shown.map((skill, index) => (
              <tr
                key={skill.skillId}
                className="focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand-primary)]"
                tabIndex={0}
                aria-label={`${skill.name} · 적용 ${formatCount(skill.applied)}건 · 전체 적용 중 ${formatRate(skill.applied, totalApplied)} · 활성 사용자 ${formatCount(skill.users)}/${formatCount(activeUsers)}명`}
                onMouseEnter={() => setHighlightedSkillId(skill.skillId)}
                onMouseLeave={() => setHighlightedSkillId(null)}
                onFocus={() => setHighlightedSkillId(skill.skillId)}
                onBlur={() => setHighlightedSkillId(null)}
              >
                <td className={`text-right ${TD} font-mono tabular-nums text-[var(--text-muted)]`}>
                  {/* 순위는 장이 넘어가도 이어진다 */}
                  {pager.from + index}
                </td>
                <td
                  className={`relative ${TD}`}
                >
                  {/* 사용량 비례 막대 — 이름 칸 안에서만 찬다. 호버·포커스 때 요약 표와 같은 외곽선이 붙는다 */}
                  <span
                    aria-hidden
                    className="ax-activity-mark absolute inset-y-0 left-0 transition-shadow duration-150"
                    data-activity-fill={relativeActivityFill(activity(skill), min, max)}
                    style={{
                      width: `${(activity(skill) / max) * 100}%`,
                      background: relativeActivityFill(activity(skill), min, max),
                      boxShadow: highlightedSkillId === skill.skillId
                        ? '0 0 0 1px var(--bg-primary), 0 0 0 3px var(--brand-secondary)'
                        : 'none',
                    }}
                  />
                  <span className="relative break-words text-[var(--text-primary)]">{skill.name}</span>
                  {highlightedSkillId === skill.skillId && (
                    <span
                      // 힌트는 항상 막대 끝 바로 오른쪽에 붙는다. 막대가 칸을 꽉 채우면 옆 수치 칸 위로 겹쳐 뜬다
                      className="pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1 font-mono text-[11px] tabular-nums text-[var(--text-secondary)] shadow-sm"
                      style={{ left: `calc(${(activity(skill) / max) * 100}% + 0.5rem)` }}
                    >
                      적용 {formatCount(skill.applied)}건 · 전체 적용 중 {formatRate(skill.applied, totalApplied)}
                    </span>
                  )}
                </td>
                <MetricCell
                  value={`${formatCount(skill.users)}/${formatCount(activeUsers)}명 · ${formatRate(skill.users, activeUsers)}`}
                  emphasized
                />
                <td className={`text-right ${TD} font-mono tabular-nums text-[var(--text-muted)]`}>
                  {formatDate(skill.lastUsedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-end">
        <TablePager {...pager} />
      </div>
    </div>
  )
}

/**
 * 수치 한 칸 — 0은 눌러서 0이 아닌 값이 먼저 읽히게 한다
 *
 * @param value - 숫자 값
 * @param emphasized - 주요 지표 여부. 0이 아닐 때 더 진하게 찍는다
 */
function MetricCell({ value, emphasized = false }: { value: string; emphasized?: boolean }) {
  return (
    <td className={`text-right ${TD} font-mono tabular-nums ${emphasized ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
      {value}
    </td>
  )
}

/** 분모가 없는 비율은 0%로 꾸미지 않고 대시로 남긴다. */
function formatRate(value: number, total: number): string {
  if (total <= 0) return '—'
  const percentage = Math.round((value / total) * 1000) / 10
  return `${percentage.toLocaleString('ko-KR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}

/**
 * 순위를 가르는 실제 사용량 — 적용 보고
 *
 * @param skill - 스킬 한 줄
 * @returns 적용 보고 수
 */
function activity(skill: AxSkillUsageRow): number {
  return skill.applied
}
