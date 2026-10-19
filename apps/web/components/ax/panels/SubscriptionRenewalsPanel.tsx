/**
 * AX 대시보드 — 구독 갱신 패널 본문
 *
 * 결제일이 가까운 순으로, 이번 결제 주기에 초기화된 회차들의 최종 주간 사용률과 그 평균을 보여준다.
 * 판정(유지·해지)은 하지 않는다 — 실측만 두고 결정은 사람이 한다.
 * 보고가 없는 회차는 0이 아니라 빈칸이다. 평균 옆의 회차 수가 표본 크기다.
 */

import type { AxRenewalRow, AxSubscriptionRenewalData } from '@/lib/features/ax'
import type { AxPanelViewProps } from './types'
import { formatDateTime, formatMoney } from '../format'
import { EmptyNote, META_LINE, SectionHeader, TD, TH } from './primitives'

/** 값이 없을 때 표에 찍는 기호 */
const EMPTY = '—'

/** 이 일수 안에 결제되면 경고 톤으로 표시한다 — 뽀밋이 DM 과 같은 기준 */
const DUE_SOON_DAYS = 7

/**
 * 구독 갱신 패널 화면
 *
 * @param data - 결제일이 가까운 순으로 정렬된 구독 행
 */
export function SubscriptionRenewalsPanel({ data }: AxPanelViewProps<AxSubscriptionRenewalData>) {
  return (
    <div>
      <SectionHeader
        label="결제 주기별 주간 한도 사용률"
        aside={`대상 ${data.rows.length}건 · 개인 Anthropic·OpenAI 구독 (공용 제외)`}
        description="주간 한도가 초기화되기 전에 받은 사용률을 그 회차의 값으로 쓰고, 지난 결제일 이후 초기화된 회차들을 평균합니다. 수집기는 하루 한 번 보고하므로 마지막 날 사용량은 덜 잡힐 수 있습니다 — 회차별 값에 마우스를 올리면 마지막으로 받은 시각이 보입니다."
      />
      {data.rows.length === 0 ? (
        <EmptyNote>대상 구독이 없습니다. 구독 로스터에 사용자 이름과 결제일이 있어야 합니다.</EmptyNote>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className={`text-left ${TH}`}>사용자</th>
                <th className={`text-left ${TH}`}>플랜</th>
                <th className={`text-right ${TH}`}>다음 결제</th>
                <th className={`text-right ${TH}`}>주기 평균</th>
                <th className={`text-left ${TH}`}>회차별 최종값</th>
                <th className={`text-right ${TH}`}>진행 중</th>
                <th className={`text-right ${TH}`}>금액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {data.rows.map((row) => (
                <RenewalRow key={`${row.ownerName}-${row.vendor}-${row.plan}-${row.renewalDay}`} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** 구독 한 건 */
function RenewalRow({ row }: { row: AxRenewalRow }) {
  const dueSoon = row.daysLeft <= DUE_SOON_DAYS
  return (
    <tr className="transition-colors duration-200 hover:bg-[var(--bg-secondary)]">
      <td className={`${TD} text-[var(--text-primary)]`}>{row.ownerName}</td>
      <td className={`${TD} text-[var(--text-secondary)]`}>{row.vendor} {row.plan}</td>
      <td className={`${TD} text-right font-mono tabular-nums whitespace-nowrap`}>
        <span className="text-[var(--text-secondary)]">{formatKstDay(row.nextRenewal)}</span>{' '}
        <span className={dueSoon ? 'text-[var(--accent-orange)]' : 'text-[var(--text-muted)]'}>
          {row.daysLeft === 0 ? '오늘' : `D-${row.daysLeft}`}
        </span>
      </td>
      <td className={`${TD} text-right font-mono tabular-nums whitespace-nowrap`}>
        {row.averagePercent === null ? (
          <span className="text-[var(--text-muted)]">보고 없음</span>
        ) : (
          <>
            <span className="text-[var(--text-primary)]">{row.averagePercent}%</span>{' '}
            <span className={META_LINE}>{row.weeks.length}회</span>
          </>
        )}
      </td>
      <td className={`${TD} font-mono tabular-nums text-[var(--text-secondary)] whitespace-nowrap`}>
        {row.weeks.length === 0
          ? EMPTY
          : row.weeks.map((week, index) => (
              <span key={week.resetsAt} title={`초기화 ${formatDateTime(week.resetsAt)} · 마지막 보고 ${formatDateTime(week.reportedAt)}`}>
                {index > 0 && <span className="text-[var(--text-muted)]"> · </span>}
                {week.usedPercent}
              </span>
            ))}
      </td>
      <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-muted)]`}>
        {row.currentPercent === null ? EMPTY : `${row.currentPercent}%`}
      </td>
      <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)] whitespace-nowrap`}>
        {formatMoney(row.amount, row.currency)}
      </td>
    </tr>
  )
}

/**
 * KST 날짜 키를 그대로 표기한다 — Date 로 바꾸면 브라우저 시간대에 따라 하루가 밀린다
 *
 * @param key - YYYY-MM-DD (KST)
 * @returns "10. 25." 형태
 */
function formatKstDay(key: string): string {
  const [, month, day] = key.split('-').map(Number)
  return `${month}. ${day}.`
}
