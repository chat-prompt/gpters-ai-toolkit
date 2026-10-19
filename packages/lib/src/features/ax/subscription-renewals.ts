/**
 * AX Dashboard — 구독 갱신 결정표
 *
 * 다음 결제일 전에 "이 사람이 이번 결제 주기 동안 주간 한도를 얼마나 썼나"를 보여준다.
 * 다음 달 구독(유지·변경·해지)을 정하는 근거다. 「클라이언트」 패널이 구성원 × 서비스 표에 합쳐
 * 보여주고(`buildMemberServiceRows`), 뽀밋이가 같은 데이터를 DM 으로 보낸다(`GET /api/ax/subscription-sync`).
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
 * 로스터 이름과 계정 표시명은 괄호 별칭까지 같은 사람으로 본다(`박수오` = `박수오 (소파)`, `타타` = `조효희 (타타)`).
 */

import { db, axClientUsage, axSubscriptions, axUsageLimitWindows } from '@gpters/db'
import { and, eq, gte, isNotNull } from 'drizzle-orm'
import type {
  AxClientUsageMemberRow,
  AxMemberServiceRow,
  AxRenewalRow,
  AxSubscriptionMemberRow,
  AxSubscriptionRenewalData,
  AxUsageClient,
} from './types'
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

/** 클라이언트 표시명 */
const CLIENT_LABELS: Record<AxUsageClient, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
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

/** 초기화 전에 받은 보고 한 건 */
type Report = { resetsAt: Date; usedPercent: number; reportedAt: Date; seenAt: Date }

/** 한 회차. reportedAt 은 최댓값을 보고한 시각, lastSeenAt 은 가장 늦은 보고 시각(진행 중 회차 고르기용) */
type Window = { resetsAt: Date; usedPercent: number; reportedAt: Date; lastSeenAt: Date }

/**
 * 같은 사람인지 가르는 이름 키 — 전체 이름, 괄호 앞 이름, 괄호 안 별칭
 *
 * 로스터는 `타타`, 계정 표시명은 `조효희 (타타)`처럼 적힌다.
 * ponytail: 별칭이 겹치는 두 사람은 구분하지 못한다. 그런 일이 생기면 로스터에 user_id 를 둔다.
 *
 * @param name - 로스터 이름 또는 계정 표시명
 */
export function personNameKeys(name: string): string[] {
  const trimmed = name.trim()
  const match = trimmed.match(/^(.*?)\s*\(([^)]*)\)\s*$/)
  const keys = match ? [trimmed, match[1].trim(), match[2].trim()] : [trimmed]
  return keys.filter((key) => key.length > 0)
}

/** 두 이름이 같은 사람을 가리키는지 (이름 키가 하나라도 겹치면) */
export function samePerson(a: string, b: string): boolean {
  const keys = new Set(personNameKeys(a))
  return personNameKeys(b).some((key) => keys.has(key))
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

/** 다음 결제일까지 남은 일수. 오늘이면 0 */
function daysUntil(next: Date, now: Date): number {
  return Math.round((next.getTime() - startOfKstDay(now).getTime()) / DAY_MS)
}

/**
 * 초기화 시각이 1시간 안으로 이어지는 보고를 한 회차로 묶는다(보고마다 초 단위로 흔들릴 수 있다).
 * 정렬한 뒤 묶고 대표 시각은 회차의 마지막 초기화 시각으로 둬서, 입력 순서와 무관하게 같은 결과를 낸다.
 *
 * @param reports - 한 사람·한 클라이언트의 보고
 */
function clusterWindows(reports: Report[]): Window[] {
  const sorted = [...reports].sort((a, b) => a.resetsAt.getTime() - b.resetsAt.getTime())
  const windows: Window[] = []
  for (const item of sorted) {
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
  return windows
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
  const byOwner = new Map<string, { name: string; client: AxUsageClient; reports: Report[] }>()
  for (const row of usage) {
    if (!row.limitResetsAt || row.limitUsedPercent === null || row.syncedAt >= row.limitResetsAt) continue
    const usedPercent = Number(row.limitUsedPercent)
    if (!Number.isFinite(usedPercent)) continue
    const name = row.memberName.trim()
    const key = `${name}\u0000${row.client}`
    const entry = byOwner.get(key) ?? { name, client: row.client, reports: [] }
    entry.reports.push({ resetsAt: row.limitResetsAt, usedPercent, reportedAt: row.syncedAt, seenAt: row.seenAt ?? row.syncedAt })
    byOwner.set(key, entry)
  }

  const rows: AxRenewalRow[] = []
  for (const sub of subscriptions) {
    const owner = sub.ownerName?.trim()
    const client = CLIENT_BY_VENDOR[sub.vendor]
    if (!owner || owner.startsWith('공용') || !client || sub.renewalDay === null || sub.billingCycle !== 'monthly') continue

    const { previous, next } = renewalCycle(sub.renewalDay, now)
    // 같은 사람이 계정 표시명과 로스터 이름을 다르게 쓸 수 있어 별칭까지 맞는 보고를 모두 모은다
    const mine = clusterWindows(
      [...byOwner.values()]
        .filter((entry) => entry.client === client && samePerson(owner, entry.name))
        .flatMap((entry) => entry.reports)
    )

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
      daysLeft: daysUntil(next, now),
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
 * 구성원 × 서비스 한 줄 표를 만든다 (DB 없이 테스트하는 순수 함수)
 *
 * 구독 한 건마다 한 줄을 만들고 같은 사람·같은 클라이언트의 사용 보고를 붙인다.
 * 어느 구독에도 붙지 않은 사용 보고는 "구독 없음" 줄로 남긴다(개인 결제 등).
 *
 * @param usageMembers - 클라이언트 패널의 팀원별 최신 사용량
 * @param subscriptions - 활성 구독 전체 (공용·연간 포함)
 * @param renewals - 갱신 결정표 (사람 구독만)
 * @param now - 기준 시각
 * @returns 다음 결제일이 가까운 순. 결제일이 없는 줄은 뒤로
 */
export function buildMemberServiceRows(
  usageMembers: AxClientUsageMemberRow[],
  subscriptions: AxSubscriptionMemberRow[],
  renewals: AxRenewalRow[],
  now: Date
): AxMemberServiceRow[] {
  const used = new Set<AxClientUsageMemberRow>()
  const toUsage = (member: AxClientUsageMemberRow): AxMemberServiceRow['usage'] => ({
    plan: member.plan,
    totalTokens: member.totalTokens,
    sessions: member.sessions,
    limitUsedPercent: member.limitUsedPercent,
    limitResetsAt: member.limitResetsAt,
    lastReportedAt: member.lastReportedAt,
  })

  const rows: AxMemberServiceRow[] = subscriptions.map((sub) => {
    const owner = sub.ownerName?.trim() ?? ''
    const client = CLIENT_BY_VENDOR[sub.vendor] ?? null
    const shared = owner.startsWith('공용')
    const member = client && owner && !shared
      ? usageMembers.find((candidate) => !used.has(candidate) && candidate.client === client && samePerson(owner, candidate.memberName))
      : undefined
    if (member) used.add(member)
    const renewal = renewals.find((row) =>
      row.ownerName === owner && row.vendor === sub.vendor && row.plan === sub.plan && row.renewalDay === sub.renewalDay
    )
    const cycle = sub.renewalDay !== null && sub.billingCycle === 'monthly' ? renewalCycle(sub.renewalDay, now) : null

    return {
      name: member?.memberName ?? (owner || '미지정'),
      service: client ? CLIENT_LABELS[client] : sub.vendor,
      subscription: {
        vendor: sub.vendor,
        plan: sub.plan,
        amount: sub.amount,
        currency: sub.currency,
        payer: sub.payer,
        shared,
        nextRenewal: cycle ? kstDateKey(cycle.next) : null,
        daysLeft: cycle ? daysUntil(cycle.next, now) : null,
      },
      cycleWeeks: renewal?.weeks ?? [],
      cycleAveragePercent: renewal?.averagePercent ?? null,
      usage: member ? toUsage(member) : null,
    }
  })

  for (const member of usageMembers) {
    if (used.has(member)) continue
    rows.push({
      name: member.memberName,
      service: CLIENT_LABELS[member.client],
      subscription: null,
      cycleWeeks: [],
      cycleAveragePercent: null,
      usage: toUsage(member),
    })
  }

  const order = (row: AxMemberServiceRow) => row.subscription?.daysLeft ?? Number.POSITIVE_INFINITY
  return rows.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name, 'ko') || a.service.localeCompare(b.service))
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
    return await db
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
  } catch (err) {
    log.warn('주간 한도 회차 테이블을 읽지 못해 하루 단위 보고만 씁니다', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/**
 * 구독 갱신 결정표를 읽는다. 개인 식별 데이터라 관리자 경로에서만 부른다.
 *
 * @returns 실패하면 null — 호출하는 쪽이 사용량 화면 전체를 막지 않게 한다
 */
export async function loadRenewalData(): Promise<AxSubscriptionRenewalData | null> {
  try {
    const now = new Date()
    const since = new Date(now.getTime() - 40 * DAY_MS)
    const [subscriptions, usage, windows] = await Promise.all([
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
      loadLimitWindows(since),
    ])
    return { rows: buildRenewalRows(subscriptions, [...usage, ...windows], now) }
  } catch (err) {
    log.error('구독 갱신 데이터 조회 실패', err)
    return null
  }
}
