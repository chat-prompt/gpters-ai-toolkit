#!/usr/bin/env node

/**
 * MCP 플러그인 사용 행태 분석 스크립트
 *
 * mcp_audit_logs 테이블을 쿼리하여 사용 행태 리포트를 생성합니다.
 * --days=N 옵션으로 분석 기간을 지정할 수 있습니다 (기본 30일).
 */

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── 목표치 (수동 업데이트) ───────────────────────────────
const TARGETS = {
  // 핵심 퍼널 지표
  searchToViewPct: 15,      // 검색→조회 전환율 (%)
  viewToDeployPct: 10,      // 조회→배포 전환율 (%)
  zeroResultPct: 10,        // 검색 무결과율 상한 (%)
  relevanceThreshold: 0.40, // 검색 무결과 판정 기준 (이하면 관련 스킬 없음)

  // 퍼널 추적 지표
  skillApplyPct: 50,        // 스킬 적용률 (%)
  searchSkipPct: 30,        // 검색 스킵율 상한 (%)

  // 품질 지표
  errorRatePct: 1.0,        // 에러율 상한 (%)
  avgResponseMs: 500,       // 전체 평균 응답시간 상한 (ms)
  searchResponseMs: 1500,   // 검색 평균 응답시간 상한 (ms) — Go/No-go 가산 조건
}
// ──────────────────────────────────────────────────────────

// .env.local에서 DATABASE_URL 로드
function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL

  const candidates = [
    resolve(__dirname, '../../../.env.local'),
    resolve(__dirname, '../../../.env'),
  ]

  for (const envPath of candidates) {
    try {
      const content = readFileSync(envPath, 'utf-8')
      const match = content.match(/^DATABASE_URL\s*=\s*["']?(.+?)["']?\s*$/m)
      if (match) return match[1]
    } catch {
      // 파일 없으면 다음 후보
    }
  }

  throw new Error('DATABASE_URL을 찾을 수 없습니다. .env.local을 확인하세요.')
}

// pnpm 환경에서 @neondatabase/serverless 로드
function loadNeon() {
  const projectRoot = resolve(__dirname, '../../..')
  const paths = [
    resolve(projectRoot, 'packages/db/node_modules/@neondatabase/serverless/index.mjs'),
    resolve(projectRoot, 'node_modules/@neondatabase/serverless/index.mjs'),
    resolve(projectRoot, 'node_modules/.pnpm/@neondatabase+serverless@1.0.2/node_modules/@neondatabase/serverless/index.mjs'),
  ]

  for (const p of paths) {
    try {
      const require = createRequire(p)
      return require(resolve(p, '..'))
    } catch {
      // 다음 경로 시도
    }
  }

  // fallback: createRequire로 일반 resolve
  const require = createRequire(resolve(projectRoot, 'packages/db/package.json'))
  return require('@neondatabase/serverless')
}

// CLI 인자 파싱
function parseDays() {
  const arg = process.argv.find((a) => a.startsWith('--days='))
  if (arg) {
    const n = parseInt(arg.split('=')[1], 10)
    if (!isNaN(n) && n > 0) return n
  }
  return 30
}

// 구분선
function separator(title) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('='.repeat(60))
}

// 테이블 출력 헬퍼
function printTable(headers, rows, alignRight = []) {
  if (rows.length === 0) {
    console.log('  (데이터 없음)')
    return
  }

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length))
  )

  const formatRow = (cells) =>
    '| ' +
    cells
      .map((c, i) => {
        const s = String(c ?? '')
        return alignRight.includes(i) ? s.padStart(widths[i]) : s.padEnd(widths[i])
      })
      .join(' | ') +
    ' |'

  console.log(formatRow(headers))
  console.log(
    '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|'
  )
  rows.forEach((r) => console.log(formatRow(r)))
}

async function main() {
  const days = parseDays()
  const databaseUrl = loadDatabaseUrl()
  const { neon } = loadNeon()
  const sql = neon(databaseUrl)

  console.log(`\n📊 MCP 플러그인 사용 행태 분석 리포트`)
  console.log(`   기간: 최근 ${days}일`)
  console.log(`   생성: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`)

  // ── 1. 전체 요약 ──
  separator('1. 전체 요약')

  const [summary] = await sql`
    SELECT
      COUNT(*)::int AS total_logs,
      COUNT(DISTINCT ip_hash)::int AS unique_users,
      COUNT(*) FILTER (WHERE tool = 'search_plugins' OR tool = 'semantic_search')::int AS search_count,
      COUNT(*) FILTER (WHERE tool = 'get_plugin_content')::int AS view_count,
      COUNT(*) FILTER (WHERE tool = 'get_plugin_content' AND referral_source = 'search')::int AS view_from_search,
      COUNT(*) FILTER (WHERE tool = 'deploy_skill')::int AS deploy_count,
      COUNT(*) FILTER (WHERE tool = 'report_search_skip')::int AS skip_count,
      COUNT(*) FILTER (WHERE tool = 'report_skill_outcome')::int AS outcome_count,
      COUNT(*) FILTER (WHERE tool = 'report_skill_outcome' AND (request_params->'params'->'arguments'->>'applied')::boolean = true)::int AS outcome_applied,
      COUNT(*) FILTER (WHERE tool = 'undeploy_skill')::int AS undeploy_count,
      COUNT(*) FILTER (WHERE tool = 'check_updates')::int AS check_updates_count,
      COUNT(*) FILTER (WHERE tool = 'suggest_improvement')::int AS suggest_improve_count,
      COUNT(*) FILTER (WHERE tool = 'list_suggestions')::int AS list_suggest_count,
      COUNT(*) FILTER (WHERE tool = 'resolve_suggestion')::int AS resolve_suggest_count,
      COUNT(*) FILTER (WHERE tool = 'add_files')::int AS add_files_count,
      COUNT(*) FILTER (WHERE tool = 'remove_files')::int AS remove_files_count,
      COUNT(*) FILTER (WHERE tool = 'report_session_event')::int AS session_event_count,
      COUNT(*) FILTER (WHERE response_status = 'error' AND tool IS DISTINCT FROM 'report_session_event')::int AS error_count,
      -- 응답시간: report_session_event 제외 (대량 이벤트로 메트릭 오염 방지)
      COUNT(*) FILTER (WHERE tool IS DISTINCT FROM 'report_session_event')::int AS effective_logs,
      ROUND(AVG(response_time) FILTER (WHERE tool IS DISTINCT FROM 'report_session_event'))::int AS avg_response_time,
      ROUND(AVG(response_time) FILTER (WHERE tool = 'search_plugins' OR tool = 'semantic_search'))::int AS avg_search_time,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time) FILTER (WHERE tool = 'search_plugins' OR tool = 'semantic_search'))::int AS p50_search_time,
      ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time) FILTER (WHERE tool = 'search_plugins' OR tool = 'semantic_search'))::int AS p95_search_time,
      ROUND(AVG(response_time) FILTER (WHERE tool IS NOT NULL AND tool NOT IN ('search_plugins', 'semantic_search', 'report_session_event')))::int AS avg_other_time
    FROM mcp_audit_logs
    WHERE created_at >= NOW() - make_interval(days => ${days})
  `

  const searchCount = summary.search_count || 0
  const viewCount = summary.view_count || 0
  const viewFromSearch = summary.view_from_search || 0
  const conversionRate =
    searchCount > 0 ? ((viewFromSearch / searchCount) * 100).toFixed(1) : '0.0'

  const effectiveLogs = summary.effective_logs || 0
  console.log(`  총 로그 수:      ${summary.total_logs.toLocaleString()} (유효 ${effectiveLogs.toLocaleString()}, 세션이벤트 ${(summary.session_event_count || 0).toLocaleString()} 제외)`)
  console.log(`  고유 사용자:     ${summary.unique_users.toLocaleString()}`)
  console.log(`  검색 요청:       ${searchCount.toLocaleString()}`)
  console.log(`  스킬 조회:       ${viewCount.toLocaleString()} (검색경유 ${viewFromSearch} / 직접 ${viewCount - viewFromSearch})`)
  console.log(`  배포:            ${summary.deploy_count.toLocaleString()}`)
  console.log(`  검색 스킵 보고:  ${(summary.skip_count || 0).toLocaleString()}`)
  console.log(`  스킬 결과 보고:  ${(summary.outcome_count || 0).toLocaleString()} (적용 ${summary.outcome_applied || 0} / 미적용 ${(summary.outcome_count || 0) - (summary.outcome_applied || 0)})`)
  console.log(`  배포 해제:       ${(summary.undeploy_count || 0).toLocaleString()}`)
  console.log(`  업데이트 확인:   ${(summary.check_updates_count || 0).toLocaleString()}`)
  console.log(`  개선 제안:       ${(summary.suggest_improve_count || 0).toLocaleString()}`)
  console.log(`  제안 조회/처리:  ${(summary.list_suggest_count || 0).toLocaleString()} / ${(summary.resolve_suggest_count || 0).toLocaleString()}`)
  console.log(`  파일 추가/제거:  ${(summary.add_files_count || 0).toLocaleString()} / ${(summary.remove_files_count || 0).toLocaleString()}`)
  console.log(`  세션 이벤트:     ${(summary.session_event_count || 0).toLocaleString()}`)
  console.log(`  에러:            ${summary.error_count.toLocaleString()}`)
  console.log(`  검색→조회 전환율: ${conversionRate}%`)
  console.log(``)
  console.log(`  ⏱ 응답시간:`)
  console.log(`     전체 평균:    ${summary.avg_response_time ?? '-'}ms`)
  console.log(`     검색 평균:    ${summary.avg_search_time ?? '-'}ms`)
  console.log(`     검색 P50:     ${summary.p50_search_time ?? '-'}ms`)
  console.log(`     검색 P95:     ${summary.p95_search_time ?? '-'}ms`)
  console.log(`     기타 평균:    ${summary.avg_other_time ?? '-'}ms`)

  // ── 2. 클라이언트별 비교 ──
  separator('2. 클라이언트별 비교')

  const clientStats = await sql`
    SELECT
      COALESCE(client_type, 'unknown') AS client,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE tool = 'search_plugins' OR tool = 'semantic_search')::int AS searches,
      COUNT(*) FILTER (WHERE tool = 'get_plugin_content')::int AS views,
      COUNT(*) FILTER (WHERE tool = 'get_plugin_content' AND referral_source = 'search')::int AS views_from_search,
      COUNT(*) FILTER (WHERE tool = 'deploy_skill')::int AS deploys,
      COUNT(*) FILTER (WHERE response_status = 'error')::int AS errors,
      ROUND(AVG(response_time))::int AS avg_ms
    FROM mcp_audit_logs
    WHERE created_at >= NOW() - make_interval(days => ${days})
    GROUP BY COALESCE(client_type, 'unknown')
    ORDER BY total DESC
  `

  printTable(
    ['클라이언트', '총요청', '검색', '조회', '직접조회', '배포', '에러', '평균ms', '전환율'],
    clientStats.map((r) => {
      const directViews = r.views - r.views_from_search
      return [
        r.client,
        r.total,
        r.searches,
        r.views,
        directViews,
        r.deploys,
        r.errors,
        r.avg_ms ?? '-',
        r.searches > 0
          ? ((r.views_from_search / r.searches) * 100).toFixed(1) + '%'
          : '-',
      ]
    }),
    [1, 2, 3, 4, 5, 6, 7, 8]
  )

  // ── 3. 인기 검색어 (클라이언트별 TOP 15) ──
  separator('3. 인기 검색어 (클라이언트별 TOP 15)')

  const topSearches = await sql`
    SELECT
      COALESCE(client_type, 'unknown') AS client,
      request_params->'params'->'arguments'->>'query' AS query,
      COUNT(*)::int AS cnt
    FROM mcp_audit_logs
    WHERE created_at >= NOW() - make_interval(days => ${days})
      AND (tool = 'search_plugins' OR tool = 'semantic_search')
      AND request_params->'params'->'arguments'->>'query' IS NOT NULL
    GROUP BY COALESCE(client_type, 'unknown'), request_params->'params'->'arguments'->>'query'
    ORDER BY client, cnt DESC
  `

  // 클라이언트별로 그룹핑
  const searchByClient = {}
  for (const r of topSearches) {
    if (!searchByClient[r.client]) searchByClient[r.client] = []
    searchByClient[r.client].push(r)
  }

  for (const [client, rows] of Object.entries(searchByClient)) {
    console.log(`\n  [${client}]`)
    printTable(
      ['#', '검색어', '횟수'],
      rows.slice(0, 15).map((r, i) => {
        const q = r.query.length > 50 ? r.query.slice(0, 47) + '...' : r.query
        return [i + 1, q, r.cnt]
      }),
      [0, 2]
    )
  }

  // ── 4. 검색 품질 분석 ──
  separator('4. 검색 품질 분석 (전환율 진단)')

  // 4-1. 미전환 검색 분석 (무결과 + 조회 미이어짐)
  // 무결과 = 최고 점수가 relevanceThreshold 미만 (실질적으로 쓸만한 결과 없음)
  const threshold = TARGETS.relevanceThreshold
  const deadSearchData = await sql`
    WITH search_logs AS (
      SELECT
        id,
        session_id,
        request_params->'params'->'arguments'->>'query' AS query,
        search_results,
        CASE
          WHEN search_results IS NULL OR jsonb_array_length(search_results) = 0 THEN true
          WHEN (search_results->0->>'score')::float < ${threshold} THEN true
          ELSE false
        END AS is_low_relevance
      FROM mcp_audit_logs
      WHERE created_at >= NOW() - make_interval(days => ${days})
        AND (tool = 'search_plugins' OR tool = 'semantic_search')
    ),
    sessions_with_view AS (
      SELECT DISTINCT session_id
      FROM mcp_audit_logs
      WHERE created_at >= NOW() - make_interval(days => ${days})
        AND tool = 'get_plugin_content'
        AND session_id IS NOT NULL
    )
    SELECT
      COUNT(*)::int AS total_searches,
      COUNT(*) FILTER (WHERE is_low_relevance)::int AS low_relevance,
      COUNT(*) FILTER (WHERE NOT is_low_relevance)::int AS has_relevant,
      COUNT(*) FILTER (
        WHERE session_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM sessions_with_view v WHERE v.session_id = search_logs.session_id)
      )::int AS unconverted,
      COUNT(*) FILTER (
        WHERE is_low_relevance
          AND session_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM sessions_with_view v WHERE v.session_id = search_logs.session_id)
      )::int AS unconverted_low_relevance
    FROM search_logs
  `

  const sq = deadSearchData[0]
  const totalSearches = sq.total_searches || 1
  const zeroResultPct = (sq.low_relevance / totalSearches * 100).toFixed(1)

  console.log(`  총 검색:        ${sq.total_searches}건`)
  console.log(`  유효 결과:      ${sq.has_relevant}건 (top score >= ${threshold})`)
  console.log(`  저연관/무결과:   ${sq.low_relevance}건 (${zeroResultPct}%) — top score < ${threshold}`)
  console.log(`  미전환 검색:     ${sq.unconverted}건 (이 중 저연관 ${sq.unconverted_low_relevance}건)`)

  // 미전환 검색어 TOP 15 (개선 대상)
  const deadSearchTerms = await sql`
    WITH search_logs AS (
      SELECT
        session_id,
        request_params->'params'->'arguments'->>'query' AS query,
        CASE
          WHEN search_results IS NULL OR jsonb_array_length(search_results) = 0 THEN NULL
          ELSE (search_results->0->>'score')::float
        END AS top_score
      FROM mcp_audit_logs
      WHERE created_at >= NOW() - make_interval(days => ${days})
        AND (tool = 'search_plugins' OR tool = 'semantic_search')
        AND request_params->'params'->'arguments'->>'query' IS NOT NULL
    ),
    sessions_with_view AS (
      SELECT DISTINCT session_id
      FROM mcp_audit_logs
      WHERE created_at >= NOW() - make_interval(days => ${days})
        AND tool = 'get_plugin_content'
        AND session_id IS NOT NULL
    )
    SELECT
      s.query,
      COUNT(*)::int AS cnt,
      ROUND(AVG(s.top_score)::numeric, 2) AS avg_score
    FROM search_logs s
    WHERE s.session_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM sessions_with_view v WHERE v.session_id = s.session_id)
    GROUP BY s.query
    ORDER BY cnt DESC
    LIMIT 15
  `

  if (deadSearchTerms.length > 0) {
    // 고점수(>= threshold) 미전환 = 스킬은 있는데 에이전트가 안 본 것 → 노출/설명 개선
    const highScoreDead = deadSearchTerms.filter((r) => r.avg_score !== null && parseFloat(r.avg_score) >= threshold)
    // 저점수(< threshold) 미전환 = 관련 스킬 부족 → 신규 스킬 후보
    const lowScoreDead = deadSearchTerms.filter((r) => r.avg_score === null || parseFloat(r.avg_score) < threshold)

    if (highScoreDead.length > 0) {
      console.log(`\n  [미전환 — 고점수] 스킬은 있지만 조회 안 됨 → 제목/설명 개선 필요`)
      printTable(
        ['#', '검색어', '횟수', '평균점수'],
        highScoreDead.map((r, i) => {
          const q = r.query.length > 50 ? r.query.slice(0, 47) + '...' : r.query
          return [i + 1, q, r.cnt, r.avg_score]
        }),
        [0, 2, 3]
      )
    }

    if (lowScoreDead.length > 0) {
      console.log(`\n  [미전환 — 저점수] 관련 스킬 부족 → 신규 스킬 추가 후보`)
      printTable(
        ['#', '검색어', '횟수', '평균점수'],
        lowScoreDead.map((r, i) => {
          const q = r.query.length > 50 ? r.query.slice(0, 47) + '...' : r.query
          return [i + 1, q, r.cnt, r.avg_score !== null ? r.avg_score : '-']
        }),
        [0, 2, 3]
      )
    }
  }

  // 4-2. 세션별 검색→조회 흐름 분석
  const sessionFunnel = await sql`
    WITH search_sessions AS (
      SELECT DISTINCT session_id
      FROM mcp_audit_logs
      WHERE created_at >= NOW() - make_interval(days => ${days})
        AND (tool = 'search_plugins' OR tool = 'semantic_search')
        AND session_id IS NOT NULL
    ),
    view_sessions AS (
      SELECT DISTINCT session_id
      FROM mcp_audit_logs
      WHERE created_at >= NOW() - make_interval(days => ${days})
        AND tool = 'get_plugin_content'
        AND session_id IS NOT NULL
    ),
    deploy_sessions AS (
      SELECT DISTINCT session_id
      FROM mcp_audit_logs
      WHERE created_at >= NOW() - make_interval(days => ${days})
        AND tool = 'deploy_skill'
        AND session_id IS NOT NULL
    )
    SELECT
      (SELECT COUNT(*)::int FROM search_sessions) AS search_sessions,
      (SELECT COUNT(*)::int FROM search_sessions s WHERE EXISTS (SELECT 1 FROM view_sessions v WHERE v.session_id = s.session_id)) AS search_to_view,
      (SELECT COUNT(*)::int FROM view_sessions v WHERE EXISTS (SELECT 1 FROM deploy_sessions d WHERE d.session_id = v.session_id)) AS view_to_deploy
  `

  const sf = sessionFunnel[0]
  const ssTotal = sf.search_sessions || 1

  console.log(`\n  [세션 기반 퍼널]`)
  console.log(`  검색 세션:           ${sf.search_sessions}`)
  console.log(`  → 조회로 이어진 세션: ${sf.search_to_view} (${(sf.search_to_view / ssTotal * 100).toFixed(1)}%)`)
  console.log(`  → 배포로 이어진 세션: ${sf.view_to_deploy}`)

  // ── 4-3. 검색 스킵 분석 (report_search_skip) — (구 4-4) ──
  const skipData = await sql`
    SELECT
      request_params->'params'->'arguments'->>'reason' AS reason,
      request_params->'params'->'arguments'->>'query' AS query,
      request_params->'params'->'arguments'->'resultIds' AS result_ids,
      COUNT(*)::int AS cnt
    FROM mcp_audit_logs
    WHERE created_at >= NOW() - make_interval(days => ${days})
      AND tool = 'report_search_skip'
    GROUP BY reason, query, result_ids
    ORDER BY cnt DESC
  `

  if (skipData.length > 0) {
    console.log(`\n  [검색 스킵 분석 — report_search_skip]`)

    // 스킵 사유 분포
    const reasonMap = {}
    let totalSkips = 0
    for (const r of skipData) {
      const reason = r.reason || '(미지정)'
      reasonMap[reason] = (reasonMap[reason] || 0) + r.cnt
      totalSkips += r.cnt
    }

    console.log(`\n  총 스킵 건수: ${totalSkips}`)
    console.log(`\n  스킵 사유 분포:`)
    printTable(
      ['사유', '건수', '비율'],
      Object.entries(reasonMap)
        .sort((a, b) => b[1] - a[1])
        .map(([reason, cnt]) => [
          reason.length > 60 ? reason.slice(0, 57) + '...' : reason,
          cnt,
          `${(cnt / totalSkips * 100).toFixed(1)}%`,
        ]),
      [1]
    )

    // 스킵된 검색 쿼리 목록 TOP 15
    const skipQueryMap = {}
    for (const r of skipData) {
      const q = r.query || '(미지정)'
      skipQueryMap[q] = (skipQueryMap[q] || 0) + r.cnt
    }

    console.log(`\n  스킵된 검색 쿼리 TOP 15:`)
    printTable(
      ['#', '검색어', '스킵 횟수'],
      Object.entries(skipQueryMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([query, cnt], i) => [
          i + 1,
          query.length > 50 ? query.slice(0, 47) + '...' : query,
          cnt,
        ]),
      [0, 2]
    )
  }

  // ── 4-4. 스킬 적용률 분석 (report_skill_outcome) — (구 4-5) ──
  const outcomeData = await sql`
    SELECT
      request_params->'params'->'arguments'->>'skillId' AS skill_id,
      (request_params->'params'->'arguments'->>'applied')::boolean AS applied,
      request_params->'params'->'arguments'->>'summary' AS summary,
      COUNT(*)::int AS cnt
    FROM mcp_audit_logs
    WHERE created_at >= NOW() - make_interval(days => ${days})
      AND tool = 'report_skill_outcome'
    GROUP BY skill_id, applied, summary
    ORDER BY cnt DESC
  `

  if (outcomeData.length > 0) {
    console.log(`\n  [스킬 적용률 분석 — report_skill_outcome]`)

    let totalOutcomes = 0
    let appliedCount = 0
    let notAppliedCount = 0
    const appliedSkills = {}
    const notAppliedSkills = {}

    for (const r of outcomeData) {
      totalOutcomes += r.cnt
      const skillId = r.skill_id || '(미지정)'
      if (r.applied) {
        appliedCount += r.cnt
        appliedSkills[skillId] = (appliedSkills[skillId] || 0) + r.cnt
      } else {
        notAppliedCount += r.cnt
        notAppliedSkills[skillId] = (notAppliedSkills[skillId] || 0) + r.cnt
      }
    }

    const appliedPct = totalOutcomes > 0 ? (appliedCount / totalOutcomes * 100).toFixed(1) : '0.0'
    const notAppliedPct = totalOutcomes > 0 ? (notAppliedCount / totalOutcomes * 100).toFixed(1) : '0.0'

    console.log(`\n  총 스킬 결과 보고: ${totalOutcomes}건`)
    console.log(`  적용됨:   ${appliedCount}건 (${appliedPct}%)`)
    console.log(`  미적용:   ${notAppliedCount}건 (${notAppliedPct}%)`)

    // 적용된 스킬 목록
    const appliedEntries = Object.entries(appliedSkills).sort((a, b) => b[1] - a[1])
    if (appliedEntries.length > 0) {
      console.log(`\n  적용된 스킬 목록:`)
      printTable(
        ['#', '스킬 ID', '적용 횟수'],
        appliedEntries.map(([id, cnt], i) => [i + 1, id, cnt]),
        [0, 2]
      )
    }

    // 미적용된 스킬 목록
    const notAppliedEntries = Object.entries(notAppliedSkills).sort((a, b) => b[1] - a[1])
    if (notAppliedEntries.length > 0) {
      console.log(`\n  미적용된 스킬 목록:`)
      printTable(
        ['#', '스킬 ID', '미적용 횟수'],
        notAppliedEntries.map(([id, cnt], i) => [i + 1, id, cnt]),
        [0, 2]
      )
    }

    // 미적용 사유 요약
    const notAppliedSummaries = outcomeData
      .filter((r) => !r.applied && r.summary)
      .sort((a, b) => b.cnt - a.cnt)
      .slice(0, 10)

    if (notAppliedSummaries.length > 0) {
      console.log(`\n  미적용 사유 TOP 10:`)
      printTable(
        ['#', '스킬 ID', '사유', '건수'],
        notAppliedSummaries.map((r, i) => [
          i + 1,
          r.skill_id || '(미지정)',
          (r.summary || '').length > 50 ? r.summary.slice(0, 47) + '...' : (r.summary || ''),
          r.cnt,
        ]),
        [0, 3]
      )
    }
  }

  // ── 5. 인기 스킬 (클라이언트별 TOP 10) ──
  separator('5. 인기 스킬 (클라이언트별 TOP 10 조회)')

  const topSkills = await sql`
    SELECT
      COALESCE(client_type, 'unknown') AS client,
      COALESCE(
        request_params->'params'->'arguments'->>'pluginId',
        request_params->'params'->'arguments'->>'name',
        '(unknown)'
      ) AS skill_id,
      COUNT(*)::int AS cnt
    FROM mcp_audit_logs
    WHERE created_at >= NOW() - make_interval(days => ${days})
      AND tool = 'get_plugin_content'
    GROUP BY COALESCE(client_type, 'unknown'),
             COALESCE(
               request_params->'params'->'arguments'->>'pluginId',
               request_params->'params'->'arguments'->>'name',
               '(unknown)'
             )
    ORDER BY client, cnt DESC
  `

  const skillsByClient = {}
  for (const r of topSkills) {
    if (!skillsByClient[r.client]) skillsByClient[r.client] = []
    skillsByClient[r.client].push(r)
  }

  for (const [client, rows] of Object.entries(skillsByClient)) {
    console.log(`\n  [${client}]`)
    printTable(
      ['#', '스킬 ID', '조회수'],
      rows.slice(0, 10).map((r, i) => [i + 1, r.skill_id, r.cnt]),
      [0, 2]
    )
  }

  // ── 6. 시간대별 사용량 (KST) ──
  separator('6. 시간대별 사용량 (KST)')

  const hourlyUsage = await sql`
    SELECT
      EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Seoul')::int AS hour_kst,
      COALESCE(client_type, 'unknown') AS client,
      COUNT(*)::int AS cnt
    FROM mcp_audit_logs
    WHERE created_at >= NOW() - make_interval(days => ${days})
    GROUP BY hour_kst, COALESCE(client_type, 'unknown')
    ORDER BY hour_kst, client
  `

  // 피벗: 시간대 × 클라이언트
  const clients = [...new Set(hourlyUsage.map((r) => r.client))].sort()
  const hourMap = {}
  for (const r of hourlyUsage) {
    if (!hourMap[r.hour_kst]) hourMap[r.hour_kst] = {}
    hourMap[r.hour_kst][r.client] = r.cnt
  }

  printTable(
    ['시간(KST)', ...clients, '합계'],
    Array.from({ length: 24 }, (_, h) => {
      const row = hourMap[h] || {}
      const total = clients.reduce((sum, c) => sum + (row[c] || 0), 0)
      return [`${String(h).padStart(2, '0')}:00`, ...clients.map((c) => row[c] || 0), total]
    }),
    Array.from({ length: clients.length + 2 }, (_, i) => i)
  )

  // ── 7. 일별 추이 (최근 14일) ──
  separator('7. 일별 추이 (최근 14일)')

  const displayDays = Math.min(days, 14)

  const dailyTrend = await sql`
    SELECT
      TO_CHAR((created_at AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS day,
      COALESCE(client_type, 'unknown') AS client,
      COUNT(*)::int AS cnt,
      COUNT(DISTINCT ip_hash)::int AS users
    FROM mcp_audit_logs
    WHERE created_at >= NOW() - make_interval(days => ${displayDays})
    GROUP BY (created_at AT TIME ZONE 'Asia/Seoul')::date, COALESCE(client_type, 'unknown')
    ORDER BY (created_at AT TIME ZONE 'Asia/Seoul')::date DESC, client
  `

  // 피벗: 일자 × 클라이언트
  const dailyClients = [...new Set(dailyTrend.map((r) => r.client))].sort()
  const dayMap = {}
  for (const r of dailyTrend) {
    const key = r.day
    if (!dayMap[key]) dayMap[key] = { users: new Set() }
    dayMap[key][r.client] = r.cnt
    // 사용자 수는 단순 합산이 아니라 max 사용 (클라이언트별 중복 가능)
    dayMap[key][`${r.client}_users`] = r.users
  }

  const sortedDays = Object.keys(dayMap).sort().reverse()

  printTable(
    ['날짜', ...dailyClients.flatMap((c) => [`${c}(요청)`, `${c}(유저)`])],
    sortedDays.map((d) => {
      const row = dayMap[d]
      return [
        d,
        ...dailyClients.flatMap((c) => [row[c] || 0, row[`${c}_users`] || 0]),
      ]
    }),
    Array.from({ length: dailyClients.length * 2 + 1 }, (_, i) => i)
  )

  // ── 8. 세션 분석 ──
  separator('8. 세션 분석')

  const [sess] = await sql`
    SELECT
      COUNT(*)::int AS total_sessions,
      COUNT(*) FILTER (WHERE status = 'finalized')::int AS finalized,
      COUNT(*) FILTER (WHERE status = 'active')::int AS active,
      ROUND(AVG(duration_seconds) FILTER (WHERE status = 'finalized'))::int AS avg_duration,
      ROUND(AVG(total_requests), 1) AS avg_requests,
      COUNT(*) FILTER (WHERE had_search)::int AS sessions_with_search,
      COUNT(*) FILTER (WHERE had_view)::int AS sessions_with_view,
      COUNT(*) FILTER (WHERE had_deployment)::int AS sessions_with_deploy,
      AVG(CASE WHEN search_to_view_conversion THEN 1 ELSE 0 END) FILTER (WHERE status = 'finalized') AS s2v_rate,
      AVG(CASE WHEN view_to_deploy_conversion THEN 1 ELSE 0 END) FILTER (WHERE status = 'finalized') AS v2d_rate,
      ROUND(AVG(avg_response_time) FILTER (WHERE avg_response_time IS NOT NULL))::int AS avg_rt,
      SUM(COALESCE((client_context->>'suggestionsShown')::int, 0))::int AS total_suggestions_shown,
      SUM(COALESCE((client_context->>'suggestionsUsed')::int, 0))::int AS total_suggestions_used,
      SUM(COALESCE((client_context->>'promptCount')::int, 0))::int AS total_prompts
    FROM mcp_sessions
    WHERE started_at >= NOW() - make_interval(days => ${days})
  `

  printTable(
    ['지표', '값'],
    [
      ['총 세션', sess.total_sessions || 0],
      ['Finalized', sess.finalized || 0],
      ['Active', sess.active || 0],
      ['평균 지속시간', `${Math.round(sess.avg_duration || 0)}초`],
      ['평균 요청수/세션', (Number(sess.avg_requests) || 0).toFixed(1)],
      ['검색 포함 세션', sess.sessions_with_search || 0],
      ['조회 포함 세션', sess.sessions_with_view || 0],
      ['배포 포함 세션', sess.sessions_with_deploy || 0],
      ['검색→조회 전환율', `${((Number(sess.s2v_rate) || 0) * 100).toFixed(1)}%`],
      ['조회→배포 전환율', `${((Number(sess.v2d_rate) || 0) * 100).toFixed(1)}%`],
      ['평균 응답시간', `${Math.round(sess.avg_rt || 0)}ms`],
    ],
    [1]
  )

  // Client context summary
  const sugShown = Number(sess.total_suggestions_shown) || 0
  const sugUsed = Number(sess.total_suggestions_used) || 0
  if (sugShown > 0) {
    console.log(`\n  📊 클라이언트 컨텍스트:`)
    console.log(`     총 프롬프트: ${sess.total_prompts || 0}`)
    console.log(`     추천 노출: ${sugShown}, 사용: ${sugUsed} (${(sugUsed/sugShown*100).toFixed(1)}%)`)
  }

  // Session client distribution
  const sessClientResult = await sql`
    SELECT COALESCE(client_type, 'unknown') AS client, COUNT(*)::int AS cnt
    FROM mcp_sessions WHERE started_at >= NOW() - make_interval(days => ${days})
    GROUP BY client_type ORDER BY cnt DESC
  `
  if (sessClientResult.length > 0) {
    console.log(`\n  📱 세션 클라이언트 분포:`)
    printTable(
      ['클라이언트', '세션 수'],
      sessClientResult.map((r) => [r.client, r.cnt]),
      [1]
    )
  }

  // ── 9. 커뮤니티 & 관리 활동 ──
  separator('9. 커뮤니티 & 관리 활동')

  const mgmtTools = await sql`
    SELECT
      tool,
      COUNT(*)::int AS cnt,
      COUNT(DISTINCT session_id)::int AS sessions,
      COUNT(DISTINCT ip_hash)::int AS users
    FROM mcp_audit_logs
    WHERE created_at >= NOW() - make_interval(days => ${days})
      AND tool IN ('undeploy_skill', 'check_updates', 'suggest_improvement', 'list_suggestions', 'resolve_suggestion', 'add_files', 'remove_files', 'report_session_event')
    GROUP BY tool
    ORDER BY cnt DESC
  `

  if (mgmtTools.length > 0) {
    printTable(
      ['도구', '호출수', '세션', '사용자'],
      mgmtTools.map((r) => [r.tool, r.cnt, r.sessions, r.users]),
      [1, 2, 3]
    )

    // check_updates 상세: 어떤 스킬 업데이트를 확인하는지
    const updateChecks = await sql`
      SELECT
        COALESCE(request_params->'params'->'arguments'->>'installedSkills', '(미지정)') AS skills_checked,
        COUNT(*)::int AS cnt
      FROM mcp_audit_logs
      WHERE created_at >= NOW() - make_interval(days => ${days})
        AND tool = 'check_updates'
      GROUP BY skills_checked
      ORDER BY cnt DESC
      LIMIT 10
    `.catch(() => [])

    if (updateChecks.length > 0) {
      console.log(`\n  [업데이트 확인 내역]`)
      printTable(
        ['#', '확인한 스킬 목록', '횟수'],
        updateChecks.map((r, i) => {
          const s = r.skills_checked.length > 60 ? r.skills_checked.slice(0, 57) + '...' : r.skills_checked
          return [i + 1, s, r.cnt]
        }),
        [0, 2]
      )
    }

    // suggest_improvement 상세
    const suggestions = await sql`
      SELECT
        request_params->'params'->'arguments'->>'pluginId' AS plugin_id,
        request_params->'params'->'arguments'->>'title' AS title,
        COUNT(*)::int AS cnt
      FROM mcp_audit_logs
      WHERE created_at >= NOW() - make_interval(days => ${days})
        AND tool = 'suggest_improvement'
      GROUP BY plugin_id, title
      ORDER BY cnt DESC
      LIMIT 10
    `.catch(() => [])

    if (suggestions.length > 0) {
      console.log(`\n  [개선 제안 내역]`)
      printTable(
        ['#', '스킬 ID', '제안 제목', '건수'],
        suggestions.map((r, i) => [
          i + 1,
          r.plugin_id || '(미지정)',
          (r.title || '').length > 40 ? r.title.slice(0, 37) + '...' : (r.title || '-'),
          r.cnt,
        ]),
        [0, 3]
      )
    }

    // report_session_event 상세: 이벤트 타입별
    const sessionEvents = await sql`
      SELECT
        request_params->'params'->'arguments'->>'eventType' AS event_type,
        COUNT(*)::int AS cnt
      FROM mcp_audit_logs
      WHERE created_at >= NOW() - make_interval(days => ${days})
        AND tool = 'report_session_event'
      GROUP BY event_type
      ORDER BY cnt DESC
    `.catch(() => [])

    if (sessionEvents.length > 0) {
      console.log(`\n  [세션 이벤트 타입]`)
      printTable(
        ['이벤트 타입', '건수'],
        sessionEvents.map((r) => [r.event_type || '(미지정)', r.cnt]),
        [1]
      )
    }

    // add_files / remove_files 상세: 어떤 스킬에 파일 작업했는지
    const fileOps = await sql`
      SELECT
        tool,
        COALESCE(
          request_params->'params'->'arguments'->>'id',
          request_params->'params'->'arguments'->>'pluginId',
          '(미지정)'
        ) AS skill_id,
        COUNT(*)::int AS cnt
      FROM mcp_audit_logs
      WHERE created_at >= NOW() - make_interval(days => ${days})
        AND tool IN ('add_files', 'remove_files')
      GROUP BY tool, skill_id
      ORDER BY cnt DESC
      LIMIT 10
    `.catch(() => [])

    if (fileOps.length > 0) {
      console.log(`\n  [파일 추가/제거 내역]`)
      printTable(
        ['#', '작업', '스킬 ID', '건수'],
        fileOps.map((r, i) => [i + 1, r.tool, r.skill_id, r.cnt]),
        [0, 3]
      )
    }
  } else {
    console.log('  (해당 기간 관리 도구 사용 이력 없음)')
  }

  // 9-2. 개선 제안 현황 (suggestions 테이블)
  const suggestionStats = await sql`
    SELECT
      status,
      COUNT(*)::int AS cnt
    FROM suggestions
    WHERE created_at >= NOW() - make_interval(days => ${days})
    GROUP BY status
    ORDER BY cnt DESC
  `.catch(() => [])

  if (suggestionStats.length > 0) {
    const totalSuggestions = suggestionStats.reduce((s, r) => s + r.cnt, 0)
    console.log(`\n  [개선 제안 현황 — suggestions 테이블]`)
    console.log(`  총 제안: ${totalSuggestions}건`)
    printTable(
      ['상태', '건수', '비율'],
      suggestionStats.map((r) => [
        r.status,
        r.cnt,
        `${(r.cnt / totalSuggestions * 100).toFixed(1)}%`,
      ]),
      [1]
    )

    // 스킬별 제안 분포
    const suggestionBySkill = await sql`
      SELECT
        plugin_id,
        COUNT(*)::int AS cnt,
        COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
        COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
      FROM suggestions
      WHERE created_at >= NOW() - make_interval(days => ${days})
      GROUP BY plugin_id
      ORDER BY cnt DESC
      LIMIT 10
    `.catch(() => [])

    if (suggestionBySkill.length > 0) {
      console.log(`\n  스킬별 제안 TOP 10:`)
      printTable(
        ['#', '스킬 ID', '총', '수락', '거절', '대기'],
        suggestionBySkill.map((r, i) => [i + 1, r.plugin_id, r.cnt, r.accepted, r.rejected, r.pending]),
        [0, 2, 3, 4, 5]
      )
    }
  }

  // 9-3. 스킬 버전 이력 (item_versions 테이블)
  const versionStats = await sql`
    SELECT
      iv.item_id,
      ci.name AS item_name,
      COUNT(*)::int AS version_count,
      MAX(iv.version) AS latest_version,
      MAX(iv.created_at) AS last_updated
    FROM item_versions iv
    LEFT JOIN catalog_items ci ON ci.id = iv.item_id
    WHERE iv.created_at >= NOW() - make_interval(days => ${days})
    GROUP BY iv.item_id, ci.name
    ORDER BY version_count DESC
    LIMIT 15
  `.catch(() => [])

  if (versionStats.length > 0) {
    console.log(`\n  [스킬 버전 업데이트 — item_versions 테이블]`)
    const totalVersions = versionStats.reduce((s, r) => s + r.version_count, 0)
    console.log(`  기간 내 총 버전 업데이트: ${totalVersions}건`)
    printTable(
      ['#', '스킬 ID', '이름', '업데이트 수', '최신 버전', '마지막 업데이트'],
      versionStats.map((r, i) => [
        i + 1,
        r.item_id.length > 25 ? r.item_id.slice(0, 22) + '...' : r.item_id,
        (r.item_name || '-').length > 20 ? r.item_name.slice(0, 17) + '...' : (r.item_name || '-'),
        r.version_count,
        r.latest_version,
        new Date(r.last_updated).toLocaleDateString('ko-KR'),
      ]),
      [0, 3]
    )

    // 버전 타입 분포
    const versionTypes = await sql`
      SELECT
        version_type,
        COUNT(*)::int AS cnt
      FROM item_versions
      WHERE created_at >= NOW() - make_interval(days => ${days})
      GROUP BY version_type
      ORDER BY cnt DESC
    `.catch(() => [])

    if (versionTypes.length > 0) {
      console.log(`\n  버전 타입 분포:`)
      printTable(
        ['타입', '건수'],
        versionTypes.map((r) => [r.version_type, r.cnt]),
        [1]
      )
    }
  }

  // ── 9-4. 검색 무결과율 (skill_events 기반) ──
  // Go/No-go 핵심 지표: 무결과율 10% 이하
  const ZERO_RESULT_SKILL_ID = '__zero_result__'
  const MIN_SAMPLE = 100

  separator('9-4. 검색 무결과율 (skill_events 기반) ★ Go/No-go 핵심')

  // 범위 A: 전체 (skill_events)
  const [zrAll] = await sql`
    WITH search_queries AS (
      SELECT DISTINCT session_id, query
      FROM skill_events
      WHERE action = 'search'
        AND skill_id != ${ZERO_RESULT_SKILL_ID}
        AND created_at >= NOW() - make_interval(days => ${days})
        AND query IS NOT NULL
    ),
    zero_queries AS (
      SELECT DISTINCT session_id, query
      FROM skill_events
      WHERE action = 'search'
        AND skill_id = ${ZERO_RESULT_SKILL_ID}
        AND created_at >= NOW() - make_interval(days => ${days})
        AND query IS NOT NULL
    )
    SELECT
      (SELECT COUNT(*)::int FROM search_queries) + (SELECT COUNT(*)::int FROM zero_queries) AS total,
      (SELECT COUNT(*)::int FROM zero_queries) AS zero_cnt
  `.catch(() => [{ total: 0, zero_cnt: 0 }])

  const zrAllTotal = Number(zrAll.total) || 0
  const zrAllZero = Number(zrAll.zero_cnt) || 0
  const zrAllPct = zrAllTotal > 0 ? (zrAllZero / zrAllTotal * 100).toFixed(1) : '-'

  // 범위 B: 실제 클라이언트만 (claude_code/opencode/codex)
  const [zrClient] = await sql`
    WITH client_sessions AS (
      SELECT session_id FROM mcp_sessions
      WHERE client_type IN ('claude_code', 'opencode', 'codex')
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
    zero_queries AS (
      SELECT DISTINCT se.session_id, se.query
      FROM skill_events se
      JOIN client_sessions cs ON cs.session_id = se.session_id
      WHERE se.action = 'search'
        AND se.skill_id = ${ZERO_RESULT_SKILL_ID}
        AND se.created_at >= NOW() - make_interval(days => ${days})
        AND se.query IS NOT NULL
    )
    SELECT
      (SELECT COUNT(*)::int FROM search_queries) + (SELECT COUNT(*)::int FROM zero_queries) AS total,
      (SELECT COUNT(*)::int FROM zero_queries) AS zero_cnt
  `.catch(() => [{ total: 0, zero_cnt: 0 }])

  const zrClientTotal = Number(zrClient.total) || 0
  const zrClientZero = Number(zrClient.zero_cnt) || 0
  const zrClientPct = zrClientTotal > 0 ? (zrClientZero / zrClientTotal * 100).toFixed(1) : '-'

  // 일별 트렌드 (최근 7일)
  const zrTrend = await sql`
    WITH daily AS (
      SELECT
        DATE(created_at) AS day,
        COUNT(DISTINCT CASE WHEN skill_id = ${ZERO_RESULT_SKILL_ID} THEN session_id || '::' || query END)::int AS zero_cnt,
        COUNT(DISTINCT session_id || '::' || query)::int AS total_cnt
      FROM skill_events
      WHERE action = 'search'
        AND created_at >= NOW() - INTERVAL '7 days'
        AND query IS NOT NULL
      GROUP BY DATE(created_at)
      ORDER BY day DESC
    )
    SELECT * FROM daily
  `.catch(() => [])

  printTable(
    ['범위', '총 검색', '무결과', '무결과율', '표본 유의미'],
    [
      ['A: 전체 (skill_events)', zrAllTotal, zrAllZero, `${zrAllPct}%`, zrAllTotal >= MIN_SAMPLE ? '✅' : `⚠️ (${MIN_SAMPLE}건 미만)`],
      ['B: 실제 클라이언트', zrClientTotal, zrClientZero, `${zrClientPct}%`, zrClientTotal >= MIN_SAMPLE ? '✅' : `⚠️ (${MIN_SAMPLE}건 미만)`],
    ],
    [1, 2]
  )

  console.log(`  목표: 10% 이하 (Go/No-go 기준)`)

  if (zrTrend.length > 0) {
    console.log(`\n  [일별 무결과율 트렌드 — 최근 7일]`)
    printTable(
      ['날짜', '총 검색', '무결과', '무결과율'],
      zrTrend.map((r) => {
        const pct = r.total_cnt > 0 ? (r.zero_cnt / r.total_cnt * 100).toFixed(1) : '-'
        return [
          new Date(r.day).toLocaleDateString('ko-KR'),
          r.total_cnt,
          r.zero_cnt,
          `${pct}%`,
        ]
      }),
      [1, 2]
    )
  }

  // 무결과 검색어 TOP 10 (개선 대상)
  const zrTopQueries = await sql`
    SELECT
      query,
      COUNT(DISTINCT session_id)::int AS sessions,
      COUNT(*)::int AS cnt
    FROM skill_events
    WHERE action = 'search'
      AND skill_id = ${ZERO_RESULT_SKILL_ID}
      AND created_at >= NOW() - make_interval(days => ${days})
      AND query IS NOT NULL
    GROUP BY query
    ORDER BY sessions DESC, cnt DESC
    LIMIT 10
  `.catch(() => [])

  if (zrTopQueries.length > 0) {
    console.log(`\n  [무결과 검색어 TOP 10 — 스킬 추가 후보]`)
    printTable(
      ['#', '검색어', '세션 수', '총 횟수'],
      zrTopQueries.map((r, i) => {
        const q = r.query.length > 50 ? r.query.slice(0, 47) + '...' : r.query
        return [i + 1, q, r.sessions, r.cnt]
      }),
      [0, 2, 3]
    )
  }

  // skill_events 기반 무결과율을 section 11 목표에서 사용
  const seZeroResultPct = zrAllPct

  // ── 10. 스킬별 전환율 분석 (skill_events) ──
  let matchedHitPctValue = '-'  // section 11에서 재사용
  separator('10. 스킬별 전환율 분석 (skill_events)')

  const skillFunnel = await sql`
    SELECT
      skill_id,
      COUNT(*) FILTER (WHERE action = 'search')::int AS searches,
      COUNT(*) FILTER (WHERE action = 'load')::int AS loads,
      COUNT(*) FILTER (WHERE action = 'apply')::int AS applies,
      COUNT(*) FILTER (WHERE action = 'skip')::int AS skips,
      COUNT(*) FILTER (WHERE action = 'deploy')::int AS deploys,
      COUNT(*) FILTER (WHERE action = 'suggest')::int AS suggests,
      COUNT(DISTINCT session_id)::int AS sessions
    FROM skill_events
    WHERE created_at >= NOW() - make_interval(days => ${days})
    GROUP BY skill_id
    ORDER BY loads DESC, searches DESC
    LIMIT 20
  `.catch(() => [])

  if (skillFunnel.length > 0) {
    const [eventSummary] = await sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE action = 'search')::int AS searches,
        COUNT(*) FILTER (WHERE action = 'load')::int AS loads,
        COUNT(*) FILTER (WHERE action = 'apply')::int AS applies,
        COUNT(*) FILTER (WHERE action = 'skip')::int AS skips,
        COUNT(*) FILTER (WHERE action = 'deploy')::int AS deploys,
        COUNT(DISTINCT session_id)::int AS sessions,
        COUNT(DISTINCT skill_id)::int AS unique_skills
      FROM skill_events
      WHERE created_at >= NOW() - make_interval(days => ${days})
    `

    console.log(`  총 이벤트: ${eventSummary.total}건 (${eventSummary.unique_skills}개 스킬, ${eventSummary.sessions}개 세션)`)
    console.log(`  search: ${eventSummary.searches} → load: ${eventSummary.loads} → apply: ${eventSummary.applies} / skip: ${eventSummary.skips} → deploy: ${eventSummary.deploys}`)
    const globalLoadRate = eventSummary.searches > 0 ? (eventSummary.loads / eventSummary.searches * 100).toFixed(1) : '-'
    const globalApplyRate = eventSummary.loads > 0 ? (eventSummary.applies / eventSummary.loads * 100).toFixed(1) : '-'
    console.log(`  전체 search→load: ${globalLoadRate}%, load→apply: ${globalApplyRate}%`)

    console.log(`\n  [스킬별 퍼널 TOP 20]`)
    printTable(
      ['#', '스킬 ID', 'search', 'load', 'apply', 'skip', 'deploy', '세션', 'S→L%', 'L→A%'],
      skillFunnel.map((r, i) => {
        const s2l = r.searches > 0 ? (r.loads / r.searches * 100).toFixed(0) + '%' : '-'
        const l2a = r.loads > 0 ? (r.applies / r.loads * 100).toFixed(0) + '%' : '-'
        return [i + 1, r.skill_id, r.searches, r.loads, r.applies, r.skips, r.deploys, r.sessions, s2l, l2a]
      }),
      [0, 2, 3, 4, 5, 6, 7]
    )

    // 저조한 전환율 스킬 (search 3회 이상인데 load 0)
    const deadSkills = skillFunnel.filter((r) => r.searches >= 3 && r.loads === 0)
    if (deadSkills.length > 0) {
      console.log(`\n  [검색 노출 되지만 조회 안 되는 스킬] — 제목/설명 개선 후보`)
      printTable(
        ['#', '스킬 ID', 'search 횟수', 'load 횟수'],
        deadSkills.map((r, i) => [i + 1, r.skill_id, r.searches, r.loads]),
        [0, 2, 3]
      )
    }

    // ── 10-2. 스킬 매칭 기반 추천 적중률 (Go/No-go 핵심 지표) ──
    // "추천된 그 스킬을 실제로 조회했는가"를 skill_events의 skill_id 매칭으로 측정
    const [matchedHitRate] = await sql`
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
        JOIN loaded_skills ls ON ss.session_id = ls.session_id AND ss.skill_id = ls.skill_id
      )
      SELECT
        (SELECT COUNT(DISTINCT session_id || '::' || skill_id) FROM search_skills) AS total_recommendations,
        (SELECT COUNT(*) FROM matched) AS matched_loads
    `.catch(() => [{ total_recommendations: 0, matched_loads: 0 }])

    const totalRecs = parseInt(matchedHitRate.total_recommendations) || 0
    const matchedLoads = parseInt(matchedHitRate.matched_loads) || 0
    // matchedHitPct는 section 11 목표 달성에서 재사용하므로 외부 스코프에 할당
    matchedHitPctValue = totalRecs > 0 ? (matchedLoads / totalRecs * 100).toFixed(1) : '-'

    console.log(`\n  [추천 적중률 — 스킬 매칭 기반] ★ Go/No-go 핵심 지표`)
    console.log(`  추천된 (세션×스킬) 쌍: ${totalRecs}`)
    console.log(`  실제 조회 매칭:        ${matchedLoads}`)
    console.log(`  적중률:                ${matchedHitPctValue}%`)
  } else {
    console.log('  (skill_events 데이터 없음 — 테이블 미존재 또는 이벤트 미기록)')
  }

  // ── 11. 목표 달성 현황 ──
  separator('11. 목표 달성 현황')

  const totalLogs = effectiveLogs || 1  // report_session_event 제외
  const errorRate = ((summary.error_count || 0) / totalLogs * 100)
  const s2vPct = searchCount > 0 ? (viewFromSearch / searchCount * 100) : 0
  const v2dPct = viewCount > 0 ? ((summary.deploy_count || 0) / viewCount * 100) : 0
  const sessionS2vPct = sf.search_sessions > 0
    ? (sf.search_to_view / sf.search_sessions * 100) : 0
  const skillApplyPct = (summary.outcome_count || 0) > 0
    ? ((summary.outcome_applied || 0) / summary.outcome_count * 100) : 0
  const searchSkipPct = searchCount > 0
    ? ((summary.skip_count || 0) / searchCount * 100) : 0
  // skill_events 기반 적중률 (section 9에서 계산된 값 재사용)
  const skillMatchHitPct = matchedHitPctValue !== '-'
    ? parseFloat(matchedHitPctValue) : 0

  const metrics = [
    {
      name: '★ 추천 적중률 (스킬매칭)',
      actual: skillMatchHitPct,
      target: TARGETS.searchToViewPct,
      unit: '%',
      higher: true,
      note: 'skill_events 기반',
    },
    {
      name: '세션 전환율 (검색→조회)',
      actual: parseFloat(sessionS2vPct.toFixed(1)),
      target: TARGETS.searchToViewPct,
      unit: '%',
      higher: true,
    },
    {
      name: '조회→배포 전환율',
      actual: parseFloat(v2dPct.toFixed(1)),
      target: TARGETS.viewToDeployPct,
      unit: '%',
      higher: true,
    },
    {
      name: '스킬 적용률',
      actual: parseFloat(skillApplyPct.toFixed(1)),
      target: TARGETS.skillApplyPct,
      unit: '%',
      higher: true,
    },
    {
      name: '검색 스킵율',
      actual: parseFloat(searchSkipPct.toFixed(1)),
      target: TARGETS.searchSkipPct,
      unit: '%',
      higher: false,
    },
    {
      name: '검색 무결과율 (audit_logs)',
      actual: parseFloat(zeroResultPct),
      target: TARGETS.zeroResultPct,
      unit: '%',
      higher: false,
    },
    {
      name: '★ 검색 무결과율 (skill_events)',
      actual: seZeroResultPct !== '-' ? parseFloat(seZeroResultPct) : 0,
      target: TARGETS.zeroResultPct,
      unit: '%',
      higher: false,
      note: `n=${zrAllTotal}${zrAllTotal < MIN_SAMPLE ? ' (표본 부족)' : ''}`,
    },
    {
      name: '에러율',
      actual: parseFloat(errorRate.toFixed(2)),
      target: TARGETS.errorRatePct,
      unit: '%',
      higher: false,
    },
    {
      name: '전체 평균 응답시간',
      actual: summary.avg_response_time ?? 0,
      target: TARGETS.avgResponseMs,
      unit: 'ms',
      higher: false,
    },
    {
      name: '검색 평균 응답시간',
      actual: summary.avg_search_time ?? 0,
      target: TARGETS.searchResponseMs,
      unit: 'ms',
      higher: false,
    },
  ]

  printTable(
    ['지표', '현재', '목표', '달성률', '상태'],
    metrics.map((m) => {
      const pct = m.target > 0 ? (m.actual / m.target * 100) : 0
      const achieved = m.higher ? m.actual >= m.target : m.actual <= m.target
      const achievePct = m.higher
        ? pct.toFixed(0) + '%'
        : (m.actual > 0 ? (m.target / m.actual * 100).toFixed(0) + '%' : '✅ 0')
      return [
        m.name,
        `${m.actual}${m.unit}`,
        `${m.target}${m.unit}`,
        achievePct,
        achieved ? '✅ 달성' : '⚠️ 미달',
      ]
    }),
    [3]
  )

  const achievedCount = metrics.filter((m) =>
    m.higher ? m.actual >= m.target : m.actual <= m.target
  ).length
  console.log(`\n  종합: ${achievedCount}/${metrics.length} 달성`)

  // ═══════════════════════════════════════════════════════════
  // 12. Go/No-go Dashboard
  // ═══════════════════════════════════════════════════════════
  separator('12. Go/No-go Dashboard')

  console.log(`  판정 기준: 6개 중 5개+ 충족 (필수 #1, #2, #4 포함) = Go`)
  console.log(`  최종 판정일: 3/21`)
  console.log('')

  // ── 조건 1: 추천 적중률 (skill_events search→load 매칭) ──
  const [gonogo1] = await sql`
    WITH search_skills AS (
      SELECT DISTINCT session_id, skill_id
      FROM skill_events
      WHERE action = 'search'
        AND skill_id IS NOT NULL
        AND created_at >= NOW() - make_interval(days => ${days})
    ),
    loaded_skills AS (
      SELECT DISTINCT session_id, skill_id
      FROM skill_events
      WHERE action = 'load'
        AND created_at >= NOW() - make_interval(days => ${days})
    ),
    matched AS (
      SELECT ss.session_id, ss.skill_id
      FROM search_skills ss
      JOIN loaded_skills ls ON ss.session_id = ls.session_id AND ss.skill_id = ls.skill_id
    )
    SELECT
      (SELECT COUNT(*) FROM search_skills)::int AS total_recs,
      (SELECT COUNT(*) FROM matched)::int AS matched_loads
  `.catch(() => [{ total_recs: 0, matched_loads: 0 }])

  const gn1Total = gonogo1.total_recs || 0
  const gn1Matched = gonogo1.matched_loads || 0
  const gn1Pct = gn1Total > 0 ? (gn1Matched / gn1Total * 100) : 0
  const gn1MinN = 100
  const gn1Pass = gn1Total >= gn1MinN && gn1Pct >= 30

  // ── 조건 2: 검색 무결과율 (훅 기반) ──
  const [gonogo2] = await sql`
    SELECT
      COUNT(*)::int AS total_searches,
      COUNT(*) FILTER (
        WHERE search_results IS NULL
          OR jsonb_array_length(search_results) = 0
          OR (search_results->0->>'score')::float < ${threshold}
      )::int AS zero_result
    FROM mcp_audit_logs
    WHERE created_at >= NOW() - make_interval(days => ${days})
      AND (tool = 'search_plugins' OR tool = 'semantic_search')
      AND (
        referral_source = 'suggest'
        OR request_params->'params'->'arguments'->>'_source' = 'skill-suggest'
      )
  `.catch(() => [{ total_searches: 0, zero_result: 0 }])

  const gn2Total = gonogo2.total_searches || 0
  const gn2Zero = gonogo2.zero_result || 0
  const gn2Pct = gn2Total > 0 ? (gn2Zero / gn2Total * 100) : 0
  const gn2MinN = 100
  const gn2Pass = gn2Total >= gn2MinN && gn2Pct <= 10

  // ── 조건 3: 발견의 가치 (full funnel) ──
  const [gonogo3] = await sql`
    WITH funnel AS (
      SELECT session_id, skill_id,
        bool_or(action = 'search') AS searched,
        bool_or(action = 'load') AS loaded,
        bool_or(action IN ('apply', 'deploy')) AS converted
      FROM skill_events
      WHERE created_at >= NOW() - make_interval(days => ${days})
      GROUP BY session_id, skill_id
    )
    SELECT COUNT(*)::int AS full_funnel_count
    FROM funnel
    WHERE searched AND loaded AND converted
  `.catch(() => [{ full_funnel_count: 0 }])

  const gn3Count = gonogo3.full_funnel_count || 0
  const gn3MinN = 3
  const gn3Pass = gn3Count >= gn3MinN

  // ── 조건 4: 검색 속도 P50 ──
  const gn4P50 = summary.p50_search_time || 0
  const gn4N = searchCount
  const gn4MinN = 50
  const gn4Pass = gn4N >= gn4MinN && gn4P50 <= 2000

  // ── 조건 5: 외부 스킬 추천 적중 (full funnel 스킬 목록) ──
  const gonogoExternal = await sql`
    WITH funnel AS (
      SELECT session_id, skill_id,
        bool_or(action = 'search') AS searched,
        bool_or(action = 'load') AS loaded,
        bool_or(action IN ('apply', 'deploy')) AS converted
      FROM skill_events
      WHERE created_at >= NOW() - make_interval(days => ${days})
      GROUP BY session_id, skill_id
    )
    SELECT DISTINCT skill_id
    FROM funnel
    WHERE searched AND loaded AND converted
    ORDER BY skill_id
    LIMIT 20
  `.catch(() => [])

  const gn5Skills = gonogoExternal.map((r) => r.skill_id)
  const gn5Pass = gn5Skills.length >= 1

  // ── 조건 6: 시간 절약 사례 (apply + deploy) ──
  const [gonogo6] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE action = 'apply')::int AS apply_count,
      COUNT(*) FILTER (WHERE action = 'deploy')::int AS deploy_count,
      COUNT(*)::int AS total_positive
    FROM skill_events
    WHERE created_at >= NOW() - make_interval(days => ${days})
      AND action IN ('apply', 'deploy')
  `.catch(() => [{ apply_count: 0, deploy_count: 0, total_positive: 0 }])

  const gn6Total = gonogo6.total_positive || 0
  const gn6MinN = 5
  const gn6Pass = gn6Total >= gn6MinN

  // ── Dashboard 출력 ──
  const gonogoConditions = [
    {
      id: 1,
      name: '추천 적중률',
      criterion: '≥ 30%',
      value: `${gn1Pct.toFixed(1)}%`,
      n: gn1Total,
      minN: gn1MinN,
      pass: gn1Pass,
      required: true,
    },
    {
      id: 2,
      name: '검색 무결과율 (훅)',
      criterion: '≤ 10%',
      value: `${gn2Pct.toFixed(1)}%`,
      n: gn2Total,
      minN: gn2MinN,
      pass: gn2Pass,
      required: true,
    },
    {
      id: 3,
      name: '발견의 가치',
      criterion: '≥ 3건',
      value: `${gn3Count}건`,
      n: gn3Count,
      minN: gn3MinN,
      pass: gn3Pass,
      required: false,
    },
    {
      id: 4,
      name: '검색 속도 P50',
      criterion: '≤ 2,000ms',
      value: `${gn4P50.toLocaleString()}ms`,
      n: gn4N,
      minN: gn4MinN,
      pass: gn4Pass,
      required: true,
    },
    {
      id: 5,
      name: '외부 스킬 추천',
      criterion: '≥ 1건',
      value: `${gn5Skills.length}건`,
      n: gn5Skills.length,
      minN: 1,
      pass: gn5Pass,
      required: false,
    },
    {
      id: 6,
      name: '시간 절약 사례',
      criterion: '≥ 5건',
      value: `${gn6Total}건 (apply ${gonogo6.apply_count || 0} + deploy ${gonogo6.deploy_count || 0})`,
      n: gn6Total,
      minN: gn6MinN,
      pass: gn6Pass,
      required: false,
    },
  ]

  printTable(
    ['#', '조건', '기준', '현재값', '표본(n)', '최소n', '신뢰도', '판정'],
    gonogoConditions.map((c) => {
      const confidence = c.n >= c.minN ? '충분' : `부족 (${c.n}/${c.minN})`
      const status = c.n < c.minN
        ? '⏳ 표본부족'
        : c.pass
          ? '✅ 충족'
          : '❌ 미충족'
      return [
        `${c.id}${c.required ? '*' : ''}`,
        c.name,
        c.criterion,
        c.value,
        c.n,
        c.minN,
        confidence,
        status,
      ]
    }),
    [0, 4, 5]
  )

  console.log(`  (* = 필수 조건)`)

  if (gn5Skills.length > 0) {
    console.log(`\n  [Full funnel 완주 스킬] ${gn5Skills.join(', ')}`)
  }

  // ── 종합 판정 ──
  const gonogoPassedCount = gonogoConditions.filter((c) => c.pass).length
  const requiredPassed = gonogoConditions.filter((c) => c.required && c.pass).length
  const requiredTotal = gonogoConditions.filter((c) => c.required).length
  const insufficientSample = gonogoConditions.some((c) => c.n < c.minN)

  let verdict = ''
  if (insufficientSample) {
    verdict = '⏳ 판정 유보 (표본 부족)'
  } else if (gonogoPassedCount >= 5 && requiredPassed === requiredTotal) {
    verdict = '🟢 Go'
  } else if (gonogoPassedCount >= 4 && requiredPassed >= 2) {
    verdict = '🟡 Conditional Go'
  } else {
    verdict = '🔴 No-go'
  }

  console.log(`\n  ┌─────────────────────────────────────┐`)
  console.log(`  │ 종합 판정: ${verdict.padEnd(25)}│`)
  console.log(`  │ 충족: ${gonogoPassedCount}/6 (필수 ${requiredPassed}/${requiredTotal})${' '.repeat(14)}│`)
  console.log(`  └─────────────────────────────────────┘`)

  console.log(`\n✅ 분석 완료\n`)
}

main().catch((err) => {
  console.error('❌ 분석 실패:', err.message || err)
  process.exit(1)
})
