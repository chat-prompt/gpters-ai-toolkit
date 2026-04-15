/**
 * 주간 리포트 데이터 생성
 *
 * analyze-mcp-usage.mjs 스크립트의 핵심 쿼리를 타입드 함수로 포팅.
 * 이미지 렌더러(Phase B)와 cron route(Phase C)에서 사용.
 *
 * @packageDocumentation
 */

import { db } from '@gpters/db'
import { sql } from 'drizzle-orm'
import { createLogger } from '../core/logger'
import { ZERO_RESULT_SKILL_ID } from './skill-events'

const log = createLogger('weekly-report')

// ─── 목표치 (analyze-mcp-usage.mjs의 TARGETS와 동일) ──────
export const TARGETS = {
  searchToViewPct: 15,
  viewToDeployPct: 10,
  zeroResultPct: 10,
  skillApplyPct: 50,
  searchSkipPct: 30,
  errorRatePct: 1.0,
  avgResponseMs: 500,
  searchResponseMs: 1500,
} as const

// ─── 타입 ──────────────────────────────────────────────────

export interface TargetMetric {
  name: string
  actual: number
  target: number
  unit: string
  /** true = 높을수록 좋음 (전환율), false = 낮을수록 좋음 (에러율) */
  higher: boolean
  achieved: boolean
  note?: string
}

export interface ClientBreakdown {
  client: string
  total: number
  searches: number
  views: number
  deploys: number
  errors: number
  avgMs: number
}

export interface SessionFunnel {
  totalSessions: number
  searchSessions: number
  viewSessions: number
  deploySessions: number
  applySessions: number
  s2vRate: number
  v2dRate: number
  d2aRate: number
}

export interface WeeklyReportData {
  period: { days: number; generatedAt: string }
  summary: {
    totalLogs: number
    effectiveLogs: number
    uniqueUsers: number
    searchCount: number
    viewCount: number
    viewFromSearch: number
    deployCount: number
    skipCount: number
    outcomeCount: number
    outcomeApplied: number
    errorCount: number
    avgResponseTime: number
    avgSearchTime: number
    p50SearchTime: number
    p95SearchTime: number
  }
  clients: ClientBreakdown[]
  sessionFunnel: SessionFunnel
  /** skill_events 기반 무결과율 (%) */
  skillEventsZeroResultPct: number
  skillEventsZeroResultTotal: number
  /** 스킬 매칭 기반 추천 적중률 (%) */
  recommendationAccuracyPct: number
  recommendationTotal: number
  recommendationMatched: number
  targets: TargetMetric[]
  achievedCount: number
  totalTargets: number
}

// ─── 쿼리 함수들 ──────────────────────────────────────────

/** 섹션 1: 전체 요약 */
async function querySummary(days: number) {
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total_logs,
      COUNT(DISTINCT t.user_id)::int AS unique_users,
      COUNT(*) FILTER (WHERE tool IN ('search_plugins', 'semantic_search'))::int AS search_count,
      COUNT(*) FILTER (WHERE tool = 'get_plugin_content')::int AS view_count,
      COUNT(*) FILTER (WHERE tool = 'get_plugin_content' AND referral_source = 'search')::int AS view_from_search,
      COUNT(*) FILTER (WHERE tool = 'deploy_skill')::int AS deploy_count,
      COUNT(*) FILTER (WHERE tool = 'report_search_skip')::int AS skip_count,
      COUNT(*) FILTER (WHERE tool = 'report_skill_outcome')::int AS outcome_count,
      COUNT(*) FILTER (WHERE tool = 'report_skill_outcome' AND (request_params->'params'->'arguments'->>'applied')::boolean = true)::int AS outcome_applied,
      COUNT(*) FILTER (WHERE response_status = 'error' AND tool IS DISTINCT FROM 'report_session_event')::int AS error_count,
      COUNT(*) FILTER (WHERE tool IS DISTINCT FROM 'report_session_event')::int AS effective_logs,
      ROUND(AVG(response_time) FILTER (WHERE tool IS DISTINCT FROM 'report_session_event'))::int AS avg_response_time,
      ROUND(AVG(response_time) FILTER (WHERE tool IN ('search_plugins', 'semantic_search')))::int AS avg_search_time,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time) FILTER (WHERE tool IN ('search_plugins', 'semantic_search')))::int AS p50_search_time,
      ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time) FILTER (WHERE tool IN ('search_plugins', 'semantic_search')))::int AS p95_search_time
    FROM mcp_audit_logs l
    LEFT JOIN oauth_access_tokens t ON l.access_token_id = t.id
    WHERE l.created_at >= NOW() - make_interval(days => ${days})
  `)

  const row = result.rows[0] as Record<string, number | null>
  return {
    totalLogs: Number(row.total_logs) || 0,
    effectiveLogs: Number(row.effective_logs) || 0,
    uniqueUsers: Number(row.unique_users) || 0,
    searchCount: Number(row.search_count) || 0,
    viewCount: Number(row.view_count) || 0,
    viewFromSearch: Number(row.view_from_search) || 0,
    deployCount: Number(row.deploy_count) || 0,
    skipCount: Number(row.skip_count) || 0,
    outcomeCount: Number(row.outcome_count) || 0,
    outcomeApplied: Number(row.outcome_applied) || 0,
    errorCount: Number(row.error_count) || 0,
    avgResponseTime: Number(row.avg_response_time) || 0,
    avgSearchTime: Number(row.avg_search_time) || 0,
    p50SearchTime: Number(row.p50_search_time) || 0,
    p95SearchTime: Number(row.p95_search_time) || 0,
  }
}

/** 섹션 2: 클라이언트별 분포 */
async function queryClientBreakdown(days: number): Promise<ClientBreakdown[]> {
  const result = await db.execute(sql`
    SELECT
      COALESCE(client_type, 'unknown') AS client,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE tool IN ('search_plugins', 'semantic_search'))::int AS searches,
      COUNT(*) FILTER (WHERE tool = 'get_plugin_content')::int AS views,
      COUNT(*) FILTER (WHERE tool = 'deploy_skill')::int AS deploys,
      COUNT(*) FILTER (WHERE response_status = 'error')::int AS errors,
      ROUND(AVG(response_time))::int AS avg_ms
    FROM mcp_audit_logs
    WHERE created_at >= NOW() - make_interval(days => ${days})
    GROUP BY COALESCE(client_type, 'unknown')
    ORDER BY total DESC
  `)

  return (result.rows as Record<string, unknown>[]).map((r) => ({
    client: String(r.client),
    total: Number(r.total) || 0,
    searches: Number(r.searches) || 0,
    views: Number(r.views) || 0,
    deploys: Number(r.deploys) || 0,
    errors: Number(r.errors) || 0,
    avgMs: Number(r.avg_ms) || 0,
  }))
}

/** 사용자 기반 4단계 퍼널: 검색→조회→배포→사용 */
async function querySessionFunnel(days: number): Promise<SessionFunnel> {
  const result = await db.execute(sql`
    WITH user_funnel AS (
      SELECT
        t.user_id,
        bool_or(l.tool IN ('search_plugins', 'semantic_search')) AS searched,
        bool_or(l.tool = 'get_plugin_content') AS viewed,
        bool_or(l.tool = 'deploy_skill') AS deployed,
        bool_or(l.tool = 'report_skill_outcome'
          AND (l.request_params->'params'->'arguments'->>'applied')::boolean = true
        ) AS applied
      FROM mcp_audit_logs l
      JOIN oauth_access_tokens t ON l.access_token_id = t.id
      WHERE l.created_at >= NOW() - make_interval(days => ${days})
        AND t.user_id IS NOT NULL
      GROUP BY t.user_id
    )
    SELECT
      COUNT(*)::int AS total_users,
      COUNT(*) FILTER (WHERE searched)::int AS search_users,
      COUNT(*) FILTER (WHERE viewed)::int AS view_users,
      COUNT(*) FILTER (WHERE deployed)::int AS deploy_users,
      COUNT(*) FILTER (WHERE applied)::int AS apply_users,
      COUNT(*) FILTER (WHERE searched AND viewed)::int AS search_to_view,
      COUNT(*) FILTER (WHERE viewed AND deployed)::int AS view_to_deploy,
      COUNT(*) FILTER (WHERE deployed AND applied)::int AS deploy_to_apply
    FROM user_funnel
  `)

  const row = result.rows[0] as Record<string, number | null>
  const searchUsers = Number(row.search_users) || 0
  const viewUsers = Number(row.view_users) || 0
  const deployUsers = Number(row.deploy_users) || 0
  const searchToView = Number(row.search_to_view) || 0
  const viewToDeploy = Number(row.view_to_deploy) || 0
  const deployToApply = Number(row.deploy_to_apply) || 0
  return {
    totalSessions: Number(row.total_users) || 0,
    searchSessions: searchUsers,
    viewSessions: viewUsers,
    deploySessions: deployUsers,
    applySessions: Number(row.apply_users) || 0,
    s2vRate: searchUsers > 0 ? searchToView / searchUsers : 0,
    v2dRate: viewUsers > 0 ? viewToDeploy / viewUsers : 0,
    d2aRate: deployUsers > 0 ? deployToApply / deployUsers : 0,
  }
}

/** 무결과율 — audit_logs 기반 (검색 결과 0건 or top score < threshold) */
async function queryZeroResultRate(days: number) {
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total_searches,
      COUNT(*) FILTER (
        WHERE jsonb_array_length(COALESCE(search_results, '[]'::jsonb)) = 0
      )::int AS zero_result_count
    FROM mcp_audit_logs
    WHERE tool IN ('search_plugins', 'semantic_search')
      AND response_status = 'success'
      AND created_at >= NOW() - make_interval(days => ${days})
  `)

  const row = result.rows[0] as Record<string, number | null>
  const total = Number(row.total_searches) || 0
  const zero = Number(row.zero_result_count) || 0
  return { total, zero, pct: total > 0 ? (zero / total) * 100 : 0 }
}

/** 섹션 10-2: 스킬 매칭 기반 추천 적중률 */
async function queryRecommendationAccuracy(days: number) {
  const result = await db.execute(sql`
    WITH search_skills AS (
      SELECT session_id, skill_id
      FROM skill_events
      WHERE action = 'search'
        AND skill_id IS NOT NULL
        AND created_at >= NOW() - make_interval(days => ${days})
    ),
    loaded_skills AS (
      SELECT session_id, skill_id
      FROM skill_events
      WHERE action = 'load'
        AND created_at >= NOW() - make_interval(days => ${days})
    ),
    matched AS (
      SELECT DISTINCT ss.session_id, ss.skill_id
      FROM search_skills ss
      JOIN loaded_skills ls
        ON ss.session_id = ls.session_id AND ss.skill_id = ls.skill_id
    )
    SELECT
      (SELECT COUNT(DISTINCT session_id || '::' || skill_id) FROM search_skills) AS total_recommendations,
      (SELECT COUNT(*) FROM matched) AS matched_loads
  `)

  const row = result.rows[0] as Record<string, number | null>
  const total = Number(row.total_recommendations) || 0
  const matched = Number(row.matched_loads) || 0
  return { total, matched, pct: total > 0 ? (matched / total) * 100 : 0 }
}

// ─── 목표 달성 계산 ────────────────────────────────────────

function computeTargets(
  summary: WeeklyReportData['summary'],
  sessionFunnel: SessionFunnel,
  zeroResult: { pct: number; total: number },
  recAccuracy: { pct: number },
): { metrics: TargetMetric[]; achievedCount: number } {
  const { effectiveLogs, searchCount, viewCount, outcomeCount, outcomeApplied, errorCount, skipCount } = summary

  const errorRate = effectiveLogs > 0 ? (errorCount / effectiveLogs) * 100 : 0
  const v2dPct = viewCount > 0 ? (summary.deployCount / viewCount) * 100 : 0
  const skillApplyPct = outcomeCount > 0 ? (outcomeApplied / outcomeCount) * 100 : 0
  const searchSkipPct = searchCount > 0 ? (skipCount / searchCount) * 100 : 0
  const sessionS2vPct = sessionFunnel.s2vRate * 100

  const metrics: TargetMetric[] = [
    {
      name: '추천 적중률',
      actual: round1(recAccuracy.pct),
      target: TARGETS.searchToViewPct,
      unit: '%',
      higher: true,
      achieved: recAccuracy.pct >= TARGETS.searchToViewPct,
      note: 'skill_events 기반',
    },
    {
      name: '세션 전환율 (검색→조회)',
      actual: round1(sessionS2vPct),
      target: TARGETS.searchToViewPct,
      unit: '%',
      higher: true,
      achieved: sessionS2vPct >= TARGETS.searchToViewPct,
    },
    {
      name: '조회→배포 전환율',
      actual: round1(v2dPct),
      target: TARGETS.viewToDeployPct,
      unit: '%',
      higher: true,
      achieved: v2dPct >= TARGETS.viewToDeployPct,
    },
    {
      name: '스킬 적용률',
      actual: round1(skillApplyPct),
      target: TARGETS.skillApplyPct,
      unit: '%',
      higher: true,
      achieved: skillApplyPct >= TARGETS.skillApplyPct,
    },
    {
      name: '검색 스킵율',
      actual: round1(searchSkipPct),
      target: TARGETS.searchSkipPct,
      unit: '%',
      higher: false,
      achieved: searchSkipPct <= TARGETS.searchSkipPct,
    },
    {
      name: '검색 무결과율',
      actual: round1(zeroResult.pct),
      target: TARGETS.zeroResultPct,
      unit: '%',
      higher: false,
      achieved: zeroResult.pct <= TARGETS.zeroResultPct,
      note: `n=${zeroResult.total}`,
    },
    {
      name: '에러율',
      actual: round2(errorRate),
      target: TARGETS.errorRatePct,
      unit: '%',
      higher: false,
      achieved: errorRate <= TARGETS.errorRatePct,
    },
    {
      name: '전체 평균 응답시간',
      actual: summary.avgResponseTime,
      target: TARGETS.avgResponseMs,
      unit: 'ms',
      higher: false,
      achieved: summary.avgResponseTime <= TARGETS.avgResponseMs,
    },
    {
      name: '검색 평균 응답시간',
      actual: summary.avgSearchTime,
      target: TARGETS.searchResponseMs,
      unit: 'ms',
      higher: false,
      achieved: summary.avgSearchTime <= TARGETS.searchResponseMs,
    },
  ]

  const achievedCount = metrics.filter((m) => m.achieved).length
  return { metrics, achievedCount }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ─── 메인 함수 ─────────────────────────────────────────────

/**
 * 주간 리포트 데이터 생성
 *
 * 4개 SQL 쿼리를 병렬 실행 후 목표 달성 지표를 계산합니다.
 *
 * @param days - 분석 기간 (기본 7일)
 */
export async function generateWeeklyReport(days = 7): Promise<WeeklyReportData> {
  log.info('Generating weekly report', { days })

  const [summary, clients, sessionFunnel, zeroResult, recAccuracy] = await Promise.all([
    querySummary(days),
    queryClientBreakdown(days),
    querySessionFunnel(days),
    queryZeroResultRate(days),
    queryRecommendationAccuracy(days),
  ])

  const { metrics, achievedCount } = computeTargets(summary, sessionFunnel, zeroResult, recAccuracy)

  const data: WeeklyReportData = {
    period: { days, generatedAt: new Date().toISOString() },
    summary,
    clients,
    sessionFunnel,
    skillEventsZeroResultPct: round1(zeroResult.pct),
    skillEventsZeroResultTotal: zeroResult.total,
    recommendationAccuracyPct: round1(recAccuracy.pct),
    recommendationTotal: recAccuracy.total,
    recommendationMatched: recAccuracy.matched,
    targets: metrics,
    achievedCount,
    totalTargets: metrics.length,
  }

  log.info('Weekly report generated', {
    achievedCount,
    totalTargets: metrics.length,
    uniqueUsers: summary.uniqueUsers,
  })

  return data
}
