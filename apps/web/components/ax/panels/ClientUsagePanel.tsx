/**
 * AX 대시보드 — 클라이언트 사용량 패널 본문
 *
 * 위는 클라이언트별 요약, 가운데는 모델별 사용량, 아래는 팀원별 상세다.
 *
 * Codex는 롤아웃, Claude Code는 statusline usage cache에서 주간 한도 스냅샷을 수집한다.
 * 아직 새 수집기로 보고되지 않은 값은 0%가 아니라 "미수집"으로 명확히 밝힌다.
 */

import type {
  AxClientUsageClientRow,
  AxClientUsageData,
  AxClientUsageMemberRow,
  AxUsageParticipationRow,
  AxUsageParticipationStatus,
  AxUsageClient,
} from '@/lib/features/ax'
import type { AxPanelViewProps } from './types'
import { formatCount, formatDate, formatDateTime } from '../format'

/** 클라이언트 표시명 */
const CLIENT_LABELS: Record<AxUsageClient, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
}

/** 값이 없을 때 표에 찍는 기호 */
const EMPTY = '—'

/** 표 머리칸 공통 스타일 */
const TH = 'font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] font-normal'

/** 표 본문칸 공통 여백 */
const TD = 'py-2.5 px-3'

/**
 * 토큰 수를 짧게 표기
 *
 * 대시보드에서 40억 단위 숫자를 그대로 쓰면 자릿수를 세게 된다.
 *
 * @param n - 토큰 수
 * @returns "4.4B" 형태의 축약 표기
 */
function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

/**
 * 클라이언트 사용량 패널 화면
 *
 * @param data - 사용량 집계. members가 null이면 팀원별 상세를 렌더하지 않는다
 */
export function ClientUsagePanel({ data }: AxPanelViewProps<AxClientUsageData>) {
  return (
    <div className="space-y-10">
      <div>
        <PeriodNotice
          periodStart={data.periodStart}
          periodEnd={data.periodEnd}
          syncedAt={data.syncedAt}
          reportingMembers={data.reportingMembers}
          internalMembers={data.internalMembers}
        />
        {data.byClient.length > 0 ? (
          <div className="mt-3">
            <ClientTable rows={data.byClient} total={data.totalTokens} />
          </div>
        ) : (
          <p className="mt-3 border-l-2 border-[var(--border-hover)] pl-4 text-sm text-[var(--text-secondary)]">
            수집된 사용량이 없습니다.
          </p>
        )}
      </div>

      {data.byModel.length > 0 && <ModelTable rows={data.byModel} total={data.totalTokens} />}

      {/* 내부 계정 전수 수집 상태 — 관리자에게만 데이터가 내려온다 */}
      {data.participation !== null && <ParticipationTable rows={data.participation} />}

      {/* 팀원별 상세 — 관리자에게만 데이터가 내려온다 */}
      {data.members !== null && <MemberTable members={data.members} />}
    </div>
  )
}

const PARTICIPATION_STATUS: Record<
  AxUsageParticipationStatus,
  { label: string; tone: string }
> = {
  reporting: { label: '정상 보고', tone: 'text-[var(--accent-green)]' },
  stale: { label: '7일 초과 미보고', tone: 'text-[var(--accent-orange)]' },
  not_using: { label: '최근 사용 기록 없음', tone: 'text-[var(--text-secondary)]' },
  not_installed: { label: '승인 후 수집 미확인', tone: 'text-[var(--accent-orange)]' },
  not_approved: { label: '활성 승인 없음', tone: 'text-[var(--accent-orange)]' },
}

const PARTICIPATION_SOURCE: Record<AxUsageParticipationRow['source'], string> = {
  collector: '수집기 점검 신호',
  usage_report: '인증 사용자 사용량',
  legacy_usage: '기존 사용량 보고',
  authorization: '승인 있음 · 점검 없음',
  none: '활성 승인 기록 없음',
}

/** 내부 계정 전원의 수집 참여 상태 (관리자 전용) */
function ParticipationTable({ rows }: { rows: AxUsageParticipationRow[] }) {
  const active = rows.filter((row) => row.status === 'reporting').length
  const statusCounts = (Object.keys(PARTICIPATION_STATUS) as AxUsageParticipationStatus[])
    .map((status) => ({ status, count: rows.filter((row) => row.status === status).length }))
    .filter((item) => item.count > 0)

  return (
    <div>
      <p className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        수집 참여 상태 · 주간 활성 {formatCount(active)}/{formatCount(rows.length)}명
      </p>
      <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
        상태는 수집기 점검 신호, 기존 보고, OAuth 승인 기록을 순서대로 대조한 결과입니다. 승인됐지만
        점검 신호가 없는 계정은 승인 후 수집 미확인으로 분류합니다. 최근 사용 기록 없음은 수집기가
        정상 응답했지만 해당 기간의 사용량이 0건이라는 뜻입니다.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {statusCounts.map(({ status, count }) => (
          <span
            key={status}
            className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]"
          >
            {PARTICIPATION_STATUS[status].label} {formatCount(count)}명
          </span>
        ))}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className={`text-left ${TD} ${TH} w-[18%]`}>사용자</th>
              <th className={`text-left ${TD} ${TH} w-[20%]`}>상태</th>
              <th className={`text-left ${TD} ${TH} w-[17%]`}>클라이언트</th>
              <th className={`text-right ${TD} ${TH}`}>마지막 보고</th>
              <th className={`text-right ${TD} ${TH}`}>마지막 로그인</th>
              <th className={`text-left ${TD} ${TH} w-[18%]`}>판정 근거</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {rows.map((row) => {
              const status = PARTICIPATION_STATUS[row.status]
              return (
                <tr
                  key={row.userId}
                  className="transition-colors duration-200 hover:bg-[var(--bg-secondary)]"
                >
                  <td className={`${TD} text-[var(--text-primary)]`}>{row.memberName}</td>
                  <td className={`${TD} ${status.tone}`}>{status.label}</td>
                  <td className={`${TD} text-[var(--text-secondary)]`}>
                    {row.clients.length > 0
                      ? row.clients.map((client) => CLIENT_LABELS[client]).join(', ')
                      : EMPTY}
                  </td>
                  <td className={`text-right ${TD} font-mono text-xs tabular-nums text-[var(--text-muted)]`}>
                    {row.lastReportedAt ? formatDate(row.lastReportedAt) : EMPTY}
                  </td>
                  <td className={`text-right ${TD} font-mono text-xs tabular-nums text-[var(--text-muted)]`}>
                    {row.lastLoginAt ? formatDate(row.lastLoginAt) : EMPTY}
                  </td>
                  <td className={`${TD} text-xs text-[var(--text-secondary)]`}>
                    {PARTICIPATION_SOURCE[row.source]}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * 클라이언트별 요약 표
 *
 * 한도 값이 있으면 퍼센트를, 최신 스냅샷이 없으면 "미수집"을 보여준다.
 *
 * @param rows - 클라이언트별 집계
 * @param total - 전체 토큰 합계 (비율 계산용)
 */
function ClientTable({ rows, total }: { rows: AxClientUsageClientRow[]; total: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            <th className={`text-left ${TD} ${TH} w-[24%]`}>클라이언트</th>
            <th className={`text-right ${TD} ${TH} w-20`}>인원</th>
            <th className={`text-right ${TD} ${TH} w-20`}>세션</th>
            <th className={`text-right ${TD} ${TH} w-24`}>토큰</th>
            <th className={`text-left ${TD} ${TH}`}>비중</th>
            <th className={`text-right ${TD} ${TH} w-[18%]`}>주간 한도</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {rows.map((row) => {
            const ratio = total > 0 ? Math.min(1, row.totalTokens / total) : 0
            return (
              <tr
                key={row.client}
                className="transition-colors duration-200 hover:bg-[var(--bg-secondary)]"
              >
                <td className={`${TD} text-[var(--text-primary)]`}>
                  {CLIENT_LABELS[row.client] ?? row.client}
                </td>
                <td
                  className={`text-right ${TD} font-mono tabular-nums text-[var(--text-secondary)]`}
                >
                  {formatCount(row.members)}
                </td>
                <td
                  className={`text-right ${TD} font-mono tabular-nums text-[var(--text-secondary)]`}
                >
                  {formatCount(row.sessions)}
                </td>
                <td
                  className={`text-right ${TD} font-mono tabular-nums whitespace-nowrap text-[var(--text-primary)]`}
                >
                  {formatTokens(row.totalTokens)}
                </td>
                <td className={TD}>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 min-w-[80px] flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                      <div
                        className="h-full rounded-full bg-[var(--brand-primary)]"
                        style={{ width: `${ratio * 100}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                      {Math.round(ratio * 100)}%
                    </span>
                  </div>
                </td>
                <td className={`text-right ${TD} whitespace-nowrap`}>
                  <LimitCell row={row} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/*
        한도를 안 주는 클라이언트가 섞여 있으면 그 이유를 표 아래에 한 줄로 밝힌다.
        색이 text-muted가 아니라 text-secondary인 이유: 이 문장은 타임스탬프 같은 곁가지가 아니라
        표의 빈 칸을 해석하는 데 필요한 설명이라 대비 4.5:1을 넘겨야 한다.
      */}
      {rows.some((row) => row.client === 'claude-code' && !row.reportsLimit) && (
        <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
          Claude Code의 주간 한도와 리셋 시각은 로컬 statusline usage cache에서 수집합니다.
          기존 보고는 미수집으로 남으며, 새 수집기가 보고한 뒤부터 표시됩니다.
        </p>
      )}
    </div>
  )
}

/**
 * 주간 한도 칸
 *
 * @param row - 클라이언트별 집계 한 줄
 */
function LimitCell({ row }: { row: AxClientUsageClientRow }) {
  if (!row.reportsLimit) {
    return <span className="text-[11px] text-[var(--text-muted)]">미수집</span>
  }
  if (row.avgLimitUsedPercent === null) {
    return <span className="font-mono text-[var(--text-muted)]">{EMPTY}</span>
  }
  return (
    <span
      className={`font-mono tabular-nums ${
        row.avgLimitUsedPercent >= 80
          ? 'text-[var(--accent-orange)]'
          : 'text-[var(--text-primary)]'
      }`}
    >
      {row.avgLimitUsedPercent}%
    </span>
  )
}

/**
 * 모델별 사용량 표
 *
 * @param rows - 모델별 토큰 (내림차순)
 * @param total - 전체 토큰 합계
 */
function ModelTable({
  rows,
  total,
}: {
  rows: Array<{ model: string; tokens: number }>
  total: number
}) {
  return (
    <div>
      <p className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        모델별 사용량 상위 {formatCount(rows.length)}개
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className={`text-left ${TD} ${TH} w-[40%]`}>모델</th>
              <th className={`text-right ${TD} ${TH} w-24`}>토큰</th>
              <th className={`text-left ${TD} ${TH}`}>비중</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {rows.map((row) => {
              const ratio = total > 0 ? Math.min(1, row.tokens / total) : 0
              return (
                <tr
                  key={row.model}
                  className="transition-colors duration-200 hover:bg-[var(--bg-secondary)]"
                >
                  <td className={`${TD} font-mono text-[13px] text-[var(--text-primary)]`}>
                    {row.model}
                  </td>
                  <td
                    className={`text-right ${TD} font-mono tabular-nums whitespace-nowrap text-[var(--text-secondary)]`}
                  >
                    {formatTokens(row.tokens)}
                  </td>
                  <td className={TD}>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 min-w-[80px] flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                        <div
                          className="h-full rounded-full bg-[var(--text-muted)]"
                          style={{ width: `${ratio * 100}%` }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                        {Math.round(ratio * 100)}%
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * 팀원별 사용량 상세 표 (관리자 전용) — 최신 한도 스냅샷이 없으면 미수집으로 밝힌다
 *
 * @param members - 팀원별 사용량
 */
function MemberTable({ members }: { members: AxClientUsageMemberRow[] }) {
  if (members.length === 0) {
    return (
      <p className="border-l-2 border-[var(--border-hover)] pl-4 text-sm text-[var(--text-secondary)]">
        팀원별 사용 내역이 없습니다.
      </p>
    )
  }

  const sorted = [...members].sort(
    (a, b) =>
      a.memberName.localeCompare(b.memberName, 'ko') || b.totalTokens - a.totalTokens
  )

  return (
    <div>
      <p className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        팀원별 상세 {formatCount(sorted.length)}건
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className={`text-left ${TD} ${TH} w-[16%]`}>사용자</th>
              <th className={`text-left ${TD} ${TH} w-[18%]`}>클라이언트</th>
              <th className={`text-left ${TD} ${TH} w-[20%]`}>플랜</th>
              <th className={`text-right ${TD} ${TH}`}>세션</th>
              <th className={`text-right ${TD} ${TH}`}>토큰</th>
              <th className={`text-right ${TD} ${TH}`}>주간 한도</th>
              <th className={`text-right ${TD} ${TH}`}>리셋</th>
              <th className={`text-right ${TD} ${TH}`}>마지막 보고</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {sorted.map((member, index) => {
              const previous = index > 0 ? sorted[index - 1] : null
              // 같은 사람이 이어지는 줄은 이름을 비운다 — 사람 단위 묶음이 보이게
              const repeated = previous !== null && previous.memberName === member.memberName

              return (
                <tr
                  key={`${member.userId ?? `legacy:${member.memberName}`}-${member.client}`}
                  className="transition-colors duration-200 hover:bg-[var(--bg-secondary)]"
                >
                  <td className={`${TD} text-[var(--text-primary)]`}>
                    {repeated ? '' : member.memberName}
                  </td>
                  <td className={`${TD} text-[var(--text-secondary)]`}>
                    {CLIENT_LABELS[member.client] ?? member.client}
                  </td>
                  <td className={`${TD} text-[var(--text-secondary)]`}>{member.plan ?? EMPTY}</td>
                  <td
                    className={`text-right ${TD} font-mono tabular-nums text-[var(--text-secondary)]`}
                  >
                    {formatCount(member.sessions)}
                  </td>
                  <td
                    className={`text-right ${TD} font-mono tabular-nums whitespace-nowrap text-[var(--text-primary)]`}
                  >
                    {formatTokens(member.totalTokens)}
                  </td>
                  <td
                    className={`text-right ${TD} font-mono tabular-nums whitespace-nowrap ${
                      member.limitUsedPercent !== null && member.limitUsedPercent >= 80
                        ? 'text-[var(--accent-orange)]'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {member.limitUsedPercent !== null
                      ? `${member.limitUsedPercent}%`
                      : '미수집'}
                  </td>
                  <td
                    className={`text-right ${TD} font-mono tabular-nums whitespace-nowrap text-[var(--text-muted)]`}
                  >
                    {member.limitResetsAt !== null
                      ? formatDateTime(member.limitResetsAt)
                      : '미수집'}
                  </td>
                  <td
                    className={`text-right ${TD} font-mono tabular-nums whitespace-nowrap text-[var(--text-muted)]`}
                  >
                    {member.lastReportedAt !== null ? formatDate(member.lastReportedAt) : EMPTY}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * 집계 구간·참여율 안내
 *
 * 이 패널의 숫자는 조회 시각이 아니라 수집기가 돌던 시점의 구간을 담는다.
 * 보고 인원만 쓰면 "전원이 참여 중"으로 오독되므로, 분모(사내 계정 수)를 알 수
 * 있을 때는 참여율 형태로 보여준다.
 *
 * @param periodStart - 구간 시작 (ISO 8601)
 * @param periodEnd - 구간 끝 (ISO 8601)
 * @param syncedAt - 마지막 수집 시각 (ISO 8601)
 * @param reportingMembers - 최근 구간에 실제 사용 기록을 보고한 인원 수
 * @param internalMembers - 사내 계정 수. 도메인 미설정이면 null
 */
function PeriodNotice({
  periodStart,
  periodEnd,
  syncedAt,
  reportingMembers,
  internalMembers,
}: {
  periodStart: string | null
  periodEnd: string | null
  syncedAt: string | null
  reportingMembers: number
  internalMembers: number | null
}) {
  const range =
    periodStart !== null && periodEnd !== null
      ? `${formatDate(periodStart)} ~ ${formatDate(periodEnd)}`
      : '구간 미상'

  const participation =
    internalMembers !== null && internalMembers > 0
      ? `활성 보고 ${formatCount(reportingMembers)}/${formatCount(internalMembers)}명`
      : `활성 보고 ${formatCount(reportingMembers)}명`

  return (
    <p className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
      {range}
      {` · ${participation}`}
      {syncedAt !== null && ` · 수집 ${formatDate(syncedAt)}`}
    </p>
  )
}
