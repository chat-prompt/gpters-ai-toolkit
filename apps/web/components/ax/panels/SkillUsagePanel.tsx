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
import { formatCount, formatDate, relativeActivityFill } from '../format'
import { TablePager, usePagedRows } from './TablePager'

/** 한 장에 실을 스킬 수 */
const SKILL_PAGE_SIZE = 20

/** 표 머리칸 공통 스타일 */
const TH = 'font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] font-normal'

/** 표 본문칸 공통 여백 */
const TD = 'py-2.5 px-3'

/** 데이터가 비었을 때의 조용한 안내문 */
const EMPTY_NOTE = 'border-l-2 border-[var(--border-hover)] pl-4 text-sm text-[var(--text-secondary)]'

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

/** 검색 노출·로드·적용 보고가 전체 관측 이벤트에서 차지한 비중을 보여준다. */
export function SkillEventSummary({
  totals,
  totalEvents,
}: {
  totals: AxSkillUsageData['actionTotals']
  totalEvents: number
}) {
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)
  const steps = [
    { label: '검색 노출', value: totals.search, color: 'var(--text-muted)' },
    {
      label: '로드',
      value: totals.load,
      color: 'color-mix(in srgb, var(--text-muted) 58%, var(--bg-primary))',
    },
    {
      label: '적용 보고',
      value: totals.apply,
      color: 'var(--accent-orange)',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-8">
      {steps.map((step, index) => {
        const rate = formatRate(step.value, totalEvents)
        const highlighted = highlightedIndex === index
        return (
          <div
            key={step.label}
            className="relative py-2 outline-none"
            tabIndex={0}
            aria-label={`${step.label} ${formatCount(step.value)}건 · 전체 이벤트 중 ${rate}`}
            onMouseEnter={() => setHighlightedIndex(index)}
            onMouseLeave={() => setHighlightedIndex(null)}
            onFocus={() => setHighlightedIndex(index)}
            onBlur={() => setHighlightedIndex(null)}
          >
            <p className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: step.color }} />
              {step.label}
            </p>
            {highlighted && (
              <p className="absolute right-0 top-0 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1 font-mono text-[10px] tabular-nums text-[var(--text-secondary)] shadow-sm">
                전체 이벤트 중 {rate}
              </p>
            )}
            <p className="mt-2 font-mono text-xl tabular-nums text-[var(--text-primary)]">{formatCount(step.value)}</p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${totalEvents > 0 ? Math.min(100, (step.value / totalEvents) * 100) : 0}%`,
                  background: step.color,
                  boxShadow: highlighted
                    ? '0 0 0 1px var(--bg-primary), 0 0 0 3px var(--brand-secondary)'
                    : 'none',
                }}
              />
            </div>
          </div>
        )
      })}
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
      <div className="relative mb-3 inline-flex items-center gap-1.5">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">스킬별 실제 적용</p>
        <span
          className="cursor-help rounded-full px-1 font-mono text-[10px] text-[var(--text-muted)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--brand-primary)]"
          tabIndex={0}
          aria-label="스킬 적용 집계 범위 안내"
          aria-describedby="skill-application-coverage-help"
          onMouseEnter={() => setShowCoverageHelp(true)}
          onMouseLeave={() => setShowCoverageHelp(false)}
          onFocus={() => setShowCoverageHelp(true)}
          onBlur={() => setShowCoverageHelp(false)}
        >
          ?
        </span>
        {showCoverageHelp && (
          <span
            id="skill-application-coverage-help"
            role="tooltip"
            className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 w-72 -translate-y-1/2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-2 text-[11px] font-normal leading-relaxed tracking-normal text-[var(--text-secondary)] shadow-lg"
          >
            명시적인 적용 보고만 집계합니다. 로컬에서 다시 실행했지만 보고하지 않은 횟수는 0이 아니라 미관측입니다.
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className={`text-right ${TD} ${TH} w-12`}>순위</th>
              <th className={`text-left ${TD} ${TH} w-[56%]`}>스킬</th>
              <th className={`text-right ${TD} ${TH}`}>활성 사용자 중 적용</th>
              <th className={`text-right ${TD} ${TH}`}>마지막 사용</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {shown.map((skill, index) => (
              <tr
                key={skill.skillId}
                className="focus-visible:outline-none"
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
                  {/* 사용량 비례 막대 — 이름 칸 안에서만 찬다 */}
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0"
                    data-activity-fill={relativeActivityFill(activity(skill), min, max)}
                    style={{
                      width: `${(activity(skill) / max) * 100}%`,
                      background: relativeActivityFill(activity(skill), min, max),
                    }}
                  />
                  <span className="relative text-[var(--text-primary)]">{skill.name}</span>
                  {highlightedSkillId === skill.skillId && (
                    <span className="pointer-events-none absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1 font-mono text-[10px] tabular-nums text-[var(--text-secondary)] shadow-sm">
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
