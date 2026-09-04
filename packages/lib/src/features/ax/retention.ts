/**
 * AX Dashboard — 반복 사용과 정착률 패널
 *
 * 다른 패널이 "얼마나 쓰였나"를 보여준다면 이 패널은 "다시 돌아오는가"를 본다.
 * 주간 재방문, 신규·재사용자, 스킬별 재사용, 같은 스킬을 며칠에 걸쳐 다시 쓰는지(반복 깊이)를 센다.
 *
 * 정의는 전부 실측이다.
 * - 사용은 명시적 `apply` 보고이며 계정(user_id)이 있는 것만 사람 단위 지표에 넣는다.
 * - 흐름 ID 없는 보고를 시간 근접으로 이어 붙이는 추정 연결은 하지 않는다(#74 → #76 되돌림).
 * - "재사용"은 같은 사용자가 같은 스킬을 **서로 다른 날(UTC) 2일 이상** 적용한 것이다.
 *   흐름(journey·session) 단위로 세지 않는 이유: 운영 적용 보고의 86%가 흐름 ID 없이 온다(2026-09-04, 30일).
 *   같은 날의 반복 보고를 세지 않는 이유: 한 작업이 1초 간격으로 두 번 보고되는 사례가 있어
 *   이벤트 수는 반복 사용을 과대 계산한다.
 * - 하루 경계는 같은 탭의 스킬 사용량 패널과 같은 UTC다.
 *
 * 조직이 12명 규모라 개인을 지목하는 표는 내려보내지 않는다. 사용자 ID는 집계 안에서만 쓰고 버린다.
 */

import { db } from '@gpters/db'
import { sql } from 'drizzle-orm'
import { createLogger } from '../../core/logger'
import { panelOk, panelError } from './panel'
import { num, startOfUtcDay } from './kst'
import type {
  AxPanel,
  AxPanelMeta,
  AxRetentionData,
  AxRetentionSkillRow,
  AxRetentionWeek,
} from './types'

const log = createLogger('ax-retention')

/** 재사용으로 보는 최소 활동 일수 */
const REUSE_MIN_DAYS = 2
/** 재방문 창의 길이(일) */
const WEEK_DAYS = 7
/** 스킬별 재사용 표에 내려보내는 최대 줄 수 */
const SKILL_LIMIT = 15
const DAY_MS = 24 * 60 * 60 * 1000

const meta: AxPanelMeta = {
  id: 'skill-retention',
  title: '반복 사용',
  description: '주간 재방문, 신규·재사용자, 스킬별 재사용과 반복 깊이',
  source: 'aitk DB (skill_events)',
  visibility: 'org',
  parentId: 'skill-usage',
  usesPeriod: true,
}

/** 사용자×스킬 조합 한 줄 — 집계 입력 */
export interface RetentionPairRow {
  skill_id: string
  name: string | null
  user_id: string
  applies: number
  active_days: number
}

/** 사용자가 활동한 7일 창 — 0이 가장 최근 창 */
export interface RetentionWeekRow {
  user_id: string
  week: number
}

/** 사용자의 전 기간 최초 적용 시각 */
export interface RetentionFirstApplyRow {
  user_id: string
  first_applied_at: string | Date
}

/** 집계 입력 묶음 */
export interface RetentionInputs {
  since: Date
  until: Date
  pairs: RetentionPairRow[]
  weeks: RetentionWeekRow[]
  firstApplies: RetentionFirstApplyRow[]
  anonymousApplies: number
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

/**
 * 쿼리 결과를 화면 데이터로 만든다 — SQL과 분리해 두어 규칙을 단위 테스트할 수 있다
 *
 * @param inputs - 조합·주간·최초 적용 행
 * @param days - 조회 기간(일)
 * @returns 반복 사용 패널 데이터
 */
export function buildRetentionData(inputs: RetentionInputs, days: number): AxRetentionData {
  const { since, until, pairs, weeks, firstApplies, anonymousApplies } = inputs

  const firstApplyByUser = new Map<string, number>()
  for (const row of firstApplies) {
    firstApplyByUser.set(row.user_id, toDate(row.first_applied_at).getTime())
  }
  const firstObservedMs = firstApplyByUser.size > 0 ? Math.min(...firstApplyByUser.values()) : null

  // 사용자 구분 — 기간 안에서 적용을 보고한 사람만 센다
  const activeUsers = new Set<string>()
  const reusingUsers = new Set<string>()
  for (const pair of pairs) {
    activeUsers.add(pair.user_id)
    if (pair.active_days >= REUSE_MIN_DAYS) reusingUsers.add(pair.user_id)
  }
  let newUsers = 0
  for (const userId of activeUsers) {
    const first = firstApplyByUser.get(userId)
    // 최초 적용 시각을 모르면(집계 시차) 신규로 꾸미지 않고 재사용자에도 넣지 않는다
    if (first !== undefined && first >= since.getTime()) newUsers += 1
  }
  const returningUsers = [...activeUsers].filter((userId) => {
    const first = firstApplyByUser.get(userId)
    return first !== undefined && first < since.getTime()
  }).length

  // 스킬 구분과 스킬별 표
  const bySkill = new Map<string, AxRetentionSkillRow>()
  for (const pair of pairs) {
    const row = bySkill.get(pair.skill_id) ?? {
      skillId: pair.skill_id,
      name: pair.name && pair.name.trim().length > 0 ? pair.name : pair.skill_id,
      applies: 0,
      users: 0,
      reusedUsers: 0,
      maxActiveDays: 0,
    }
    row.applies += pair.applies
    row.users += 1
    if (pair.active_days >= REUSE_MIN_DAYS) row.reusedUsers += 1
    row.maxActiveDays = Math.max(row.maxActiveDays, pair.active_days)
    bySkill.set(pair.skill_id, row)
  }
  let single = 0
  let reused = 0
  let multipleWithoutReuse = 0
  for (const row of bySkill.values()) {
    if (row.applies <= 1) single += 1
    else if (row.reusedUsers > 0) reused += 1
    else multipleWithoutReuse += 1
  }
  const multiApplySkills = [...bySkill.values()]
    .filter((row) => row.applies >= 2)
    .sort((a, b) => b.reusedUsers - a.reusedUsers || b.applies - a.applies || a.name.localeCompare(b.name))

  // 반복 깊이 — 조합마다 적용한 서로 다른 날 수
  const pairSummary = { total: pairs.length, oneDay: 0, twoDays: 0, threePlusDays: 0 }
  for (const pair of pairs) {
    if (pair.active_days <= 1) pairSummary.oneDay += 1
    else if (pair.active_days === 2) pairSummary.twoDays += 1
    else pairSummary.threePlusDays += 1
  }

  // 주간 재방문 — 창 0이 오늘까지의 7일, 창 1이 그 직전 7일…
  const weekCount = Math.max(1, Math.floor(days / WEEK_DAYS))
  const usersByWeek = new Map<number, Set<string>>()
  for (const row of weeks) {
    const set = usersByWeek.get(row.week) ?? new Set<string>()
    set.add(row.user_id)
    usersByWeek.set(row.week, set)
  }
  const weekRows: AxRetentionWeek[] = []
  for (let index = weekCount - 1; index >= 0; index -= 1) {
    const end = new Date(until.getTime() - index * WEEK_DAYS * DAY_MS)
    const start = new Date(end.getTime() - WEEK_DAYS * DAY_MS)
    const current = usersByWeek.get(index) ?? new Set<string>()
    const previous = usersByWeek.get(index + 1) ?? new Set<string>()
    // 직전 창이 첫 적용 보고보다 앞이면 그 창은 관측된 적이 없다 — 0이 아니라 미관측
    const previousObserved = firstObservedMs !== null && start.getTime() > firstObservedMs
    let newInWeek = 0
    for (const userId of current) {
      const first = firstApplyByUser.get(userId)
      if (first !== undefined && first >= start.getTime() && first < end.getTime()) newInWeek += 1
    }
    weekRows.push({
      start: start.toISOString(),
      end: end.toISOString(),
      activeUsers: current.size,
      previousActiveUsers: previousObserved ? previous.size : null,
      retainedUsers: previousObserved ? [...current].filter((userId) => previous.has(userId)).length : null,
      newUsers: newInWeek,
    })
  }

  return {
    since: since.toISOString(),
    until: until.toISOString(),
    firstObservedAt: firstObservedMs === null ? null : new Date(firstObservedMs).toISOString(),
    anonymousApplies,
    users: {
      active: activeUsers.size,
      new: newUsers,
      returning: returningUsers,
      reusing: reusingUsers.size,
    },
    weeks: weekRows,
    skills: { applied: bySkill.size, single, multipleWithoutReuse, reused },
    pairs: pairSummary,
    topSkills: multiApplySkills.slice(0, SKILL_LIMIT),
    totalMultiApplySkills: multiApplySkills.length,
    thresholds: { reuseMinDays: REUSE_MIN_DAYS, weekDays: WEEK_DAYS },
  }
}

function rowsOf<T>(result: unknown): T[] {
  return ((result as { rows?: T[] } | null)?.rows ?? []) as T[]
}

/**
 * 반복 사용과 정착률 패널
 *
 * 카탈로그에 있는 스킬의 적용 보고만 센다(같은 탭의 다른 패널과 같은 모집단).
 */
export const skillRetentionPanel: AxPanel<AxRetentionData> = {
  meta,
  async load({ days }) {
    const span = Number.isFinite(days) && days > 0 ? Math.floor(days) : 7
    // 기간 경계는 스킬 사용량 패널과 같다 — 오늘을 포함해 정확히 span일
    const until = new Date(startOfUtcDay(new Date()).getTime() + DAY_MS)
    const since = new Date(until.getTime() - span * DAY_MS)
    // 가장 오래된 창의 "직전 창"까지 읽어야 첫 창의 재방문을 셀 수 있다
    const weekCount = Math.max(1, Math.floor(span / WEEK_DAYS))
    const weeksSince = new Date(until.getTime() - (weekCount + 1) * WEEK_DAYS * DAY_MS)

    try {
      const [pairResult, weekResult, firstApplyResult, anonymousResult] = await Promise.all([
        // 1. 사용자×스킬 조합 — 적용 수와 적용한 서로 다른 날(UTC) 수
        db.execute(sql`
          SELECT e.skill_id,
            c.name AS name,
            e.user_id,
            count(*)::int AS applies,
            count(DISTINCT date_trunc('day', e.created_at AT TIME ZONE 'UTC'))::int AS active_days
          FROM skill_events e
          INNER JOIN catalog_items c ON c.id = e.skill_id
          WHERE e.action = 'apply'
            AND e.user_id IS NOT NULL
            AND e.created_at >= ${since}
            AND e.created_at < ${until}
          GROUP BY e.skill_id, c.name, e.user_id
        `),
        // 2. 사용자가 활동한 7일 창 — 오늘(UTC 하루 끝)에서 거슬러 7일씩 자른다. 0이 가장 최근 창
        db.execute(sql`
          SELECT DISTINCT e.user_id,
            floor(extract(epoch FROM (${until}::timestamptz - e.created_at)) / ${WEEK_DAYS * 86_400})::int AS week
          FROM skill_events e
          INNER JOIN catalog_items c ON c.id = e.skill_id
          WHERE e.action = 'apply'
            AND e.user_id IS NOT NULL
            AND e.created_at >= ${weeksSince}
            AND e.created_at < ${until}
        `),
        // 3. 사용자별 전 기간 최초 적용 — 신규·재사용자 판정과 관측 시작 시각
        db.execute(sql`
          SELECT e.user_id, min(e.created_at) AS first_applied_at
          FROM skill_events e
          INNER JOIN catalog_items c ON c.id = e.skill_id
          WHERE e.action = 'apply'
            AND e.user_id IS NOT NULL
          GROUP BY e.user_id
        `),
        // 4. 계정을 알 수 없는 적용 — 사람 단위 지표에 넣을 수 없어 따로 센다
        db.execute(sql`
          SELECT count(*)::int AS anonymous_applies
          FROM skill_events e
          INNER JOIN catalog_items c ON c.id = e.skill_id
          WHERE e.action = 'apply'
            AND e.user_id IS NULL
            AND e.created_at >= ${since}
            AND e.created_at < ${until}
        `),
      ])

      const pairs = rowsOf<Record<string, unknown>>(pairResult).map((row) => ({
        skill_id: String(row.skill_id ?? ''),
        name: typeof row.name === 'string' ? row.name : null,
        user_id: String(row.user_id ?? ''),
        applies: num(row.applies),
        active_days: num(row.active_days),
      }))
      const weekRows = rowsOf<Record<string, unknown>>(weekResult).map((row) => ({
        user_id: String(row.user_id ?? ''),
        week: num(row.week),
      }))
      const firstApplies = rowsOf<Record<string, unknown>>(firstApplyResult).map((row) => ({
        user_id: String(row.user_id ?? ''),
        first_applied_at: row.first_applied_at as string | Date,
      }))
      const anonymousApplies = num(rowsOf<Record<string, unknown>>(anonymousResult)[0]?.anonymous_applies)

      const data = buildRetentionData(
        { since, until, pairs, weeks: weekRows, firstApplies, anonymousApplies },
        span
      )

      const latest = data.weeks[data.weeks.length - 1]
      const highlight =
        latest && latest.previousActiveUsers !== null && latest.retainedUsers !== null && latest.previousActiveUsers > 0
          ? `${latest.retainedUsers}/${latest.previousActiveUsers}`
          : '—'
      return panelOk(meta, data, [
        // 최근 7일 창은 기간 선택과 무관하게 같으므로 스냅숏 층에 둔다
        { label: '주간 재방문', value: highlight, hint: '명 · 직전 7일 대비' },
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error('Retention panel failed', { message })
      return panelError(meta, '반복 사용 지표를 계산하지 못했습니다')
    }
  },
}
