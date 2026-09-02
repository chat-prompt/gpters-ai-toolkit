/**
 * AX Dashboard — 성과 요약 패널
 *
 * 목업이 제안한 성과 지표 가운데 **지금 실측 가능한 것만** 계산한다.
 * 활성 인원·일별 추이·시간대별 활성 인원은 skill_events에서 나오고,
 * 스킬 실행 시작·완료는 별도 실행 결과 패널에서 다루며, 이 요약은 사람의 실제 적용에 집중한다.
 *
 * 실제 사용 지표는 스킬 사용량 패널과 동일하게 적용 보고만 센다.
 * 로드는 적용 전환을 설명하는 보조 신호로만 별도 집계한다.
 */

import { axAgentTelemetryBatches, db, skillEvents, catalogItems, users } from '@gpters/db'
import { and, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm'
import { createLogger } from '../../core/logger'
import { panelOk, panelError } from './panel'
import { ACTUAL_USAGE_ACTIONS } from './skills'
import type { AxOverviewData, AxOverviewMemberRow, AxPanel, AxPanelMeta } from './types'

const log = createLogger('ax-overview')

const meta: AxPanelMeta = {
  id: 'overview',
  title: '요약',
  description: '구성원의 AX 활동',
  source: 'aitk DB (skill_events)',
  visibility: 'org',
  usesPeriod: true,
}

/**
 * 잔디밭 고정 윈도우 — 오늘을 포함한 최근 365일
 *
 * 잔디밭은 기간 선택과 무관한 "장기 습관" 그림이라 조회 기간을 따라가지 않는다.
 * 날짜가 지나면 창이 최신 쪽으로 하루씩 굴러간다.
 */
const GRASS_WINDOW_DAYS = 365

/** 사용자별 사용량 표 상한 */
const MEMBER_LIMIT = 20

/**
 * 이 패널의 하루 경계는 전부 KST다
 *
 * 사람 단위 지표("어느 날 몇 명이 움직였나", "하루 중 언제 움직이나")를 UTC 경계로
 * 자르면 KST 00~09시 활동이 전날 막대로 넘어가, 화면의 날짜 라벨과 실제 근무일이
 * 어긋난다. 이벤트 수를 세는 스킬 사용량 패널은 UTC 경계를 유지한다(문서화된 선택).
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * created_at을 KST 일자 문자열(YYYY-MM-DD)로 자른 표현식
 */
const kstDayExpr = sql<string>`to_char(date_trunc('day', ${skillEvents.createdAt} at time zone 'Asia/Seoul'), 'YYYY-MM-DD')`

/**
 * created_at의 KST 시(hour) 표현식
 *
 * 시간대별 밀도는 "팀이 하루 중 언제 움직이는가"를 보는 지표라
 * 저장 시각(UTC)이 아니라 근무 시간대(Asia/Seoul)로 변환해 센다.
 */
const kstHourExpr = sql<number>`extract(hour from ${skillEvents.createdAt} at time zone 'Asia/Seoul')::int`

/** 에이전트 증분 batch 종료 시각을 KST 일자 문자열로 자른 표현식 */
const agentKstDayExpr = sql<string>`to_char(date_trunc('day', ${axAgentTelemetryBatches.windowEnd} at time zone 'Asia/Seoul'), 'YYYY-MM-DD')`

/** KST 기준 하루의 시작(= KST 자정에 해당하는 UTC 시각)으로 내린다 */
function startOfKstDay(date: Date): Date {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS)
  const floor = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
  return new Date(floor - KST_OFFSET_MS)
}

/** KST 기준 날짜 키 (YYYY-MM-DD) */
function kstDateKey(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/** count 계열 컬럼을 숫자로 (bigint가 문자열로 오는 드라이버 대비) */
function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** timestamp 컬럼 값을 ISO 8601 문자열로. 드라이버가 string을 주는 경우도 함께 처리 */
function toIso(value: Date | string | null): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * 활동이 없는 날을 0으로 채워 연속된 일별 축을 만든다 (KST 날짜 기준)
 *
 * @param counts - KST 날짜 → 값
 * @param from - 구간 시작 (KST 자정에 해당하는 UTC 시각)
 * @param to - 구간 끝
 * @returns 구간 내 모든 KST 날짜가 채워진 [날짜, 값] 배열
 */
function fillDailySeries(
  counts: Map<string, number>,
  from: Date,
  to: Date
): Array<{ date: string; value: number }> {
  const filled: Array<{ date: string; value: number }> = []

  for (let time = startOfKstDay(from).getTime(); time <= to.getTime(); time += 24 * 60 * 60 * 1000) {
    const key = kstDateKey(new Date(time))
    filled.push({ date: key, value: counts.get(key) ?? 0 })
  }

  return filled
}

/** 로드 코호트·직접 적용이 없는 날도 0으로 채워 선택 기간의 연속 축을 만든다 */
function fillDailySkillFlow(
  rows: Array<{
    date: string
    directApplied: number
    loaded: number
    linkableLoaded: number
    appliedAfterLoad: number
  }>,
  from: Date,
  to: Date
): AxOverviewData['dailySkillFlow'] {
  const counts = new Map(rows.map((row) => [row.date, row]))
  return fillDailySeries(new Map(), from, to).map(({ date }) => ({
    date,
    directApplied: counts.get(date)?.directApplied ?? 0,
    loaded: counts.get(date)?.loaded ?? 0,
    linkableLoaded: counts.get(date)?.linkableLoaded ?? 0,
    appliedAfterLoad: counts.get(date)?.appliedAfterLoad ?? 0,
  }))
}

/**
 * 0~23시를 모두 채운 시간대별 밀도
 *
 * 활동이 없는 시간을 빼면 축이 끊겨 "언제 안 움직이는가"가 안 보인다.
 *
 * @param rows - 시간대별 이벤트 수 (있는 시간만)
 * @returns 24칸이 모두 채워진 배열
 */
function fillMissingHours(rows: Array<{ hour: number; users: number }>): Array<{ hour: number; users: number }> {
  const counts = new Map(rows.map((row) => [row.hour, row.users]))
  return Array.from({ length: 24 }, (_, hour) => ({ hour, users: counts.get(hour) ?? 0 }))
}

/**
 * 성과 요약 패널
 *
 * 조회 기간(`days`)은 추이·분포·밀도에 적용된다. 누적 참여 인원만 전 기간 기준이다.
 * 기간별 활성 인원은 스킬 사용량 패널이 같은 모집단으로 집계하므로 여기서 되풀이하지 않는다.
 */
export const overviewPanel: AxPanel<AxOverviewData> = {
  meta,

  async load({ days, isAdmin }) {
    const span = Number.isFinite(days) && days > 0 ? Math.floor(days) : 30
    const now = new Date()
    // KST 하루 경계로 내려 온전한 하루 단위 구간을 잡는다 — 그래야 일별·시간대 차트의
    // 첫 하루가 반쪽(00~09시 누락)이 되지 않는다
    const since = startOfKstDay(new Date(now.getTime() - (span - 1) * 24 * 60 * 60 * 1000))
    const grassSince = startOfKstDay(
      new Date(now.getTime() - (GRASS_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000)
    )

    /** 실제 사용 모집단 — 카탈로그 스킬의 명시적인 적용 보고 */
    const appliedPopulation = (from?: Date) =>
      from
        ? and(gte(skillEvents.createdAt, from), inArray(skillEvents.action, ACTUAL_USAGE_ACTIONS))
        : inArray(skillEvents.action, ACTUAL_USAGE_ACTIONS)

    /** 적용 전환 설명에 필요한 로드·적용 이벤트 모집단 */
    const activityPopulation = (from?: Date) =>
      from
        ? and(gte(skillEvents.createdAt, from), inArray(skillEvents.action, ['load', 'apply']))
        : inArray(skillEvents.action, ['load', 'apply'])

    try {
      // 1. 누적 참여 인원 — 전 기간
      const [cumulative] = await db
        .select({ users: sql<number>`count(distinct ${skillEvents.userId})::int` })
        .from(skillEvents)
        .innerJoin(catalogItems, eq(catalogItems.id, skillEvents.skillId))
        .where(appliedPopulation())

      // 2. 팀 스킬(aitk 카탈로그) 수 — 현재 시점 인벤토리. 미사용 스킬 쿼리와 같은 발행 기준
      const [catalog] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(catalogItems)
        .where(
          and(
            eq(catalogItems.type, 'skill'),
            or(eq(catalogItems.status, 'published'), isNull(catalogItems.status))
          )
        )

      // 3. 잔디밭 — 활동은 로드 없이 적용 + 로드 후 적용이다.
      //    journey를 우선하고 기존 MCP session을 fallback으로 사용해 앞선 로드를 찾는다.
      const grassRows = await db
        .select({
          date: kstDayExpr,
          directApplied: sql<number>`count(*) filter (
            where ${skillEvents.action} = 'apply'
              and not exists (
                select 1
                from skill_events loaded
                where coalesce(${skillEvents.journeyId}, ${skillEvents.sessionId}) is not null
                  and coalesce(loaded.journey_id, loaded.session_id) = coalesce(${skillEvents.journeyId}, ${skillEvents.sessionId})
                  and loaded.user_id = ${skillEvents.userId}
                  and loaded.skill_id = ${skillEvents.skillId}
                  and loaded.action = 'load'
                  and loaded.created_at <= ${skillEvents.createdAt}
              )
          )::int`,
          appliedAfterLoad: sql<number>`count(*) filter (
            where ${skillEvents.action} = 'apply'
              and exists (
                select 1
                from skill_events loaded
                where coalesce(${skillEvents.journeyId}, ${skillEvents.sessionId}) is not null
                  and coalesce(loaded.journey_id, loaded.session_id) = coalesce(${skillEvents.journeyId}, ${skillEvents.sessionId})
                  and loaded.user_id = ${skillEvents.userId}
                  and loaded.skill_id = ${skillEvents.skillId}
                  and loaded.action = 'load'
                  and loaded.created_at <= ${skillEvents.createdAt}
              )
          )::int`,
          loads: sql<number>`count(*) filter (where ${skillEvents.action} = 'load')::int`,
          // 세션 ID 없는 과거 CLI 로드는 전체 로드에는 넣되 전환율 분모에서는 구분한다.
          linkableLoads: sql<number>`count(*) filter (
            where ${skillEvents.action} = 'load'
              and coalesce(${skillEvents.journeyId}, ${skillEvents.sessionId}) is not null
          )::int`,
        })
        .from(skillEvents)
        .innerJoin(catalogItems, eq(catalogItems.id, skillEvents.skillId))
        .where(activityPopulation(grassSince))
        .groupBy(kstDayExpr)
        .orderBy(kstDayExpr)

      // 4. 시간대별 사용 인원 — KST (조회 기간)
      const hourlyRows = await db
        .select({
          hour: kstHourExpr,
          users: sql<number>`count(distinct ${skillEvents.userId})::int`,
        })
        .from(skillEvents)
        .innerJoin(catalogItems, eq(catalogItems.id, skillEvents.skillId))
        .where(appliedPopulation(since))
        .groupBy(kstHourExpr)
        .orderBy(kstHourExpr)

      // 5. 일별 사용 인원 — 각 날짜 안에서는 같은 사용자를 한 번만 센다.
      //    journey를 우선하고 기존 MCP session을 fallback으로 사용해 로드 전환을 판별한다.
      //    화면에는 고유 사용자 수를 집계하고, 둘 다 없는 적용은 직접 적용으로 남긴다.
      const flowResult = await db.execute(sql`
        WITH load_journeys AS (
          SELECT
            loaded.user_id,
            COALESCE(loaded.journey_id, loaded.session_id) AS flow_id,
            loaded.skill_id,
            min(loaded.created_at) AS loaded_at
          FROM skill_events loaded
          INNER JOIN catalog_items catalog ON catalog.id = loaded.skill_id
          WHERE loaded.action = 'load'
            AND loaded.user_id IS NOT NULL
            AND COALESCE(loaded.journey_id, loaded.session_id) IS NOT NULL
            AND loaded.created_at >= ${since}
          GROUP BY loaded.user_id, COALESCE(loaded.journey_id, loaded.session_id), loaded.skill_id
        ), classified_loads AS (
          SELECT
            load_journeys.user_id,
            load_journeys.loaded_at,
            EXISTS (
              SELECT 1
              FROM skill_events applied
              WHERE COALESCE(applied.journey_id, applied.session_id) = load_journeys.flow_id
                AND applied.user_id = load_journeys.user_id
                AND applied.skill_id = load_journeys.skill_id
                AND applied.action = 'apply'
                AND applied.created_at >= load_journeys.loaded_at
            ) AS applied_after_load
          FROM load_journeys
        ), apply_journeys AS (
          SELECT
            applied.user_id,
            COALESCE(applied.journey_id, applied.session_id) AS flow_id,
            applied.skill_id,
            min(applied.created_at) AS applied_at
          FROM skill_events applied
          INNER JOIN catalog_items catalog ON catalog.id = applied.skill_id
          WHERE applied.action = 'apply'
            AND applied.user_id IS NOT NULL
            AND COALESCE(applied.journey_id, applied.session_id) IS NOT NULL
            AND applied.created_at >= ${since}
          GROUP BY applied.user_id, COALESCE(applied.journey_id, applied.session_id), applied.skill_id
        ), direct_applies AS (
          SELECT apply_journeys.user_id, apply_journeys.applied_at
          FROM apply_journeys
          WHERE NOT EXISTS (
            SELECT 1
            FROM skill_events loaded
            WHERE COALESCE(loaded.journey_id, loaded.session_id) = apply_journeys.flow_id
              AND loaded.user_id = apply_journeys.user_id
              AND loaded.skill_id = apply_journeys.skill_id
              AND loaded.action = 'load'
              AND loaded.created_at <= apply_journeys.applied_at
          )
          UNION ALL
          SELECT applied.user_id, applied.created_at AS applied_at
          FROM skill_events applied
          INNER JOIN catalog_items catalog ON catalog.id = applied.skill_id
          WHERE applied.action = 'apply'
            AND applied.user_id IS NOT NULL
            AND applied.journey_id IS NULL
            AND applied.session_id IS NULL
            AND applied.created_at >= ${since}
        ), all_load_daily AS (
          SELECT
            to_char(date_trunc('day', loaded.created_at at time zone 'Asia/Seoul'), 'YYYY-MM-DD') AS date,
            count(distinct loaded.user_id)::int AS loaded
          FROM skill_events loaded
          INNER JOIN catalog_items catalog ON catalog.id = loaded.skill_id
          WHERE loaded.action = 'load'
            AND loaded.user_id IS NOT NULL
            AND loaded.created_at >= ${since}
          GROUP BY 1
        ), linked_load_daily AS (
          SELECT
            to_char(date_trunc('day', loaded_at at time zone 'Asia/Seoul'), 'YYYY-MM-DD') AS date,
            count(distinct user_id)::int AS linkable_loaded,
            count(distinct user_id) filter (where applied_after_load)::int AS applied_after_load
          FROM classified_loads
          GROUP BY 1
        ), direct_daily AS (
          SELECT
            to_char(date_trunc('day', applied_at at time zone 'Asia/Seoul'), 'YYYY-MM-DD') AS date,
            count(distinct user_id)::int AS direct_applied
          FROM direct_applies
          GROUP BY 1
        ), summary AS (
          SELECT
            (
              SELECT count(distinct loaded.user_id)::int
              FROM skill_events loaded
              INNER JOIN catalog_items catalog ON catalog.id = loaded.skill_id
              WHERE loaded.action = 'load'
                AND loaded.user_id IS NOT NULL
                AND loaded.created_at >= ${since}
            ) AS loaded,
            (SELECT count(distinct user_id)::int FROM classified_loads) AS linkable_loaded,
            (
              SELECT count(distinct user_id)::int
              FROM classified_loads
              WHERE applied_after_load
            ) AS applied_after_load,
            (SELECT count(distinct user_id)::int FROM direct_applies) AS direct_applied
        ), all_dates AS (
          SELECT date FROM all_load_daily
          UNION
          SELECT date FROM linked_load_daily
          UNION
          SELECT date FROM direct_daily
        )
        SELECT
          all_dates.date,
          COALESCE(direct_daily.direct_applied, 0)::int AS direct_applied,
          COALESCE(all_load_daily.loaded, 0)::int AS loaded,
          COALESCE(linked_load_daily.linkable_loaded, 0)::int AS linkable_loaded,
          COALESCE(linked_load_daily.applied_after_load, 0)::int AS applied_after_load,
          summary.direct_applied AS summary_direct_applied,
          summary.loaded AS summary_loaded,
          summary.linkable_loaded AS summary_linkable_loaded,
          summary.applied_after_load AS summary_applied_after_load
        FROM all_dates
        CROSS JOIN summary
        LEFT JOIN all_load_daily ON all_load_daily.date = all_dates.date
        LEFT JOIN linked_load_daily ON linked_load_daily.date = all_dates.date
        LEFT JOIN direct_daily ON direct_daily.date = all_dates.date
        ORDER BY 1
      `)

      // 6. 사용자별 사용량 (조회 기간) — 개인 식별 데이터라 관리자에게만 조회한다
      const memberRows = isAdmin
        ? await db
            .select({
              name: users.name,
              uniqueSkills: sql<number>`count(distinct ${skillEvents.skillId}) filter (where ${inArray(skillEvents.action, ACTUAL_USAGE_ACTIONS)})::int`,
              loaded: sql<number>`count(*) filter (where ${skillEvents.action} = 'load')::int`,
              applied: sql<number>`count(*) filter (where ${skillEvents.action} = 'apply')::int`,
              lastActiveAt: sql<Date | null>`max(${skillEvents.createdAt})`,
            })
            .from(skillEvents)
            .innerJoin(catalogItems, eq(catalogItems.id, skillEvents.skillId))
            .innerJoin(users, eq(users.id, skillEvents.userId))
            .where(activityPopulation(since))
            .groupBy(users.id, users.name)
            .orderBy(
              sql`count(*) filter (where ${skillEvents.action} = 'apply') desc`,
              sql`count(*) filter (where ${skillEvents.action} = 'load') desc`
            )
            .limit(MEMBER_LIMIT)
        : null

      // 7. 에이전트 사용량 잔디 — 짧은 증분 batch만 종료일에 귀속한다.
      //    여러 날을 덮는 초기 backfill은 내부 일별 분포를 알 수 없어 제외한다.
      const agentGrassRows = await db
        .select({
          date: agentKstDayExpr,
          turns: sql<number>`sum(${axAgentTelemetryBatches.turns})::int`,
          agents: sql<number>`count(distinct ${axAgentTelemetryBatches.agentId})::int`,
        })
        .from(axAgentTelemetryBatches)
        .where(
          and(
            gte(axAgentTelemetryBatches.windowStart, grassSince),
            sql`${axAgentTelemetryBatches.windowEnd} >= ${axAgentTelemetryBatches.windowStart}`,
            sql`${axAgentTelemetryBatches.windowEnd} - ${axAgentTelemetryBatches.windowStart} <= interval '24 hours'`
          )
        )
        .groupBy(agentKstDayExpr)
        .orderBy(agentKstDayExpr)

      const totalParticipants = num(cumulative?.users)
      const catalogSkills = num(catalog?.count)
      const grassLoadCounts = new Map(grassRows.map((row) => [row.date, num(row.loads)]))
      const grassLinkableCounts = new Map(
        grassRows.map((row) => [row.date, num(row.linkableLoads)])
      )
      const grassDirectCounts = new Map(grassRows.map((row) => [row.date, num(row.directApplied)]))
      const grassConvertedCounts = new Map(
        grassRows.map((row) => [row.date, num(row.appliedAfterLoad)])
      )
      const agentCounts = new Map(agentGrassRows.map((row) => [row.date, num(row.agents)]))
      const flowSummaryRow = flowResult.rows[0]

      const memberUsage: AxOverviewMemberRow[] | null = memberRows
        ? memberRows.map((row) => ({
            name: (row.name ?? '').trim() || '이름 미설정',
            uniqueSkills: num(row.uniqueSkills),
            loaded: num(row.loaded),
            applied: num(row.applied),
            lastActiveAt: toIso(row.lastActiveAt),
          }))
        : null

      return panelOk(
        meta,
        {
          totalParticipants,
          catalogSkills,
          grassDaily: fillDailySeries(
            new Map(
              grassRows.map((row) => [
                row.date,
                num(row.directApplied) + num(row.appliedAfterLoad),
              ])
            ),
            grassSince,
            now
          ).map((point) => ({
            date: point.date,
            events: point.value,
            loads: grassLoadCounts.get(point.date) ?? 0,
            linkableLoads: grassLinkableCounts.get(point.date) ?? 0,
            directApplied: grassDirectCounts.get(point.date) ?? 0,
            appliedAfterLoad: grassConvertedCounts.get(point.date) ?? 0,
          })),
          agentGrassDaily: fillDailySeries(
            new Map(agentGrassRows.map((row) => [row.date, num(row.turns)])),
            grassSince,
            now
          ).map((point) => ({
            date: point.date,
            events: point.value,
            agents: agentCounts.get(point.date) ?? 0,
          })),
          dailySkillFlow: fillDailySkillFlow(
            flowResult.rows.map((row) => ({
              date: String(row.date),
              directApplied: num(row.direct_applied),
              loaded: num(row.loaded),
              linkableLoaded: num(row.linkable_loaded),
              appliedAfterLoad: num(row.applied_after_load),
            })),
            since,
            now
          ),
          skillFlowSummary: {
            directApplied: num(flowSummaryRow?.summary_direct_applied),
            loaded: num(flowSummaryRow?.summary_loaded),
            linkableLoaded: num(flowSummaryRow?.summary_linkable_loaded),
            appliedAfterLoad: num(flowSummaryRow?.summary_applied_after_load),
          },
          hourlyDensity: fillMissingHours(
            hourlyRows.map((row) => ({ hour: num(row.hour), users: num(row.users) }))
          ),
          memberUsage,
        },
        [
          // aitk = 사람이 쓰는 팀 스킬, bbopters-shared = 에이전트 스킬 — 출처를 라벨로 가른다
          { label: '팀 스킬', value: catalogSkills.toLocaleString('ko-KR'), hint: '개' },
        ]
      )
    } catch (error) {
      log.error('성과 요약 집계 실패', error, { days: span })
      return panelError<AxOverviewData>(meta, '성과 요약을 불러오지 못했습니다')
    }
  },
}
