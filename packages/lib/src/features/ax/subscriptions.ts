/**
 * AX Dashboard — 팀원별 구독 패널
 *
 * `import-ax-subscriptions.ts` 스크립트로 결제내역 트래커 시트에서 옮겨진
 * `ax_subscriptions` 테이블을 읽어 벤더별 집계와 (관리자 전용) 팀원별 상세를 보여준다.
 */

import { db, axSubscriptions } from '@gpters/db'
import { eq } from 'drizzle-orm'
import type {
  AxPanel,
  AxPanelContext,
  AxPanelMeta,
  AxPanelResult,
  AxSubscriptionData,
  AxSubscriptionMemberRow,
  AxSubscriptionVendorRow,
} from './types'
import { panelOk, panelError } from './panel'
import { createLogger } from '../../core/logger'

const log = createLogger('ax-subscriptions')

const meta: AxPanelMeta = {
  id: 'subscriptions',
  title: '구독 현황',
  description: '팀에서 쓰는 AI·SaaS 구독 플랜과 월 비용',
  source: '결제내역 트래커 시트 (수동 import)',
  visibility: 'org',
  parentId: 'client-usage',
  usesPeriod: false,
}

/** 소수점 둘째 자리 반올림 */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * yearly 구독은 12로 나눠 월 환산한다. 환율 환산은 하지 않는다
 *
 * 여기서는 반올림하지 않는다 — 행마다 반올림하면 오차가 쌓여
 * 연 100달러짜리 12건이 99.96달러가 된다. 합산이 끝난 뒤 한 번만 반올림한다.
 */
function toMonthlyAmount(amount: number, billingCycle: 'monthly' | 'yearly'): number {
  return billingCycle === 'yearly' ? amount / 12 : amount
}

/**
 * 요약 밴드에 올릴 월 합계 문구
 *
 * 통화가 섞여 있으면 환율로 합치지 않고 그대로 이어 붙인다.
 *
 * @param byCurrency - 통화별 월 환산 합계
 * @returns "US$2,220" 형태. 통화가 여럿이면 " + "로 잇는다
 */
function formatMonthlyTotal(byCurrency: Record<string, number>): string {
  const parts = Object.entries(byCurrency).map(([currency, amount]) =>
    new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  )
  return parts.length > 0 ? parts.join(' + ') : '—'
}

/** 통화별 합계를 한 번에 반올림한다 */
function roundAll(byCurrency: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(byCurrency).map(([currency, amount]) => [currency, round2(amount)])
  )
}

/**
 * 팀원별 구독 패널 로드
 *
 * status='active' 행만 읽는다 — 집계·팀원 상세 모두 활성 구독만 대상이다.
 * `ctx.isAdmin`이 아니면 `members`는 항상 null (이름·이메일 노출 금지).
 */
async function load(ctx: AxPanelContext): Promise<AxPanelResult<AxSubscriptionData>> {
  try {
    const rows = await db
      .select()
      .from(axSubscriptions)
      .where(eq(axSubscriptions.status, 'active'))

    const monthlyByCurrency: Record<string, number> = {}
    const vendorAgg = new Map<string, { seats: number; monthlyByCurrency: Record<string, number> }>()

    for (const row of rows) {
      // numeric 컬럼은 드라이버가 문자열로 준다
      const amount = Number(row.amount)
      const monthly = toMonthlyAmount(amount, row.billingCycle)
      monthlyByCurrency[row.currency] = (monthlyByCurrency[row.currency] ?? 0) + monthly

      const entry = vendorAgg.get(row.vendor) ?? { seats: 0, monthlyByCurrency: {} }
      entry.seats += 1
      entry.monthlyByCurrency[row.currency] = (entry.monthlyByCurrency[row.currency] ?? 0) + monthly
      vendorAgg.set(row.vendor, entry)
    }

    // 통화가 섞인 벤더끼리는 "월 환산 합계가 큰 순"을 단일 기준으로 비교할 방법이 없다
    // (환율 환산 금지 요구사항과 충돌). 애매한 경우이므로 단순하게 vendor 이름 오름차순으로 정렬한다.
    const byVendor: AxSubscriptionVendorRow[] = Array.from(vendorAgg.entries())
      .map(([vendor, agg]) => ({
        vendor,
        seats: agg.seats,
        monthlyByCurrency: roundAll(agg.monthlyByCurrency),
      }))
      .sort((a, b) => a.vendor.localeCompare(b.vendor))

    const members: AxSubscriptionMemberRow[] | null = ctx.isAdmin
      ? rows.map((row) => ({
          ownerName: row.ownerName,
          vendor: row.vendor,
          plan: row.plan,
          amount: Number(row.amount),
          currency: row.currency,
          billingCycle: row.billingCycle,
          renewalDay: row.renewalDay,
          payer: row.payer,
          status: row.status,
        }))
      : null

    // 시트에서 마지막으로 넘어온 시각 — 조회 시각과 구분해 화면에 보여준다
    const syncedAt = rows.reduce<Date | null>((latest, row) => {
      const value = row.syncedAt instanceof Date ? row.syncedAt : new Date(row.syncedAt)
      if (Number.isNaN(value.getTime())) return latest
      return !latest || value > latest ? value : latest
    }, null)

    const rounded = roundAll(monthlyByCurrency)

    return panelOk(
      meta,
      {
        syncedAt: syncedAt ? syncedAt.toISOString() : null,
        activeSeats: rows.length,
        monthlyByCurrency: rounded,
        byVendor,
        members,
      },
      [{ label: '월 구독 비용', value: formatMonthlyTotal(rounded), hint: `${rows.length}건` }]
    )
  } catch (err) {
    log.error('구독 패널 조회 실패', err)
    return panelError(meta, '구독 데이터를 불러오지 못했습니다')
  }
}

export const subscriptionsPanel: AxPanel<AxSubscriptionData> = { meta, load }
