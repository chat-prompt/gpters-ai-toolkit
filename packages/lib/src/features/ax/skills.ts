/**
 * AX Dashboard — 스킬 사용량 패널
 *
 * aitk DB의 skill_events(스킬 상호작용 로그)와 mcp_sessions(세션)를 기간별로 집계한다.
 * 집계는 SQL GROUP BY 5회로 끝내고, 정렬·상위 절단만 애플리케이션에서 처리한다.
 */

import { axAgentTelemetryBatches, db, skillEvents, catalogItems } from '@gpters/db'
import { and, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm'
import { createLogger } from '../../core/logger'
import { panelOk, panelError } from './panel'
import { startOfUtcDay } from './kst'
import { batchObservesSkills } from './agent-activity'
import type {
  AxAgentTelemetrySource,
  AxPanel,
  AxPanelMeta,
  AxSkillUsageData,
  AxSkillUsageRow,
} from './types'

const log = createLogger('ax-skills')

/** 표에 노출할 스킬 수 상한 */
const SKILL_LIMIT = 50

/**
 * 카탈로그에서 서버가 기록하는 핵심 상호작용
 *
 * `exercise_search`·`exercise_apply`는 실습 생성 엔진이 남기는 기계 트래픽이라
 * 사용자 없이 건수만 올린다. 행동별 현황과 스킬별 표에서는 이 목록만 사용한다.
 * `suggest`는 기능 자체가 제거돼(2026-05-18) 새 행이 쌓이지 않으므로 포함하지 않는다.
 * 실제 사용 지표는 아래 ACTUAL_USAGE_ACTIONS로 더 좁혀 적용 보고만 센다.
 */
export const CORE_ACTIONS = ['search', 'load', 'apply', 'skip', 'deploy'] as const

/** 실제 사용으로 해석하는 서버 신호 — 에이전트의 명시적인 적용 보고만 센다 */
export const ACTUAL_USAGE_ACTIONS = ['apply'] as const

/**
 * 사람과 에이전트를 하루 단위로 나란히 놓기 위한 집계.
 *
 * **로드끼리만 비교한다.** 에이전트 쪽에는 적용·실행 신호가 없다 — 운영 376개 배치 전부
 * `executions`가 비어 있다(2026-09-06 확인). 사람의 "적용"과 에이전트의 "로드"를 한 축에 두면
 * 서로 다른 사건을 비교하는 그림이 된다.
 *
 * 배치는 내부 시간 분포를 보존하지 않으므로 **하루 경계를 걸친 배치는 통째로 뺀다.** 운영에서는
 * 하루 30~54개 배치 중 0~2개가 여기 해당한다. 뺀 수는 화면에 그대로 적는다.
 *
 * @param batches - 기간에 걸친 원본 배치
 * @param days - 채워야 할 날짜 키 (YYYY-MM-DD)
 * @returns 날짜별 로드 수와 제외 내역
 */
export function aggregateAgentLoads(
  batches: Array<{
    source: string
    runtime: unknown
    windowStart: Date | string
    windowEnd: Date | string
    skillLoads: Array<Record<string, unknown>>
  }>,
  days: string[]
): { byDay: Map<string, number>; observedDays: Set<string>; excludedBatches: number; unobservedBatches: number } {
  const byDay = new Map<string, number>()
  const observedDays = new Set<string>()
  let excludedBatches = 0
  let unobservedBatches = 0

  for (const batch of batches) {
    if (!batchObservesSkills(batch.source as AxAgentTelemetrySource, batch.runtime)) {
      unobservedBatches += 1
      continue
    }
    const start = batch.windowStart instanceof Date ? batch.windowStart : new Date(batch.windowStart)
    const end = batch.windowEnd instanceof Date ? batch.windowEnd : new Date(batch.windowEnd)
    const startDay = start.toISOString().slice(0, 10)
    if (startDay !== end.toISOString().slice(0, 10)) {
      excludedBatches += 1
      continue
    }
    // 관측 가능한 배치가 있었다는 사실은 로드가 0이어도 기록한다 — 그래야 "0건"과 "미관측"이 갈린다
    observedDays.add(startDay)
    const loads = batch.skillLoads.reduce((sum, entry) => {
      const loaded = Number(entry.loaded ?? 0)
      return sum + (Number.isFinite(loaded) ? loaded : 0)
    }, 0)
    byDay.set(startDay, (byDay.get(startDay) ?? 0) + loads)
  }

  for (const day of days) if (!byDay.has(day) && observedDays.has(day)) byDay.set(day, 0)
  return { byDay, observedDays, excludedBatches, unobservedBatches }
}

const meta: AxPanelMeta = {
  id: 'skill-usage',
  title: '스킬',
  description: 'aitk 서버에서 관측된 검색·콘텐츠 로드·적용 보고 현황',
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

  async load({ days }) {
    const span = Number.isFinite(days) && days > 0 ? Math.floor(days) : 30
    const now = new Date()
    // 하루 경계로 내려 구간을 잡는다 — 그래야 추이의 첫 막대가 온전한 하루를 담는다.
    // 오늘을 포함해 정확히 span일이 되도록 span-1일 전부터 센다 ("30일" → 막대 30개)
    const since = startOfUtcDay(new Date(now.getTime() - (span - 1) * 24 * 60 * 60 * 1000))

    try {
      const allTimeLastUsedAt = sql<Date | null>`(
        select max("skill_events"."created_at") from "skill_events"
        where "skill_events"."skill_id" = "catalog_items"."id"
          and ${inArray(skillEvents.action, ACTUAL_USAGE_ACTIONS)}
      )`
      const allTimeUsageSessions = sql<number>`(
        select count(distinct "skill_events"."session_id")::int from "skill_events"
        where "skill_events"."skill_id" = "catalog_items"."id"
          and ${inArray(skillEvents.action, ACTUAL_USAGE_ACTIONS)}
      )`

      // 일곱 쿼리는 서로 독립이라 왕복 지연이 쌓이지 않게 한 번에 보낸다.
      const [[totals], skillRows, dailyRows, unusedRows, originResult, humanLoadRows, agentBatches] =
        await Promise.all([
        // 1. 요약 지표 — 아래 표와 같은 단일 GPTers 카탈로그 모집단을 쓴다
        //    세션 수도 같은 집합에서 센다 — 별도로 mcp_sessions를 세면 조직 범위와
        //    익명 세션 취급이 달라져 옆 타일과 모집단이 어긋난다
        db
          .select({
            totalEvents: sql<number>`count(*)::int`,
            searched: actionCount('search'),
            loaded: actionCount('load'),
            applied: actionCount('apply'),
            skipped: actionCount('skip'),
            deployed: actionCount('deploy'),
            activeUsers: sql<number>`count(distinct ${skillEvents.userId}) filter (where ${inArray(skillEvents.action, ACTUAL_USAGE_ACTIONS)})::int`,
            sessions: sql<number>`count(distinct ${skillEvents.sessionId}) filter (where ${inArray(skillEvents.action, ACTUAL_USAGE_ACTIONS)})::int`,
          })
          .from(skillEvents)
          .innerJoin(catalogItems, eq(catalogItems.id, skillEvents.skillId))
          .where(and(gte(skillEvents.createdAt, since), inArray(skillEvents.action, CORE_ACTIONS))),

        // 2. 스킬별 action 피벗 — 카탈로그에 존재하는 항목만 대상으로 한다
        db
          .select({
            skillId: skillEvents.skillId,
            name: catalogItems.name,
            searched: actionCount('search'),
            loaded: actionCount('load'),
            applied: actionCount('apply'),
            skipped: actionCount('skip'),
            deployed: actionCount('deploy'),
            users: sql<number>`count(distinct ${skillEvents.userId}) filter (where ${inArray(skillEvents.action, ACTUAL_USAGE_ACTIONS)})::int`,
            lastUsedAt: sql<Date | null>`max(${skillEvents.createdAt}) filter (where ${skillEvents.action} = 'apply')`,
          })
          .from(skillEvents)
          .innerJoin(catalogItems, eq(catalogItems.id, skillEvents.skillId))
          .where(and(gte(skillEvents.createdAt, since), inArray(skillEvents.action, CORE_ACTIONS)))
          .groupBy(skillEvents.skillId, catalogItems.name),

        // 3. 일자별 실제 사용 추이 — 명시적인 적용 보고만 센다
        db
          .select({ date: dayExpr, events: sql<number>`count(*)::int` })
          .from(skillEvents)
          .innerJoin(catalogItems, eq(catalogItems.id, skillEvents.skillId))
          .where(and(gte(skillEvents.createdAt, since), inArray(skillEvents.action, ACTUAL_USAGE_ACTIONS)))
          .groupBy(dayExpr)
          .orderBy(dayExpr),

        // 4. 기간 내 적용 보고가 없는 카탈로그 스킬
        //    빈 배열 notInArray는 Drizzle에서 깨지므로 서브쿼리로 처리한다
        //    검색 노출·스킵만 있는 스킬도 관리 관점에서는 미관측이다. 정리 우선순위는
        //    전 기간의 마지막 적용 보고가 오래된 순, 같은 시각이면 누적 적용 세션이 적은 순이다.
        db
          .select({
            id: catalogItems.id,
            name: catalogItems.name,
            lastUsedAt: allTimeLastUsedAt,
            usageSessions: allTimeUsageSessions,
            totalUnused: sql<number>`count(*) over()::int`,
          })
          .from(catalogItems)
          .where(
            and(
              eq(catalogItems.type, 'skill'),
              // 발행된 적 없는 초안은 "안 쓰인 스킬"이 아니다
              or(eq(catalogItems.status, 'published'), isNull(catalogItems.status)),
              sql`${catalogItems.id} not in (
                select distinct ${skillEvents.skillId} from ${skillEvents}
                where ${skillEvents.createdAt} >= ${since.toISOString()}
                  and ${inArray(skillEvents.action, ACTUAL_USAGE_ACTIONS)}
              )`
            )
          )
          // NULLS FIRST = 한 번도 실제 사용된 적 없는 스킬이 정리 후보의 맨 앞이다.
          .orderBy(
            sql`${allTimeLastUsedAt} asc nulls first`,
            allTimeUsageSessions,
            catalogItems.name
          )
          .limit(SKILL_LIMIT),

        // 5. 기원 분해 — 로드·적용이 같은 흐름(journey, 없으면 session)의 앞선 검색·로드와 이어졌는지.
        //    검색 요청 수는 결과 줄마다 한 행인 skill_events 대신 요청마다 한 행인 감사 로그에서 센다.
        //    흐름 ID가 없는 이벤트는 판정 불가라 unlinkable로 따로 둔다.
        db.execute(sql`
          WITH loads AS (
            SELECT e.skill_id, COALESCE(e.journey_id, e.session_id) AS flow_id, e.created_at
            FROM skill_events e
            INNER JOIN catalog_items c ON c.id = e.skill_id
            WHERE e.action = 'load' AND e.created_at >= ${since}
          ), applies AS (
            SELECT e.skill_id, COALESCE(e.journey_id, e.session_id) AS flow_id, e.created_at
            FROM skill_events e
            INNER JOIN catalog_items c ON c.id = e.skill_id
            WHERE e.action = 'apply' AND e.created_at >= ${since}
          ), load_origin AS (
            SELECT CASE
              WHEN flow_id IS NULL THEN 'unlinkable'
              WHEN EXISTS (
                SELECT 1 FROM skill_events s
                WHERE COALESCE(s.journey_id, s.session_id) = loads.flow_id
                  AND s.skill_id = loads.skill_id AND s.action = 'search'
                  AND s.created_at <= loads.created_at
              ) THEN 'from_search'
              ELSE 'direct' END AS origin
            FROM loads
          ), apply_origin AS (
            SELECT CASE
              WHEN flow_id IS NULL THEN 'unlinkable'
              WHEN EXISTS (
                SELECT 1 FROM skill_events s
                WHERE COALESCE(s.journey_id, s.session_id) = applies.flow_id
                  AND s.skill_id = applies.skill_id AND s.action = 'search'
                  AND s.created_at <= applies.created_at
              ) THEN 'from_search'
              WHEN EXISTS (
                SELECT 1 FROM skill_events l
                WHERE COALESCE(l.journey_id, l.session_id) = applies.flow_id
                  AND l.skill_id = applies.skill_id AND l.action = 'load'
                  AND l.created_at <= applies.created_at
              ) THEN 'after_direct_load'
              ELSE 'without_load' END AS origin
            FROM applies
          )
          SELECT
            (SELECT count(*)::int FROM mcp_audit_logs
              WHERE tool IN ('search_plugins', 'semantic_search')
                AND response_status = 'success'
                AND created_at >= ${since}) AS search_requests,
            (SELECT count(*)::int FROM load_origin WHERE origin = 'from_search') AS loads_from_search,
            (SELECT count(*)::int FROM load_origin WHERE origin = 'direct') AS loads_direct,
            (SELECT count(*)::int FROM load_origin WHERE origin = 'unlinkable') AS loads_unlinkable,
            (SELECT count(*)::int FROM apply_origin WHERE origin = 'from_search') AS applies_from_search,
            (SELECT count(*)::int FROM apply_origin WHERE origin = 'after_direct_load') AS applies_after_direct_load,
            (SELECT count(*)::int FROM apply_origin WHERE origin = 'without_load') AS applies_without_load,
            (SELECT count(*)::int FROM apply_origin WHERE origin = 'unlinkable') AS applies_unlinkable
        `),

        // 6. 사람의 일별 스킬 로드 — 에이전트와 견주려면 같은 사건(로드)이어야 한다.
        //    위 3번 daily는 적용 보고라 축이 다르다.
        db
          .select({ date: dayExpr, events: sql<number>`count(*)::int` })
          .from(skillEvents)
          .innerJoin(catalogItems, eq(catalogItems.id, skillEvents.skillId))
          .where(and(gte(skillEvents.createdAt, since), eq(skillEvents.action, 'load')))
          .groupBy(dayExpr),

        // 7. 에이전트 배치 원본 — 관측 가능 여부와 하루 경계 판정은 JS에서 한다.
        //    SQL로 합치면 스킬 신호를 못 담는 수집기의 배치가 0으로 섞여 미관측과 구분되지 않는다.
        db
          .select({
            // source는 컬럼이 아니라 collection jsonb 안에 있다 (shared-skills·agent-activity와 같다)
            collection: axAgentTelemetryBatches.collection,
            runtime: axAgentTelemetryBatches.runtime,
            windowStart: axAgentTelemetryBatches.windowStart,
            windowEnd: axAgentTelemetryBatches.windowEnd,
            skillLoads: axAgentTelemetryBatches.skillLoads,
          })
          .from(axAgentTelemetryBatches)
          .where(gte(axAgentTelemetryBatches.windowEnd, since)),
      ])

      const originRow = ((originResult as { rows?: Record<string, unknown>[] } | null)?.rows ?? [])[0] ?? {}

      const humanLoadDaily = fillMissingDays(
        humanLoadRows.map((row) => ({ date: row.date, events: num(row.events) })),
        since,
        now
      )
      const agentLoads = aggregateAgentLoads(
        agentBatches.map((batch) => ({
          source: typeof (batch.collection as Record<string, unknown> | null)?.source === 'string'
            ? String((batch.collection as Record<string, unknown>).source)
            : '',
          runtime: batch.runtime,
          windowStart: batch.windowStart,
          windowEnd: batch.windowEnd,
          skillLoads: batch.skillLoads ?? [],
        })),
        humanLoadDaily.map((row) => row.date)
      )
      const humanVsAgent: AxSkillUsageData['humanVsAgent'] = {
        daily: humanLoadDaily.map((row) => ({
          date: row.date,
          human: row.events,
          // 관측 가능한 배치가 없었던 날은 0이 아니라 미관측이다
          agent: agentLoads.observedDays.has(row.date) ? agentLoads.byDay.get(row.date) ?? 0 : null,
        })),
        observedDays: agentLoads.observedDays.size,
        excludedBatches: agentLoads.excludedBatches,
        unobservedBatches: agentLoads.unobservedBatches,
      }

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
        .sort((a, b) => b.applied - a.applied || b.loaded - a.loaded)
        .slice(0, SKILL_LIMIT)

      const totalEvents = num(totals?.totalEvents)
      const loaded = num(totals?.loaded)
      const applied = num(totals?.applied)
      const meaningfulUses = applied
      const activeUsers = num(totals?.activeUsers)

      return panelOk(
        meta,
        {
          totalEvents,
          meaningfulUses,
          activeUsers,
          sessions: num(totals?.sessions),
          actionTotals: {
            search: num(totals?.searched),
            load: loaded,
            apply: applied,
            skip: num(totals?.skipped),
            deploy: num(totals?.deployed),
          },
          origins: {
            searchRequests: num(originRow.search_requests),
            loads: {
              fromSearch: num(originRow.loads_from_search),
              direct: num(originRow.loads_direct),
              unlinkable: num(originRow.loads_unlinkable),
            },
            applies: {
              fromSearch: num(originRow.applies_from_search),
              afterDirectLoad: num(originRow.applies_after_direct_load),
              withoutLoad: num(originRow.applies_without_load),
              unlinkable: num(originRow.applies_unlinkable),
            },
          },
          skills,
          daily: fillMissingDays(
            dailyRows.map((row) => ({ date: row.date, events: num(row.events) })),
            since,
            now
          ),
          humanVsAgent,
          totalUnusedSkills: num(unusedRows[0]?.totalUnused),
          unusedSkills: unusedRows.map((row) => ({
            id: row.id,
            name: row.name,
            lastUsedAt: toIso(row.lastUsedAt),
            usageSessions: num(row.usageSessions),
          })),
        },
        [
          // 기간 라벨은 붙이지 않는다 — 화면의 기간 선택이 이 두 타일 바로 옆에 있다
          { label: '실제 적용 보고', value: meaningfulUses.toLocaleString('ko-KR'), hint: '건', periodLinked: true },
          { label: '실제 사용 구성원', value: activeUsers.toLocaleString('ko-KR'), hint: '명', periodLinked: true },
        ]
      )
    } catch (error) {
      log.error('스킬 사용량 집계 실패', error, { days: span })
      return panelError<AxSkillUsageData>(meta, '스킬 사용량을 불러오지 못했습니다')
    }
  },
}
