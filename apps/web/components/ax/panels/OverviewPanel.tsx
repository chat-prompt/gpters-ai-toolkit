'use client'

/**
 * AX 대시보드 — 성과 요약 패널 본문
 *
 * 상단은 전체 구성원 수를 보여주고, 계정이 연결된 누적 스킬 참여 수는 내부 집계로만
 * 남긴다. 익명 이벤트가 있어 실제 사람 수로 단정할 수 없기 때문이다. 본문은 사람 중심의
 * 실측 그래프(일별 활성 추이 · 시간대별 밀도)와,
 * 목업에는 있으나 아직 계측하지 못하는 지표의 목록으로 구성된다.
 *
 * 미계측 지표를 숨기지 않고 사유와 함께 보여주는 것이 이 패널의 핵심 설계다 —
 * 0이나 추정값으로 채우면 대시보드 전체 수치의 신뢰가 무너진다.
 */

import type { AxOverviewData } from '@/lib/features/ax'
import type { AxPanelViewProps } from './types'
import { formatCount, formatDate } from '../format'

/** 표 머리칸 공통 스타일 */
const SECTION_LABEL = 'font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]'

/** 데이터가 비었을 때의 조용한 안내문 */
const EMPTY_NOTE = 'border-l-2 border-[var(--border-hover)] pl-4 text-sm text-[var(--text-secondary)]'

/** 구성원 AX 활동 그래프의 실제 막대 영역 높이(px) */
const ACTIVITY_CHART_HEIGHT = 176

/**
 * 성과 요약 패널 화면
 *
 * @param data - 성과 요약 집계
 * @param days - 조회 기간(일)
 */
export function OverviewPanel({ data, days }: AxPanelViewProps<AxOverviewData>) {
  return (
    <div className="space-y-10">
      <DailySkillFlow daily={data.dailySkillFlow} days={days} />
      <HourlyActiveUsers rows={data.hourlyDensity} />
      {/* 사용자별 로드·적용 보고 — 관리자에게만 데이터가 내려온다 */}
      {data.memberUsage !== null && <MemberUsageTable rows={data.memberUsage} days={days} />}
      <UnmeasuredList items={data.unmeasured} />
    </div>
  )
}

/**
 * 사용자별 로드·적용 보고 표 (관리자 전용)
 *
 * 이름 칸에 사용량 비례 막대를 깔아 순위 차이가 표를 읽지 않고도 보이게 한다.
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
  if (rows.length === 0) {
    return (
      <div>
        <p className={SECTION_LABEL}>사용자별 로드와 실제 적용</p>
        <p className={`mt-3 ${EMPTY_NOTE}`}>최근 {days}일 동안 로드·적용 활동이 없습니다.</p>
      </div>
    )
  }

  const max = Math.max(1, ...rows.map((row) => row.applied))

  return (
    <div>
      <p className={SECTION_LABEL}>사용자별 로드와 실제 적용</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className="py-2.5 px-3 text-left font-mono text-[11px] uppercase tracking-[0.14em] font-normal text-[var(--text-muted)] w-[36%]">사용자</th>
              <th className="py-2.5 px-3 text-right font-mono text-[11px] uppercase tracking-[0.14em] font-normal text-[var(--text-muted)]">로드</th>
              <th className="py-2.5 px-3 text-right font-mono text-[11px] uppercase tracking-[0.14em] font-normal text-[var(--text-muted)]">적용 보고</th>
              <th className="py-2.5 px-3 text-right font-mono text-[11px] uppercase tracking-[0.14em] font-normal text-[var(--text-muted)]">마지막 활동</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {rows.map((row, index) => (
              // 이름은 유일키가 아니다 — "이름 미설정"이 둘이면 충돌한다
              <tr key={`${row.name}-${index}`} className="transition-colors duration-200 hover:bg-[var(--bg-secondary)]">
                <td className="relative py-2.5 px-3">
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-[var(--brand-primary)]/[0.07]"
                    style={{ width: `${(row.applied / max) * 100}%` }}
                  />
                  <span className="relative text-[var(--text-primary)]">{row.name}</span>
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-primary)]">
                  {formatCount(row.loaded)}건
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                  {formatCount(row.applied)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-muted)]">
                  {formatDate(row.lastActiveAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">
        로드는 에이전트가 스킬의 전체 지침을 불러온 횟수이고, 실제 사용은 작업에 적용했다고
        명시적으로 보고한 횟수입니다. 이름 칸의 막대와 정렬은 실제 적용 보고 기준이며,
        검색 결과 노출·성공 여부·서버 호출 없이 로컬에서 재사용한 횟수는 포함하지 않습니다.
      </p>
    </div>
  )
}

/**
 * 일별 로드 코호트와 적용 전환을 누적·겹침 막대로 표시한다
 *
 * 맨 아래는 앞선 로드 없이 적용된 흐름, 그 위 반투명 막대는 로드 전체다.
 * 로드 뒤 실제 적용까지 이어진 부분은 반투명 로드 막대 안에 진하게 겹친다.
 *
 * @param daily - 일자별 직접 적용·로드·로드 후 적용 코호트
 * @param days - 조회 기간(일). 데이터가 없을 때 안내 문구에만 쓴다
 */
function DailySkillFlow({
  daily,
  days,
}: {
  daily: AxOverviewData['dailySkillFlow']
  days: number
}) {
  const totalDirect = daily.reduce((sum, point) => sum + point.directApplied, 0)
  const totalLoaded = daily.reduce((sum, point) => sum + point.loaded, 0)
  const totalLinkable = daily.reduce((sum, point) => sum + point.linkableLoaded, 0)
  const totalConverted = daily.reduce((sum, point) => sum + point.appliedAfterLoad, 0)
  const conversionRate = totalLinkable > 0 ? Math.round((totalConverted / totalLinkable) * 100) : 0

  if (daily.length === 0 || (totalDirect === 0 && totalLoaded === 0)) {
    return (
      <div>
        <p className={SECTION_LABEL}>구성원의 AX 활동</p>
        <p className={`mt-3 ${EMPTY_NOTE}`}>최근 {days}일 동안 로드·적용 활동이 없습니다.</p>
      </div>
    )
  }

  const max = Math.max(1, ...daily.map((point) => point.directApplied + point.loaded))
  const first = daily[0]
  const last = daily[daily.length - 1]

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className={SECTION_LABEL}>구성원의 AX 활동</p>
        <p className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
          로드 {formatCount(totalLoaded)} · 로드 후 적용 {formatCount(totalConverted)}/{formatCount(totalLinkable)} · {conversionRate}%
          {' · '}로드 없이 적용 {formatCount(totalDirect)}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--text-muted)]">
        <LegendSwatch color="var(--brand-secondary)" label="로드 없이 적용" />
        <LegendSwatch color="var(--brand-primary)" opacity={0.15} label="로드" />
        <LegendSwatch color="var(--brand-primary)" opacity={0.75} label="로드 후 적용" />
      </div>
      <div className="mt-4 flex h-44 items-end gap-[2px]">
        {daily.map((point) => (
          <div
            key={point.date}
            className="group relative flex min-w-[2px] flex-1 flex-col justify-end"
            style={{
              height: `${Math.max(3, ((point.directApplied + point.loaded) / max) * ACTIVITY_CHART_HEIGHT)}px`,
            }}
            aria-label={`${formatDayLabel(point.date)} · 로드 ${formatCount(point.loaded)}건 · 연결 가능 로드 ${formatCount(point.linkableLoaded)}건 · 로드 후 적용 ${formatCount(point.appliedAfterLoad)}건 · 로드 없이 적용 ${formatCount(point.directApplied)}건`}
          >
            {point.loaded > 0 && (
              <div
                className="relative w-full rounded-t-[3px]"
                style={{
                  height: `${(point.loaded / (point.loaded + point.directApplied)) * 100}%`,
                  background: 'color-mix(in srgb, var(--brand-primary) 15%, transparent)',
                }}
              >
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 transition-opacity group-hover:opacity-90"
                  style={{
                    height: `${(point.appliedAfterLoad / point.loaded) * 100}%`,
                    background: 'var(--brand-primary)',
                    opacity: 0.75,
                  }}
                />
              </div>
            )}
            {point.directApplied > 0 && (
              <div
                className="w-full transition-opacity group-hover:opacity-80"
                style={{
                  height: `${(point.directApplied / (point.loaded + point.directApplied)) * 100}%`,
                  background: 'var(--brand-secondary)',
                }}
              />
            )}
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1 font-mono text-[11px] tabular-nums text-[var(--text-primary)] shadow-lg group-hover:block">
              {formatDayLabel(point.date)} · 로드 {formatCount(point.loaded)} (연결 가능{' '}
              {formatCount(point.linkableLoaded)}) · 로드 후 적용{' '}
              {formatCount(point.appliedAfterLoad)} · 로드 없이 적용 {formatCount(point.directApplied)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        <span>{first ? formatDayLabel(first.date) : ''}</span>
        <span>최대 {formatCount(max)}개 흐름/일</span>
        <span>{last ? formatDayLabel(last.date) : ''}</span>
      </div>
      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">
        반투명 막대는 전체 로드입니다. 로드 전환은 그중 세션 ID가 있는 세션×스킬에서 첫 로드
        뒤 적용 보고가 이어졌는지 계산하며, 세션이 없어 연결할 수 없는 로드는 전환율에서
        제외합니다. 세션 없는 적용 보고는 로드 없이 적용에 포함하고, 선택 기간 이전에 로드된
        흐름은 이 기간의 로드 코호트에 포함하지 않습니다.
      </p>
    </div>
  )
}

/** 활동 그래프 범례 한 항목 */
function LegendSwatch({
  color,
  opacity = 1,
  label,
}: {
  color: string
  opacity?: number
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="h-2.5 w-2.5 rounded-[2px]" style={{ background: color, opacity }} />
      {label}
    </span>
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
  const max = Math.max(1, ...rows.map((row) => row.users))
  const total = rows.reduce((sum, row) => sum + row.users, 0)

  if (total === 0) {
    return (
      <div>
        <p className={SECTION_LABEL}>시간대별 실제 사용 인원 (KST)</p>
        <p className={`mt-3 ${EMPTY_NOTE}`}>이 기간에 적용 보고가 없습니다.</p>
      </div>
    )
  }

  return (
    <div>
      <p className={SECTION_LABEL}>시간대별 실제 사용 인원 (KST)</p>
      <div className="mt-3 flex h-24 items-end gap-[3px]">
        {rows.map((point) => (
          <div
            key={point.hour}
            className="group relative min-w-[3px] flex-1"
            style={{ height: `${Math.max(2, (point.users / max) * 100)}%` }}
            aria-label={`${point.hour}시 · ${formatCount(point.users)}명`}
          >
            <div
              className={`h-full rounded-t-[3px] bg-[var(--brand-primary)] transition-opacity duration-200 ${
                point.users === max ? 'opacity-100' : 'opacity-25 group-hover:opacity-60'
              }`}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1 font-mono text-[11px] tabular-nums text-[var(--text-primary)] shadow-lg group-hover:block">
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

/**
 * 아직 계측하지 않는 지표 목록
 *
 * 접지 않고 항상 펼쳐 둔다 — 이 목록은 부끄러운 부록이 아니라
 * "여기 있는 숫자는 전부 실측"이라는 선언의 반쪽이다.
 *
 * @param items - 미계측 지표와 사유
 */
function UnmeasuredList({ items }: { items: AxOverviewData['unmeasured'] }) {
  if (items.length === 0) return null

  return (
    <div className="rounded-xl border border-dashed border-[var(--border-hover)] px-5 py-4">
      <p className={SECTION_LABEL}>아직 계측하지 않는 지표</p>
      <ul className="mt-3 space-y-1.5">
        {items.map((item) => (
          <li key={item.label} className="flex flex-wrap gap-x-2 text-sm">
            <span className="text-[var(--text-primary)]">{item.label}</span>
            <span className="text-[var(--text-secondary)]">— {item.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * 일자 라벨 (YYYY-MM-DD → "8월 3일")
 *
 * Date로 파싱하면 시간대에 따라 하루가 밀리므로 문자열을 그대로 쪼갠다.
 *
 * @param date - YYYY-MM-DD 형식 날짜
 * @returns "8월 3일". 형식이 다르면 입력을 그대로 돌려준다
 */
function formatDayLabel(date: string): string {
  const parts = date.split('-')
  if (parts.length !== 3) return date
  return `${Number(parts[1])}월 ${Number(parts[2])}일`
}
