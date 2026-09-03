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
    <div>
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

  return (
    <div>
      {/* 두 경로를 좌우 단으로 나누고 단계는 위에서 아래로 쌓는다.
          단 사이 48px, 행 안쪽 16px, 라벨과 막대 12px — 4px 스케일로 숨 쉴 자리를 둔다 */}
      <div className="grid grid-cols-1 gap-x-12 gap-y-6 sm:grid-cols-2">
        {lanes.map((lane) => (
          <div key={lane.id}>
            <h4 className={SECTION_LABEL}>{lane.label}</h4>
            <div className="mt-4 divide-y divide-[var(--border-subtle)]">
              {lane.steps.map((step) => {
                const key = `${lane.id}:${step.label}`
                const active = highlighted === key
                const rate = step.previous ? formatSampledRate(step.value, step.previous.value) : null
                const ratio = step.previous
                  ? (step.previous.value > 0 ? Math.min(1, step.value / step.previous.value) : 0)
                  : (step.value > 0 ? 1 : 0)
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
                return (
                  <div
                    key={key}
                    role="group"
                    className="relative py-4 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]"
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
                        className="block h-full rounded-full"
                        style={{
                          width: `${ratio * 100}%`,
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
          </div>
        ))}
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
