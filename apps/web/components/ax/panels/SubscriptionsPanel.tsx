/**
 * AX 대시보드 — 구독 현황 패널 본문
 *
 * 화면 전체 폭을 쓰는 본문만 그린다. 제목·설명·출처는 껍데기가 그린다.
 * 위는 벤더별 요약 표, 아래는 팀원별 상세 표다. 둘 다 접지 않는다.
 *
 * 벤더별 집계는 전원에게, 팀원별 상세는 관리자에게만 보인다.
 * 관리자가 아니면 `members`가 null로 내려오고, 이 경우 개인 정보 영역을 아예 렌더하지 않는다.
 */

import type {
  AxSubscriptionData,
  AxSubscriptionMemberRow,
  AxSubscriptionVendorRow,
} from '@/lib/features/ax'
import type { AxPanelViewProps } from './types'
import { formatCount, formatMoney, formatMoneyMap } from '../format'

/** 결제 주기 표기 */
const CYCLE_LABELS: Record<string, string> = {
  monthly: '월간',
  yearly: '연간',
}

/** 이 기간(일)을 넘게 갱신되지 않았으면 오래된 자료로 본다 */
const STALE_AFTER_DAYS = 14

/** 값이 없을 때 표에 찍는 기호 */
const EMPTY = '—'

/** 표 머리칸 공통 스타일 */
const TH = 'font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] font-normal'

/** 표 본문칸 공통 여백 */
const TD = 'py-2.5 px-3'

/**
 * 구독 현황 패널 화면
 *
 * @param data - 구독 집계. members가 null이면 팀원별 상세를 렌더하지 않는다
 */
export function SubscriptionsPanel({ data }: AxPanelViewProps<AxSubscriptionData>) {
  return (
    <div className="space-y-10">
      <div>
        {/* 기준 시각 — 수동 반영이라 조회 시각과 다르다. 표를 읽기 전에 먼저 밝힌다 */}
        <SyncedAtNotice syncedAt={data.syncedAt} />
        {data.byVendor.length > 0 ? (
          <div className="mt-3">
            <VendorTable rows={data.byVendor} totals={data.monthlyByCurrency} />
          </div>
        ) : (
          <p className="mt-3 border-l-2 border-[var(--border-hover)] pl-4 text-sm text-[var(--text-secondary)]">
            등록된 구독이 없습니다.
          </p>
        )}
      </div>

      {/* 팀원별 상세 — 관리자에게만 데이터가 내려온다 */}
      {data.members !== null && <MemberTable members={data.members} />}
    </div>
  )
}

/**
 * 벤더별 요약 표 — 벤더명·좌석·월 비용·비율 막대를 한 줄에 둔다
 *
 * 환율 환산을 하지 않으므로, 막대 길이는 "같은 통화 합계 대비 점유율" 중 가장 큰 값을 쓴다.
 * 통화가 하나인 흔한 경우에는 그대로 전체 대비 비율이 된다.
 *
 * @param rows - 벤더별 집계
 * @param totals - 통화별 월 환산 합계
 */
function VendorTable({
  rows,
  totals,
}: {
  rows: AxSubscriptionVendorRow[]
  totals: Record<string, number>
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            <th className={`text-left ${TD} ${TH} w-[28%]`}>벤더</th>
            <th className={`text-right ${TD} ${TH} w-20`}>좌석</th>
            <th className={`text-right ${TD} ${TH} w-[22%]`}>월 비용</th>
            <th className={`text-left ${TD} ${TH}`}>비율</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {rows.map((row) => {
            const ratio = share(row.monthlyByCurrency, totals)
            return (
              <tr
                key={row.vendor}
                className="transition-colors duration-200 hover:bg-[var(--bg-secondary)]"
              >
                <td className={`${TD} text-[var(--text-primary)]`}>{row.vendor}</td>
                <td
                  className={`text-right ${TD} font-mono tabular-nums ${
                    row.seats === 0 ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {formatCount(row.seats)}
                </td>
                <td
                  className={`text-right ${TD} font-mono tabular-nums text-[var(--text-primary)] whitespace-nowrap`}
                >
                  {formatMoneyMap(row.monthlyByCurrency)}
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
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * 팀원별 구독 상세 표 (관리자 전용)
 *
 * 사람 기준으로 정렬해 한 사람의 구독이 붙어 보이게 하고,
 * 같은 사람이 이어지는 줄에서는 이름을 비워 시선이 흩어지지 않게 한다.
 *
 * @param members - 이용 중인 구독만 담긴 목록
 */
function MemberTable({ members }: { members: AxSubscriptionMemberRow[] }) {
  if (members.length === 0) {
    return (
      <p className="border-l-2 border-[var(--border-hover)] pl-4 text-sm text-[var(--text-secondary)]">
        팀원별 구독 내역이 없습니다.
      </p>
    )
  }

  const sorted = [...members].sort(
    (a, b) => ownerLabel(a).localeCompare(ownerLabel(b), 'ko') || a.vendor.localeCompare(b.vendor)
  )

  return (
    <div>
      {/* 해지 건은 애초에 내려오지 않으므로 표 위에서 범위를 밝힌다 */}
      <p className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        팀원별 상세 {formatCount(sorted.length)}건 · 이용 중인 구독만
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className={`text-left ${TD} ${TH} w-[16%]`}>사용자</th>
              <th className={`text-left ${TD} ${TH} w-[18%]`}>서비스</th>
              <th className={`text-left ${TD} ${TH} w-[20%]`}>플랜</th>
              <th className={`text-right ${TD} ${TH}`}>결제일</th>
              <th className={`text-left ${TD} ${TH}`}>결제 주체</th>
              <th className={`text-right ${TD} ${TH}`}>금액</th>
              <th className={`text-right ${TD} ${TH}`}>주기</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {sorted.map((member, index) => {
              const owner = ownerLabel(member)
              const previous = index > 0 ? sorted[index - 1] : null
              // 같은 사람이 이어지는 줄은 이름을 비운다 — 이름이 반복되면 사람 단위 묶음이 안 보인다
              const repeated = previous !== null && ownerLabel(previous) === owner

              return (
                <tr
                  key={`${owner}-${member.vendor}-${member.plan}-${index}`}
                  className="transition-colors duration-200 hover:bg-[var(--bg-secondary)]"
                >
                  <td className={`${TD} text-[var(--text-primary)]`}>{repeated ? '' : owner}</td>
                  <td className={`${TD} text-[var(--text-secondary)]`}>{member.vendor}</td>
                  <td className={`${TD} text-[var(--text-secondary)]`}>{member.plan}</td>
                  <td
                    className={`text-right ${TD} font-mono tabular-nums text-[var(--text-muted)] whitespace-nowrap`}
                  >
                    {member.renewalDay !== null ? `매월 ${member.renewalDay}일` : EMPTY}
                  </td>
                  <td className={`${TD} text-[var(--text-secondary)]`}>{member.payer ?? EMPTY}</td>
                  <td
                    className={`text-right ${TD} font-mono tabular-nums text-[var(--text-primary)] whitespace-nowrap`}
                  >
                    {formatMoney(member.amount, member.currency)}
                  </td>
                  <td className={`text-right ${TD} text-[var(--text-secondary)]`}>
                    {CYCLE_LABELS[member.billingCycle] ?? member.billingCycle}
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
 * 기준 시각 안내
 *
 * 이 숫자는 시트에서 마지막으로 넘어온 시점의 것이다.
 * 오래됐거나 넘어온 적이 없으면 배경색이 아니라 글자색만 경고 톤으로 바꾼다.
 *
 * @param syncedAt - 시트에서 마지막으로 반영된 시각 (ISO 8601). 이력이 없으면 null
 */
function SyncedAtNotice({ syncedAt }: { syncedAt: string | null }) {
  const daysAgo = syncedAt === null ? null : daysSince(syncedAt)
  const isStale = daysAgo === null || daysAgo >= STALE_AFTER_DAYS

  const label =
    syncedAt === null || daysAgo === null
      ? '갱신 이력 없음'
      : `시트 반영 ${formatDay(syncedAt)}${daysAgo >= STALE_AFTER_DAYS ? ` · ${daysAgo}일 지남` : ''}`

  return (
    <p
      className={`font-mono text-[11px] tabular-nums ${
        isStale ? 'text-[var(--accent-orange)]' : 'text-[var(--text-muted)]'
      }`}
    >
      {label}
    </p>
  )
}

/**
 * 벤더 한 곳이 차지하는 비중 (0~1)
 *
 * @param byCurrency - 벤더의 통화별 월 환산 금액
 * @param totals - 통화별 월 환산 합계
 * @returns 통화별 점유율 중 최댓값. 계산할 수 없으면 0
 */
function share(byCurrency: Record<string, number>, totals: Record<string, number>): number {
  let best = 0
  for (const [currency, amount] of Object.entries(byCurrency)) {
    const total = totals[currency]
    if (!total) continue
    best = Math.max(best, Math.min(1, amount / total))
  }
  return best
}

/**
 * 구독 한 건의 사용자 표기
 *
 * @param member - 구독 한 건
 * @returns 이름. 비어 있으면 "미지정"
 */
function ownerLabel(member: AxSubscriptionMemberRow): string {
  return member.ownerName ?? '미지정'
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

/**
 * 날짜만 표기 (YYYY-MM-DD)
 *
 * 갱신 시각은 "며칠 전 자료인지"만 알면 되므로 시:분은 버린다.
 *
 * @param iso - ISO 8601 시각 문자열
 * @returns 현지 시각 기준 날짜 문자열
 */
function formatDay(iso: string): string {
  const date = new Date(iso)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
