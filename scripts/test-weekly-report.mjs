#!/usr/bin/env node
/**
 * 주간 리포트 테스트 — 실제 DB에서 데이터 가져와 이미지 생성
 * 실행: node scripts/test-weekly-report.mjs [--days=30]
 * 출력: scripts/out/weekly-report.png
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const outDir = resolve(__dirname, 'out')
mkdirSync(outDir, { recursive: true })

// .env.local 로드
const envPath = resolve(projectRoot, '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const dbMatch = envContent.match(/^DATABASE_URL\s*=\s*["']?(.+?)["']?\s*$/m)
if (!dbMatch) throw new Error('DATABASE_URL not found in .env.local')
process.env.DATABASE_URL = dbMatch[1]

// days 파라미터
const days = parseInt(process.argv.find(a => a.startsWith('--days='))?.split('=')[1] || '7')

// Neon 직접 연결 (drizzle 거치지 않고 raw SQL)
function loadNeon() {
  const paths = [
    resolve(projectRoot, 'node_modules/.pnpm/@neondatabase+serverless@1.0.2/node_modules/@neondatabase/serverless/index.mjs'),
    resolve(projectRoot, 'packages/db/node_modules/@neondatabase/serverless/index.mjs'),
  ]
  for (const p of paths) {
    try {
      const req = createRequire(p)
      return req(resolve(p, '..'))
    } catch { /* next */ }
  }
  const req = createRequire(resolve(projectRoot, 'packages/db/package.json'))
  return req('@neondatabase/serverless')
}

const ZERO_RESULT_SKILL_ID = '__zero_result__'
const { neon } = loadNeon()
const sql = neon(process.env.DATABASE_URL)

console.log(`\n📊 주간 리포트 테스트 (최근 ${days}일)\n`)

// ── 쿼리 실행 ──
const [summary] = await sql`
  SELECT
    COUNT(*)::int AS total_logs,
    COUNT(DISTINCT t.user_id)::int AS unique_users,
    COUNT(*) FILTER (WHERE tool IN ('search_plugins','semantic_search'))::int AS search_count,
    COUNT(*) FILTER (WHERE tool = 'get_plugin_content')::int AS view_count,
    COUNT(*) FILTER (WHERE tool = 'get_plugin_content' AND referral_source = 'search')::int AS view_from_search,
    COUNT(*) FILTER (WHERE tool = 'deploy_skill')::int AS deploy_count,
    COUNT(*) FILTER (WHERE tool = 'report_search_skip')::int AS skip_count,
    COUNT(*) FILTER (WHERE tool = 'report_skill_outcome')::int AS outcome_count,
    COUNT(*) FILTER (WHERE tool = 'report_skill_outcome' AND (request_params->'params'->'arguments'->>'applied')::boolean = true)::int AS outcome_applied,
    COUNT(*) FILTER (WHERE response_status = 'error' AND tool IS DISTINCT FROM 'report_session_event')::int AS error_count,
    COUNT(*) FILTER (WHERE tool IS DISTINCT FROM 'report_session_event')::int AS effective_logs,
    ROUND(AVG(response_time) FILTER (WHERE tool IS DISTINCT FROM 'report_session_event'))::int AS avg_response_time,
    ROUND(AVG(response_time) FILTER (WHERE tool IN ('search_plugins','semantic_search')))::int AS avg_search_time,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time) FILTER (WHERE tool IN ('search_plugins','semantic_search')))::int AS p50_search_time,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time) FILTER (WHERE tool IN ('search_plugins','semantic_search')))::int AS p95_search_time
  FROM mcp_audit_logs l
  LEFT JOIN oauth_access_tokens t ON l.access_token_id = t.id
  WHERE l.created_at >= NOW() - make_interval(days => ${days})
`

const clientStats = await sql`
  SELECT
    COALESCE(client_type, 'unknown') AS client,
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE tool IN ('search_plugins','semantic_search'))::int AS searches,
    COUNT(*) FILTER (WHERE tool = 'get_plugin_content')::int AS views,
    COUNT(*) FILTER (WHERE tool = 'deploy_skill')::int AS deploys,
    COUNT(*) FILTER (WHERE response_status = 'error')::int AS errors,
    ROUND(AVG(response_time))::int AS avg_ms
  FROM mcp_audit_logs
  WHERE created_at >= NOW() - make_interval(days => ${days})
  GROUP BY COALESCE(client_type, 'unknown')
  ORDER BY total DESC
`

const [sess] = await sql`
  WITH user_funnel AS (
    SELECT t.user_id,
      bool_or(l.tool IN ('search_plugins','semantic_search')) AS searched,
      bool_or(l.tool='get_plugin_content') AS viewed,
      bool_or(l.tool='deploy_skill') AS deployed,
      bool_or(l.tool='report_skill_outcome'
        AND (l.request_params->'params'->'arguments'->>'applied')::boolean=true) AS applied
    FROM mcp_audit_logs l
    JOIN oauth_access_tokens t ON l.access_token_id=t.id
    WHERE l.created_at >= NOW() - make_interval(days => ${days}) AND t.user_id IS NOT NULL
    GROUP BY t.user_id
  )
  SELECT
    COUNT(*)::int AS total_sessions,
    COUNT(*) FILTER (WHERE searched)::int AS search_sessions,
    COUNT(*) FILTER (WHERE viewed)::int AS view_sessions,
    COUNT(*) FILTER (WHERE deployed)::int AS deploy_sessions,
    COUNT(*) FILTER (WHERE applied)::int AS apply_sessions,
    COUNT(*) FILTER (WHERE searched AND viewed)::int AS search_to_view,
    COUNT(*) FILTER (WHERE viewed AND deployed)::int AS view_to_deploy,
    COUNT(*) FILTER (WHERE deployed AND applied)::int AS deploy_to_apply
  FROM user_funnel
`

const [zr] = await sql`
  SELECT
    COUNT(*)::int AS total_searches,
    COUNT(*) FILTER (
      WHERE jsonb_array_length(COALESCE(search_results, '[]'::jsonb)) = 0
    )::int AS zero_result_count
  FROM mcp_audit_logs
  WHERE tool IN ('search_plugins','semantic_search')
    AND response_status = 'success'
    AND created_at >= NOW() - make_interval(days => ${days})
`.catch(() => [{ total_searches: 0, zero_result_count: 0 }])

const [rec] = await sql`
  WITH ss AS (
    SELECT session_id, skill_id FROM skill_events
    WHERE action='search' AND skill_id IS NOT NULL
      AND created_at >= NOW() - make_interval(days => ${days})
  ), ls AS (
    SELECT session_id, skill_id FROM skill_events
    WHERE action='load' AND created_at >= NOW() - make_interval(days => ${days})
  ), m AS (
    SELECT DISTINCT ss.session_id, ss.skill_id FROM ss
    JOIN ls ON ss.session_id=ls.session_id AND ss.skill_id=ls.skill_id
  )
  SELECT (SELECT COUNT(DISTINCT session_id||'::'||skill_id) FROM ss) AS total_recs,
         (SELECT COUNT(*) FROM m) AS matched
`.catch(() => [{ total_recs: 0, matched: 0 }])

// ── 데이터 조립 ──
const n = (v) => Number(v) || 0
const reportData = {
  period: { days, generatedAt: new Date().toISOString() },
  summary: {
    totalLogs: n(summary.total_logs), effectiveLogs: n(summary.effective_logs),
    uniqueUsers: n(summary.unique_users), searchCount: n(summary.search_count),
    viewCount: n(summary.view_count), viewFromSearch: n(summary.view_from_search),
    deployCount: n(summary.deploy_count), skipCount: n(summary.skip_count),
    outcomeCount: n(summary.outcome_count), outcomeApplied: n(summary.outcome_applied),
    errorCount: n(summary.error_count), avgResponseTime: n(summary.avg_response_time),
    avgSearchTime: n(summary.avg_search_time), p50SearchTime: n(summary.p50_search_time),
    p95SearchTime: n(summary.p95_search_time),
  },
  clients: clientStats.map(r => ({
    client: String(r.client), total: n(r.total), searches: n(r.searches),
    views: n(r.views), deploys: n(r.deploys), errors: n(r.errors), avgMs: n(r.avg_ms),
  })),
  sessionFunnel: {
    totalSessions: n(sess.total_sessions), searchSessions: n(sess.search_sessions),
    viewSessions: n(sess.view_sessions), deploySessions: n(sess.deploy_sessions),
    applySessions: n(sess.apply_sessions),
    s2vRate: n(sess.search_sessions) > 0 ? n(sess.search_to_view) / n(sess.search_sessions) : 0,
    v2dRate: n(sess.view_sessions) > 0 ? n(sess.view_to_deploy) / n(sess.view_sessions) : 0,
    d2aRate: n(sess.deploy_sessions) > 0 ? n(sess.deploy_to_apply) / n(sess.deploy_sessions) : 0,
  },
  skillEventsZeroResultPct: 0, skillEventsZeroResultTotal: 0,
  recommendationAccuracyPct: 0, recommendationTotal: 0, recommendationMatched: 0,
  targets: [], achievedCount: 0, totalTargets: 0,
}

// zero result (audit_logs 기반)
const zrTotal = n(zr.total_searches), zrZero = n(zr.zero_result_count)
reportData.skillEventsZeroResultPct = zrTotal > 0 ? Math.round(zrZero / zrTotal * 1000) / 10 : 0
reportData.skillEventsZeroResultTotal = zrTotal

// recommendation
const recTotal = n(rec.total_recs), recMatched = n(rec.matched)
reportData.recommendationAccuracyPct = recTotal > 0 ? Math.round(recMatched / recTotal * 1000) / 10 : 0
reportData.recommendationTotal = recTotal
reportData.recommendationMatched = recMatched

// targets
const TARGETS = { searchToViewPct:15, viewToDeployPct:10, zeroResultPct:10, skillApplyPct:50, searchSkipPct:30, errorRatePct:1.0, avgResponseMs:500, searchResponseMs:1500 }
const s = reportData.summary
const sf = reportData.sessionFunnel
const errorRate = s.effectiveLogs > 0 ? (s.errorCount / s.effectiveLogs) * 100 : 0
const v2dPct = s.viewCount > 0 ? (s.deployCount / s.viewCount) * 100 : 0
const skillApplyPct = s.outcomeCount > 0 ? (s.outcomeApplied / s.outcomeCount) * 100 : 0
const searchSkipPct = s.searchCount > 0 ? (s.skipCount / s.searchCount) * 100 : 0
const r1 = v => Math.round(v * 10) / 10
const r2 = v => Math.round(v * 100) / 100

const targets = [
  { name: '추천 적중률', actual: r1(reportData.recommendationAccuracyPct), target: TARGETS.searchToViewPct, unit: '%', higher: true },
  { name: '세션 전환율', actual: r1(sf.s2vRate * 100), target: TARGETS.searchToViewPct, unit: '%', higher: true },
  { name: '조회→배포', actual: r1(v2dPct), target: TARGETS.viewToDeployPct, unit: '%', higher: true },
  { name: '스킬 적용률', actual: r1(skillApplyPct), target: TARGETS.skillApplyPct, unit: '%', higher: true },
  { name: '검색 스킵율', actual: r1(searchSkipPct), target: TARGETS.searchSkipPct, unit: '%', higher: false },
  { name: '검색 무결과율', actual: r1(reportData.skillEventsZeroResultPct), target: TARGETS.zeroResultPct, unit: '%', higher: false },
  { name: '에러율', actual: r2(errorRate), target: TARGETS.errorRatePct, unit: '%', higher: false },
  { name: '전체 응답시간', actual: s.avgResponseTime, target: TARGETS.avgResponseMs, unit: 'ms', higher: false },
  { name: '검색 응답시간', actual: s.avgSearchTime, target: TARGETS.searchResponseMs, unit: 'ms', higher: false },
].map(m => ({ ...m, achieved: m.higher ? m.actual >= m.target : m.actual <= m.target }))

reportData.targets = targets
reportData.achievedCount = targets.filter(t => t.achieved).length
reportData.totalTargets = targets.length

console.log(`✅ 데이터 수집 완료`)
console.log(`   총 요청: ${s.effectiveLogs} / 사용자: ${s.uniqueUsers}명`)
console.log(`   목표 달성: ${reportData.achievedCount}/${reportData.totalTargets}`)
console.log(`   클라이언트: ${clientStats.length}종`)
console.log()

// JSON 저장
const jsonPath = resolve(outDir, 'weekly-report.json')
writeFileSync(jsonPath, JSON.stringify(reportData, null, 2))
console.log(`📄 JSON: ${jsonPath}`)

// ── 이미지 렌더 ──
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'

const fontBase = resolve(projectRoot, 'packages/lib/src/reports/assets')
const fontRegular = readFileSync(resolve(fontBase, 'Pretendard-Regular.ttf'))
const fontBold = readFileSync(resolve(fontBase, 'Pretendard-Bold.ttf'))

const h = (type, props = {}, ...children) => {
  const flat = children.flat().filter(c => c !== null && c !== undefined && c !== false)
  const style = { ...(props.style || {}) }
  if ((type === 'div' || type === 'span') && !style.display) style.display = 'flex'
  return { type, props: { ...props, style, children: flat } }
}

const C = { bg:'#f7f8fa', card:'#ffffff', border:'#e5e7eb', text:'#0f172a', muted:'#64748b', subtle:'#94a3b8', accent:'#3b82f6', up:'#10b981', down:'#ef4444', track:'#eef2ff', bar:'#6366f1', achieved:'#dcfce7', achievedBorder:'#86efac', missed:'#fef2f2', missedBorder:'#fca5a5' }

const KpiCard = (label, value, sub) => h('div', { style: { display:'flex', flexDirection:'column', flex:1, backgroundColor:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:'16px 20px', gap:4 } },
  h('div', { style: { fontSize:14, color:C.muted, fontWeight:500 } }, label),
  h('div', { style: { fontSize:32, fontWeight:700, color:C.text, letterSpacing:-0.5 } }, value),
  sub ? h('div', { style: { fontSize:13, color:C.subtle } }, sub) : null,
)

const TargetRow = (m) => {
  const icon = m.achieved ? '✅' : '⚠️'
  const bg = m.achieved ? C.achieved : C.missed
  const bc = m.achieved ? C.achievedBorder : C.missedBorder
  return h('div', { style: { display:'flex', alignItems:'center', gap:10, backgroundColor:bg, border:`1px solid ${bc}`, borderRadius:10, padding:'8px 14px', height:38 } },
    h('span', { style: { fontSize:15, width:24 } }, icon),
    h('span', { style: { fontSize:14, fontWeight:500, color:C.text, flex:1 } }, m.name),
    h('span', { style: { fontSize:16, fontWeight:700, color:C.text } }, `${m.actual}${m.unit}`),
    h('span', { style: { fontSize:13, color:C.muted, marginLeft:6 } }, `/ ${m.target}${m.unit}`),
  )
}

const ClientRow = (c, max) => {
  const pct = Math.max(Math.round((c.total / max) * 100), 3)
  return h('div', { style: { display:'flex', alignItems:'center', gap:10, height:28 } },
    h('div', { style: { width:110, fontSize:14, fontWeight:500, color:C.text } }, c.client),
    h('div', { style: { display:'flex', flex:1, height:18, backgroundColor:C.track, borderRadius:9, overflow:'hidden' } },
      h('div', { style: { display:'flex', width:`${pct}%`, backgroundColor:C.bar, borderRadius:9 } }),
    ),
    h('div', { style: { width:55, fontSize:14, fontWeight:700, color:C.text, textAlign:'right' } }, c.total.toLocaleString()),
  )
}

const FunnelStage = (label, value, pctLabel) => h('div', { style: { display:'flex', flexDirection:'column', alignItems:'center', gap:2 } },
  h('div', { style: { fontSize:30, fontWeight:800, color:C.text, letterSpacing:-1 } }, String(value)),
  h('div', { style: { fontSize:13, color:C.muted } }, label),
  pctLabel ? h('div', { style: { marginTop:2, padding:'1px 8px', backgroundColor:C.track, borderRadius:999, fontSize:11, fontWeight:700, color:C.accent } }, pctLabel) : null,
)

const SectionTitle = (emoji, title) => h('div', { style: { display:'flex', alignItems:'center', gap:8, fontSize:18, fontWeight:700, color:C.text, marginBottom:10 } }, h('span', {}, emoji), h('span', {}, title))

const Card = (children, extra = {}) => h('div', { style: { display:'flex', flexDirection:'column', backgroundColor:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:24, ...extra } }, ...children.filter(Boolean))

const d = reportData
const achieved = d.targets.filter(t => t.achieved)
const missed = d.targets.filter(t => !t.achieved)
const maxClient = d.clients.length > 0 ? Math.max(...d.clients.map(c => c.total)) : 1
const topClients = d.clients.slice(0, 5)
const s2v = d.sessionFunnel.searchSessions > 0 ? Math.round((d.sessionFunnel.viewSessions / d.sessionFunnel.searchSessions) * 100) : 0
const v2d = d.sessionFunnel.viewSessions > 0 ? Math.round((d.sessionFunnel.deploySessions / d.sessionFunnel.viewSessions) * 100) : 0
const d2a = d.sessionFunnel.deploySessions > 0 ? Math.round((d.sessionFunnel.applySessions / d.sessionFunnel.deploySessions) * 100) : 0

const tree = h('div', { style: { display:'flex', flexDirection:'column', width:'100%', height:'100%', padding:36, backgroundColor:C.bg, fontFamily:'Pretendard', gap:16 } },
  // Header
  h('div', { style: { display:'flex', alignItems:'center', justifyContent:'space-between' } },
    h('div', { style: { display:'flex', flexDirection:'column', gap:2 } },
      h('div', { style: { fontSize:28, fontWeight:700, color:C.text, letterSpacing:-0.5 } }, 'GPTers AI Toolkit 주간 리포트'),
      h('div', { style: { fontSize:14, color:C.muted } }, `최근 ${d.period.days}일 · ${new Date(d.period.generatedAt).toLocaleDateString('ko-KR')}`),
    ),
    h('div', { style: { display:'flex', alignItems:'center', padding:'6px 14px', backgroundColor: d.achievedCount >= d.totalTargets * 0.7 ? C.achieved : C.missed, border:`1px solid ${d.achievedCount >= d.totalTargets * 0.7 ? C.achievedBorder : C.missedBorder}`, borderRadius:999, fontSize:14, fontWeight:700, color: d.achievedCount >= d.totalTargets * 0.7 ? '#166534' : '#991b1b' } }, `${d.achievedCount}/${d.totalTargets} 목표 달성`),
  ),
  // KPI
  h('div', { style: { display:'flex', gap:12 } },
    KpiCard('총 요청', d.summary.effectiveLogs.toLocaleString() + '건'),
    KpiCard('고유 사용자', d.summary.uniqueUsers + '명'),
    KpiCard('평균 응답', d.summary.avgResponseTime + 'ms', `검색 P50: ${d.summary.p50SearchTime}ms`),
    KpiCard('성공률', d.summary.effectiveLogs > 0 ? (((d.summary.effectiveLogs - d.summary.errorCount) / d.summary.effectiveLogs) * 100).toFixed(1) + '%' : '-'),
  ),
  // Targets 2-column
  h('div', { style: { display:'flex', gap:12 } },
    Card([ SectionTitle('✅', `달성 (${achieved.length})`), h('div', { style: { display:'flex', flexDirection:'column', gap:6 } }, ...achieved.map(t => TargetRow(t))) ], { flex:1 }),
    Card([ SectionTitle('⚠️', `미달 (${missed.length})`), h('div', { style: { display:'flex', flexDirection:'column', gap:6 } }, ...missed.map(t => TargetRow(t))) ], { flex:1 }),
  ),
  // Funnel + Clients
  h('div', { style: { display:'flex', gap:12 } },
    Card([ SectionTitle('📈', '세션 퍼널'), h('div', { style: { display:'flex', alignItems:'center', justifyContent:'space-around', paddingTop:6 } },
      FunnelStage('검색', d.sessionFunnel.searchSessions),
      h('div', { style: { fontSize:22, color:C.subtle, fontWeight:700, marginTop:-8 } }, '→'),
      FunnelStage('조회', d.sessionFunnel.viewSessions, `${s2v}%`),
      h('div', { style: { fontSize:22, color:C.subtle, fontWeight:700, marginTop:-8 } }, '→'),
      FunnelStage('배포', d.sessionFunnel.deploySessions, `${v2d}%`),
      h('div', { style: { fontSize:22, color:C.subtle, fontWeight:700, marginTop:-8 } }, '→'),
      FunnelStage('사용', d.sessionFunnel.applySessions, `${d2a}%`),
    ) ], { flex:1.3 }),
    Card([ SectionTitle('👥', '클라이언트 TOP 5'), h('div', { style: { display:'flex', flexDirection:'column', gap:8 } }, ...topClients.map(c => ClientRow(c, maxClient))) ], { flex:1.2 }),
  ),
  // Footer
  h('div', { style: { display:'flex', justifyContent:'flex-end', fontSize:11, color:C.subtle, marginTop:2 } }, 'gpters-ai-toolkit · auto-generated'),
)

const svg = await satori(tree, {
  width: 1080,
  fonts: [
    { name: 'Pretendard', data: fontRegular, weight: 400, style: 'normal' },
    { name: 'Pretendard', data: fontBold, weight: 700, style: 'normal' },
  ],
})

const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1080 } })
const png = resvg.render().asPng()
const pngPath = resolve(outDir, 'weekly-report.png')
writeFileSync(pngPath, png)
console.log(`🖼️  PNG: ${pngPath} (${(png.length / 1024).toFixed(1)} KB)`)
console.log(`\n✅ 완료`)
