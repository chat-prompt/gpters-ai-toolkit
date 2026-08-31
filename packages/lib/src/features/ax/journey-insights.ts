/**
 * AX Dashboard — 개선 인사이트 패널
 *
 * 현재 수집되는 로그만으로 답할 수 있는 두 질문을 다룬다.
 * 1. 검색했지만 결과를 찾지 못한 지점은 어디인가?
 * 2. 검색 후보가 상세 확인과 적용 판단 기록으로 얼마나 이어지는가?
 *
 * get_plugin_content는 설치가 아니라 콘텐츠 조회이고, applied=true도 성공 판정이 아니다.
 * 따라서 이 파일은 설치율·실행 성공률이라는 이름을 쓰지 않는다.
 */

import { db } from '@gpters/db'
import { sql } from 'drizzle-orm'
import { createLogger } from '../../core/logger'
import { panelError, panelOk } from './panel'
import type {
  AxInsightPhraseRow,
  AxJourneyInsightsData,
  AxPanel,
  AxPanelMeta,
  AxSkillOutcomeRow,
} from './types'

const log = createLogger('ax-journey-insights')

/** 공식 무결과율 판단에 쓰는 기존 최소 표본 기준과 맞춘다 */
const MIN_SEARCH_SAMPLE = 100
/** 시작 후 이 시간이 지나도 완료가 없으면 보고 누락으로 분류한다. */
const EXECUTION_REPORT_TIMEOUT_MINUTES = 30

/** 자유 입력 문구가 표 폭을 깨거나 과도한 원문을 노출하지 않게 하는 표시 상한 */
const MAX_TEXT_LENGTH = 120

const meta: AxPanelMeta = {
  id: 'journey-insights',
  title: '탐색·결과 분석',
  description: '검색 후보가 상세 확인과 적용 판단 기록으로 이어지는 흐름',
  source: 'aitk DB (mcp_audit_logs · skill_events · ax_skill_execution_attempts)',
  // 검색어와 자유 입력 사유가 포함되므로 관리자에게만 제공한다.
  visibility: 'admin',
  parentId: 'skill-usage',
  usesPeriod: true,
}

/** count·numeric 계열을 안전하게 숫자로 바꾼다 */
function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** 0~100 비율. 분모가 없으면 0으로 꾸미지 않고 null */
function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round((numerator / denominator) * 10_000) / 100
}

/** timestamp 값을 ISO 8601로 정규화한다 */
function toIso(value: unknown): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** 검색어·사유를 한 줄로 정리하고 화면 노출 길이를 제한한다 */
function displayText(value: unknown): string {
  const compact = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (compact.length <= MAX_TEXT_LENGTH) return compact
  return `${compact.slice(0, MAX_TEXT_LENGTH - 1)}…`
}

/** node-postgres/Neon 공통 execute 응답에서 row 배열만 좁힌다 */
function rowsOf(result: unknown): Record<string, unknown>[] {
  const rows = (result as { rows?: unknown[] } | null)?.rows
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
}

/** 자유 입력 문구 집계 행 매핑 */
function phraseRows(rows: Record<string, unknown>[]): AxInsightPhraseRow[] {
  return rows
    .map((row) => ({ text: displayText(row.text), count: num(row.count) }))
    .filter((row) => row.text.length > 0)
}

/** 실행 결과 스키마 롤링 배포 전에는 기존 패널을 깨지 않고 계측만 준비 중으로 남긴다 */
async function loadExecutionSummary(span: number): Promise<{
  summary: Record<string, unknown>
  agents: Record<string, unknown>[]
} | null> {
  try {
    const [summaryResult, agentResult] = await Promise.all([
      db.execute(sql`
      SELECT
        count(*)::int AS attempts,
        count(*) filter (where start_observed = true)::int AS started_attempts,
        count(*) filter (where status <> 'running')::int AS completed_attempts,
        count(*) filter (
          where status = 'running'
            and started_at >= NOW() - make_interval(mins => ${EXECUTION_REPORT_TIMEOUT_MINUTES})
        )::int AS in_progress_attempts,
        count(*) filter (
          where status = 'running'
            and started_at < NOW() - make_interval(mins => ${EXECUTION_REPORT_TIMEOUT_MINUTES})
        )::int AS unreported_attempts,
        count(*) filter (where status <> 'running' and start_observed = false)::int AS completion_without_start,
        count(*) filter (where skill_version is null or trim(skill_version) = '')::int AS missing_version,
        count(*) filter (
          where status in ('success', 'partial', 'failed') and validation_method = 'none'
        )::int AS unvalidated_completed,
        avg(extract(epoch from (completed_at - started_at))) filter (
          where status <> 'running' and start_observed = true and completed_at >= started_at
        )::float AS average_duration_seconds,
        count(*) filter (where status = 'success')::int AS success,
        count(*) filter (where status = 'partial')::int AS partial,
        count(*) filter (where status = 'failed')::int AS failed,
        count(*) filter (where status = 'abandoned')::int AS abandoned,
        count(*) filter (
          where status in ('success', 'partial', 'failed')
            and validation_passed is not null
        )::int AS verified_attempts,
        count(*) filter (
          where status = 'success' and validation_passed = true
        )::int AS verified_successes
      FROM ax_skill_execution_attempts
      WHERE started_at >= NOW() - make_interval(days => ${span})
         OR completed_at >= NOW() - make_interval(days => ${span})
      `),
      db.execute(sql`
        SELECT
          agent_id,
          agent,
          count(*)::int AS attempts,
          count(*) filter (where status <> 'running')::int AS completed,
          count(*) filter (where status = 'success')::int AS success,
          count(*) filter (where status = 'partial')::int AS partial,
          count(*) filter (where status = 'failed')::int AS failed,
          count(*) filter (where status = 'abandoned')::int AS abandoned,
          count(*) filter (
            where status = 'running'
              and started_at >= NOW() - make_interval(mins => ${EXECUTION_REPORT_TIMEOUT_MINUTES})
          )::int AS in_progress,
          count(*) filter (
            where status = 'running'
              and started_at < NOW() - make_interval(mins => ${EXECUTION_REPORT_TIMEOUT_MINUTES})
          )::int AS unreported,
          count(*) filter (
            where status in ('success', 'partial', 'failed') and validation_passed is not null
          )::int AS verified_attempts,
          count(*) filter (where status = 'success' and validation_passed = true)::int AS verified_successes,
          max(coalesce(completed_at, started_at)) AS last_reported_at
        FROM ax_skill_execution_attempts
        WHERE started_at >= NOW() - make_interval(days => ${span})
           OR completed_at >= NOW() - make_interval(days => ${span})
        GROUP BY agent_id, agent
        ORDER BY unreported DESC, failed DESC, attempts DESC, agent_id ASC
      `),
    ])
    return { summary: rowsOf(summaryResult)[0] ?? {}, agents: rowsOf(agentResult) }
  } catch (error) {
    log.warn('실행 결과 테이블 미준비 — 기존 탐색 지표만 표시한다', { error })
    return null
  }
}

/**
 * 개선 인사이트 패널
 *
 * 모든 분석은 선택 기간의 rolling window를 쓴다. 같은 journey(없으면 기존 MCP session)에서
 * 같은 스킬을 여러 번 로드한 경우 하나의 `흐름×스킬` 조합으로 합쳐 반복 호출을 제거한다.
 */
export const journeyInsightsPanel: AxPanel<AxJourneyInsightsData> = {
  meta,

  async load({ days }) {
    const span = Number.isFinite(days) && days > 0 ? Math.floor(days) : 30

    try {
      const [
        searchSummaryResult,
        searchFlowResult,
        zeroQueryResult,
        skillOutcomeResult,
        searchReasonResult,
        notAppliedReasonResult,
        executionSummary,
      ] = await Promise.all([
        // 실제 검색 요청은 audit log 한 행이므로, 검색 결과마다 한 행인 skill_events보다
        // query-level 무결과율의 분모로 적합하다. 결과 배열이 없는 로그는 판정 불가로 분리한다.
        db.execute(sql`
          SELECT
            count(*) filter (where jsonb_typeof(search_results) = 'array')::int
              AS observed_searches,
            count(*) filter (where search_results is null
              or jsonb_typeof(search_results) <> 'array')::int AS unobserved_searches,
            count(*) filter (where jsonb_typeof(search_results) = 'array'
              and jsonb_array_length(search_results) = 0)::int AS zero_result_searches
          FROM mcp_audit_logs
          WHERE tool IN ('search_plugins', 'semantic_search')
            AND response_status = 'success'
            AND created_at >= NOW() - make_interval(days => ${span})
        `),

        // 검색 결과 한 개가 한 행인 skill_events에서 반복 포함 총 노출을 함께 세되,
        // 전환 퍼널은 journey 우선, 기존 MCP session fallback의 흐름×스킬로 중복 제거한다.
        db.execute(sql`
          WITH raw_exposed AS (
            SELECT COALESCE(journey_id, session_id) AS flow_id, skill_id, created_at
            FROM skill_events
            WHERE action = 'search'
              AND skill_id <> '__zero_result__'
              AND created_at >= NOW() - make_interval(days => ${span})
          ), exposed AS (
            SELECT flow_id, skill_id, min(created_at) AS exposed_at
            FROM raw_exposed
            WHERE flow_id IS NOT NULL
            GROUP BY flow_id, skill_id
          ), journey AS (
            SELECT
              exposed.*,
              (
                SELECT min(loaded.created_at)
                FROM skill_events loaded
                WHERE COALESCE(loaded.journey_id, loaded.session_id) = exposed.flow_id
                  AND loaded.skill_id = exposed.skill_id
                  AND loaded.action = 'load'
                  AND loaded.created_at >= exposed.exposed_at
              ) AS loaded_at
            FROM exposed
          ), classified AS (
            SELECT
              journey.*,
              CASE WHEN journey.loaded_at IS NULL THEN false ELSE EXISTS (
                SELECT 1
                FROM skill_events applied
                WHERE COALESCE(applied.journey_id, applied.session_id) = journey.flow_id
                  AND applied.skill_id = journey.skill_id
                  AND applied.action = 'apply'
                  AND applied.created_at >= journey.loaded_at
              ) END AS is_applied,
              CASE WHEN journey.loaded_at IS NULL THEN false ELSE EXISTS (
                SELECT 1
                FROM skill_events skipped
                WHERE COALESCE(skipped.journey_id, skipped.session_id) = journey.flow_id
                  AND skipped.skill_id = journey.skill_id
                  AND skipped.action = 'skip'
                  AND skipped.query IS NULL
                  AND COALESCE(skipped.context, '') NOT LIKE 'auto:%'
                  AND skipped.created_at >= journey.loaded_at
              ) END AS is_not_applied
            FROM journey
          )
          SELECT
            (SELECT count(*)::int FROM raw_exposed) AS total_exposures,
            count(*)::int AS exposed_pairs,
            count(*) filter (where loaded_at is not null)::int AS loaded_from_search_pairs,
            count(*) filter (where loaded_at is not null and is_applied)::int
              AS applied_from_search_pairs,
            count(*) filter (where loaded_at is not null and not is_applied and is_not_applied)::int
              AS not_applied_from_search_pairs,
            count(*) filter (where loaded_at is not null and not is_applied and not is_not_applied)::int
              AS unreported_from_search_pairs
          FROM classified
        `),

        // 요청 본문은 MCP(JSON-RPC)와 REST 형태가 모두 존재해 여러 경로를 순서대로 읽는다.
        db.execute(sql`
          WITH zero_queries AS (
            SELECT
              trim(COALESCE(
                request_params->'params'->'arguments'->>'query',
                request_params->'arguments'->>'query',
                request_params->>'query'
              )) AS query,
              created_at
            FROM mcp_audit_logs
            WHERE tool IN ('search_plugins', 'semantic_search')
              AND response_status = 'success'
              AND jsonb_typeof(search_results) = 'array'
              AND jsonb_array_length(search_results) = 0
              AND created_at >= NOW() - make_interval(days => ${span})
          )
          SELECT min(query) AS text, count(*)::int AS count, max(created_at) AS last_seen_at
          FROM zero_queries
          WHERE query IS NOT NULL AND query <> ''
          GROUP BY lower(query)
          ORDER BY count(*) DESC, max(created_at) DESC
          LIMIT 8
        `),

        // auto: 스킵은 명시적 미적용이 아니라 보고 누락이다. 같은 조합에 apply가 하나라도
        // 있으면 적용으로 우선 분류하고, 그 다음 명시 미적용, 나머지를 미보고로 둔다.
        db.execute(sql`
          WITH loaded AS (
            SELECT COALESCE(journey_id, session_id) AS flow_id, skill_id, min(created_at) AS loaded_at
            FROM skill_events
            WHERE action = 'load'
              AND COALESCE(journey_id, session_id) IS NOT NULL
              AND created_at >= NOW() - make_interval(days => ${span})
            GROUP BY COALESCE(journey_id, session_id), skill_id
          ), classified AS (
            SELECT
              loaded.flow_id,
              loaded.skill_id,
              COALESCE(bool_or(events.action = 'apply'
                AND events.created_at >= loaded.loaded_at), false) AS applied,
              COALESCE(bool_or(events.action = 'skip'
                AND events.query IS NULL
                AND COALESCE(events.context, '') NOT LIKE 'auto:%'
                AND events.created_at >= loaded.loaded_at), false) AS not_applied
            FROM loaded
            LEFT JOIN skill_events events
              ON COALESCE(events.journey_id, events.session_id) = loaded.flow_id
              AND events.skill_id = loaded.skill_id
              AND events.action IN ('apply', 'skip')
            GROUP BY loaded.flow_id, loaded.skill_id
          ), skill_rollup AS (
            SELECT
              classified.skill_id,
              COALESCE(catalog_items.name, classified.skill_id) AS name,
              count(*)::int AS loaded_pairs,
              count(*) filter (where applied)::int AS applied_pairs,
              count(*) filter (where not applied and not_applied)::int AS not_applied_pairs,
              count(*) filter (where not applied and not not_applied)::int AS unreported_pairs
            FROM classified
            LEFT JOIN catalog_items ON catalog_items.id = classified.skill_id
            GROUP BY classified.skill_id, catalog_items.name
          ), ranked AS (
            SELECT
              *,
              sum(loaded_pairs) over()::int AS total_loaded_pairs,
              sum(applied_pairs) over()::int AS total_applied_pairs,
              sum(not_applied_pairs) over()::int AS total_not_applied_pairs,
              sum(unreported_pairs) over()::int AS total_unreported_pairs
            FROM skill_rollup
          )
          SELECT * FROM ranked
          ORDER BY unreported_pairs DESC, loaded_pairs DESC, name ASC
          LIMIT 12
        `),

        // report_search_skip은 검색 결과의 skillId마다 행을 남긴다. 한 번의 보고가 결과 수만큼
        // 부풀지 않도록 세션·검색어·사유·시각 조합으로 먼저 중복 제거한다.
        db.execute(sql`
          WITH reports AS (
            SELECT DISTINCT session_id, query, context, created_at
            FROM skill_events
            WHERE action = 'skip'
              AND query IS NOT NULL
              AND context IS NOT NULL
              AND trim(context) <> ''
              AND created_at >= NOW() - make_interval(days => ${span})
          )
          SELECT min(trim(context)) AS text, count(*)::int AS count
          FROM reports
          GROUP BY lower(trim(context))
          ORDER BY count(*) DESC, min(trim(context)) ASC
          LIMIT 6
        `),

        db.execute(sql`
          SELECT min(trim(context)) AS text, count(*)::int AS count
          FROM skill_events
          WHERE action = 'skip'
            AND query IS NULL
            AND context IS NOT NULL
            AND trim(context) <> ''
            AND context NOT LIKE 'auto:%'
            AND created_at >= NOW() - make_interval(days => ${span})
          GROUP BY lower(trim(context))
          ORDER BY count(*) DESC, min(trim(context)) ASC
          LIMIT 6
        `),

        loadExecutionSummary(span),
      ])

      const searchSummary = rowsOf(searchSummaryResult)[0] ?? {}
      const searchFlow = rowsOf(searchFlowResult)[0] ?? {}
      const observedSearches = num(searchSummary.observed_searches)
      const zeroResultSearches = num(searchSummary.zero_result_searches)
      const totalExposures = num(searchFlow.total_exposures)
      const exposedPairs = num(searchFlow.exposed_pairs)
      const loadedFromSearchPairs = num(searchFlow.loaded_from_search_pairs)
      const appliedFromSearchPairs = num(searchFlow.applied_from_search_pairs)
      const notAppliedFromSearchPairs = num(searchFlow.not_applied_from_search_pairs)
      const unreportedFromSearchPairs = num(searchFlow.unreported_from_search_pairs)
      const decidedFromSearchPairs = appliedFromSearchPairs + notAppliedFromSearchPairs

      const outcomeRows = rowsOf(skillOutcomeResult)
      const outcomeSummary = outcomeRows[0] ?? {}
      const loadedPairs = num(outcomeSummary.total_loaded_pairs)
      const appliedPairs = num(outcomeSummary.total_applied_pairs)
      const notAppliedPairs = num(outcomeSummary.total_not_applied_pairs)
      const unreportedPairs = num(outcomeSummary.total_unreported_pairs)
      const explicitOutcomes = appliedPairs + notAppliedPairs

      const skillOutcomes: AxSkillOutcomeRow[] = outcomeRows.map((row) => {
        const loaded = num(row.loaded_pairs)
        const applied = num(row.applied_pairs)
        const notApplied = num(row.not_applied_pairs)
        return {
          skillId: String(row.skill_id ?? ''),
          name: String(row.name ?? row.skill_id ?? ''),
          loadedPairs: loaded,
          appliedPairs: applied,
          notAppliedPairs: notApplied,
          unreportedPairs: num(row.unreported_pairs),
          outcomeCoverageRate: rate(applied + notApplied, loaded),
        }
      })

      const executionRow = executionSummary?.summary
      const executionAttempts = executionRow ? num(executionRow.attempts) : 0
      const executionSuccess = executionRow ? num(executionRow.success) : 0
      const executionPartial = executionRow ? num(executionRow.partial) : 0
      const executionFailed = executionRow ? num(executionRow.failed) : 0
      const executionAbandoned = executionRow ? num(executionRow.abandoned) : 0
      const verifiedAttempts = executionRow ? num(executionRow.verified_attempts) : 0
      const verifiedSuccesses = executionRow ? num(executionRow.verified_successes) : 0
      const selfReportedCompleted = executionSuccess + executionPartial + executionFailed

      return panelOk(meta, {
        exploration: {
          observedSearches,
          unobservedSearches: num(searchSummary.unobserved_searches),
          zeroResultSearches,
          zeroResultRate: rate(zeroResultSearches, observedSearches),
          totalExposures,
          exposedPairs,
          loadedFromSearchPairs,
          appliedFromSearchPairs,
          notAppliedFromSearchPairs,
          unreportedFromSearchPairs,
          searchToLoadRate: rate(loadedFromSearchPairs, exposedPairs),
          loadToDecisionRate: rate(decidedFromSearchPairs, loadedFromSearchPairs),
          sampleIsSignificant: observedSearches >= MIN_SEARCH_SAMPLE,
        },
        zeroResultQueries: rowsOf(zeroQueryResult).map((row) => ({
          text: displayText(row.text),
          count: num(row.count),
          lastSeenAt: toIso(row.last_seen_at),
        })).filter((row) => row.text.length > 0),
        execution: executionSummary === null || executionAttempts === 0
          ? null
          : {
              attempts: executionAttempts,
              startedAttempts: num(executionRow?.started_attempts),
              completedAttempts: num(executionRow?.completed_attempts),
              inProgressAttempts: num(executionRow?.in_progress_attempts),
              unreportedAttempts: num(executionRow?.unreported_attempts),
              completionWithoutStart: num(executionRow?.completion_without_start),
              missingVersion: num(executionRow?.missing_version),
              unvalidatedCompleted: num(executionRow?.unvalidated_completed),
              averageDurationSeconds: executionRow?.average_duration_seconds === null || executionRow?.average_duration_seconds === undefined
                ? null
                : Math.round(num(executionRow.average_duration_seconds)),
              success: executionSuccess,
              partial: executionPartial,
              failed: executionFailed,
              abandoned: executionAbandoned,
              verifiedAttempts,
              verifiedSuccesses,
              verifiedSuccessRate: rate(verifiedSuccesses, verifiedAttempts),
              selfReportedSuccessRate: rate(executionSuccess, selfReportedCompleted),
              agents: (executionSummary?.agents ?? []).map((row) => {
                const agentVerifiedAttempts = num(row.verified_attempts)
                return {
                  agentId: String(row.agent_id ?? ''),
                  runtime: String(row.agent ?? ''),
                  attempts: num(row.attempts),
                  completed: num(row.completed),
                  success: num(row.success),
                  partial: num(row.partial),
                  failed: num(row.failed),
                  abandoned: num(row.abandoned),
                  inProgress: num(row.in_progress),
                  unreported: num(row.unreported),
                  verifiedAttempts: agentVerifiedAttempts,
                  verifiedSuccessRate: rate(num(row.verified_successes), agentVerifiedAttempts),
                  lastReportedAt: toIso(row.last_reported_at),
                }
              }).filter((row) => row.agentId.length > 0),
            },
        outcomes: {
          loadedPairs,
          appliedPairs,
          notAppliedPairs,
          unreportedPairs,
          outcomeCoverageRate: rate(explicitOutcomes, loadedPairs),
          confirmedApplyRate: rate(appliedPairs, explicitOutcomes),
        },
        skillOutcomes,
        searchSkipReasons: phraseRows(rowsOf(searchReasonResult)),
        notAppliedReasons: phraseRows(rowsOf(notAppliedReasonResult)),
      })
    } catch (error) {
      log.error('개선 인사이트 집계 실패', error, { days: span })
      return panelError<AxJourneyInsightsData>(meta, '개선 인사이트를 불러오지 못했습니다')
    }
  },
}
