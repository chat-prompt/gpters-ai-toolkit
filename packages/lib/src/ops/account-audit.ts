/**
 * 계정 점검 — 조용히 남아 있는 퇴사 계정과 반쪽짜리 정지를 찾는다.
 *
 * 2026-09에 퇴사자 두 명이 8월·4월 이후 로그인이 없는데도 `active`로 남아 있었고, 그중 한 명의
 * 개인 토큰을 에이전트 머신이 물려받아 143건을 그 사람 이름으로 기록했다. 아무도 몰랐던 이유는
 * 단순하다 — 아무 데서도 안 보였다. 앱의 오프보딩(조직 멤버 제거)은 잘 만들어져 있지만
 * 누군가 눌러야 돈다.
 *
 * 여기서 잡는 것 세 가지:
 * - **휴면**: `active`인데 마지막 로그인이 오래됐다. 퇴사인지 그냥 안 쓰는지는 사람이 판단한다 —
 *   그래서 판정이 아니라 **목록**을 낸다. 살아있는 토큰·수집기·소유 스킬 수를 같이 적어
 *   지우면 무엇이 딸려 가는지 보이게 한다.
 * - **반쪽 정지**: `suspended`인데 조직 소속이나 토큰이 살아 있다. 정식 경로를 안 탄 정지다.
 * - **이름 중복**: 같은 이름의 활성 계정이 둘 이상. 이메일을 바꿔 새로 만든 경우 옛 계정이 남는다.
 *
 * 판정은 실측만 쓴다. 로그인 기록이 없는 계정은 "오래됐다"가 아니라 **"기록 없음"**으로 적는다.
 */

import {
  axAgentTelemetryCollectors,
  catalogItems,
  db,
  oauthAccessTokens,
  oauthRefreshTokens,
  orgMemberships,
  skillEvents,
  users,
} from '@gpters/db'
import { and, eq, gt, sql } from 'drizzle-orm'
import { createLogger } from '../core/logger'

const log = createLogger('account-audit')

/** 기본 휴면 기준(일). 분기에 한 번도 안 들어오면 물어볼 만하다 */
export const DEFAULT_DORMANT_DAYS = 90

/** 점검에 필요한 계정 한 줄 — 로더가 모으고 판정기가 읽는다 */
export interface AccountAuditInput {
  userId: string
  name: string | null
  email: string
  role: string
  accountStatus: 'active' | 'suspended'
  /** 마지막 로그인. 한 번도 없으면 null */
  lastLoginAt: Date | null
  createdAt: Date | null
  /** 활성 조직 소속 수 */
  activeMemberships: number
  /** 만료 안 된 활성 access 토큰 수 */
  liveAccessTokens: number
  /** 만료 안 된 활성 refresh 토큰 수 */
  liveRefreshTokens: number
  /** 활성 텔레메트리 수집기 수 */
  activeCollectors: number
  /** 소유한 카탈로그 항목 수 */
  ownedItems: number
  /** 마지막 스킬 이벤트. 없으면 null */
  lastEventAt: Date | null
}

/** 휴면 후보 한 줄 */
export interface DormantAccount {
  userId: string
  name: string | null
  email: string
  role: string
  /** ISO. 로그인 기록이 없으면 null — "오래됐다"와 구분한다 */
  lastLoginAt: string | null
  /**
   * 마지막 활동 — 웹 로그인과 스킬 이벤트 중 최근 것. 둘 다 없으면 null.
   * 웹에 안 들어오고 CLI로만 쓰는 사람은 로그인 기록이 오래돼도 활동 중이다 — 첫 운영 실행에서
   * 그날 스킬을 쓴 사람이 휴면으로 잡힌 적이 있다(로그인 6/1, 이벤트 9/8).
   */
  lastActivityAt: string | null
  /** 마지막 활동 후 지난 일수. 기록이 없으면 null */
  daysSinceActivity: number | null
  liveAccessTokens: number
  activeCollectors: number
  ownedItems: number
  lastEventAt: string | null
}

/** 반쪽 정지 한 줄 — 정지인데 남아 있는 것 */
export interface InconsistentSuspension {
  userId: string
  name: string | null
  email: string
  activeMemberships: number
  liveAccessTokens: number
  liveRefreshTokens: number
}

/** 이름 중복 묶음 */
export interface DuplicateName {
  name: string
  accounts: Array<{ userId: string; email: string; lastLoginAt: string | null; createdAt: string | null }>
}

/** 점검 결과 */
export interface AccountAuditReport {
  checkedAt: string
  dormantDays: number
  /** 점검한 계정 수 (정지 포함) */
  checked: number
  dormant: DormantAccount[]
  inconsistentSuspended: InconsistentSuspension[]
  duplicateNames: DuplicateName[]
}

const DAY_MS = 86_400_000

/**
 * 계정 목록으로 점검 결과를 만든다. DB를 읽지 않는 순수 함수라 테스트가 쉽다.
 *
 * @param inputs - 점검 대상 계정들
 * @param options - `dormantDays` 휴면 기준, `now` 기준 시각
 * @returns 점검 결과
 */
export function buildAccountAuditReport(
  inputs: AccountAuditInput[],
  options: { dormantDays?: number; now?: Date } = {}
): AccountAuditReport {
  const now = options.now ?? new Date()
  const dormantDays = options.dormantDays ?? DEFAULT_DORMANT_DAYS
  const cutoff = now.getTime() - dormantDays * DAY_MS

  const lastActivity = (row: AccountAuditInput): Date | null => {
    const times = [row.lastLoginAt, row.lastEventAt].filter((d): d is Date => d !== null)
    return times.length > 0 ? new Date(Math.max(...times.map((d) => d.getTime()))) : null
  }

  const dormant: DormantAccount[] = inputs
    .filter((row) => row.accountStatus === 'active')
    .map((row) => ({ row, activity: lastActivity(row) }))
    .filter(({ activity }) => activity === null || activity.getTime() < cutoff)
    .map(({ row, activity }) => ({
      userId: row.userId,
      name: row.name,
      email: row.email,
      role: row.role,
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      lastActivityAt: activity?.toISOString() ?? null,
      daysSinceActivity: activity ? Math.floor((now.getTime() - activity.getTime()) / DAY_MS) : null,
      liveAccessTokens: row.liveAccessTokens,
      activeCollectors: row.activeCollectors,
      ownedItems: row.ownedItems,
      lastEventAt: row.lastEventAt?.toISOString() ?? null,
    }))
    // 기록 없음 → 가장 오래된 순. 사람이 위에서부터 보게 한다
    .sort((a, b) => (a.lastActivityAt ?? '').localeCompare(b.lastActivityAt ?? ''))

  const inconsistentSuspended: InconsistentSuspension[] = inputs
    .filter((row) => row.accountStatus === 'suspended')
    .filter((row) => row.activeMemberships > 0 || row.liveAccessTokens > 0 || row.liveRefreshTokens > 0)
    .map((row) => ({
      userId: row.userId,
      name: row.name,
      email: row.email,
      activeMemberships: row.activeMemberships,
      liveAccessTokens: row.liveAccessTokens,
      liveRefreshTokens: row.liveRefreshTokens,
    }))

  const byName = new Map<string, AccountAuditInput[]>()
  for (const row of inputs) {
    if (row.accountStatus !== 'active') continue
    const key = row.name?.trim()
    if (!key) continue
    byName.set(key, [...(byName.get(key) ?? []), row])
  }
  const duplicateNames: DuplicateName[] = [...byName.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([name, rows]) => ({
      name,
      accounts: rows
        .map((row) => ({
          userId: row.userId,
          email: row.email,
          lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
          createdAt: row.createdAt?.toISOString() ?? null,
        }))
        .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
    }))

  return {
    checkedAt: now.toISOString(),
    dormantDays,
    checked: inputs.length,
    dormant,
    inconsistentSuspended,
    duplicateNames,
  }
}

/** user_id별 개수를 Map으로 */
function countMap(rows: Array<{ userId: string | null; count: number }>): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) if (row.userId) map.set(row.userId, Number(row.count))
  return map
}

/**
 * 점검에 필요한 계정 정보를 모은다.
 *
 * 상관 서브쿼리 대신 집계 쿼리 여섯 개를 따로 돌려 JS에서 합친다 — drizzle이 조인 없는 select에서
 * 컬럼 접두를 떼는 탓에 서브쿼리 안의 `users.id`가 자식 테이블 컬럼으로 읽혀 조용히 0이 나온 적이 있다.
 *
 * @returns 모든 계정의 점검 입력
 */
export async function loadAccountAuditInputs(): Promise<AccountAuditInput[]> {
  const now = new Date()
  const [accounts, memberships, accessTokens, refreshTokens, collectors, items, events] = await Promise.all([
    db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        accountStatus: users.accountStatus,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users),
    db
      .select({ userId: orgMemberships.userId, count: sql<number>`count(*)::int` })
      .from(orgMemberships)
      .where(eq(orgMemberships.status, 'active'))
      .groupBy(orgMemberships.userId),
    db
      .select({ userId: oauthAccessTokens.userId, count: sql<number>`count(*)::int` })
      .from(oauthAccessTokens)
      .where(and(eq(oauthAccessTokens.isActive, true), gt(oauthAccessTokens.expiresAt, now)))
      .groupBy(oauthAccessTokens.userId),
    db
      .select({ userId: oauthRefreshTokens.userId, count: sql<number>`count(*)::int` })
      .from(oauthRefreshTokens)
      .where(and(eq(oauthRefreshTokens.isActive, true), gt(oauthRefreshTokens.expiresAt, now)))
      .groupBy(oauthRefreshTokens.userId),
    db
      .select({ userId: axAgentTelemetryCollectors.userId, count: sql<number>`count(*)::int` })
      .from(axAgentTelemetryCollectors)
      .where(eq(axAgentTelemetryCollectors.isActive, true))
      .groupBy(axAgentTelemetryCollectors.userId),
    db
      .select({ userId: catalogItems.authorId, count: sql<number>`count(*)::int` })
      .from(catalogItems)
      .groupBy(catalogItems.authorId),
    db
      .select({ userId: skillEvents.userId, lastAt: sql<string | null>`max(${skillEvents.createdAt})` })
      .from(skillEvents)
      .groupBy(skillEvents.userId),
  ])

  const membershipCount = countMap(memberships)
  const accessCount = countMap(accessTokens)
  const refreshCount = countMap(refreshTokens)
  const collectorCount = countMap(collectors)
  const itemCount = countMap(items)
  const lastEvent = new Map<string, Date>()
  for (const row of events) if (row.userId && row.lastAt) lastEvent.set(row.userId, new Date(row.lastAt))

  return accounts.map((row) => ({
    userId: row.userId,
    name: row.name,
    email: row.email,
    role: row.role,
    accountStatus: row.accountStatus,
    lastLoginAt: row.lastLoginAt ? new Date(row.lastLoginAt) : null,
    createdAt: row.createdAt ? new Date(row.createdAt) : null,
    activeMemberships: membershipCount.get(row.userId) ?? 0,
    liveAccessTokens: accessCount.get(row.userId) ?? 0,
    liveRefreshTokens: refreshCount.get(row.userId) ?? 0,
    activeCollectors: collectorCount.get(row.userId) ?? 0,
    ownedItems: itemCount.get(row.userId) ?? 0,
    lastEventAt: lastEvent.get(row.userId) ?? null,
  }))
}

/**
 * 계정 점검을 실행한다.
 *
 * @param options - `dormantDays` 휴면 기준(일), `now` 기준 시각
 * @returns 점검 결과
 */
export async function checkAccountHygiene(
  options: { dormantDays?: number; now?: Date } = {}
): Promise<AccountAuditReport> {
  const inputs = await loadAccountAuditInputs()
  const report = buildAccountAuditReport(inputs, options)
  log.info('Account audit finished', {
    checked: report.checked,
    dormant: report.dormant.length,
    inconsistent: report.inconsistentSuspended.length,
    duplicates: report.duplicateNames.length,
  })
  return report
}
