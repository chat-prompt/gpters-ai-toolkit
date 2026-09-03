/**
 * AX Dashboard — 장기 활동(잔디) 패널
 *
 * 요약 화면 맨 아래의 최근 365일 잔디 두 장(구성원 스킬 활동, 에이전트 턴)을 만든다.
 * 기간 선택과 무관한 고정 윈도우라 요약 패널에서 떼어냈다 — 기간을 바꿀 때마다
 * 가장 무거운 코호트 집계를 다시 돌리지 않기 위해서다. 화면에는 탭으로 노출하지 않는다.
 */

import { axAgentTelemetryBatches, catalogItems, db, skillEvents } from '@gpters/db'
import { and, eq, gte, inArray, sql } from 'drizzle-orm'
import { createLogger } from '../../core/logger'
import { fillDailySeries, num, startOfKstDay } from './kst'
import { panelError, panelOk } from './panel'
import type { AxActivityGrassData, AxPanel, AxPanelMeta } from './types'

const log = createLogger('ax-activity-grass')

const meta: AxPanelMeta = {
  id: 'activity-grass',
  title: '장기 활동',
  description: '최근 365일 구성원 스킬 활동과 에이전트 턴',
  source: 'aitk DB (skill_events · ax_agent_telemetry_batches)',
  visibility: 'org',
  usesPeriod: false,
  hidden: true,
}

/**
 * 잔디밭 고정 윈도우 — 오늘을 포함한 최근 365일
 *
 * 잔디밭은 기간 선택과 무관한 "장기 습관" 그림이라 조회 기간을 따라가지 않는다.
 * 날짜가 지나면 창이 최신 쪽으로 하루씩 굴러간다.
 */
const GRASS_WINDOW_DAYS = 365

/** created_at을 KST 일자 문자열(YYYY-MM-DD)로 자른 표현식 */
const kstDayExpr = sql<string>`to_char(date_trunc('day', ${skillEvents.createdAt} at time zone 'Asia/Seoul'), 'YYYY-MM-DD')`

/** 에이전트 증분 batch 종료 시각을 KST 일자 문자열로 자른 표현식 */
const agentKstDayExpr = sql<string>`to_char(date_trunc('day', ${axAgentTelemetryBatches.windowEnd} at time zone 'Asia/Seoul'), 'YYYY-MM-DD')`

/** 사용자×흐름(journey, 없으면 session)×스킬 — 로드 코호트 키 */
const cohortKey = sql`(
  ${skillEvents.userId},
  coalesce(${skillEvents.journeyId}, ${skillEvents.sessionId}),
  ${skillEvents.skillId}
)`

/** 이후 적용과 연결할 수 있는 로드 — flow ID와 user ID가 모두 있어야 한다 */
const linkableLoad = sql`${skillEvents.action} = 'load'
  and coalesce(${skillEvents.journeyId}, ${skillEvents.sessionId}) is not null
  and ${skillEvents.userId} is not null`

/**
 * 장기 활동(잔디) 패널
 *
 * 두 잔디는 서로 다른 테이블을 읽으므로 동시에 조회한다.
 */
export const activityGrassPanel: AxPanel<AxActivityGrassData> = {
  meta,

  async load() {
    const now = new Date()
    const grassSince = startOfKstDay(
      new Date(now.getTime() - (GRASS_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000)
    )

    try {
      const [grassRows, agentGrassRows] = await Promise.all([
        // 1. 구성원 스킬 활동 — 로드 없이 적용(적용 날짜 기준) + 로드 후 적용(로드 코호트, 로드 날짜 기준).
        //    적용 날짜 기준 이벤트 수를 쓰면 기간 전 로드·반복 적용 때문에 분자가 분모를 넘을 수 있다.
        db
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
            // 로드 코호트 중 같은 사용자·흐름·스킬에서 이후 apply가 한 번이라도 있으면 전환으로 센다.
            appliedAfterLoad: sql<number>`count(distinct ${cohortKey}) filter (
              where ${linkableLoad}
                and exists (
                  select 1
                  from skill_events applied
                  where coalesce(applied.journey_id, applied.session_id) = coalesce(${skillEvents.journeyId}, ${skillEvents.sessionId})
                    and applied.user_id = ${skillEvents.userId}
                    and applied.skill_id = ${skillEvents.skillId}
                    and applied.action = 'apply'
                    and applied.created_at >= ${skillEvents.createdAt}
                )
            )::int`,
            loads: sql<number>`count(*) filter (where ${skillEvents.action} = 'load')::int`,
            // 세션 ID 없는 과거 CLI 로드는 전체 로드에는 넣되 전환율 분모에서는 구분한다.
            linkableLoads: sql<number>`count(distinct ${cohortKey}) filter (where ${linkableLoad})::int`,
          })
          .from(skillEvents)
          .innerJoin(catalogItems, eq(catalogItems.id, skillEvents.skillId))
          .where(and(gte(skillEvents.createdAt, grassSince), inArray(skillEvents.action, ['load', 'apply'])))
          .groupBy(kstDayExpr)
          .orderBy(kstDayExpr),

        // 2. 에이전트 턴 — 짧은 증분 batch만 종료일에 귀속한다.
        //    여러 날을 덮는 초기 backfill은 내부 일별 분포를 알 수 없어 제외한다.
        db
          .select({
            date: agentKstDayExpr,
            turns: sql<number>`sum(${axAgentTelemetryBatches.turns})::int`,
            // 턴이 0인 빈 배치는 "활동 에이전트"로 세지 않는다.
            agents: sql<number>`count(distinct ${axAgentTelemetryBatches.agentId}) filter (where ${axAgentTelemetryBatches.turns} > 0)::int`,
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
          .orderBy(agentKstDayExpr),
      ])

      const loads = new Map(grassRows.map((row) => [row.date, num(row.loads)]))
      const linkable = new Map(grassRows.map((row) => [row.date, num(row.linkableLoads)]))
      const direct = new Map(grassRows.map((row) => [row.date, num(row.directApplied)]))
      const converted = new Map(grassRows.map((row) => [row.date, num(row.appliedAfterLoad)]))
      const agents = new Map(agentGrassRows.map((row) => [row.date, num(row.agents)]))

      return panelOk(meta, {
        grassDaily: fillDailySeries(
          new Map(grassRows.map((row) => [row.date, num(row.directApplied) + num(row.appliedAfterLoad)])),
          grassSince,
          now
        ).map((point) => ({
          date: point.date,
          events: point.value,
          loads: loads.get(point.date) ?? 0,
          linkableLoads: linkable.get(point.date) ?? 0,
          directApplied: direct.get(point.date) ?? 0,
          appliedAfterLoad: converted.get(point.date) ?? 0,
        })),
        agentGrassDaily: fillDailySeries(
          new Map(agentGrassRows.map((row) => [row.date, num(row.turns)])),
          grassSince,
          now
        ).map((point) => ({
          date: point.date,
          events: point.value,
          agents: agents.get(point.date) ?? 0,
        })),
      })
    } catch (error) {
      log.error('장기 활동 집계 실패', error)
      return panelError<AxActivityGrassData>(meta, '장기 활동을 불러오지 못했습니다')
    }
  },
}
