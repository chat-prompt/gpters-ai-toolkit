'use client'

/**
 * AX 대시보드 — 클라이언트 패널 본문
 *
 * 사용량·구독 현황·구독 갱신을 한 화면에 둔다. 위에서부터
 * 서비스별 요약(좌석·월 비용·사용량) → 구성원 × 구독(관리자) → 모델별 사용량 → 수집 참여 상태(접힘).
 *
 * Codex는 롤아웃, Claude Code는 statusline usage cache에서 주간 한도 스냅샷을 수집한다.
 * 한도 캐시를 얻지 못한 값은 0%가 아니라 "미수집"으로, 구독은 있는데 사용 보고가 없으면
 * "보고 없음"으로 밝힌다. 구독 없이 사용 중인 줄도 남긴다 — 그 차이가 다음 달 구독을 정하는 신호다.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type {
  AxClientUsageClientRow,
  AxClientUsageData,
  AxMemberServiceRow,
  AxSubscriptionData,
  AxUsageParticipationRow,
  AxUsageParticipationStatus,
  AxUsageClient,
} from '@/lib/features/ax'
import { AX_USAGE_PARTICIPATION_STATUS_ORDER, LATE_REPORT_GAP_HOURS, formatProjectedPercent, isEarlyReset, isLateReport, judgedWeekPercent, reportGapHours, samePerson } from '@/lib/features/ax'
import type { AxPanelViewProps } from './types'
import { formatCount, formatDate, formatDateTime, formatMoney, formatMoneyMap } from '../format'

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

/** 구독 벤더 → 사용량을 보고하는 클라이언트 */
const CLIENT_BY_VENDOR: Record<string, AxUsageClient> = {
  Anthropic: 'claude-code',
  OpenAI: 'codex',
}

/**
 * 이 기간(일)을 넘게 갱신되지 않았으면 구독 데이터를 오래된 자료로 본다.
 *
 * 구독 데이터의 정본은 「지니파이(주) 결제 내역」 `구독 로스터` 탭이고, 이 표는 사본이다.
 * 갱신 담당과 주기가 **최하영 · 월 1회**로 확정돼서(DEV-4319, 2026-09-06) 기준을 그 주기에 맞춘다.
 * 31일이면 "이번 달 갱신이 빠졌다"일 때만 켜진다.
 */
const STALE_AFTER_DAYS = 31

/**
 * 서비스 비중 게이지의 두 색 — 브랜드 주황(Claude Code)과 짙은 하늘색(Codex).
 * dataviz 검증기로 라이트(#ffffff)·다크(#0c0c0d) 표면 모두 통과(정상 시각 ΔE 31, 색약 ΔE 23).
 * 다크 테마의 밝은 토큰(#F26522·#38bdf8)은 다크 표면 밝기 대역을 넘어 쓰지 않는다
 */
const SHARE_COLORS: Record<AxUsageClient, string> = {
  'claude-code': '#D95A1E',
  codex: '#0284c7',
}

/** 이 일수 안에 결제되면 경고 톤으로 표시한다 — 뽀밋이 DM 과 같은 기준 */
const DUE_SOON_DAYS = 7

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
 * 클라이언트 패널 화면
 *
 * @param data - 사용량·구독 집계. people·participation이 null이면(관리자 아님) 개인 영역을 그리지 않는다
 */
export function ClientUsagePanel({ data }: AxPanelViewProps<AxClientUsageData>) {
  return (
    <div className="space-y-10">
      <div>
        {/* 상태 경고(구독 조회 실패·시트 갱신 지연)는 늘 보이게, 평소의 기준 시각·읽는 법은 도움말에 둔다 */}
        {!data.subscriptions ? (
          // 구독을 못 읽으면 좌석·월 비용이 "—"로 남는다 — 구독이 없는 것과 구분되게 밝힌다
          <p className="mb-3 font-mono text-[11px] text-[var(--accent-orange)]">구독 데이터를 불러오지 못했습니다</p>
        ) : isSheetStale(data.subscriptions.syncedAt) ? (
          <div className="mb-3"><SyncedAtNotice syncedAt={data.subscriptions.syncedAt} /></div>
        ) : null}
        {data.byClient.length > 0 || (data.subscriptions?.byVendor.length ?? 0) > 0 ? (
          <div>
            {/* 제목 줄은 게이지가 없어도 그린다 — 도움말 안의 기준 시각이 게이지와 함께 사라지지 않게 */}
            <div className="relative flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-[var(--text-muted)]">
              <div className="flex items-center gap-1.5">
                서비스 비중
                <InfoTip label="서비스 비중 기준">
                  <PeriodNotice
                    periodStart={data.periodStart}
                    periodEnd={data.periodEnd}
                    syncedAt={data.syncedAt}
                    reportingMembers={data.reportingMembers}
                    internalMembers={data.internalMembers}
                  />
                  {data.subscriptions && <SyncedAtNotice syncedAt={data.subscriptions.syncedAt} />}
                  <p className="mt-2">게이지 가운데 숫자는 Claude Code 몫이고, 아래는 두 서비스의 값입니다.</p>
                  <p className="mt-2">표의 주기 평균은 구독마다 지난 결제일 이후 회차별 주간 한도 사용률(7일을 못 채운 회차는 7일 환산 추정)을 평균하고, 그 값을 사람마다 같은 무게로 다시 평균한 것입니다. 끝난 회차가 아직 없는 구독은 빠집니다.</p>
                </InfoTip>
              </div>
              {(['claude-code', 'codex'] as const).map((client) => (
                <span key={client} className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: SHARE_COLORS[client] }} />
                  {CLIENT_LABELS[client]}
                </span>
              ))}
            </div>
            <ServiceShareGauges rows={data.byClient} subscriptions={data.subscriptions} />
            <div className="mt-6">
              <ServiceTable rows={data.byClient} total={data.totalTokens} subscriptions={data.subscriptions} cycleError={data.cycleError} />
            </div>
          </div>
        ) : (
          <>
            {/* 비어 있을 때는 기준 시각이 "수집 누락"과 "실제 0건"을 가르는 근거라 펼쳐 둔다 */}
            <PeriodNotice
              periodStart={data.periodStart}
              periodEnd={data.periodEnd}
              syncedAt={data.syncedAt}
              reportingMembers={data.reportingMembers}
              internalMembers={data.internalMembers}
            />
            {data.subscriptions && !isSheetStale(data.subscriptions.syncedAt) && (
              <SyncedAtNotice syncedAt={data.subscriptions.syncedAt} />
            )}
            <p className="mt-3 border-l-2 border-[var(--border-hover)] pl-4 text-sm text-[var(--text-secondary)]">
              수집된 사용량과 등록된 구독이 없습니다.
            </p>
          </>
        )}
      </div>

      {/* 구성원 × 구독 — 관리자에게만 데이터가 내려온다 */}
      {data.people !== null && (
        <PeopleTable rows={data.people} cycleError={data.cycleError} participation={data.participation ?? []} />
      )}
      {data.peopleError && (
        <p className="border-l-2 border-[var(--accent-orange)] pl-4 text-sm text-[var(--text-secondary)]">
          구독 데이터를 불러오지 못해 구성원 × 구독 표를 만들지 못했습니다. 사용량은 위 요약에 그대로 있습니다.
        </p>
      )}

      {data.byModel.length > 0 && <ModelTable rows={data.byModel} total={data.totalTokens} />}

      {/* 내부 계정 전수 수집 상태 — 관리자에게만 데이터가 내려온다. 매일 볼 표가 아니라 접어 둔다 */}
      {data.participation !== null && (
        // 이름 붙은 그룹이다 — 그냥 `group` 이면 안쪽 도움말의 group-hover 가 표 전체 호버에 반응한다
        <details className="group/participation">
          <summary className="cursor-pointer list-none font-mono text-[11px] tabular-nums text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            <span className="mr-1 inline-block transition-transform group-open/participation:rotate-90">›</span>
            수집 참여 상태 · 정상 보고 {formatCount(data.participation.filter((row) => row.status === 'reporting').length)}/
            {formatCount(data.participation.length)}명
          </summary>
          <div className="mt-3">
            <ParticipationTable rows={data.participation} />
          </div>
        </details>
      )}
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

/**
 * 두 버전을 숫자 단위로 비교한다(`0.7.9` < `0.7.24`). 숫자가 아닌 꼬리(`-beta`)는 무시한다.
 *
 * @returns a가 낮으면 음수, 같으면 0, 높으면 양수
 */
export function compareVersions(a: string, b: string): number {
  const parse = (version: string) => version.split('.').map((part) => parseInt(part, 10) || 0)
  const [left, right] = [parse(a), parse(b)]
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** 자동 연결을 건너뛴 이유 (aitk `AutoSetupSkipReason`) */
const LIMIT_SKIP_LABELS: Record<string, string> = {
  symlink: '설정 폴더가 심링크',
  'config-dir': 'CLAUDE_CONFIG_DIR 사용',
  declined: '직접 해제함',
  drifted: '연결 뒤 직접 되돌림',
  unsupported: '표시줄 형식 미지원',
  disabled: '자동 연결 꺼 둠',
  agent: '에이전트 머신',
  platform: 'Windows',
}

/** 한도를 이 기간 안에 받았으면 수집 중으로 본다 — 주간 한도라 일주일에 한 번은 Claude Code를 연다는 가정 */
const LIMIT_SNAPSHOT_FRESH_MS = 7 * 86_400_000

/**
 * Claude 주간 한도 수집 연결 상태를 한 줄로 만든다. Claude Code를 안 쓰는 사람은 null(빈 칸).
 *
 * 지금의 미연결 상태가 과거 한도 수신보다 우선한다 — 어제 받은 한도가 있어도 오늘 연결을 되돌렸으면 미연결이다.
 * 옛 aitk 보고는 상태를 보내지 않아 이전 관측이 남으므로, 마지막 보고보다 하루 넘게 이른 관측이면 날짜를 붙인다.
 *
 * @param row - 참여 상태 행
 * @param now - 기준 시각 (테스트용)
 * @returns 표시 문구와 경고 여부
 */
export function limitCaptureLabel(
  row: Pick<AxUsageParticipationRow, 'clients' | 'limitCapture' | 'lastReportedAt'>,
  now = Date.now()
): { label: string; warn: boolean } | null {
  const capture = row.limitCapture
  // 보존된 상태가 있으면 이번 보고가 Codex 전용 머신에서 왔어도 보여준다(아래에서 관측 날짜를 붙인다)
  if (!capture) {
    // aitk 0.7.25 전에는 연결 상태를 보내지 않는다 — 실패로 단정하지 않는다
    return row.clients.includes('claude-code') ? { label: '상태 미보고', warn: false } : null
  }
  // 신선도는 화면을 연 시각이 아니라 상태를 받은 시각 기준이다 — 보고가 끊긴 사람을 "미수신"으로 오판하지 않는다
  const at = capture.observedAt ? new Date(capture.observedAt).getTime() : now
  const status = ((): { label: string; warn: boolean } => {
    if (capture.statusline !== 'aitk') {
      const skipped = capture.autoSetup?.startsWith('skipped:') ? capture.autoSetup.slice('skipped:'.length) : null
      if (skipped) return { label: `미연결 · ${LIMIT_SKIP_LABELS[skipped] ?? skipped}`, warn: true }
      if (capture.autoSetup === 'failed') return { label: '미연결 · 연결 실패', warn: true }
      return { label: '미연결', warn: true }
    }
    if (capture.snapshotAt && at - new Date(capture.snapshotAt).getTime() <= LIMIT_SNAPSHOT_FRESH_MS) {
      return { label: '수집 중', warn: false }
    }
    // 같은 훅이 연결 직후 보고하므로 새로 연결한 날은 표시줄이 아직 한 번도 안 그려졌다 — 경고하지 않는다.
    // 이미 연결된 머신은 매일 `unchanged`를 새 시각으로 남기므로 `connected:*`일 때만 유예한다
    if (
      !capture.snapshotAt &&
      capture.autoSetup?.startsWith('connected:') &&
      capture.autoSetupAt &&
      at - new Date(capture.autoSetupAt).getTime() <= 86_400_000
    ) {
      return { label: '연결됨 · 첫 수신 대기', warn: false }
    }
    return { label: '연결됨 · 한도 미수신', warn: true }
  })()
  const observed = capture.observedAt ? new Date(capture.observedAt).getTime() : null
  const reported = row.lastReportedAt ? new Date(row.lastReportedAt).getTime() : null
  if (observed !== null && reported !== null && reported - observed > 86_400_000) {
    return { ...status, label: `${status.label} (${formatDate(capture.observedAt!)} 관측)` }
  }
  return status
}

/**
 * 수집 참여 상태 값 — 판정 근거는 칸을 따로 두지 않고 호버·포커스 때 띄운다.
 *
 * 표가 가로 스크롤 영역 안이라 아래로 띄우면 마지막 줄에서 잘린다 — 넓은 화면은 같은 높이 오른쪽(클라이언트 칸 위),
 * 좁은 화면은 오른쪽이 스크롤 영역 밖이라 위쪽(윗줄 위)에 둔다. 버튼과 본문 사이 간격은 투명한 여백이라
 * 포인터를 본문으로 옮겨도 닫히지 않는다.
 */
function StatusWithSource({ label, tone, source }: { label: string; tone: string; source: string }) {
  const id = useId()
  const { dismissed, handlers } = useEscDismiss()
  return (
    <span className="group/status relative inline-flex" {...handlers}>
      <button
        type="button"
        aria-describedby={id}
        // Safari 는 버튼을 눌러도 포커스를 주지 않는다 — 누르면 툴팁이 열리게 직접 준다
        onClick={(event) => event.currentTarget.focus()}
        className={`cursor-help underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--brand-primary)] ${tone}`}
      >
        {label}
      </button>
      <span
        id={id}
        role="tooltip"
        data-dismissed={dismissed || undefined}
        className={`invisible absolute bottom-full left-0 z-30 w-max max-w-[11rem] pb-1 opacity-0 transition-opacity duration-150 group-hover/status:visible group-hover/status:opacity-100 group-focus-within/status:visible group-focus-within/status:opacity-100 sm:bottom-auto sm:left-full sm:top-1/2 sm:max-w-none sm:-translate-y-1/2 sm:pb-0 sm:pl-2 ${
          dismissed ? '!invisible !opacity-0' : ''
        }`}
      >
        <span className="block rounded-md border border-[var(--border-hover)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] shadow-lg sm:whitespace-nowrap">
          판정 근거 · {source}
        </span>
      </span>
    </span>
  )
}

/** 내부 계정 전원의 수집 참여 상태 (관리자 전용) */
function ParticipationTable({ rows }: { rows: AxUsageParticipationRow[] }) {
  // npm 최신을 서버에서 따로 묻지 않는다 — 팀에서 가장 높은 버전보다 낮은 마지막 관측 버전을 주황색으로 둔다.
  const newestAitk = rows
    .map((row) => row.aitkVersion)
    .filter((version): version is string => version !== null)
    .reduce<string | null>((max, version) => (max === null || compareVersions(version, max) > 0 ? version : max), null)
  // pill과 표 모두 나쁜 상태부터 좋은 상태 순이다.
  const statusCounts = AX_USAGE_PARTICIPATION_STATUS_ORDER
    .map((status) => ({ status, count: rows.filter((row) => row.status === status).length }))
    .filter((item) => item.count > 0)

  return (
    <div>
      <div className="relative flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        판정 기준
        <InfoTip label="수집 참여 상태 판정 기준">
          <p>정상 보고는 최근 7일 안에 사용량이 도착한 상태입니다. AITK 업그레이드만으로 즉시 바뀌지는 않습니다.</p>
          <p className="mt-2">상태에 마우스를 올리거나 키보드로 포커스하면 판정 근거(수집기 점검 신호·승인 기록 등)가 보입니다.</p>
          <p className="mt-2">aitk는 최근 30일 동안 그 사람의 마지막 사용량 보고에 찍힌 버전입니다(세션 시작 훅이 실제로 쓰는 aitk, 0.7.9 이하는 버전을 보내지 않던 aitk). 사용량 보고를 꺼 둔 사람은 비어 있습니다. 머신이 여러 대면 마지막으로 보고한 머신만 보이고, 업그레이드 뒤 아직 보고가 없으면 이전 버전으로 남습니다. 팀에서 가장 높은 버전보다 낮으면 주황색입니다.</p>
          <p className="mt-2">자동 보고는 플러그인이 설치된 Claude Code·Codex의 새 세션 시작 시 하루 한 번 시도하며, 로그인과 로컬 사용 기록이 필요합니다.</p>
          <p className="mt-2">승인 후 수집 미확인은 아직 보고가 없다는 뜻이며, 최근 사용 기록 없음은 수집기가 응답했지만 사용량이 0건이라는 뜻입니다.</p>
        </InfoTip>
      </div>
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
              <th className={`text-left ${TD} ${TH} w-[22%]`}>상태</th>
              <th className={`text-left ${TD} ${TH} w-[22%]`}>클라이언트</th>
              <th className={`whitespace-nowrap text-left ${TD} ${TH}`}>aitk</th>
              <th className={`whitespace-nowrap text-right ${TD} ${TH}`}>마지막 보고</th>
              <th className={`whitespace-nowrap text-right ${TD} ${TH}`}>마지막 로그인</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {rows.map((row, index) => {
              const status = PARTICIPATION_STATUS[row.status]
              // 상태 그룹이 바뀌는 행은 굵은 선으로 묶음 경계를 드러낸다.
              const startsGroup = index > 0 && rows[index - 1].status !== row.status
              return (
                <tr
                  key={row.userId}
                  data-status-group-start={startsGroup ? row.status : undefined}
                  className={`transition-colors duration-200 hover:bg-[var(--bg-secondary)] ${
                    startsGroup ? 'border-t-2 border-t-[var(--border-hover)]' : ''
                  }`}
                >
                  <td className={`${TD} text-[var(--text-primary)]`}>{row.memberName}</td>
                  <td className={TD}>
                    <StatusWithSource label={status.label} tone={status.tone} source={PARTICIPATION_SOURCE[row.source]} />
                  </td>
                  <td className={`${TD} text-[var(--text-secondary)]`}>
                    {row.clients.length > 0
                      ? row.clients.map((client) => CLIENT_LABELS[client]).join(', ')
                      : EMPTY}
                  </td>
                  <td
                    className={`whitespace-nowrap ${TD} font-mono text-xs tabular-nums ${
                      row.aitkVersion && newestAitk && compareVersions(row.aitkVersion, newestAitk) < 0
                        ? 'text-[var(--accent-orange)]'
                        : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {row.aitkVersion ?? EMPTY}
                  </td>
                  <td className={`whitespace-nowrap text-right ${TD} font-mono text-xs tabular-nums text-[var(--text-muted)]`}>
                    {row.lastReportedAt ? formatDateTime(row.lastReportedAt) : EMPTY}
                  </td>
                  <td className={`whitespace-nowrap text-right ${TD} font-mono text-xs tabular-nums text-[var(--text-muted)]`}>
                    {row.lastLoginAt ? formatDate(row.lastLoginAt) : EMPTY}
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

/** 게이지 한 개의 값 */
interface ShareItem {
  label: string
  claude: number
  codex: number
  format: (value: number) => string
}

/**
 * 서비스 비중 게이지 — 좌석·월 비용·인원·세션·토큰마다 Claude Code 와 Codex 가 차지하는 몫
 *
 * 두 조각짜리 부분-전체라 반원 게이지로 한눈에 보이게 하고, 비율이 비슷해도 읽히게
 * 두 값을 숫자로 함께 적는다. 표는 바로 아래에 그대로 있다.
 *
 * @param rows - 클라이언트별 사용량
 * @param subscriptions - 구독 현황. 못 읽었으면 좌석·월 비용 게이지는 뺀다
 */
function ServiceShareGauges({
  rows,
  subscriptions,
}: {
  rows: AxClientUsageClientRow[]
  subscriptions: AxSubscriptionData | null
}) {
  const usage = (client: AxUsageClient) => rows.find((row) => row.client === client)
  const vendor = (client: AxUsageClient) =>
    subscriptions?.byVendor.find((item) => CLIENT_BY_VENDOR[item.vendor] === client)
  // 통화가 섞이면 환율로 합치지 않으므로 두 쪽이 같은 단일 통화일 때만 비용 게이지를 그린다.
  // 구독이 아예 없는 쪽만 0으로 본다 — 통화가 여럿인 쪽을 0으로 바꾸면 거짓 0%/100% 가 된다
  const cost = (client: AxUsageClient): { currency: string; amount: number } | 'none' | 'mixed' => {
    const entries = Object.entries(vendor(client)?.monthlyByCurrency ?? {})
    if (entries.length === 0) return 'none'
    return entries.length === 1 ? { currency: entries[0][0], amount: entries[0][1] } : 'mixed'
  }
  const claudeCost = cost('claude-code')
  const codexCost = cost('codex')
  const costCurrency =
    claudeCost === 'mixed' || codexCost === 'mixed'
      ? null
      : claudeCost !== 'none' && codexCost !== 'none'
        ? (claudeCost.currency === codexCost.currency ? claudeCost.currency : null)
        : claudeCost !== 'none' ? claudeCost.currency : codexCost !== 'none' ? codexCost.currency : null
  const amountOf = (value: ReturnType<typeof cost>) => (typeof value === 'object' ? value.amount : 0)

  const items: ShareItem[] = [
    ...(subscriptions
      ? [{ label: '좌석', claude: vendor('claude-code')?.seats ?? 0, codex: vendor('codex')?.seats ?? 0, format: formatCount }]
      : []),
    ...(costCurrency
      ? [{ label: '월 비용', claude: amountOf(claudeCost), codex: amountOf(codexCost), format: (value: number) => formatMoney(value, costCurrency).replace(/\.00$/, '') }]
      : []),
    { label: '사용 인원', claude: usage('claude-code')?.members ?? 0, codex: usage('codex')?.members ?? 0, format: formatCount },
    { label: '세션', claude: usage('claude-code')?.sessions ?? 0, codex: usage('codex')?.sessions ?? 0, format: formatCount },
    { label: '토큰', claude: usage('claude-code')?.totalTokens ?? 0, codex: usage('codex')?.totalTokens ?? 0, format: formatTokens },
  ].filter((item) => item.claude + item.codex > 0)

  if (items.length === 0) return null

  return (
    <div>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item) => <ShareGauge key={item.label} item={item} />)}
      </div>
    </div>
  )
}

/** 게이지 기하 — 반지름·두께·조각 사이 틈(px) */
const GAUGE = { r: 44, stroke: 10, gap: 2 }

/**
 * 반원 위 비율 `f`(0~1, 왼쪽→오른쪽) 지점 좌표
 *
 * @param f - 반원 위 위치
 */
function gaugePoint(f: number): string {
  const angle = Math.PI * (1 - f)
  const cx = GAUGE.r + GAUGE.stroke / 2
  const cy = GAUGE.r + GAUGE.stroke / 2
  return `${(cx + GAUGE.r * Math.cos(angle)).toFixed(2)} ${(cy - GAUGE.r * Math.sin(angle)).toFixed(2)}`
}

/** 반원의 [from, to] 구간 호 */
function gaugeArc(from: number, to: number): string {
  return `M ${gaugePoint(from)} A ${GAUGE.r} ${GAUGE.r} 0 0 1 ${gaugePoint(to)}`
}

/**
 * 게이지 두 조각의 구간
 *
 * 둥근 끝(stroke/2)이 틈을 덮지 않게 경계 양쪽을 틈 + 두께만큼 비운다. 두 몫이 모두 양수면 경계를
 * 그 여백의 두 배 안쪽으로 당겨, 작은 몫(예: 3%)도 짧은 호로 남는다 — 비우기만 하면 4% 안팎 아래 몫은
 * 통째로 사라진다. 정확한 값은 가운데 숫자와 아래 값이 전한다.
 *
 * @param share - Claude Code 몫 (0~1)
 */
export function gaugeSegments(share: number): Array<{ client: AxUsageClient; from: number; to: number }> {
  if (share <= 0) return [{ client: 'codex', from: 0, to: 1 }]
  if (share >= 1) return [{ client: 'claude-code', from: 0, to: 1 }]
  const pad = (GAUGE.gap + GAUGE.stroke) / (Math.PI * GAUGE.r) / 2
  const boundary = Math.min(Math.max(share, 2 * pad), 1 - 2 * pad)
  return [
    { client: 'claude-code', from: 0, to: boundary - pad },
    { client: 'codex', from: boundary + pad, to: 1 },
  ]
}

/**
 * 몫 표기 — 0·100 에 붙은 양수 몫을 반올림으로 0%·100% 라고 쓰지 않는다
 *
 * @param share - 0~1
 */
export function formatShare(share: number): string {
  if (share > 0 && share < 0.005) return '<1%'
  if (share < 1 && share >= 0.995) return '>99%'
  return `${Math.round(share * 100)}%`
}

/**
 * 반원 게이지 하나 — 왼쪽부터 Claude Code, 오른쪽이 Codex
 *
 * @param item - 항목 이름과 두 값
 */
function ShareGauge({ item }: { item: ShareItem }) {
  const total = item.claude + item.codex
  const share = item.claude / total
  const width = GAUGE.r * 2 + GAUGE.stroke
  const height = GAUGE.r + GAUGE.stroke
  const segments = gaugeSegments(share)
  const tip = `${item.label} · Claude Code ${item.format(item.claude)} (${formatShare(share)}) · Codex ${item.format(item.codex)} (${formatShare(1 - share)})`

  return (
    <figure className="min-w-0">
      <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto block w-full max-w-[140px]" role="img" aria-label={tip}>
        {/* 트랙 */}
        <path d={gaugeArc(0, 1)} fill="none" stroke="var(--bg-tertiary)" strokeWidth={GAUGE.stroke} strokeLinecap="round" />
        {segments.map((segment) => {
          return (
            <path
              key={segment.client}
              data-client={segment.client}
              d={gaugeArc(segment.from, segment.to)}
              fill="none"
              stroke={SHARE_COLORS[segment.client]}
              strokeWidth={GAUGE.stroke}
              strokeLinecap="round"
            >
              <title>{`${CLIENT_LABELS[segment.client]} ${item.format(segment.client === 'claude-code' ? item.claude : item.codex)}`}</title>
            </path>
          )
        })}
        <text
          x={width / 2}
          y={height - 2}
          textAnchor="middle"
          className="fill-[var(--text-primary)] font-mono text-[15px] tabular-nums"
        >
          {formatShare(share)}
        </text>
      </svg>
      {/* 스크린리더는 svg 의 aria-label 로 같은 내용을 읽으므로 캡션은 겹쳐 읽지 않게 숨긴다 */}
      <figcaption aria-hidden className="mt-1 text-center">
        <span className="block text-xs text-[var(--text-secondary)]">{item.label}</span>
        <span className="mt-0.5 flex items-center justify-center gap-2 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
          {(['claude-code', 'codex'] as const).map((client) => (
            <span key={client} className="flex items-center gap-1">
              <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: SHARE_COLORS[client] }} />
              {item.format(client === 'claude-code' ? item.claude : item.codex)}
            </span>
          ))}
        </span>
      </figcaption>
    </figure>
  )
}

/**
 * 서비스별 요약 표 — 구독(좌석·월 비용)과 사용량(인원·세션·토큰·주간 한도 주기 평균)을 한 줄에 둔다
 *
 * 주기 평균이 있으면 퍼센트를, 최신 스냅샷이 없으면 "미수집"을 보여준다.
 * 사용량을 보고하지 않는 벤더의 구독도 줄로 남긴다.
 *
 * @param rows - 클라이언트별 사용량 집계
 * @param total - 전체 토큰 합계 (비율 계산용)
 * @param subscriptions - 구독 현황. 못 읽었으면 null
 * @param cycleError - 결제 주기 회차를 못 읽었으면 true — 주기 평균 칸을 "조회 실패"로 쓴다
 */
function ServiceTable({
  rows,
  total,
  subscriptions,
  cycleError,
}: {
  rows: AxClientUsageClientRow[]
  total: number
  subscriptions: AxSubscriptionData | null
  cycleError: boolean
}) {
  const vendors = subscriptions?.byVendor ?? []
  const vendorFor = (client: AxUsageClient) =>
    vendors.find((vendor) => CLIENT_BY_VENDOR[vendor.vendor] === client)
  const unmatchedVendors = vendors.filter((vendor) => !rows.some((row) => CLIENT_BY_VENDOR[vendor.vendor] === row.client))
  const clientsWithoutUsage = (['claude-code', 'codex'] as AxUsageClient[]).filter(
    (client) => !rows.some((row) => row.client === client) && vendorFor(client)
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            <th className={`text-left ${TD} ${TH} w-[20%]`}>서비스</th>
            <th className={`text-right ${TD} ${TH} w-16`}>좌석</th>
            <th className={`text-right ${TD} ${TH}`}>월 비용</th>
            <th className={`text-right ${TD} ${TH} w-16`}>인원</th>
            <th className={`text-right ${TD} ${TH} w-20`}>세션</th>
            <th className={`text-right ${TD} ${TH} w-20`}>토큰</th>
            <th className={`text-left ${TD} ${TH}`}>비중</th>
            <th className={`text-right ${TD} ${TH} w-[14%]`}>주기 평균</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {rows.map((row) => {
            const ratio = total > 0 ? Math.min(1, row.totalTokens / total) : 0
            const vendor = vendorFor(row.client)
            return (
              <tr
                key={row.client}
                className="transition-colors duration-200 hover:bg-[var(--bg-secondary)]"
              >
                <td className={`${TD} text-[var(--text-primary)]`}>
                  {CLIENT_LABELS[row.client] ?? row.client}
                  {vendor && <span className="ml-2 text-xs text-[var(--text-muted)]">{vendor.vendor}</span>}
                </td>
                <td className={`text-right ${TD} font-mono tabular-nums text-[var(--text-secondary)]`}>
                  {vendor ? formatCount(vendor.seats) : EMPTY}
                </td>
                <td className={`text-right ${TD} font-mono tabular-nums whitespace-nowrap text-[var(--text-primary)]`}>
                  {vendor ? formatMoneyMap(vendor.monthlyByCurrency) : EMPTY}
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
                    <div className="h-1.5 min-w-[64px] flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
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
                  <LimitCell row={row} cycleError={cycleError} />
                </td>
              </tr>
            )
          })}
          {/* 구독은 있는데 이번 주 사용 보고가 없는 클라이언트, 사용량을 보고하지 않는 벤더 */}
          {[...clientsWithoutUsage.map((client) => ({ key: client, label: CLIENT_LABELS[client], vendor: vendorFor(client)! })),
            ...unmatchedVendors.filter((vendor) => !CLIENT_BY_VENDOR[vendor.vendor]).map((vendor) => ({ key: vendor.vendor, label: vendor.vendor, vendor }))]
            .map(({ key, label, vendor }) => (
              <tr key={key} className="transition-colors duration-200 hover:bg-[var(--bg-secondary)]">
                <td className={`${TD} text-[var(--text-primary)]`}>{label}</td>
                <td className={`text-right ${TD} font-mono tabular-nums text-[var(--text-secondary)]`}>{formatCount(vendor.seats)}</td>
                <td className={`text-right ${TD} font-mono tabular-nums whitespace-nowrap text-[var(--text-primary)]`}>{formatMoneyMap(vendor.monthlyByCurrency)}</td>
                <td colSpan={5} className={`${TD} text-right text-xs text-[var(--text-muted)]`}>
                  {CLIENT_BY_VENDOR[vendor.vendor] ? '사용 보고 없음' : '사용량 수집 대상 아님'}
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      {/*
        한도를 안 주는 클라이언트가 섞여 있으면 그 이유를 표 아래에 한 줄로 밝힌다.
        색이 text-muted가 아니라 text-secondary인 이유: 이 문장은 타임스탬프 같은 곁가지가 아니라
        표의 빈 칸을 해석하는 데 필요한 설명이라 대비 4.5:1을 넘겨야 한다.
      */}
      {rows.some((row) => row.client === 'claude-code' && !row.reportsLimit && row.avgLimitUsedPercent === null) && (
        <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
          Claude Code의 토큰·세션 사용량은 수집되고 있습니다. 미수집은 주간 한도와 리셋 시각을
          받지 못했다는 뜻입니다. 이 값은 로컬 상태 표시줄의 한도 캐시가 최근 15분 안에 갱신된
          경우에만 보고됩니다. 캐시의 리셋 시각이 이미 지난 값도 제외합니다. AITK는 이 캐시를 직접
          만들지 않으므로 업그레이드만으로 채워지지는 않습니다.
        </p>
      )}
    </div>
  )
}

/**
 * 주기 평균 칸 — 사람별 주간 한도 주기 평균의 평균
 *
 * @param row - 클라이언트별 집계 한 줄
 * @param cycleError - 결제 주기 회차를 못 읽었는지
 */
function LimitCell({ row, cycleError }: { row: AxClientUsageClientRow; cycleError: boolean }) {
  if (cycleError) return <span className="text-[11px] text-[var(--accent-orange)]">조회 실패</span>
  // 끝난 회차의 주기 평균은 이번 주 스냅샷이 없어도 보여준다
  if (row.avgLimitUsedPercent === null) {
    return row.reportsLimit
      ? <span className="font-mono text-[var(--text-muted)]">{EMPTY}</span>
      : <span className="text-[11px] text-[var(--text-muted)]">미수집</span>
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

/** 구성원 × 구독 표 정렬 */
type PeopleSort = 'renewal' | 'name'

/**
 * 구성원 × 구독 표 (관리자 전용)
 *
 * 한 줄 = 한 사람의 한 서비스. 구독(결제일·금액), 이번 결제 주기의 주간 한도 평균,
 * 지금 주간 한도와 최근 사용량을 함께 둔다. 구독만 있고 사용 보고가 없는 줄과
 * 구독 없이 사용하는 줄을 따로 세어 위에 밝힌다.
 *
 * @param rows - 다음 결제일이 가까운 순으로 정렬된 줄
 * @param cycleError - 결제 주기 회차를 못 읽었으면 true — 주기 평균 칸을 "조회 실패"로 쓴다
 * @param participation - 수집 참여 상태 행. 표시 이름으로 이어 Claude 한도 연결 상태를 붙인다
 */
function PeopleTable({
  rows,
  cycleError,
  participation,
}: {
  rows: AxMemberServiceRow[]
  cycleError: boolean
  participation: AxUsageParticipationRow[]
}) {
  // 기본은 이름순 — 사람을 찾아 보는 표다. 결제가 임박한 사람은 결제 임박순으로 바꿔 본다
  const [sort, setSort] = useState<PeopleSort>('name')

  if (rows.length === 0) {
    return (
      <p className="border-l-2 border-[var(--border-hover)] pl-4 text-sm text-[var(--text-secondary)]">
        구성원별 구독·사용 내역이 없습니다.
      </p>
    )
  }

  const groups = groupByPerson(rows, sort)
  // 사용 보고가 붙은 줄은 계정 표시명, 아닌 줄은 로스터 이름(`타타`)이다 — 서버와 같은 이름 규칙으로 잇는다.
  // 공용 구독은 사람이 아니고, 후보가 둘 이상이면(동명이인·별칭 겹침) 엉뚱한 사람에게 붙이지 않고 비운다
  const collectorFor = (row: AxMemberServiceRow): AxUsageParticipationRow | undefined => {
    if (row.subscription?.shared) return undefined
    const exact = participation.filter((candidate) => candidate.memberName === row.name)
    const matches = exact.length > 0 ? exact : participation.filter((candidate) => samePerson(candidate.memberName, row.name))
    return matches.length === 1 ? matches[0] : undefined
  }
  const dueSoon = rows.filter((row) => row.subscription?.daysLeft != null && row.subscription.daysLeft <= DUE_SOON_DAYS).length
  const unused = rows.filter((row) => row.subscription && row.trackable && !row.usage).length
  const unsubscribed = rows.filter((row) => !row.subscription).length

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="relative flex flex-wrap items-center gap-1.5 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
          <span>
            구성원 × 구독 {formatCount(rows.length)}줄 · {DUE_SOON_DAYS}일 안 결제 {formatCount(dueSoon)} · 사용 보고 없는 구독{' '}
            {formatCount(unused)} · 구독 없이 사용 {formatCount(unsubscribed)}
          </span>
          <InfoTip label="주기 평균 기준">
            <p>주기 평균은 지난 결제일 이후 주간 한도가 초기화되기 전에 받은 사용률을 회차마다 하나씩 잡아 평균한 값입니다.</p>
            <p className="mt-2">회차의 마지막 보고가 회차가 끝나기 {LATE_REPORT_GAP_HOURS}시간 넘게 전이면 끝 무렵 사용량이 빠져 실제보다 낮습니다. 「끝 무렵 미수집」으로 표시합니다. 벤더가 예정보다 일찍 초기화했거나 회차가 7일이 아니어서 7일을 다 채우지 못한 회차는 실측이 낮으므로, 사용률 ÷ 실제로 이어진 일수 × 7 로 환산(추정)해 평균에 넣고 「7일 미만 · 7일 환산」으로 적습니다. 100%를 넘으면 그 속도로는 한도에 걸린다는 뜻이고, 1일 미만 회차는 환산하지 않습니다. 주기 평균 값에 마우스를 올리면 회차별 값과 마지막 보고 시각이 보입니다.</p>
            <p className="mt-2">Claude Code 한도를 못 받으면 이번 주 한도 칸에 이유를 적습니다(aitk 0.7.25부터 보고). 상태 미보고는 아직 0.7.25 이전 aitk라 연결 상태를 모른다는 뜻입니다. 연결됨 · 한도 미수신은 연결은 됐지만 7일 넘게 값을 못 받은 상태로, 새 세션을 안 열었거나 표시줄을 실행하지 않는 환경(IDE 확장·API 키)일 수 있습니다. 미연결 뒤에는 자동 연결을 건너뛴 이유를, 날짜가 붙은 값은 그날 관측한 이전 상태를 뜻합니다.</p>
          </InfoTip>
        </div>
        <div role="group" aria-label="정렬" className="flex rounded-full border border-[var(--border-subtle)] p-0.5 text-[11px]">
          {(['name', 'renewal'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={sort === value}
              onClick={() => setSort(value)}
              className={`rounded-full px-3 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-[var(--brand-primary)] ${
                sort === value
                  ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {value === 'renewal' ? '결제 임박순' : '이름순'}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className={`text-left ${TD} ${TH}`}>사용자</th>
              <th className={`text-left ${TD} ${TH}`}>서비스 · 플랜</th>
              <th className={`text-right ${TD} ${TH}`}>다음 결제</th>
              <th className={`text-right ${TD} ${TH}`}>금액</th>
              <th className={`text-right ${TD} ${TH}`}>이번 주 한도</th>
              <th className={`text-right ${TD} ${TH}`}>주기 평균</th>
              <th className={`text-right ${TD} ${TH}`}>토큰</th>
              <th className={`text-right ${TD} ${TH}`}>마지막 보고</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {groups.flatMap((group, groupIndex) =>
              group.map((row, index) => (
                <tr
                  key={`${row.name}-${row.service}-${row.subscription?.plan ?? 'none'}-${index}`}
                  className={`transition-colors duration-200 hover:bg-[var(--bg-secondary)] ${
                    // 사람이 바뀌는 줄은 굵은 선으로 묶음 경계를 드러낸다
                    index === 0 && groupIndex > 0 ? 'border-t-2 border-t-[var(--border-hover)]' : ''
                  }`}
                >
                  <td className={`${TD} align-top text-[var(--text-primary)] whitespace-nowrap`}>
                    {index === 0 ? row.name : ''}
                  </td>
                  <td className={`${TD} text-[var(--text-secondary)] whitespace-nowrap`}>
                    <PlanCell row={row} />
                  </td>
                  <td className={`text-right ${TD} font-mono tabular-nums whitespace-nowrap`}>
                    <RenewalCell row={row} />
                  </td>
                  <td className={`text-right ${TD} font-mono tabular-nums whitespace-nowrap text-[var(--text-secondary)]`}>
                    {row.subscription ? formatMoney(row.subscription.amount, row.subscription.currency) : EMPTY}
                  </td>
                  <td className={`text-right ${TD} font-mono tabular-nums whitespace-nowrap`}>
                    <CurrentLimitCell row={row} collector={collectorFor(row)} />
                  </td>
                  <td className={`text-right ${TD} font-mono tabular-nums whitespace-nowrap`}>
                    <CycleAverageCell row={row} cycleError={cycleError} />
                  </td>
                  <td className={`text-right ${TD} font-mono tabular-nums whitespace-nowrap text-[var(--text-secondary)]`}>
                    {row.usage ? formatTokens(row.usage.totalTokens) : EMPTY}
                  </td>
                  <td className={`text-right ${TD} font-mono tabular-nums whitespace-nowrap`}>
                    {row.usage?.lastReportedAt ? (
                      <span className="text-[var(--text-muted)]">{formatDate(row.usage.lastReportedAt)}</span>
                    ) : row.subscription && row.trackable ? (
                      <span className="text-xs text-[var(--accent-orange)]">보고 없음</span>
                    ) : (
                      <span className="text-[var(--text-muted)]">{EMPTY}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** 한 사람의 줄 묶음 안 순서 — 결제일이 가까운 구독부터, 구독 없는 사용은 뒤로 */
function renewalOrder(row: AxMemberServiceRow): number {
  return row.subscription?.daysLeft ?? Number.POSITIVE_INFINITY
}

/**
 * 줄을 사람 단위로 묶는다
 *
 * 결제 임박순이면 묶음끼리는 그 사람의 가장 가까운 결제일 순이다 — 결제일로 줄을 흩으면
 * 같은 사람의 Claude·Codex 가 멀리 떨어져 한 사람을 한눈에 볼 수 없다.
 *
 * @param rows - 구성원 × 서비스 줄
 * @param sort - 묶음 정렬 기준
 */
function groupByPerson(rows: AxMemberServiceRow[], sort: PeopleSort): AxMemberServiceRow[][] {
  const byName = new Map<string, AxMemberServiceRow[]>()
  for (const row of rows) byName.set(row.name, [...(byName.get(row.name) ?? []), row])
  const groups = [...byName.values()].map((group) =>
    [...group].sort((a, b) => renewalOrder(a) - renewalOrder(b) || a.service.localeCompare(b.service))
  )
  return groups.sort((a, b) =>
    (sort === 'renewal' ? renewalOrder(a[0]) - renewalOrder(b[0]) : 0) || a[0].name.localeCompare(b[0].name, 'ko')
  )
}

/** 서비스 · 플랜 칸 — 구독 플랜, 대신 결제하는 사람, 구독 없이 쓰는 경우의 실제 플랜 */
function PlanCell({ row }: { row: AxMemberServiceRow }) {
  if (!row.subscription) {
    return (
      <>
        {row.service} {row.usage?.plan ?? ''}
        <span className="ml-2 text-xs text-[var(--text-muted)]">구독 없음</span>
      </>
    )
  }
  const payer = row.subscription.payer
  return (
    <>
      {row.service} {row.subscription.plan}
      {row.subscription.shared && <span className="ml-2 text-xs text-[var(--text-muted)]">공용</span>}
      {payer && payer !== '본인' && <span className="ml-2 text-xs text-[var(--text-muted)]">{payer} 결제</span>}
    </>
  )
}

/** 다음 결제 칸 — KST 날짜 문자열을 그대로 쓴다(Date 로 바꾸면 브라우저 시간대에 따라 하루가 밀린다) */
function RenewalCell({ row }: { row: AxMemberServiceRow }) {
  const nextRenewal = row.subscription?.nextRenewal
  const daysLeft = row.subscription?.daysLeft
  if (!nextRenewal || daysLeft == null) return <span className="text-[var(--text-muted)]">{EMPTY}</span>
  const [, month, day] = nextRenewal.split('-').map(Number)
  return (
    <>
      <span className="text-[var(--text-secondary)]">{`${month}. ${day}.`}</span>{' '}
      <span className={daysLeft <= DUE_SOON_DAYS ? 'text-[var(--accent-orange)]' : 'text-[var(--text-muted)]'}>
        {daysLeft === 0 ? '오늘' : `D-${daysLeft}`}
      </span>
    </>
  )
}

/**
 * 이번 주 한도 칸 — 사용 보고는 있는데 한도를 못 받았으면 미수집.
 * Claude Code 줄은 수집 연결 상태를 함께 쓴다: 값이 없으면 미수집 대신 상태를, 사용 보고가 없어도 미연결 사유를,
 * 값이 있어도 지금 연결 경고(미연결·한도 미수신)가 있으면 값 아래에 둔다 — 머신이 여러 대면 둘이 함께 참일 수 있다.
 */
function CurrentLimitCell({ row, collector }: { row: AxMemberServiceRow; collector?: AxUsageParticipationRow }) {
  const capture = row.service === CLIENT_LABELS['claude-code'] && collector ? limitCaptureLabel(collector) : null
  const percent = row.usage?.limitUsedPercent ?? null
  if (percent === null) {
    // 상태는 다른 머신에서 왔을 수 있다 — 값이 없는 칸에 "수집 중"을 쓰면 모순이라 미수집으로 둔다
    const label = capture && !capture.label.startsWith('수집 중') ? capture.label : row.usage ? '미수집' : EMPTY
    return (
      <span className={`text-[11px] ${capture?.warn ? 'text-[var(--accent-orange)]' : 'text-[var(--text-muted)]'}`}>
        {label}
      </span>
    )
  }
  return (
    <>
      <span
        title={row.usage?.limitResetsAt ? `초기화 ${formatDateTime(row.usage.limitResetsAt)}` : undefined}
        className={percent >= 80 ? 'text-[var(--accent-orange)]' : 'text-[var(--text-secondary)]'}
      >
        {percent}%
      </span>
      {/* 날짜가 붙은 경고는 지난 관측이다 — 지금 값 아래에 두면 지금 상태처럼 읽힌다 */}
      {capture?.warn && !capture.label.endsWith('관측)') && (
        <span className="block text-[11px] text-[var(--accent-orange)]">{capture.label}</span>
      )}
    </>
  )
}

/** 주기 평균 칸 — 회차 수가 표본 크기다. 회차별 값은 호버로 */
function CycleAverageCell({ row, cycleError }: { row: AxMemberServiceRow; cycleError: boolean }) {
  // 연간 결제·결제일 없는 구독은 결제 주기가 정의되지 않는다 — "회차 없음"이 아니다
  if (!row.subscription || !row.trackable || row.subscription.nextRenewal === null) {
    return <span className="text-[var(--text-muted)]">{EMPTY}</span>
  }
  if (cycleError) return <span className="text-[11px] text-[var(--accent-orange)]">조회 실패</span>
  if (row.cycleWeeks.length === 0) return <span className="text-[11px] text-[var(--text-muted)]">회차 없음</span>
  const projected = row.cycleWeeks.filter((week) => judgedWeekPercent(week) !== null)
  // 7일을 못 채워 환산한 회차(조기 초기화, Claude 처럼 7일이 아닌 회차)와 환산하지 못해 평균에서 뺀 회차
  const short = projected.filter((week) => judgedWeekPercent(week) !== week.usedPercent).length
  const excluded = row.cycleWeeks.length - projected.length
  const late = projected.filter(isLateReport).length
  const detail = row.cycleWeeks
    .map((week) => {
      const gap = isLateReport(week) ? ` · 끝나기 ${reportGapHours(week)}시간 전까지만 잡힘` : ''
      const seen = `마지막 보고 ${formatDateTime(week.reportedAt)}${gap}`
      const end = week.endedAt ?? week.resetsAt
      const value = judgedWeekPercent(week)
      const days = week.startedAt ? `${Math.round(((Date.parse(end) - Date.parse(week.startedAt)) / 86_400_000) * 10) / 10}일 만` : null
      const base = isEarlyReset(week)
        ? `${formatDateTime(end)} 조기 초기화 ${week.usedPercent}% (${days ? `${days}, ` : ''}예정 ${formatDateTime(week.resetsAt)})`
        : `${formatDateTime(week.resetsAt)} 초기화 ${week.usedPercent}%${days && value !== week.usedPercent ? ` (${days})` : ''}`
      const projection = value === week.usedPercent ? '' : value === null ? ' → 환산 안 함(1일 미만 또는 환산값 없음)' : ` → 7일 환산 ${formatProjectedPercent(value)}%`
      return `${base}${projection} (${seen})`
    })
    .join('\n')
  return (
    <span title={detail}>
      {row.cycleAveragePercent === null
        ? <span className="text-[11px] text-[var(--text-muted)]">환산할 회차 없음</span>
        : (
          <>
            <span className="text-[var(--text-primary)]">{row.cycleAveragePercent}%</span>{' '}
            <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">{projected.length}회</span>
          </>
        )}
      {/* 끝 무렵이 빠진 회차는 실제보다 낮다 — 평균을 그대로 믿지 않게 */}
      {late > 0 && <span className="block text-[11px] text-[var(--accent-orange)]">끝 무렵 미수집 {late}회</span>}
      {/* 7일을 못 채운 회차는 7일 환산(추정)으로 평균에 들어갔다는 것만 알린다 — 경고가 아니다 */}
      {short > 0 && <span className="block text-[11px] text-[var(--text-muted)]">7일 미만 {short}회 · 7일 환산</span>}
      {excluded > 0 && <span className="block text-[11px] text-[var(--text-muted)]">환산 제외 {excluded}회</span>}
    </span>
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

/**
 * 구독 데이터 기준 시각 안내
 *
 * 구독 숫자는 시트에서 마지막으로 넘어온 시점의 것이다.
 * 오래됐거나 넘어온 적이 없으면 배경색이 아니라 글자색만 경고 톤으로 바꾼다.
 *
 * @param syncedAt - 시트에서 마지막으로 반영된 시각 (ISO 8601). 이력이 없으면 null
 */
export function SyncedAtNotice({ syncedAt }: { syncedAt: string | null }) {
  const daysAgo = syncedAt === null ? null : daysSince(syncedAt)
  const isStale = isSheetStale(syncedAt)

  const label =
    syncedAt === null || daysAgo === null
      ? '구독 시트 갱신 이력 없음'
      : `구독 시트 반영 ${formatDate(syncedAt)}${daysAgo >= STALE_AFTER_DAYS ? ` · ${daysAgo}일 지남` : ''}`

  return (
    <p
      className={`mt-1 font-mono text-[11px] tabular-nums ${
        isStale ? 'text-[var(--accent-orange)]' : 'text-[var(--text-muted)]'
      }`}
    >
      {label}
    </p>
  )
}

/**
 * 오늘까지 며칠 지났는지
 *
 * @param iso - ISO 8601 시각 문자열
 * @returns 경과 일수. 파싱할 수 없으면 null
 */
function daysSince(iso: string): number | null {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return null
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000))
}

/** 구독 시트가 갱신 주기를 넘겨 오래됐거나 반영된 적이 없는지 — 그때는 경고를 늘 보이게 한다 */
function isSheetStale(syncedAt: string | null): boolean {
  const daysAgo = syncedAt === null ? null : daysSince(syncedAt)
  return daysAgo === null || daysAgo >= STALE_AFTER_DAYS
}

/**
 * "?" 도움말 — 읽는 법·기준 시각처럼 늘 펼쳐 둘 필요 없는 설명을 호버·포커스 때만 보여준다
 *
 * - 이름 붙은 그룹(`group/info`)이라 바깥의 다른 group 호버에 반응하지 않는다.
 * - 본문은 버튼이 아니라 가장 가까운 `relative` 조상(호출하는 줄)의 왼쪽 아래에 붙는다 — 버튼이 줄 끝에 있어도
 *   좁은 화면 오른쪽으로 넘치지 않게. 그래서 호출하는 줄에 `relative` 를 단다.
 * - 버튼과 본문 사이 간격은 투명한 위쪽 여백으로 만들어 호버 영역에 넣는다 — 본문으로 옮겨 가도 닫히지 않는다.
 * - Esc 로 닫는다 — 포인터를 올린 채여도 닫히고, 포인터가 떠나거나 포커스가 빠지면 다시 열 수 있다.
 *
 * @param label - 버튼의 접근성 이름
 * @param children - 도움말 내용
 */
function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId()
  const { dismissed, handlers } = useEscDismiss()

  return (
    <div className="group/info inline-flex" {...handlers}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="flex size-4 items-center justify-center rounded-full border border-[var(--border-hover)] text-[10px] text-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-[var(--brand-primary)]"
      >
        ?
      </button>
      <div
        id={id}
        role="tooltip"
        data-dismissed={dismissed || undefined}
        className={`invisible absolute left-0 top-full z-30 w-96 max-w-[calc(100vw-3rem)] pt-2 font-sans text-xs font-normal normal-case leading-relaxed tracking-normal opacity-0 group-hover/info:visible group-hover/info:opacity-100 group-focus-within/info:visible group-focus-within/info:opacity-100 ${
          dismissed ? '!invisible !opacity-0' : ''
        }`}
      >
        <div className="rounded-md border border-[var(--border-hover)] bg-[var(--bg-primary)] p-3 text-[var(--text-primary)] shadow-lg">
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * 호버·포커스로 여는 툴팁을 Esc 로 닫는 상태 (WCAG 1.4.13)
 *
 * 툴팁을 감싼 요소에 `handlers` 를 펼치고, `dismissed` 면 CSS 호버와 상관없이 숨긴다.
 */
function useEscDismiss() {
  // Esc 로 닫은 상태. 포인터를 올린 채로도 닫혀야 해서(WCAG 1.4.13) CSS 호버와 별개로 든다.
  // 포인터가 떠나거나 포커스가 빠지면 다시 열 수 있게 푼다
  // Esc 는 지금 열린 도움말(포인터가 올라가 있거나 포커스가 있는 것)만 닫는다 — 다른 도움말까지 닫힌 상태로 남기면
  // 처음 열 때 나타나지 않는다
  const [dismissed, setDismissed] = useState(false)
  const pointer = useRef(false)
  const focus = useRef(false)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (pointer.current || focus.current)) setDismissed(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  const leave = (which: typeof pointer) => {
    which.current = false
    if (!pointer.current && !focus.current) setDismissed(false)
  }

  return {
    dismissed,
    handlers: {
      onMouseEnter: () => { pointer.current = true },
      onMouseLeave: () => leave(pointer),
      onFocus: () => { focus.current = true },
      onBlur: () => leave(focus),
    },
  }
}
