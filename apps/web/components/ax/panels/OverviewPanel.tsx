'use client'

/**
 * AX 대시보드 — 성과 요약 패널 본문
 *
 * 주간 활성·누적 참여는 상단 핵심 지표 밴드가 이미 말하므로 여기서 되풀이하지 않는다.
 * 본문은 세 개의 실측 그래프(일별 활성 추이 · 활용 유형 분포 · 시간대별 밀도)와,
 * 목업에는 있으나 아직 계측하지 못하는 지표의 목록으로 구성된다.
 *
 * 미계측 지표를 숨기지 않고 사유와 함께 보여주는 것이 이 패널의 핵심 설계다 —
 * 0이나 추정값으로 채우면 대시보드 전체 수치의 신뢰가 무너진다.
 */

import type { AxOverviewData } from '@/lib/features/ax'
import type { AxPanelViewProps } from './types'
import { formatCount, formatDate } from '../format'

/** action 코드 → 화면 표기 */
const ACTION_LABELS: Record<string, string> = {
  search: '검색',
  load: '로드',
  apply: '적용',
  skip: '스킵',
  deploy: '배포',
}

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
      <DailyActiveTrend daily={data.dailyActiveUsers} days={days} />
      <ActionDistribution rows={data.actionDistribution} />
      <HourlyDensity rows={data.hourlyDensity} />
      {/* 사용자별 사용량 — 관리자에게만 데이터가 내려온다 */}
      {data.memberUsage !== null && <MemberUsageTable rows={data.memberUsage} days={days} />}
      <UnmeasuredList items={data.unmeasured} />
    </div>
  )
}

/**
 * 사용자별 사용량 표 (관리자 전용)
 *
 * 이름 칸에 사용량 비례 막대를 깔아 순위 차이가 표를 읽지 않고도 보이게 한다.
 * 에이전트별 사용량은 실행 이벤트 수집이 붙기 전까지 미계측 목록에 명시된다.
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
        <p className={SECTION_LABEL}>사용자별 사용량</p>
        <p className={`mt-3 ${EMPTY_NOTE}`}>최근 {days}일 동안 활동한 사용자가 없습니다.</p>
      </div>
    )
  }

  const max = Math.max(1, ...rows.map((row) => row.events))

  return (
    <div>
      <p className={SECTION_LABEL}>사용자별 사용량</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className="py-2.5 px-3 text-left font-mono text-[11px] uppercase tracking-[0.14em] font-normal text-[var(--text-muted)] w-[36%]">사용자</th>
              <th className="py-2.5 px-3 text-right font-mono text-[11px] uppercase tracking-[0.14em] font-normal text-[var(--text-muted)]">사용</th>
              <th className="py-2.5 px-3 text-right font-mono text-[11px] uppercase tracking-[0.14em] font-normal text-[var(--text-muted)]">적용</th>
              <th className="py-2.5 px-3 text-right font-mono text-[11px] uppercase tracking-[0.14em] font-normal text-[var(--text-muted)]">마지막 활동</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {rows.map((row) => (
              <tr key={row.name} className="transition-colors duration-200 hover:bg-[var(--bg-secondary)]">
                <td className="relative py-2.5 px-3">
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-[var(--brand-primary)]/[0.07]"
                    style={{ width: `${(row.events / max) * 100}%` }}
                  />
                  <span className="relative text-[var(--text-primary)]">{row.name}</span>
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-primary)]">
                  {formatCount(row.events)}건
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
    </div>
  )
}

/**
 * 일자별 활성 인원 추이 막대
 *
 * 스킬 사용량 패널의 추이와 같은 문법(최댓값만 진하게)을 쓰되, 세는 대상이
 * 이벤트 수가 아니라 사람 수라는 것을 라벨로 밝힌다.
 *
 * @param daily - 일자별 활성 인원
 * @param days - 조회 기간(일). 데이터가 없을 때 안내 문구에만 쓴다
 */
function DailyActiveTrend({
  daily,
  days,
}: {
  daily: AxOverviewData['dailyActiveUsers']
  days: number
}) {
  // 서버가 빈 날을 0으로 채워 내려주므로 길이가 아니라 합으로 판정한다 —
  // 전부 0인데 막대를 그리면 "최대 1명"이 활동처럼 읽힌다
  if (daily.length === 0 || daily.every((point) => point.users === 0)) {
    return (
      <div>
        <p className={SECTION_LABEL}>일별 활성 인원 (KST)</p>
        <p className={`mt-3 ${EMPTY_NOTE}`}>최근 {days}일 동안 기록된 활동이 없습니다.</p>
      </div>
    )
  }

  const max = Math.max(1, ...daily.map((point) => point.users))
  const first = daily[0]
  const last = daily[daily.length - 1]

  return (
    <div>
      <p className={SECTION_LABEL}>일별 활성 인원 (KST)</p>
      <div className="mt-3 flex h-40 items-end gap-[2px]">
        {daily.map((point) => (
          <div
            key={point.date}
            className={`min-w-[2px] flex-1 rounded-t-[3px] bg-[var(--brand-primary)] transition-opacity duration-200 ${
              point.users === max ? 'opacity-100' : 'opacity-25 hover:opacity-60'
            }`}
            style={{ height: `${Math.max(2, (point.users / max) * 100)}%` }}
            title={`${formatDayLabel(point.date)} · ${formatCount(point.users)}명`}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        <span>{first ? formatDayLabel(first.date) : ''}</span>
        <span>최대 {formatCount(max)}명</span>
        <span>{last ? formatDayLabel(last.date) : ''}</span>
      </div>
    </div>
  )
}

/**
 * 활용 유형 분포 — 가로 막대
 *
 * 유형이 다섯 개뿐이라 파이 차트 대신 순서 고정 가로 막대로 둔다.
 * 비중은 전체 이벤트 대비 백분율로 함께 찍는다.
 *
 * @param rows - action별 이벤트 수 (서버가 고정 순서로 내려준다)
 */
function ActionDistribution({ rows }: { rows: AxOverviewData['actionDistribution'] }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0)

  if (total === 0) {
    return (
      <div>
        <p className={SECTION_LABEL}>활용 유형 분포</p>
        <p className={`mt-3 ${EMPTY_NOTE}`}>이 기간에 기록된 활동이 없습니다.</p>
      </div>
    )
  }

  const max = Math.max(1, ...rows.map((row) => row.count))

  return (
    <div>
      <p className={SECTION_LABEL}>활용 유형 분포</p>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => {
          const ratio = row.count / max
          const percent = Math.round((row.count / total) * 100)
          return (
            <li key={row.action} className="flex items-center gap-3">
              <span className="w-12 shrink-0 text-sm text-[var(--text-secondary)]">
                {ACTION_LABELS[row.action] ?? row.action}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                <div
                  className="h-full rounded-full bg-[var(--brand-primary)]"
                  style={{ width: `${ratio * 100}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                {formatCount(row.count)}건 · {percent}%
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * 시간대별 활동 밀도 — KST 0~23시 막대
 *
 * "팀이 하루 중 언제 움직이는가"를 본다. 기준 시간대(KST)를 라벨로 명시한다.
 *
 * @param rows - 시간대별 이벤트 수 (24칸이 모두 채워져 내려온다)
 */
function HourlyDensity({ rows }: { rows: AxOverviewData['hourlyDensity'] }) {
  const max = Math.max(1, ...rows.map((row) => row.events))
  const total = rows.reduce((sum, row) => sum + row.events, 0)

  if (total === 0) {
    return (
      <div>
        <p className={SECTION_LABEL}>시간대별 활동 밀도 (KST)</p>
        <p className={`mt-3 ${EMPTY_NOTE}`}>이 기간에 기록된 활동이 없습니다.</p>
      </div>
    )
  }

  return (
    <div>
      <p className={SECTION_LABEL}>시간대별 활동 밀도 (KST)</p>
      <div className="mt-3 flex h-24 items-end gap-[3px]">
        {rows.map((point) => (
          <div
            key={point.hour}
            className={`min-w-[3px] flex-1 rounded-t-[3px] bg-[var(--brand-primary)] transition-opacity duration-200 ${
              point.events === max ? 'opacity-100' : 'opacity-25 hover:opacity-60'
            }`}
            style={{ height: `${Math.max(2, (point.events / max) * 100)}%` }}
            title={`${point.hour}시 · ${formatCount(point.events)}건`}
          />
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
