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
 * 사람 구독은 로스터 이름과 계정 표시명을 괄호 별칭까지 같은 사람으로 본다(`박수오` = `박수오 (소파)`, `타타` = `조효희 (타타)`).
 * 봇이 쓰는 공용·서포트 구독은 사람에게 묶이지 않아 계정 키(가입 이메일 해시)로 `ax_account_limit_windows` 회차를 잇는다.
 * 계정 키가 없는 공용·서포트 구독은 뺀다.
 */

import { db, axAccountLimitWindows, axClientUsage, axSubscriptions, axUsageLimitWindows } from '@gpters/db'
import { and, eq, gte, isNotNull, sql } from 'drizzle-orm'
import type {
  AxClientUsageMemberRow,
  AxMemberServiceRow,
  AxRenewalRow,
  AxSubscriptionMemberRow,
  AxSubscriptionRenewalData,
  AxUsageClient,
} from './types'
import { KST_OFFSET_MS, kstDateKey, startOfKstDay } from './kst'
import { samePerson } from './types'
import { createLogger } from '../../core/logger'

const log = createLogger('ax-subscription-renewals')

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
/** 주간 한도 회차 길이 (Codex window_minutes 10080, Claude seven_day) */
const WEEK_MS = 7 * DAY_MS
/** 예정보다 이만큼 넘게 일찍 끝나야 조기 초기화로 본다 — 초기화 시각 흔들림·나란한 회차와 가른다 */
const EARLY_RESET_MIN_MS = 6 * HOUR_MS
/** 평균에 넣을 회차 값의 상한(%) — 7일 환산이 100% 를 넘어도 평균에는 한도(100%)만큼만 */
export const AVERAGE_CAP_PERCENT = 100
/** 초기화 시각 이동으로 합칠 때 뒤 회차 최댓값이 앞 회차보다 이만큼(%p) 낮아도 이어진 것으로 본다 — 보고 반올림 흔들림 */
const SHIFT_CONTINUITY_TOLERANCE = 2
/**
 * 앞 회차가 이 값(%) 이상일 때만 합친다. 낮은 값은 "이어짐"과 "초기화 뒤 다시 오름"(10% → 0 → 8%)을 최댓값만으로 가를 수 없다.
 * 부풀림 문제는 높은 값에서만 생기고(2.6일에 94% → 251%), 낮은 값은 조기 초기화로 읽혀도 환산값이 작다(10% → 27%).
 * 이 위에서 잘못 합쳐도 두 값이 2%p 안이라 평균·진행 중 사용률이 거의 같다
 */
const SHIFT_MIN_PERCENT = 50
/** `recentWeeks` 에 싣는 기간 — 뽀밋이 저사용 알림이 며칠 밀려도 따라잡을 만큼 */
const RECENT_WEEKS_DAYS = 8

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

/** 사람이 아니라 봇·팀이 쓰는 구독 — 로스터 이름이 `공용(…)`·`서포트` 로 시작하거나 비었다 (뽀밋이 isSharedAccount 와 같다) */
export const isSharedOwner = (owner: string | null | undefined): boolean => /^(공용|서포트)/.test(owner?.trim() ?? '') || !owner?.trim()

/** 계산에 필요한 구독 필드 */
export interface RenewalSubscriptionInput {
  ownerName: string | null
  vendor: string
  plan: string
  amount: number | string
  currency: string
  renewalDay: number | null
  billingCycle: 'monthly' | 'yearly'
  /** 공용·서포트 구독의 계정 키 (0047). 있으면 이름 대신 이 키로 봇 회차를 잇는다 */
  accountKey?: string | null
}

/** 계산에 필요한 사용량 보고 필드 */
export interface RenewalUsageInput {
  /** 사람 보고의 이름. 계정 회차(`accountKey`)면 빈 문자열 */
  memberName: string
  /** 봇 수집기가 잰 계정 회차의 계정 키 (`ax_account_limit_windows`) */
  accountKey?: string
  /** 그 계정 회차를 보고한 봇 */
  agentIds?: string[]
  client: AxUsageClient
  limitUsedPercent: number | string | null
  limitResetsAt: Date | null
  /** 이 값을 보고받은 시각 (회차 테이블은 최댓값을 마지막으로 확인한 시각) */
  syncedAt: Date
  /** 값과 무관하게 이 회차를 마지막으로 받은 시각. 없으면 syncedAt (하루 단위 행) */
  seenAt?: Date
  /** 이 회차를 처음 받은 시각 (회차 테이블). 없으면 syncedAt */
  firstSeenAt?: Date
  /**
   * 이 회차를 처음 받을 때의 사용률 (회차 테이블, 0048). 0048 전 행은 null(모름).
   * 하루 단위 행은 이 필드가 없고(undefined) 그 행의 사용률이 곧 그 시각의 관측이다
   */
  firstUsedPercent?: number | string | null
}

/** 초기화 전에 받은 보고 한 건 */
type Report = { resetsAt: Date; usedPercent: number; reportedAt: Date; seenAt: Date; firstSeenAt: Date; firstPercent: number | null }

/**
 * 한 회차. reportedAt 은 최댓값을 보고한 시각, lastSeenAt 은 가장 늦은 보고 시각(진행 중 회차 고르기용),
 * endedAt 은 실제로 끝난 시각 — 보통 resetsAt, 벤더가 일찍 초기화했으면 다음 회차가 시작된 시각
 */
type Window = { resetsAt: Date; firstResetsAt: Date; startedAt: Date; usedPercent: number; reportedAt: Date; firstSeenAt: Date; lastSeenAt: Date; endedAt: Date; firstPercent: number | null }

// 화면(클라이언트)도 같은 규칙으로 사람을 잇는다 — DB 를 부르지 않는 types.ts 에 둔다
export { personNameKeys, samePerson } from './types'

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
function clusterWindows(reports: Report[], mergeShifts = false): Window[] {
  const sorted = [...reports].sort((a, b) => a.resetsAt.getTime() - b.resetsAt.getTime())
  const windows: Window[] = []
  for (const item of sorted) {
    const last = windows[windows.length - 1]
    if (last && item.resetsAt.getTime() - last.resetsAt.getTime() <= HOUR_MS) {
      last.resetsAt = item.resetsAt
      if (item.seenAt > last.lastSeenAt) last.lastSeenAt = item.seenAt
      // 첫 관측 값은 가장 이른 관측의 것 — 그 관측의 값을 모르면(0048 전) 모른다
      if (item.firstSeenAt < last.firstSeenAt) {
        last.firstSeenAt = item.firstSeenAt
        last.firstPercent = item.firstPercent
      }
      // 보고 시각은 최댓값을 보고한 행의 것만 쓴다 — 낮은 옛 스냅샷의 늦은 시각을 붙이면
      // 최댓값을 더 늦게 확인한 것처럼 보인다
      if (item.usedPercent > last.usedPercent) {
        last.usedPercent = item.usedPercent
        last.reportedAt = item.reportedAt
      } else if (item.usedPercent === last.usedPercent && item.reportedAt > last.reportedAt) {
        last.reportedAt = item.reportedAt
      }
    } else {
      windows.push({ resetsAt: item.resetsAt, firstResetsAt: item.resetsAt, startedAt: new Date(item.resetsAt.getTime() - WEEK_MS), usedPercent: item.usedPercent, reportedAt: item.reportedAt, firstSeenAt: item.firstSeenAt, lastSeenAt: item.seenAt, endedAt: item.resetsAt, firstPercent: item.firstPercent })
    }
  }
  // 묶는 동안 대표 초기화 시각이 늦춰졌을 수 있어 끝난 시각을 다시 맞춘다
  for (const window of windows) window.endedAt = window.resetsAt
  return markEarlyResets(mergeShifts ? mergeShiftedResets(windows) : windows)
}

/**
 * 초기화 시각만 뒤로 옮겨 간 회차를 하나로 합친다 (사용률은 이어지는데 예정 초기화가 바뀐 경우).
 *
 * 2026-10-23 한가경 Claude 실측: 10/27 01:00 회차가 94% 인 채 10/22 15:53 에 끊기고, 10/22 16:05 부터 10/28 02:00 회차가
 * 95% 로 이어졌다. 0 으로 떨어지지 않았으니 초기화가 아니다(초기화 시각 이동 또는 계정 전환). 조기 초기화로 읽으면
 * "2.6일 만에 94%" → 7일 환산 251% 가 된다.
 *
 * 진짜 초기화(Codex 조기 초기화 포함)는 그 순간 새 7일 회차를 연다 — 다음 회차의 계산상 시작(다음 초기화 − 7일)이
 * 앞 회차의 마지막 보고 무렵이다. 다음 회차가 그보다 6시간 넘게 먼저 "시작"한 셈이면 앞 회차와 겹친다 — 같은 사용량이
 * 이어진 것이다. 세 조건이 모두 맞을 때만 합친다:
 * - 앞 회차가 예정 초기화보다 6시간 넘게 일찍 끊겼다 (예정대로 끝난 회차는 건드리지 않는다)
 * - 다음 회차의 계산상 시작이 앞 회차 마지막 보고보다 6시간 넘게 이르다
 * - 앞 회차 마지막 보고 뒤에 다음 회차를 처음 받았다 (나란히 보고되는 두 계정은 합치지 않는다)
 * - 다음 회차를 앞 회차의 예정 초기화 전에 이미 받았다 (예정 뒤에 처음 받았으면 앞 회차는 마지막 며칠 안 썼을 뿐 예정대로 끝났다)
 * - 앞 회차가 50% 이상이고, 다음 회차가 앞 회차 최댓값 근처(2%p)에서 시작했다 — 사용률이 이어졌다.
 *   시작 값은 회차의 첫 관측 값(0048)으로 본다. 그 전 기록처럼 첫 값을 모르면 최댓값으로 대신 본다
 *
 * Claude 에만 쓴다 — Codex 는 벤더가 실제로 일찍 초기화하고 초기화 시각이 겹쳐 보이는 회차가 많다(하영 Codex 10/11:
 * 75% 회차 뒤 21% 회차). 그런 진짜 초기화를 합치면 조기 초기화 회차를 잃는다.
 * 합친 회차는 뒤 회차의 초기화 시각을 쓰고 사용률은 둘 중 큰 값이다. 시작은 앞 회차 기준을 이어받는다 — 뒤 회차 기준
 * (뒤 초기화 − 7일)으로 두면 나중에 실제로 일찍 초기화될 때 기간이 짧게 잡혀 7일 환산이 다시 부푼다.
 *
 * @param windows - 초기화 시각 순으로 정렬된 회차
 */
function mergeShiftedResets(windows: Window[]): Window[] {
  const merged: Window[] = []
  for (const window of windows) {
    const previous = merged[merged.length - 1]
    const shifted = previous
      && previous.lastSeenAt.getTime() < previous.resetsAt.getTime() - EARLY_RESET_MIN_MS
      && window.firstResetsAt.getTime() - WEEK_MS < previous.lastSeenAt.getTime() - EARLY_RESET_MIN_MS
      && previous.lastSeenAt.getTime() <= window.firstSeenAt.getTime()
      && window.firstSeenAt.getTime() < previous.resetsAt.getTime() - EARLY_RESET_MIN_MS
      // 사용률이 이어졌다 — 뒤 회차가 앞 회차 최댓값 근처(2%p)에서 시작했다. 첫 관측 값(0048)이 있으면 그것으로 직접 보고,
      // 없으면(0048 전 기록) 최댓값으로 대신 본다 — 진짜 초기화면 0 에서 다시 시작해 겹친 구간 안에 앞 값까지 오르기 어렵다
      && previous.usedPercent >= SHIFT_MIN_PERCENT
      && (window.firstPercent ?? window.usedPercent) >= previous.usedPercent - SHIFT_CONTINUITY_TOLERANCE
    if (!shifted) {
      merged.push(window)
      continue
    }
    // 뒤 회차가 이어받는다 — 처음 받은 시각·시작 근거(첫 초기화 시각)는 앞 회차 것, 최댓값과 그 보고 시각은 둘 중 큰 쪽
    window.firstSeenAt = previous.firstSeenAt
    window.firstPercent = previous.firstPercent
    window.firstResetsAt = previous.firstResetsAt
    window.startedAt = previous.startedAt
    if (previous.usedPercent > window.usedPercent) {
      window.usedPercent = previous.usedPercent
      window.reportedAt = previous.reportedAt
    }
    merged[merged.length - 1] = window
  }
  return merged
}

/**
 * 회차 사용률을 7일 기준으로 환산한다 — 사용률 ÷ 회차가 실제로 이어진 일수 × 7 (추정).
 *
 * 조기 초기화 회차는 7일을 못 채워 실측이 낮다(2026-10 하영 Codex: 회차마다 30~95% 인데 7일 환산 평균 약 138%).
 * 분모는 마지막 관측이 아니라 회차가 실제로 이어진 기간이다 — 1.2일에 75% 까지 쓰고 쉬었다가 4.1일에 초기화된
 * 회차를 1.2일로 나누면 448% 로 부푼다. 1일 미만 회차는 흔들림이 커서 환산하지 않는다(null).
 * 7일을 채운 회차는 실측 그대로다. 회차 값은 100% 를 넘어도 자르지 않는다 — "이 속도면 한도에 걸린다"는 신호다.
 * 다만 평균(averagePercent)에는 100% 로 잘라 넣는다 — 조기 초기화 회차 하나(2.6일에 94% → 251%)가 사람·서비스
 * 평균을 한도 위로 끌어올리지 않게(2026-10-23 하영 결정). 한도 이상은 다 「한도에 걸림」이라 그 너머 크기는 판정에 쓰지 않는다.
 * 흔들림으로 7일을 몇 초 넘긴 회차도 실측 그대로다.
 */
function projectWeek(week: Window): number | null {
  const days = (week.endedAt.getTime() - week.startedAt.getTime()) / DAY_MS
  if (days < 1) return null
  // 반올림하지 않는다 — 봇이 20%·25% 이하를 판정하는데 20.04 를 20.0 으로 만들면 기준을 넘은 회차를 알린다. 표시에서 반올림
  return days >= 7 ? week.usedPercent : (week.usedPercent / days) * 7
}

/**
 * 벤더가 회차를 일찍 초기화한 경우를 찾아 실제로 끝난 시각을 적는다.
 *
 * 조기 초기화는 회차 기간(7일)을 바꾸지 않는다 — 그 시각에 새 7일 회차가 시작될 뿐이다(2026-10-20 Codex 실측:
 * 15:35 에 42% → 0%, 초기화 예정이 10/26 08:58 → 10/27 15:35). 그래서 다음 회차의 시작은 그 초기화 시각 − 7일이다.
 * 다음 회차를 이 회차 예정 초기화보다 6시간 넘게 일찍 실제로 받았고, 그 뒤로 이 회차 보고가 오지 않았으면
 * 그때 끝난 것이다. 뒤 조건은 한 사람에게 두 회차가 나란히 보고되는 경우(계정 둘, 2시간 간격)와
 * 새 회차가 시작된 뒤에도 꺼져 있던 머신이 옛 회차를 보내는 경우를 조기 초기화로 읽지 않으려는 것이다.
 *
 * @param windows - 초기화 시각 순으로 정렬된 회차
 */
function markEarlyResets(windows: Window[]): Window[] {
  for (let i = 0; i < windows.length - 1; i++) {
    const window = windows[i]
    const next = windows[i + 1]
    // 끝난 시각은 이 회차를 마지막으로 받은 시각보다 이르지 않다 — Claude 는 "다음 초기화 − 7일" 이 실제 시작과
    // 어긋난 회차가 있다(10/15 04:00 예정 회차를 10/15 01:34 까지 받았는데 다음 회차 계산 시작은 10/13 01:00)
    // 다음 회차의 시작도 묶인 초기화 시각 중 가장 이른 것 기준(이 회차 시작과 같은 기준 — 흔들림이 경계를 옮기지 않게)
    const endedAt = Math.max(next.firstResetsAt.getTime() - WEEK_MS, window.lastSeenAt.getTime())
    // 새 회차를 예정보다 일찍 실제로 받았어야 한다 — 마지막 날 쓰지 않은 것만으로는 조기 초기화가 아니다.
    // 새 회차를 받은 뒤로 이 회차 보고가 하나라도 오면 나란한 회차(계정 둘)다
    const early = endedAt < window.resetsAt.getTime() - EARLY_RESET_MIN_MS
      && endedAt > window.resetsAt.getTime() - WEEK_MS
      && next.firstSeenAt.getTime() < window.resetsAt.getTime() - EARLY_RESET_MIN_MS
      && window.lastSeenAt.getTime() <= next.firstSeenAt.getTime()
    if (early) window.endedAt = new Date(endedAt)
  }
  // 회차 시작 = 묶인 초기화 시각 중 가장 이른 것 − 7일(몇 초 흔들림이 기간을 줄여 1일 경계에서 빠지지 않게).
  // 다만 앞 회차가 그보다 6시간 넘게 늦게 끝났으면 그때부터다 — Claude 는 회차가 7일이 아닐 때가 있어
  // "초기화 − 7일" 이 실제 시작보다 며칠 이를 수 있다. 6시간 안쪽은 나란한 회차(계정 둘, 2시간 간격)라 무시한다
  for (let i = 0; i < windows.length; i++) {
    const window = windows[i]
    const computed = window.firstResetsAt.getTime() - WEEK_MS
    const previousEnd = i > 0 ? windows[i - 1].endedAt.getTime() : Number.NEGATIVE_INFINITY
    // 앞 회차가 끝나기 6시간 넘게 전부터 이 회차를 받고 있었으면 두 회차가 겹친 것(계정 둘) — 옮기지 않는다
    const later = previousEnd > computed + EARLY_RESET_MIN_MS && previousEnd < window.firstResetsAt.getTime() - EARLY_RESET_MIN_MS
      && window.firstSeenAt.getTime() >= previousEnd - EARLY_RESET_MIN_MS
    window.startedAt = new Date(later ? previousEnd : computed)
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
  // (이름 또는 계정 키, 클라이언트) 별로 초기화 전에 받은 보고만 모은다
  const byOwner = new Map<string, { name: string; accountKey?: string; client: AxUsageClient; reports: Report[]; agentIds: Set<string> }>()
  for (const row of usage) {
    if (!row.limitResetsAt || row.limitUsedPercent === null || row.syncedAt >= row.limitResetsAt) continue
    const usedPercent = Number(row.limitUsedPercent)
    if (!Number.isFinite(usedPercent)) continue
    const name = row.memberName.trim()
    const key = `${row.accountKey ? `key:${row.accountKey}` : name}\u0000${row.client}`
    const entry = byOwner.get(key) ?? { name, accountKey: row.accountKey, client: row.client, reports: [], agentIds: new Set<string>() }
    for (const agentId of row.agentIds ?? []) entry.agentIds.add(agentId)
    // 하루 단위 행은 그 시각의 관측이라 사용률이 곧 첫 관측 값 후보다. 회차 행은 0048 컬럼(없으면 모름)
    const firstPercent = row.firstUsedPercent === undefined ? usedPercent : row.firstUsedPercent === null ? null : Number(row.firstUsedPercent)
    entry.reports.push({ resetsAt: row.limitResetsAt, usedPercent, reportedAt: row.syncedAt, seenAt: row.seenAt ?? row.syncedAt, firstSeenAt: row.firstSeenAt ?? row.syncedAt, firstPercent: Number.isFinite(firstPercent) ? firstPercent : null })
    byOwner.set(key, entry)
  }

  const rows: AxRenewalRow[] = []
  for (const sub of subscriptions) {
    const owner = sub.ownerName?.trim()
    const client = CLIENT_BY_VENDOR[sub.vendor]
    const accountKey = sub.accountKey ?? null
    const shared = isSharedOwner(owner)
    if (!owner || (shared && !accountKey) || !client || sub.renewalDay === null || sub.billingCycle !== 'monthly') continue

    const { previous, next } = renewalCycle(sub.renewalDay, now)
    // 공용·서포트는 계정 키로, 사람은 계정 표시명과 로스터 이름이 다를 수 있어 별칭까지 맞는 보고를 모두 모은다
    const entries = [...byOwner.values()].filter((entry) => entry.client === client && (shared
      ? entry.accountKey === accountKey
      : !entry.accountKey && samePerson(owner, entry.name)))
    // 초기화 시각만 옮겨 간 회차 합치기는 Claude 만 — Codex 는 실제 조기 초기화가 많다
    const mine = clusterWindows(entries.flatMap((entry) => entry.reports), client === 'claude-code')

    const toWeek = (week: Window) => ({
      resetsAt: week.resetsAt.toISOString(),
      startedAt: week.startedAt.toISOString(),
      endedAt: week.endedAt.toISOString(),
      usedPercent: week.usedPercent,
      projectedPercent: projectWeek(week),
      reportedAt: week.reportedAt.toISOString(),
    })
    // 회차가 끝난 시점은 실제로 끝난 시각(조기 초기화면 그때)으로 센다
    const weeks = mine.filter((week) => week.endedAt >= previous && week.endedAt <= now).map(toWeek)
    // 결제일이 막 지나 weeks 에서 빠진 회차도 저사용 알림이 놓치지 않게 결제 주기와 무관하게 따로 싣는다
    const recentWeeks = mine
      .filter((week) => week.endedAt <= now && week.endedAt.getTime() >= now.getTime() - RECENT_WEEKS_DAYS * DAY_MS)
      .map(toWeek)
    // 조기 초기화 회차도 7일 환산값으로 평균에 넣되 100% 로 자른다. 1일 미만 회차는 환산하지 않아 빠진다
    const projected = weeks
      .map((week) => week.projectedPercent)
      .filter((value): value is number => value !== null)
      .map((value) => Math.min(value, AVERAGE_CAP_PERCENT))
    // 아직 끝나지 않은 회차가 둘 이상이면 가장 최근에 보고된 쪽이 진행 중이다.
    // 꺼져 있던 머신이 끝난 회차의 옛 스냅샷을 더 늦게 보내면 그 회차를 고를 수 있다 — 드문 경우라 그대로 둔다
    const current = mine
      .filter((week) => week.endedAt > now)
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
      averagePercent: projected.length > 0
        ? Math.round((projected.reduce((sum, value) => sum + value, 0) / projected.length) * 10) / 10
        : null,
      currentPercent: current?.usedPercent ?? null,
      currentResetsAt: current?.resetsAt.toISOString() ?? null,
      recentWeeks,
      shared,
      agentIds: [...new Set(entries.flatMap((entry) => [...entry.agentIds]))].sort(),
      lastSeenAt: mine.reduce<Date | null>((latest, week) => (!latest || week.lastSeenAt > latest ? week.lastSeenAt : latest), null)?.toISOString() ?? null,
    })
  }

  return rows.sort((a, b) => a.daysLeft - b.daysLeft || a.ownerName.localeCompare(b.ownerName, 'ko'))
}

/**
 * 서비스(클라이언트)별로 사람 구독의 주기 평균을 다시 평균한다 (DB 없이 테스트하는 순수 함수)
 *
 * 주기 평균이 아직 없는 구독(완료 회차 없음)과 봇이 쓰는 공용·서포트 구독은 빼고, 사람마다 같은 무게로 센다.
 * 한 사람이 같은 서비스 구독을 둘 가지면(결제일이 다르면 값도 다르다) 그 사람 안에서 먼저 평균한다.
 *
 * @param renewals - 갱신 결정표
 * @returns 클라이언트 → 평균(소수 첫째 자리). 값이 하나도 없는 클라이언트는 키가 없다
 */
export function averageCycleByClient(renewals: AxRenewalRow[]): Partial<Record<AxUsageClient, number>> {
  const mean = (list: number[]) => list.reduce((sum, value) => sum + value, 0) / list.length
  const byPerson = new Map<string, { client: AxUsageClient; values: number[] }>()
  for (const row of renewals) {
    const client = CLIENT_BY_VENDOR[row.vendor]
    if (!client || row.averagePercent === null || row.shared) continue
    const key = `${row.ownerName}\u0000${client}`
    byPerson.set(key, { client, values: [...(byPerson.get(key)?.values ?? []), row.averagePercent] })
  }
  const values = new Map<AxUsageClient, number[]>()
  for (const person of byPerson.values()) values.set(person.client, [...(values.get(person.client) ?? []), mean(person.values)])
  return Object.fromEntries([...values].map(([client, list]) => [client, Math.round(mean(list) * 10) / 10]))
}

/**
 * 사용 보고가 이 구독(사람 구독)의 사용인지 — 서비스가 같고 소유자가 같은 사람이면 짝이다.
 * 공용·서포트 구독에는 사람 보고를 붙이지 않는다(봇 수집기가 계정으로 잰다).
 * 구성원 × 구독 표와 서비스별 사용량 합계가 같은 규칙을 쓴다(EDU-11817).
 */
export function usageMatchesSubscription(
  sub: Pick<AxSubscriptionMemberRow, 'ownerName' | 'vendor'>,
  member: Pick<AxClientUsageMemberRow, 'client' | 'memberName'>
): boolean {
  const owner = sub.ownerName?.trim() ?? ''
  return !isSharedOwner(owner) && CLIENT_BY_VENDOR[sub.vendor] === member.client && samePerson(owner, member.memberName)
}

/** 같은 계정으로 볼 초기화 시각 차이 — Codex 일괄 조기 초기화로 다른 계정끼리도 수십 초 안에 몰린다 */
const SAME_ACCOUNT_RESET_MS = 5_000

/**
 * 이름으로 구독에 짝지어지지 않은 개인 Codex 보고가 공용·서포트 계정의 사용인지 —
 * 초기화 시각이 그 계정의 진행 중인 회차와 몇 초 안이면 같은 계정이다(같은 계정이면 초 단위까지 같다).
 * Claude 는 정시에 초기화돼 다른 계정끼리도 겹치므로 판정하지 않는다(EDU-11817).
 * ponytail: 시각 근접 판정이라 일괄 초기화 직후 다른 계정이 몇 초 안에 겹치면 잘못 붙는다 — 개인 보고에 계정 키를 싣게 되면 그것으로 바꾼다
 */
export function onSharedAccount(
  report: { client: string; limitResetsAt: Date | string | null },
  sharedCodexResets: string[]
): boolean {
  if (report.client !== 'codex' || !report.limitResetsAt) return false
  const at = new Date(report.limitResetsAt).getTime()
  return sharedCodexResets.some((resetsAt) => Math.abs(new Date(resetsAt).getTime() - at) <= SAME_ACCOUNT_RESET_MS)
}

/**
 * 활성 공용·서포트 구독 계정의 진행 중인 Codex 회차 초기화 시각 — 결제일·결제 주기와 무관하게 계정 키만 본다.
 * 계정마다 가장 최근에 관측된 회차 하나다 — 조기 초기화로 끝난 회차도 예정 초기화 시각은 미래라 그것만으로는 못 가른다
 *
 * @param subscriptions - 활성 구독 행
 * @param accountWindows - 봇 수집기가 잰 계정 회차
 */
export function sharedCodexResets(
  subscriptions: { ownerName: string | null; vendor: string; accountKey?: string | null }[],
  accountWindows: Pick<RenewalUsageInput, 'accountKey' | 'client' | 'limitResetsAt' | 'syncedAt' | 'seenAt'>[],
  now: Date
): string[] {
  const keys = new Set(subscriptions
    .filter((sub) => isSharedOwner(sub.ownerName) && sub.accountKey && CLIENT_BY_VENDOR[sub.vendor] === 'codex')
    .map((sub) => sub.accountKey))
  const latest = new Map<string, { resetsAt: Date; seenAt: Date }>()
  for (const window of accountWindows) {
    if (window.client !== 'codex' || !window.accountKey || !keys.has(window.accountKey) || !window.limitResetsAt || window.limitResetsAt <= now) continue
    const seenAt = window.seenAt ?? window.syncedAt
    const known = latest.get(window.accountKey)
    if (!known || seenAt > known.seenAt) latest.set(window.accountKey, { resetsAt: window.limitResetsAt, seenAt })
  }
  return [...latest.values()].map((window) => window.resetsAt.toISOString())
}

/**
 * 구성원 × 서비스 한 줄 표를 만든다 (DB 없이 테스트하는 순수 함수)
 *
 * 구독 한 건마다 한 줄을 만들고 같은 사람·같은 클라이언트의 사용 보고를 붙인다.
 * 어느 구독에도 붙지 않은 사용 보고는 "구독 없음" 줄로 남긴다(개인 결제 등). 화면은 이 줄을 그리지 않고 수만 센다.
 *
 * @param usageMembers - 클라이언트 패널의 팀원별 최신 사용량
 * @param subscriptions - 활성 구독 전체 (공용·연간 포함)
 * @param renewals - 갱신 결정표 (사람 구독과 계정 키가 있는 공용 구독)
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
    // 이름 없는 구독은 import 가 공용으로 다루므로 같이 본다
    const shared = isSharedOwner(owner)
    // 공용·서포트는 계정 키가 있으면 봇 수집기 회차로 판정한다
    const trackable = client !== null && (!shared || sub.hasAccountKey)
    // 같은 사람의 보고가 여럿이면(옛 이름 행 + 인증 계정 행) 가장 최근 것을 붙인다 — 입력은 토큰 순이라 첫 매칭이 최신이 아니다.
    // 나머지도 이 구독의 것으로 소비한다. 남겨 두면 "구독 없이 사용" 줄이 거짓으로 생긴다
    const candidates = trackable && !shared
      ? usageMembers.filter((candidate) => !used.has(candidate) && usageMatchesSubscription(sub, candidate))
      : []
    const member = candidates.reduce<AxClientUsageMemberRow | undefined>(
      (latest, candidate) => (!latest || (candidate.lastReportedAt ?? '') > (latest.lastReportedAt ?? '') ? candidate : latest),
      undefined
    )
    for (const candidate of candidates) used.add(candidate)
    const renewal = renewals.find((row) =>
      row.ownerName === owner && row.vendor === sub.vendor && row.plan === sub.plan && row.renewalDay === sub.renewalDay
    )
    const cycle = sub.renewalDay !== null && sub.billingCycle === 'monthly' ? renewalCycle(sub.renewalDay, now) : null

    return {
      name: member?.memberName ?? (owner || '미지정'),
      service: client ? CLIENT_LABELS[client] : sub.vendor,
      trackable,
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
      // 봇 수집기가 잰 계정 회차 — 사람 줄은 사용 보고(usage)가 같은 역할을 한다
      account: shared && trackable
        ? { agentIds: renewal?.agentIds ?? [], currentPercent: renewal?.currentPercent ?? null, currentResetsAt: renewal?.currentResetsAt ?? null, lastSeenAt: renewal?.lastSeenAt ?? null }
        : null,
    }
  })

  for (const member of usageMembers) {
    if (used.has(member)) continue
    rows.push({
      name: member.memberName,
      service: CLIENT_LABELS[member.client],
      trackable: true,
      subscription: null,
      cycleWeeks: [],
      cycleAveragePercent: null,
      usage: toUsage(member),
      account: null,
    })
  }

  // 사용 보고가 없는 줄은 로스터 이름(`박수오`)이라, 같은 사람의 다른 줄이 쓰는 계정 표시명(`박수오 (소파)`)으로 맞춘다
  for (const row of rows) {
    if (row.usage || row.subscription?.shared) continue
    const sibling = rows.find((other) => other.usage && samePerson(other.name, row.name))
    if (sibling) row.name = sibling.name
  }

  const order = (row: AxMemberServiceRow) => row.subscription?.daysLeft ?? Number.POSITIVE_INFINITY
  return rows.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name, 'ko') || a.service.localeCompare(b.service))
}

/**
 * 회차 기록(0045)을 시작한 뒤의 하루 단위 행은 뺀다.
 *
 * 그 뒤의 보고는 모두 회차 기록에도 남는다. 그런데 하루 단위 행의 한도는 서버가 진행 중 회차 최댓값으로 채우고
 * (`carryLimit`) 보고 시각은 채운 시각이라, 섞으면 이틀 전에 관측한 값이 "1시간 전까지 잡힌 값"처럼 보여
 * 「끝 무렵 미수집」 경고가 사라진다. 회차 기록의 마지막 보고 시각은 최댓값을 실제로 다시 본 보고에서만 움직인다.
 * 그 전 회차는 하루 단위 행이 유일한 근거라 남긴다.
 *
 * ponytail: 회차 기록 쓰기만 실패한 보고는 하루 단위 행에만 남아 빠진다(recordLimitWindows 가 실패를 삼킨다).
 * 실패 로그가 보이면 그 회차를 하루 단위 행으로 보완한다.
 *
 * @param usage - 하루 단위 행
 * @param windows - 회차 기록 (firstReportedAt 이 가장 이른 것이 기록 시작 시각)
 */
export function dailyRowsBeforeWindows<T extends { syncedAt: Date }>(usage: T[], windows: Array<{ firstReportedAt: Date }>): T[] {
  if (windows.length === 0) return usage
  const since = Math.min(...windows.map((w) => w.firstReportedAt.getTime()))
  return usage.filter((row) => row.syncedAt.getTime() < since)
}

/**
 * 회차별 최댓값 테이블(0045)을 사용량 보고 행 모양으로 읽는다.
 *
 * `ax_client_usage` 의 하루 단위 행은 같은 날 초기화되면 직전 값을 잃으므로 이 테이블이 보완한다.
 * 0045 가 적용되기 전이면 비어 있는 것으로 보고 기존 행만으로 계산한다.
 *
 * @param since - 이 시각 이후에 초기화되는 회차만
 */
async function loadLimitWindows(since: Date): Promise<Array<RenewalUsageInput & { firstReportedAt: Date }>> {
  try {
    return await db
      .select({
        memberName: axUsageLimitWindows.memberName,
        client: axUsageLimitWindows.client,
        limitUsedPercent: axUsageLimitWindows.maxUsedPercent,
        limitResetsAt: axUsageLimitWindows.resetsAt,
        syncedAt: axUsageLimitWindows.lastReportedAt,
        seenAt: axUsageLimitWindows.lastSeenAt,
        firstReportedAt: axUsageLimitWindows.firstReportedAt,
        firstSeenAt: axUsageLimitWindows.firstReportedAt,
        firstUsedPercent: axUsageLimitWindows.firstUsedPercent,
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
 * 봇 수집기가 잰 계정 회차 테이블(0047)을 사용량 보고 행 모양으로 읽는다.
 *
 * 실패를 삼키지 않는다 — 빈 결과로 두면 공용 행이 「측정 없음」으로 보여 조회 실패와 실제 미측정을 가르지 못한다.
 * 던지면 `loadRenewalData` 가 null 을 돌려 화면이 「조회 실패」로 쓴다(0047 은 운영에 적용돼 있다).
 *
 * @param since - 이 시각 이후에 초기화되는 회차만
 */
function loadAccountLimitWindows(since: Date): Promise<RenewalUsageInput[]> {
  return db
    .select({
      memberName: sql<string>`''`,
      accountKey: axAccountLimitWindows.accountKey,
      agentIds: axAccountLimitWindows.agentIds,
      client: axAccountLimitWindows.client,
      limitUsedPercent: axAccountLimitWindows.maxUsedPercent,
      limitResetsAt: axAccountLimitWindows.resetsAt,
      syncedAt: axAccountLimitWindows.lastReportedAt,
      seenAt: axAccountLimitWindows.lastSeenAt,
      firstSeenAt: axAccountLimitWindows.firstReportedAt,
      firstUsedPercent: axAccountLimitWindows.firstUsedPercent,
    })
    .from(axAccountLimitWindows)
    .where(gte(axAccountLimitWindows.resetsAt, since))
}

/**
 * 구독 갱신 결정표를 읽는다. 개인 식별 데이터라 사람별 행은 관리자에게만 내보낸다(집계값은 모두에게).
 *
 * @returns 실패하면 null — 호출하는 쪽이 사용량 화면 전체를 막지 않게 한다
 */
export async function loadRenewalData(): Promise<AxSubscriptionRenewalData | null> {
  try {
    const now = new Date()
    const since = new Date(now.getTime() - 40 * DAY_MS)
    const [subscriptions, usage, windows, accountWindows] = await Promise.all([
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
      loadAccountLimitWindows(since),
    ])
    return {
      rows: buildRenewalRows(subscriptions, [...dailyRowsBeforeWindows(usage, windows), ...windows, ...accountWindows], now),
      sharedCodexResets: sharedCodexResets(subscriptions, accountWindows, now),
    }
  } catch (err) {
    log.error('구독 갱신 데이터 조회 실패', err)
    return null
  }
}
