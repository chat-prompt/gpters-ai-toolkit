/**
 * AX Dashboard — 스킬 사용량 패널
 *
 * aitk DB의 skill_events(스킬 상호작용 로그)와 mcp_sessions(세션)를 기간별로 집계한다.
 * 집계는 SQL GROUP BY 5회로 끝내고, 정렬·상위 절단만 애플리케이션에서 처리한다.
 */

import { db, skillEvents, catalogItems } from '@gpters/db'
import { and, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm'
import { createLogger } from '../../core/logger'
import { panelOk, panelError } from './panel'
import type { AxPanel, AxPanelMeta, AxSkillUsageData, AxSkillUsageRow } from './types'

const log = createLogger('ax-skills')

/** 표에 노출할 스킬 수 상한 */
const SKILL_LIMIT = 50

/**
 * 사람이 스킬을 쓴 행위만 센다
 *
 * `exercise_search`·`exercise_apply`는 실습 생성 엔진이 남기는 기계 트래픽이라
 * 사용자 없이 건수만 올린다. 요약 타일과 표가 같은 숫자를 말하도록 모든 쿼리에서 함께 제외한다.
 * `suggest`는 기능 자체가 제거돼(2026-05-18) 새 행이 쌓이지 않으므로 포함하지 않는다.
 */
const CORE_ACTIONS = ['search', 'load', 'apply', 'skip', 'deploy'] as const

const meta: AxPanelMeta = {
  id: 'skill-usage',
  title: '스킬 사용량',
  description: 'aitk에서 검색·로드·적용된 스킬 사용 현황',
  source: 'aitk DB (skill_events · mcp_sessions)',
  visibility: 'org',
  usesPeriod: true,
}

/** action별 건수 — pgEnum 값 하나를 세는 FILTER 집계 */
function actionCount(action: string) {
  return sql<number>`count(*) filter (where ${skillEvents.action} = ${action})::int`
}

/**
 * created_at을 UTC 일자 문자열(YYYY-MM-DD)로 자른 표현식
 *
 * `at time zone 'UTC'`를 명시한다 — 없으면 DB 세션 타임존을 따라가서
 * 배포 환경마다 하루 경계가 달라진다.
 */
const dayExpr = sql<string>`to_char(date_trunc('day', ${skillEvents.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`

/** UTC 기준 하루의 시작으로 내린다 — 첫 막대가 반쪽만 담기는 것을 막는다 */
function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/**
 * 이벤트가 없는 날을 0으로 채운다
 *
 * 채우지 않으면 활동한 날만 막대가 서고, 화면에서는 균등 폭으로 그려져
 * 띄엄띄엄 쓴 30일이 매일 쓴 것처럼 보인다.
 */
function fillMissingDays(
  rows: Array<{ date: string; events: number }>,
  from: Date,
  to: Date
): Array<{ date: string; events: number }> {
  const counts = new Map(rows.map((row) => [row.date, row.events]))
  const filled: Array<{ date: string; events: number }> = []

  for (let day = startOfUtcDay(from); day <= to; day.setUTCDate(day.getUTCDate() + 1)) {
    const key = day.toISOString().slice(0, 10)
    filled.push({ date: key, events: counts.get(key) ?? 0 })
  }

  return filled
}

/** timestamp 컬럼 값을 ISO 8601 문자열로. 드라이버가 string을 주는 경우도 있어 함께 처리 */
function toIso(value: Date | string | null): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * 요청자가 볼 수 있는 카탈로그 항목 조건
 *
 * 이 플랫폼의 카탈로그는 조직별로 격리돼 있고 기본 가시성이 private다.
 * 대시보드가 다른 조직의 비공개 스킬 이름을 흘리지 않도록, 카탈로그 읽기 관례
 * (`core/catalog.ts`의 가시성 필터)와 같은 조건을 적용한다.
 *
 * 그쪽 함수를 그대로 쓰지 않는 이유는 super_admin에게 필터를 아예 걷어내기 때문이다.
 * 사내 현황 대시보드는 역할과 무관하게 자기 조직 범위로만 본다.
 */
function visibleCatalogFilter(orgId: string | null) {
  return orgId
    ? or(
        eq(catalogItems.orgId, orgId),
        eq(catalogItems.visibility, 'public'),
        isNull(catalogItems.orgId)
      )
    : or(eq(catalogItems.visibility, 'public'), isNull(catalogItems.orgId))
}

/** count 계열 컬럼을 숫자로 (bigint가 문자열로 오는 드라이버 대비) */
function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * 스킬 사용량 패널
 *
 * 최근 `days`일 구간의 스킬 이벤트를 집계한다.
 * 이벤트가 하나도 없으면 오류가 아니라 빈 데이터로 정상 응답한다.
 */
export const skillUsagePanel: AxPanel<AxSkillUsageData> = {
  meta,

  async load({ days, orgId }) {
    const span = Number.isFinite(days) && days > 0 ? Math.floor(days) : 30
    const now = new Date()
    // 하루 경계로 내려 구간을 잡는다 — 그래야 추이의 첫 막대가 온전한 하루를 담는다.
    // 오늘을 포함해 정확히 span일이 되도록 span-1일 전부터 센다 ("30일" → 막대 30개)
    const since = startOfUtcDay(new Date(now.getTime() - (span - 1) * 24 * 60 * 60 * 1000))
    const visible = visibleCatalogFilter(orgId)

    try {
      // 1. 요약 지표 — 아래 표와 같은 모집단이어야 하므로 같은 조건을 건다
      //    (요약 타일이 전 조직 합산이고 표는 우리 조직만이면 두 숫자가 어긋난다)
      //    세션 수도 같은 집합에서 센다 — 별도로 mcp_sessions를 세면 조직 범위와
      //    익명 세션 취급이 달라져 옆 타일과 모집단이 어긋난다
      const [totals] = await db
        .select({
          totalEvents: sql<number>`count(*)::int`,
          activeUsers: sql<number>`count(distinct ${skillEvents.userId})::int`,
          sessions: sql<number>`count(distinct ${skillEvents.sessionId})::int`,
        })
        .from(skillEvents)
        .innerJoin(catalogItems, eq(catalogItems.id, skillEvents.skillId))
        .where(and(gte(skillEvents.createdAt, since), inArray(skillEvents.action, CORE_ACTIONS), visible))

      // 2. 스킬별 action 피벗 — 요청자가 볼 수 있는 카탈로그 항목만 대상으로 한다
      //    (카탈로그에 없거나 다른 조직의 비공개 스킬은 표에 올리지 않는다)
      const skillRows = await db
        .select({
          skillId: skillEvents.skillId,
          name: catalogItems.name,
          searched: actionCount('search'),
          loaded: actionCount('load'),
          applied: actionCount('apply'),
          skipped: actionCount('skip'),
          deployed: actionCount('deploy'),
          users: sql<number>`count(distinct ${skillEvents.userId})::int`,
          lastUsedAt: sql<Date | null>`max(${skillEvents.createdAt})`,
        })
        .from(skillEvents)
        .innerJoin(catalogItems, eq(catalogItems.id, skillEvents.skillId))
        .where(and(gte(skillEvents.createdAt, since), inArray(skillEvents.action, CORE_ACTIONS), visible))
        .groupBy(skillEvents.skillId, catalogItems.name)

      // 4. 일자별 추이 — 요약·표와 같은 모집단
      const dailyRows = await db
        .select({ date: dayExpr, events: sql<number>`count(*)::int` })
        .from(skillEvents)
        .innerJoin(catalogItems, eq(catalogItems.id, skillEvents.skillId))
        .where(and(gte(skillEvents.createdAt, since), inArray(skillEvents.action, CORE_ACTIONS), visible))
        .groupBy(dayExpr)
        .orderBy(dayExpr)

      // 3. 기간 내 이벤트가 하나도 없는 카탈로그 스킬
      //    빈 배열 notInArray는 Drizzle에서 깨지므로 서브쿼리로 처리한다
      //    서브쿼리도 위와 같은 action 조건을 써야 한다 — 아니면 기계 트래픽만 있는 스킬이
      //    표에서도 빠지고 미사용 목록에서도 빠져 어디에도 안 보인다
      const unusedRows = await db
        .select({ id: catalogItems.id, name: catalogItems.name })
        .from(catalogItems)
        .where(
          and(
            eq(catalogItems.type, 'skill'),
            // 발행된 적 없는 초안은 "안 쓰인 스킬"이 아니다
            or(eq(catalogItems.status, 'published'), isNull(catalogItems.status)),
            visible,
            sql`${catalogItems.id} not in (
              select distinct ${skillEvents.skillId} from ${skillEvents}
              where ${skillEvents.createdAt} >= ${since}
                and ${inArray(skillEvents.action, CORE_ACTIONS)}
            )`
          )
        )
        .orderBy(catalogItems.name)
        .limit(SKILL_LIMIT)

      const skills: AxSkillUsageRow[] = skillRows
        .map((row) => ({
          skillId: row.skillId,
          name: row.name ?? row.skillId,
          searched: num(row.searched),
          loaded: num(row.loaded),
          applied: num(row.applied),
          skipped: num(row.skipped),
          deployed: num(row.deployed),
          users: num(row.users),
          lastUsedAt: toIso(row.lastUsedAt),
        }))
        .sort((a, b) => b.loaded + b.applied - (a.loaded + a.applied))
        .slice(0, SKILL_LIMIT)

      const totalEvents = num(totals?.totalEvents)
      const activeUsers = num(totals?.activeUsers)

      return panelOk(
        meta,
        {
          totalEvents,
          activeUsers,
          sessions: num(totals?.sessions),
          skills,
          daily: fillMissingDays(
            dailyRows.map((row) => ({ date: row.date, events: num(row.events) })),
            since,
            now
          ),
          unusedSkills: unusedRows.map((row) => ({ id: row.id, name: row.name })),
        },
        [
          { label: '스킬 사용', value: totalEvents.toLocaleString('ko-KR'), hint: `${span}일` },
          { label: '쓴 사람', value: activeUsers.toLocaleString('ko-KR'), hint: '명' },
        ]
      )
    } catch (error) {
      log.error('스킬 사용량 집계 실패', error, { days: span })
      return panelError<AxSkillUsageData>(meta, '스킬 사용량을 불러오지 못했습니다')
    }
  },
}
