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

  // 품질 지표
  errorRatePct: 1.0,        // 에러율 상한 (%)
  avgResponseMs: 500,       // 평균 응답시간 상한 (ms)
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
      COUNT(*) FILTER (WHERE response_status = 'error')::int AS error_count,
      ROUND(AVG(response_time))::int AS avg_response_time
    FROM mcp_audit_logs
    WHERE created_at >= NOW() - make_interval(days => ${days})
  `

  const searchCount = summary.search_count || 0
  const viewCount = summary.view_count || 0
  const viewFromSearch = summary.view_from_search || 0
  const conversionRate =
    searchCount > 0 ? ((viewFromSearch / searchCount) * 100).toFixed(1) : '0.0'

  console.log(`  총 로그 수:      ${summary.total_logs.toLocaleString()}`)
  console.log(`  고유 사용자:     ${summary.unique_users.toLocaleString()}`)
  console.log(`  검색 요청:       ${searchCount.toLocaleString()}`)
  console.log(`  스킬 조회:       ${viewCount.toLocaleString()} (검색경유 ${viewFromSearch} / 직접 ${viewCount - viewFromSearch})`)
  console.log(`  배포:            ${summary.deploy_count.toLocaleString()}`)
  console.log(`  에러:            ${summary.error_count.toLocaleString()}`)
  console.log(`  평균 응답시간:   ${summary.avg_response_time ?? '-'}ms`)
  console.log(`  검색→조회 전환율: ${conversionRate}%`)

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

  // 4-1. 무결과 검색 (search_results가 빈 배열이거나 NULL)
  const [searchQuality] = await sql`
    SELECT
      COUNT(*)::int AS total_searches,
      COUNT(*) FILTER (
        WHERE search_results IS NULL
          OR jsonb_array_length(search_results) = 0
      )::int AS zero_results,
      COUNT(*) FILTER (
        WHERE search_results IS NOT NULL
          AND jsonb_array_length(search_results) > 0
      )::int AS has_results
    FROM mcp_audit_logs
    WHERE created_at >= NOW() - make_interval(days => ${days})
      AND (tool = 'search_plugins' OR tool = 'semantic_search')
  `

  const totalSearches = searchQuality.total_searches || 1
  const zeroResultPct = (searchQuality.zero_results / totalSearches * 100).toFixed(1)

  console.log(`  총 검색:     ${searchQuality.total_searches}건`)
  console.log(`  결과 있음:   ${searchQuality.has_results}건 (${(searchQuality.has_results / totalSearches * 100).toFixed(1)}%)`)
  console.log(`  무결과:      ${searchQuality.zero_results}건 (${zeroResultPct}%)`)

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

  // 4-3. 조회로 이어지지 않은 검색어 TOP 15 (개선 대상)
  const deadSearches = await sql`
    WITH search_logs AS (
      SELECT
        id,
        session_id,
        request_params->'params'->'arguments'->>'query' AS query,
        search_results
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
      BOOL_OR(s.search_results IS NULL OR jsonb_array_length(s.search_results) = 0) AS had_zero_results
    FROM search_logs s
    WHERE s.session_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM sessions_with_view v WHERE v.session_id = s.session_id)
    GROUP BY s.query
    ORDER BY cnt DESC
    LIMIT 15
  `

  if (deadSearches.length > 0) {
    console.log(`\n  [조회 미전환 검색어 TOP 15] — 스킬 추가/개선 후보`)
    printTable(
      ['#', '검색어', '횟수', '무결과'],
      deadSearches.map((r, i) => {
        const q = r.query.length > 50 ? r.query.slice(0, 47) + '...' : r.query
        return [i + 1, q, r.cnt, r.had_zero_results ? 'Y' : 'N']
      }),
      [0, 2]
    )
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

  // ── 8. 목표 달성 현황 ──
  separator('8. 목표 달성 현황')

  const totalLogs = summary.total_logs || 1
  const errorRate = ((summary.error_count || 0) / totalLogs * 100)
  const s2vPct = searchCount > 0 ? (viewFromSearch / searchCount * 100) : 0
  const v2dPct = viewCount > 0 ? ((summary.deploy_count || 0) / viewCount * 100) : 0
  const sessionS2vPct = sf.search_sessions > 0
    ? (sf.search_to_view / sf.search_sessions * 100) : 0

  const metrics = [
    {
      name: '검색→조회 전환율',
      actual: parseFloat(s2vPct.toFixed(1)),
      target: TARGETS.searchToViewPct,
      unit: '%',
      higher: true,
    },
    {
      name: '세션 전환율',
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
      name: '검색 무결과율',
      actual: parseFloat(zeroResultPct),
      target: TARGETS.zeroResultPct,
      unit: '%',
      higher: false,
    },
    {
      name: '에러율',
      actual: parseFloat(errorRate.toFixed(2)),
      target: TARGETS.errorRatePct,
      unit: '%',
      higher: false,
    },
    {
      name: '평균 응답시간',
      actual: summary.avg_response_time ?? 0,
      target: TARGETS.avgResponseMs,
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
        : (m.target > 0 ? (m.target / m.actual * 100).toFixed(0) + '%' : '-')
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

  console.log(`\n✅ 분석 완료\n`)
}

main().catch((err) => {
  console.error('❌ 분석 실패:', err.message || err)
  process.exit(1)
})
