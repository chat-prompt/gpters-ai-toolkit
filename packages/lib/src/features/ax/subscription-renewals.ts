/**
 * AX Dashboard — 구독 갱신 결정표 패널
 *
 * 다음 결제일 전에 "이 사람이 이번 결제 주기 동안 주간 한도를 얼마나 썼나"를 보여준다.
 * 다음 달 구독(유지·변경·해지)을 정하는 근거이고, 뽀밋이가 같은 데이터를 DM 으로 보낸다
 * (`GET /api/ax/subscription-sync`).
 *
 * 주간 사용률은 **한도가 초기화되기 전에 받은 보고의 값**이다. `ax_client_usage` 는 수집기가
 * 보낸 하루 단위 행마다 그 시점의 주간 한도 스냅샷(`limitUsedPercent`, `limitResetsAt`)을
 * 남기고, 같은 날 초기화되면 덮어써지므로 `ax_usage_limit_windows`(회차별 최댓값)를 함께 읽는다.
 * 같은 초기화 시각을 가진 보고 중 초기화 전에 받은 것만 보고, 그중 **최댓값**을 그 회차의
 * 최종값으로 쓴다 — 한 회차 안에서 사용률은 줄지 않는데, 머신이 여럿이면 가장 늦게 받은 행이
 * 다른 머신의 오래된 스냅샷일 수 있다. 초기화 뒤에 받은 행은 지난 스냅샷을 다시 보낸 것이라 뺀다.
 * 결제 주기 안에서 초기화된 회차들의 최종값을 평균한다.
 *
 * Codex 는 초기화 간격이 7일이 아닌 회차가 실측에 있다(2026-10 확인). 회차 수를 그대로 보여주고
 * 7일로 맞추지 않는다.
 *
 * 사람 기준이다 — 사용자 이름이 있는 Anthropic·OpenAI 구독만 대상이고(로스터의 `공용(…)` 구독은 뺀다),
 * 구독 이름과 사용량 보고자 이름(`owner_name` = `member_name`)이 같아야 이어진다.
 */

import { db, axClientUsage, axSubscriptions, axUsageLimitWindows } from '@gpters/db'
import { and, eq, gte, isNotNull } from 'drizzle-orm'
import type { AxPanel, AxPanelContext, AxPanelMeta, AxPanelResult, AxUsageClient } from './types'
import { panelOk, panelError } from './panel'
import { KST_OFFSET_MS, kstDateKey, startOfKstDay } from './kst'
import { createLogger } from '../../core/logger'

const log = createLogger('ax-subscription-renewals')

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

/** 구독 벤더 → 사용량을 보고하는 클라이언트 */
const CLIENT_BY_VENDOR: Record<string, AxUsageClient> = {
  Anthropic: 'claude-code',
  OpenAI: 'codex',
}

const meta: AxPanelMeta = {
  id: 'subscription-renewals',
  title: '구독 갱신',
  description: '결제일 전 이번 주기 동안의 주간 한도 사용률 — 다음 달 구독을 정하는 근거',
  source: '구독 로스터 + 수집기 주간 한도 보고',
  visibility: 'admin',
  parentId: 'client-usage',
  usesPeriod: false,
}

/** 결제 주기 안에서 초기화된 한 회차 */
export interface AxRenewalWeek {
  /** 주간 한도 초기화 시각 (ISO 8601) */
  resetsAt: string
  /** 초기화 전에 받은 사용률의 최댓값 (0~100) */
  usedPercent: number
  /** 초기화 전 마지막 보고 시각 (ISO 8601). 초기화 시각과 멀수록 마지막 날 사용량이 덜 반영됐다 */
  reportedAt: string
}

/** 구독 한 건의 갱신 결정 근거 */
export interface AxRenewalRow {
  ownerName: string
  vendor: string
  plan: string
  amount: number
  currency: string
  renewalDay: number
  /** 다음 결제일 (KST, YYYY-MM-DD) */
  nextRenewal: string
  /** 다음 결제일까지 남은 일수. 오늘이면 0 */
  daysLeft: number
  /** 이번 결제 주기에서 초기화된 회차들 (오래된 순) */
  weeks: AxRenewalWeek[]
  /** `weeks` 의 평균 사용률. 보고된 주가 없으면 null — 0과 구분한다 */
  averagePercent: number | null
  /** 아직 초기화되지 않은 회차의 사용률. 보고가 없으면 null */
  currentPercent: number | null
}

/** 구독 갱신 패널 데이터 */
export interface AxSubscriptionRenewalData {
  /** 다음 결제일이 가까운 순 */
  rows: AxRenewalRow[]
}

/** 계산에 필요한 구독 필드 */
export interface RenewalSubscriptionInput {
  ownerName: string | null
  vendor: string
  plan: string
  amount: number | string
  currency: string
  renewalDay: number | null
  billingCycle: 'monthly' | 'yearly'
}

/** 계산에 필요한 사용량 보고 필드 */
export interface RenewalUsageInput {
  memberName: string
  client: AxUsageClient
  limitUsedPercent: number | string | null
  limitResetsAt: Date | null
  /** 이 값을 보고받은 시각 (회차 테이블은 최댓값을 마지막으로 확인한 시각) */
  syncedAt: Date
  /** 값과 무관하게 이 회차를 마지막으로 받은 시각. 없으면 syncedAt (하루 단위 행) */
  seenAt?: Date
}

/**
 * 주어진 달의 결제일 0시(KST). 그 달에 없는 날(31일 등)은 말일로 당긴다.
 *
 * @param year - KST 연도
 * @param month - KST 월 (0부터, 12 이상·음수는 넘겨서 계산)
 */
function renewalOn(year: number, month: number, day: number): Date {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(day, daysInMonth)) - KST_OFFSET_MS)
}

/**
 * 오늘(KST) 이후 가장 가까운 결제일과 그 직전 결제일
 *
 * @param renewalDay - 매월 결제일 (1~31)
 * @param now - 기준 시각
 */
export function renewalCycle(renewalDay: number, now: Date): { previous: Date; next: Date } {
  const kst = new Date(now.getTime() + KST_OFFSET_MS)
  const year = kst.getUTCFullYear()
  const month = kst.getUTCMonth()
  const today = startOfKstDay(now)
  const thisMonth = renewalOn(year, month, renewalDay)
  const nextMonth = thisMonth >= today ? month : month + 1
  return { previous: renewalOn(year, nextMonth - 1, renewalDay), next: renewalOn(year, nextMonth, renewalDay) }
}

/**
 * 구독과 사용량 보고로 갱신 결정표를 만든다 (DB 없이 테스트하는 순수 함수)
 *
 * @param subscriptions - 활성 구독
 * @param usage - 주간 한도가 담긴 사용량 보고 행
 * @param now - 기준 시각
 */
export function buildRenewalRows(
  subscriptions: RenewalSubscriptionInput[],
  usage: RenewalUsageInput[],
  now: Date
): AxRenewalRow[] {
  // (이름, 클라이언트) 별로 초기화 전에 받은 보고만 모은다
  const byOwner = new Map<string, Array<{ resetsAt: Date; usedPercent: number; reportedAt: Date; seenAt: Date }>>()
  for (const row of usage) {
    if (!row.limitResetsAt || row.limitUsedPercent === null || row.syncedAt >= row.limitResetsAt) continue
    const usedPercent = Number(row.limitUsedPercent)
    if (!Number.isFinite(usedPercent)) continue
    const key = `${row.memberName.trim()}\u0000${row.client}`
    const list = byOwner.get(key) ?? []
    list.push({ resetsAt: row.limitResetsAt, usedPercent, reportedAt: row.syncedAt, seenAt: row.seenAt ?? row.syncedAt })
    byOwner.set(key, list)
  }

  // 초기화 시각이 1시간 안으로 이어지는 보고를 한 회차로 묶는다(보고마다 초 단위로 흔들릴 수 있다).
  // 정렬한 뒤 묶고 대표 시각은 회차의 마지막 초기화 시각으로 둬서, 입력 순서와 무관하게 같은 결과를 낸다
  // reportedAt 은 최댓값을 보고한 시각, lastSeenAt 은 그 회차의 가장 늦은 보고 시각(진행 중 회차 고르기용)
  type Window = { resetsAt: Date; usedPercent: number; reportedAt: Date; lastSeenAt: Date }
  const windowsByOwner = new Map<string, Window[]>()
  for (const [key, list] of byOwner) {
    list.sort((a, b) => a.resetsAt.getTime() - b.resetsAt.getTime())
    const windows: Window[] = []
    for (const item of list) {
      const last = windows[windows.length - 1]
      if (last && item.resetsAt.getTime() - last.resetsAt.getTime() <= HOUR_MS) {
        last.resetsAt = item.resetsAt
        if (item.seenAt > last.lastSeenAt) last.lastSeenAt = item.seenAt
        // 보고 시각은 최댓값을 보고한 행의 것만 쓴다 — 낮은 옛 스냅샷의 늦은 시각을 붙이면
        // 최댓값을 더 늦게 확인한 것처럼 보인다
        if (item.usedPercent > last.usedPercent) {
          last.usedPercent = item.usedPercent
          last.reportedAt = item.reportedAt
        } else if (item.usedPercent === last.usedPercent && item.reportedAt > last.reportedAt) {
          last.reportedAt = item.reportedAt
        }
      } else {
        windows.push({ resetsAt: item.resetsAt, usedPercent: item.usedPercent, reportedAt: item.reportedAt, lastSeenAt: item.seenAt })
      }
    }
    windowsByOwner.set(key, windows)
  }

  const rows: AxRenewalRow[] = []
  for (const sub of subscriptions) {
    const owner = sub.ownerName?.trim()
    const client = CLIENT_BY_VENDOR[sub.vendor]
    if (!owner || owner.startsWith('공용') || !client || sub.renewalDay === null || sub.billingCycle !== 'monthly') continue

    const { previous, next } = renewalCycle(sub.renewalDay, now)
    const mine = windowsByOwner.get(`${owner}\u0000${client}`) ?? []

    const weeks = mine
      .filter((week) => week.resetsAt >= previous && week.resetsAt <= now)
      .map((week) => ({
        resetsAt: week.resetsAt.toISOString(),
        usedPercent: week.usedPercent,
        reportedAt: week.reportedAt.toISOString(),
      }))
    // 아직 초기화 전인 회차가 둘 이상이면(벤더가 초기화 시각을 앞당김) 가장 최근에 보고된 쪽이 진행 중이다.
    // 꺼져 있던 머신이 끝난 회차의 옛 스냅샷을 더 늦게 보내면 그 회차를 고를 수 있다 — 드문 경우라 그대로 둔다
    const current = mine
      .filter((week) => week.resetsAt > now)
      .reduce<Window | undefined>((latest, week) => (!latest || week.lastSeenAt > latest.lastSeenAt ? week : latest), undefined)

    rows.push({
      ownerName: owner,
      vendor: sub.vendor,
      plan: sub.plan,
      amount: Number(sub.amount),
      currency: sub.currency,
      renewalDay: sub.renewalDay,
      nextRenewal: kstDateKey(next),
      daysLeft: Math.round((next.getTime() - startOfKstDay(now).getTime()) / DAY_MS),
      weeks,
      averagePercent: weeks.length > 0
        ? Math.round((weeks.reduce((sum, week) => sum + week.usedPercent, 0) / weeks.length) * 10) / 10
        : null,
      currentPercent: current?.usedPercent ?? null,
    })
  }

  return rows.sort((a, b) => a.daysLeft - b.daysLeft || a.ownerName.localeCompare(b.ownerName, 'ko'))
}

/**
 * 회차별 최댓값 테이블(0045)을 사용량 보고 행 모양으로 읽는다.
 *
 * `ax_client_usage` 의 하루 단위 행은 같은 날 초기화되면 직전 값을 잃으므로 이 테이블이 보완한다.
 * 0045 가 적용되기 전이면 비어 있는 것으로 보고 기존 행만으로 계산한다.
 *
 * @param since - 이 시각 이후에 초기화되는 회차만
 */
async function loadLimitWindows(since: Date): Promise<RenewalUsageInput[]> {
  try {
    const rows = await db
      .select({
        memberName: axUsageLimitWindows.memberName,
        client: axUsageLimitWindows.client,
        limitUsedPercent: axUsageLimitWindows.maxUsedPercent,
        limitResetsAt: axUsageLimitWindows.resetsAt,
        syncedAt: axUsageLimitWindows.lastReportedAt,
        seenAt: axUsageLimitWindows.lastSeenAt,
      })
      .from(axUsageLimitWindows)
      .where(gte(axUsageLimitWindows.resetsAt, since))
    return rows
  } catch (err) {
    log.warn('주간 한도 회차 테이블을 읽지 못해 하루 단위 보고만 씁니다', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/**
 * 구독 갱신 패널 로드. 개인 식별 데이터라 관리자 전용이다.
 */
async function load(ctx: AxPanelContext): Promise<AxPanelResult<AxSubscriptionRenewalData>> {
  if (!ctx.isAdmin) return panelError(meta, '관리자만 볼 수 있습니다')
  try {
    const now = new Date()
    const since = new Date(now.getTime() - 40 * DAY_MS)
    const [subscriptions, usage] = await Promise.all([
      db.select().from(axSubscriptions).where(eq(axSubscriptions.status, 'active')),
      // 가장 긴 결제 주기(31일) + 진행 중인 한 주를 덮는다
      db
        .select({
          memberName: axClientUsage.memberName,
          client: axClientUsage.client,
          limitUsedPercent: axClientUsage.limitUsedPercent,
          limitResetsAt: axClientUsage.limitResetsAt,
          syncedAt: axClientUsage.syncedAt,
        })
        .from(axClientUsage)
        .where(and(
          isNotNull(axClientUsage.limitUsedPercent),
          gte(axClientUsage.limitResetsAt, since)
        )),
    ])

    const rows = buildRenewalRows(subscriptions, [...usage, ...(await loadLimitWindows(since))], now)
    const dueThisWeek = rows.filter((row) => row.daysLeft <= 7).length
    return panelOk(meta, { rows }, [
      { label: '7일 안 결제', value: dueThisWeek.toLocaleString('ko-KR'), hint: '건' },
      { label: '대상 구독', value: rows.length.toLocaleString('ko-KR'), hint: '건' },
    ])
  } catch (err) {
    log.error('구독 갱신 패널 조회 실패', err)
    return panelError(meta, '구독 갱신 데이터를 불러오지 못했습니다')
  }
}

export const subscriptionRenewalsPanel: AxPanel<AxSubscriptionRenewalData> = { meta, load }
