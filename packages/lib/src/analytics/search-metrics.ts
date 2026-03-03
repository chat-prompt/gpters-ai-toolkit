/**
 * 검색 무결과율 측정 기준 및 유틸리티
 *
 * Go/No-go 판정의 핵심 지표인 무결과율(zero-result rate)의
 * 공식 정의, 측정 범위, 최소 표본 수 등을 정의합니다.
 */

import { db } from '@gpters/db'
import { sql } from 'drizzle-orm'
import { createLogger } from '../core/logger'
import { ZERO_RESULT_SKILL_ID } from './skill-events'

const log = createLogger('search-metrics')

// Re-export for convenience
export { ZERO_RESULT_SKILL_ID } from './skill-events'

/**
 * 측정 범위 A (1차 기준): _source='skill-suggest'인 검색만.
 * 플러그인 내장 자동 추천 훅에서 발생하는 검색.
 */
export const SCOPE_A_LABEL = 'skill-suggest 훅 전용'

/**
 * 측정 범위 B (보조 기준): clientType이 실제 클라이언트인 검색.
 * claude_code, opencode, codex 사용자 검색.
 */
export const SCOPE_B_CLIENT_TYPES = ['claude_code', 'opencode', 'codex'] as const
export const SCOPE_B_LABEL = '실제 클라이언트 (claude_code/opencode/codex)'

/** 최소 표본 수: 이 이상이어야 통계적으로 유의미 */
export const MIN_SAMPLE_SIZE = 100

/** 무결과율 목표 상한 (%) — Go/No-go 기준 */
export const ZERO_RESULT_TARGET_PCT = 10

// ─── 측정 함수 ────────────────────────────────────────────

/**
 * 무결과율 측정 결과
 */
export interface ZeroResultMetrics {
  /** 총 검색 수 (unique 쿼리 기준, skill_events search + search_zero_result) */
  totalSearches: number
  /** 결과 0건 검색 수 */
  zeroResultSearches: number
  /** 무결과율 (%) */
  zeroResultPct: number
  /** 표본이 유의미한지 여부 */
  isSignificant: boolean
}

/**
 * 측정 범위 A: skill_events 기반 무결과율 (전체)
 *
 * search_zero_result 이벤트와 search 이벤트를 기반으로 계산합니다.
 * search 이벤트는 쿼리별로 그룹핑하여 동일 검색의 다수 결과를 1건으로 셉니다.
 *
 * @param days - 분석 기간 (일)
 * @returns 무결과율 측정 결과
 */
export async function measureZeroResultRate(days: number): Promise<ZeroResultMetrics> {
  try {
    const result = await db.execute(sql`
      WITH search_queries AS (
        -- 결과가 있었던 검색: 쿼리+세션 조합으로 dedupe
        SELECT DISTINCT session_id, query
        FROM skill_events
        WHERE action = 'search'
          AND created_at >= NOW() - make_interval(days => ${days})
          AND query IS NOT NULL
      ),
      zero_result_queries AS (
        -- 결과가 0건이었던 검색
        SELECT DISTINCT session_id, query
        FROM skill_events
        WHERE action = 'search'
          AND skill_id = ${ZERO_RESULT_SKILL_ID}
          AND created_at >= NOW() - make_interval(days => ${days})
          AND query IS NOT NULL
      )
      SELECT
        (SELECT COUNT(*)::int FROM search_queries)
        + (SELECT COUNT(*)::int FROM zero_result_queries) AS total_searches,
        (SELECT COUNT(*)::int FROM zero_result_queries) AS zero_result_searches
    `)

    const row = result.rows[0] as { total_searches: number; zero_result_searches: number }
    const total = Number(row.total_searches) || 0
    const zero = Number(row.zero_result_searches) || 0

    return {
      totalSearches: total,
      zeroResultSearches: zero,
      zeroResultPct: total > 0 ? (zero / total) * 100 : 0,
      isSignificant: total >= MIN_SAMPLE_SIZE,
    }
  } catch (error) {
    log.warn('Failed to measure zero-result rate', { error })
    return { totalSearches: 0, zeroResultSearches: 0, zeroResultPct: 0, isSignificant: false }
  }
}

/**
 * 측정 범위 B: 클라이언트 타입별 무결과율
 *
 * mcpSessions와 조인하여 특정 클라이언트 타입의 세션에서만 측정합니다.
 *
 * @param days - 분석 기간 (일)
 * @param clientTypes - 측정할 클라이언트 타입 배열
 * @returns 무결과율 측정 결과
 */
export async function measureZeroResultRateByClient(
  days: number,
  clientTypes: readonly string[] = SCOPE_B_CLIENT_TYPES
): Promise<ZeroResultMetrics> {
  try {
    const clientList = clientTypes.map((t) => `'${t}'`).join(',')

    const result = await db.execute(sql`
      WITH client_sessions AS (
        SELECT session_id FROM mcp_sessions
        WHERE client_type IN (${sql.raw(clientList)})
      ),
      search_queries AS (
        SELECT DISTINCT se.session_id, se.query
        FROM skill_events se
        JOIN client_sessions cs ON cs.session_id = se.session_id
        WHERE se.action = 'search'
          AND se.skill_id != ${ZERO_RESULT_SKILL_ID}
          AND se.created_at >= NOW() - make_interval(days => ${days})
          AND se.query IS NOT NULL
      ),
      zero_result_queries AS (
        SELECT DISTINCT se.session_id, se.query
        FROM skill_events se
        JOIN client_sessions cs ON cs.session_id = se.session_id
        WHERE se.action = 'search'
          AND se.skill_id = ${ZERO_RESULT_SKILL_ID}
          AND se.created_at >= NOW() - make_interval(days => ${days})
          AND se.query IS NOT NULL
      )
      SELECT
        (SELECT COUNT(*)::int FROM search_queries)
        + (SELECT COUNT(*)::int FROM zero_result_queries) AS total_searches,
        (SELECT COUNT(*)::int FROM zero_result_queries) AS zero_result_searches
    `)

    const row = result.rows[0] as { total_searches: number; zero_result_searches: number }
    const total = Number(row.total_searches) || 0
    const zero = Number(row.zero_result_searches) || 0

    return {
      totalSearches: total,
      zeroResultSearches: zero,
      zeroResultPct: total > 0 ? (zero / total) * 100 : 0,
      isSignificant: total >= MIN_SAMPLE_SIZE,
    }
  } catch (error) {
    log.warn('Failed to measure zero-result rate by client', { error })
    return { totalSearches: 0, zeroResultSearches: 0, zeroResultPct: 0, isSignificant: false }
  }
}
