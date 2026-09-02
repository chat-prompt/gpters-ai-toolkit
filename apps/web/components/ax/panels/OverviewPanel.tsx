'use client'

/**
 * AX 대시보드 — 성과 요약 패널 본문
 *
 * 상단의 구성원 활동 카드가 선택 기간의 일별 실제 사용 인원을 담당한다. 이 본문은
 * 시간대별 사용 인원과 사용자별 고유 스킬 활용처럼 사람 중심의 상세로 구성된다.
 */

import type { AxOverviewData } from '@/lib/features/ax'
import { useState } from 'react'
import type { AxPanelViewProps } from './types'
import { formatCount, formatDate, relativeActivityFill } from '../format'

/** 표 머리칸 공통 스타일 */
const SECTION_LABEL = 'font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]'

/** 데이터가 비었을 때의 조용한 안내문 */
const EMPTY_NOTE = 'border-l-2 border-[var(--border-hover)] pl-4 text-sm text-[var(--text-secondary)]'

/**
 * 성과 요약 패널 화면
 *
 * @param data - 성과 요약 집계
 * @param days - 조회 기간(일)
 */
export function OverviewPanel({ data, days }: AxPanelViewProps<AxOverviewData>) {
  return (
    <div className="space-y-10">
      <HourlyActiveUsers rows={data.hourlyDensity} />
      {/* 사용자별 고유 스킬 활용 — 관리자에게만 데이터가 내려온다 */}
      {data.memberUsage !== null && <MemberUsageTable rows={data.memberUsage} days={days} />}
    </div>
  )
}

/**
 * 사용자별 고유 스킬 활용 표 (관리자 전용)
 *
 * 이름 칸에 실제 적용 횟수 비례 막대를 깔아 활동량 차이를 표를 읽지 않고도 보이게 한다.
 * 표의 숫자 컬럼은 활동량과 별개로 실제 적용한 고유 스킬 수를 보여준다.
 * 로드·적용 횟수는 행을 호버하거나 키보드로 포커스했을 때만 보조 정보로 드러낸다.
 * 에이전트별 사용량은 별도 에이전트 활동 패널에서 토큰·도구·스킬 신호로 보여준다.
 *
 * @param rows - 사용자별 집계 (사용량 내림차순)
 * @param days - 조회 기간(일)
 */
function MemberUsageTable({
  rows,
  days,
}: {
  rows: NonNullable<AxOverviewData['memberUsage']>
  days: number
}) {
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)
  if (rows.length === 0) {
    return (
      <div>
        <p className={SECTION_LABEL}>사용자별 스킬 활용</p>
        <p className={`mt-3 ${EMPTY_NOTE}`}>최근 {days}일 동안 스킬 활동이 없습니다.</p>
      </div>
    )
  }

  const max = Math.max(1, ...rows.map((row) => row.applied))
  const positiveValues = rows.map((row) => row.applied).filter((value) => value > 0)
  const min = positiveValues.length > 0 ? Math.min(...positiveValues) : max

  return (
    <div>
      <p className={SECTION_LABEL}>사용자별 스킬 활용</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className="py-2.5 px-3 text-left font-mono text-[11px] uppercase tracking-[0.14em] font-normal text-[var(--text-muted)] w-[56%]">사용자</th>
              <th className="py-2.5 px-3 text-right font-mono text-[11px] uppercase tracking-[0.14em] font-normal text-[var(--text-muted)]">고유 스킬</th>
              <th className="py-2.5 px-3 text-right font-mono text-[11px] uppercase tracking-[0.14em] font-normal text-[var(--text-muted)]">마지막 활동</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {rows.map((row, index) => (
              // 이름은 유일키가 아니다 — "이름 미설정"이 둘이면 충돌한다
              <tr
                key={`${row.name}-${index}`}
                className="group focus-visible:outline-none"
                tabIndex={0}
                onMouseEnter={() => setHighlightedIndex(index)}
                onMouseLeave={() => setHighlightedIndex(null)}
                onFocus={() => setHighlightedIndex(index)}
                onBlur={() => setHighlightedIndex(null)}
                aria-label={`${row.name} · 고유 스킬 ${formatCount(row.uniqueSkills)}개 · 로드 ${formatCount(row.loaded)}건 · 적용 보고 ${formatCount(row.applied)}건`}
              >
                <td className="relative py-2.5 px-3">
                  <span
                    aria-hidden
                    className="ax-activity-mark absolute inset-y-0 left-0 transition-shadow duration-150"
                    data-activity-fill={relativeActivityFill(row.applied, min, max)}
                    style={{
                      width: `${(row.applied / max) * 100}%`,
                      background: relativeActivityFill(row.applied, min, max),
                      boxShadow: highlightedIndex === index
                        ? '0 0 0 1px var(--bg-primary), 0 0 0 3px var(--brand-primary)'
                        : 'none',
                    }}
                  />
                  <span className="relative text-[var(--text-primary)]">{row.name}</span>
                  <span className={`pointer-events-none absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1 font-mono text-[10px] tabular-nums text-[var(--text-secondary)] shadow-sm ${highlightedIndex === index ? 'block' : 'hidden'}`}>
                    로드 {formatCount(row.loaded)} · 적용 {formatCount(row.applied)}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-primary)]">
                  {formatCount(row.uniqueSkills)}개
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-muted)]">
                  {formatDate(row.lastActiveAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * 시간대별 활성 인원 — KST 0~23시 막대
 *
 * "하루 중 몇 명이 움직이는가"를 본다. 기준 시간대(KST)를 라벨로 명시한다.
 *
 * @param rows - 시간대별 고유 사용자 수 (24칸이 모두 채워져 내려온다)
 */
function HourlyActiveUsers({ rows }: { rows: AxOverviewData['hourlyDensity'] }) {
  const [highlightedHour, setHighlightedHour] = useState<number | null>(null)
  const max = Math.max(1, ...rows.map((row) => row.users))
  const positiveValues = rows.map((row) => row.users).filter((value) => value > 0)
  const min = positiveValues.length > 0 ? Math.min(...positiveValues) : max
  const total = rows.reduce((sum, row) => sum + row.users, 0)

  if (total === 0) {
    return (
      <div>
        <p className={SECTION_LABEL}>시간대별 사용 인원 (KST)</p>
        <p className={`mt-3 ${EMPTY_NOTE}`}>이 기간에 적용 보고가 없습니다.</p>
      </div>
    )
  }

  return (
    <div>
      <p className={SECTION_LABEL}>시간대별 사용 인원 (KST)</p>
      <div className="mt-3 flex h-24 items-end gap-[3px]">
        {rows.map((point) => (
          <div
            key={point.hour}
            className="group relative min-w-[3px] flex-1 focus-visible:outline-none"
            style={{ height: `${Math.max(2, (point.users / max) * 100)}%` }}
            aria-label={`${point.hour}시 · ${formatCount(point.users)}명`}
            tabIndex={0}
            onMouseEnter={() => setHighlightedHour(point.hour)}
            onMouseLeave={() => setHighlightedHour(null)}
            onFocus={() => setHighlightedHour(point.hour)}
            onBlur={() => setHighlightedHour(null)}
          >
            <div
              className="ax-activity-mark h-full rounded-t-[3px] transition-shadow duration-150"
              data-activity-fill={relativeActivityFill(point.users, min, max)}
              style={{
                background: relativeActivityFill(point.users, min, max),
                boxShadow: highlightedHour === point.hour
                  ? '0 0 0 1px var(--bg-primary), 0 0 0 3px var(--brand-primary)'
                  : 'none',
              }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1 font-mono text-[11px] tabular-nums text-[var(--text-primary)] shadow-lg group-hover:block group-focus:block">
              {point.hour}시 · {formatCount(point.users)}명
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between border-t border-[var(--border-subtle)] pt-2 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        <span>0시</span>
        <span>6시</span>
        <span>12시</span>
        <span>18시</span>
        <span>23시</span>
      </div>
    </div>
  )
}
