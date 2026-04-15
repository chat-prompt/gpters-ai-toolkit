/**
 * 주간 리포트 이미지 렌더러
 *
 * satori로 SVG 생성 후 resvg-js로 PNG 변환.
 * WeeklyReportData를 입력받아 PNG Buffer를 반환.
 */

import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WeeklyReportData, TargetMetric, ClientBreakdown } from '../analytics/weekly-report'

// ─── 폰트 ─────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const ASSETS = resolve(__dirname, 'assets')

let _fontRegular: Buffer | null = null
let _fontBold: Buffer | null = null

function loadFonts() {
  if (!_fontRegular) _fontRegular = readFileSync(resolve(ASSETS, 'Pretendard-Regular.ttf'))
  if (!_fontBold) _fontBold = readFileSync(resolve(ASSETS, 'Pretendard-Bold.ttf'))
  return { regular: _fontRegular, bold: _fontBold }
}

// ─── 색상 ─────────────────────────────────────────────────

const C = {
  bg: '#f7f8fa',
  card: '#ffffff',
  border: '#e5e7eb',
  text: '#0f172a',
  muted: '#64748b',
  subtle: '#94a3b8',
  accent: '#3b82f6',
  up: '#10b981',
  down: '#ef4444',
  track: '#eef2ff',
  bar: '#6366f1',
  achieved: '#dcfce7',
  achievedBorder: '#86efac',
  missed: '#fef2f2',
  missedBorder: '#fca5a5',
}

// ─── 헬퍼 ─────────────────────────────────────────────────

type SatoriNode = {
  type: string
  props: Record<string, unknown> & { children?: (SatoriNode | string)[] }
}

function h(type: string, props: Record<string, unknown> = {}, ...children: (SatoriNode | string | false | null | undefined)[]): SatoriNode {
  const flat = children.flat().filter((c): c is SatoriNode | string => c !== null && c !== undefined && c !== false)
  const style = { ...(props.style as Record<string, unknown> || {}) }
  if ((type === 'div' || type === 'span') && !style.display) {
    style.display = 'flex'
  }
  return { type, props: { ...props, style, children: flat } }
}

// ─── 컴포넌트 ─────────────────────────────────────────────

function KpiCard(label: string, value: string, sub?: string) {
  return h('div', {
    style: {
      display: 'flex', flexDirection: 'column', flex: 1,
      backgroundColor: C.card, border: `1px solid ${C.border}`,
      borderRadius: 14, padding: '16px 20px', gap: 4,
    },
  },
    h('div', { style: { fontSize: 14, color: C.muted, fontWeight: 500 } }, label),
    h('div', { style: { fontSize: 32, fontWeight: 700, color: C.text, letterSpacing: -0.5 } }, value),
    sub ? h('div', { style: { fontSize: 13, color: C.subtle } }, sub) : null,
  )
}

function TargetRow(m: TargetMetric) {
  const icon = m.achieved ? '\u2705' : '\u26A0\uFE0F'
  const bg = m.achieved ? C.achieved : C.missed
  const borderColor = m.achieved ? C.achievedBorder : C.missedBorder
  return h('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: 10,
      backgroundColor: bg, border: `1px solid ${borderColor}`,
      borderRadius: 10, padding: '8px 14px', height: 38,
    },
  },
    h('span', { style: { fontSize: 15, width: 24 } }, icon),
    h('span', { style: { fontSize: 14, fontWeight: 500, color: C.text, flex: 1 } }, m.name),
    h('span', { style: { fontSize: 16, fontWeight: 700, color: C.text } }, `${m.actual}${m.unit}`),
    h('span', { style: { fontSize: 13, color: C.muted, marginLeft: 6 } }, `/ ${m.target}${m.unit}`),
  )
}

function ClientRow(c: ClientBreakdown, max: number) {
  const pct = Math.max(Math.round((c.total / max) * 100), 3)
  return h('div', {
    style: { display: 'flex', alignItems: 'center', gap: 10, height: 28 },
  },
    h('div', { style: { width: 100, fontSize: 14, fontWeight: 500, color: C.text } }, c.client),
    h('div', {
      style: { display: 'flex', flex: 1, height: 18, backgroundColor: C.track, borderRadius: 9, overflow: 'hidden' },
    },
      h('div', { style: { display: 'flex', width: `${pct}%`, backgroundColor: C.bar, borderRadius: 9 } }),
    ),
    h('div', { style: { width: 55, fontSize: 14, fontWeight: 700, color: C.text, textAlign: 'right' } }, c.total.toLocaleString()),
  )
}

function FunnelStage(label: string, value: number, pctLabel?: string) {
  return h('div', {
    style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  },
    h('div', { style: { fontSize: 30, fontWeight: 800, color: C.text, letterSpacing: -1 } }, String(value)),
    h('div', { style: { fontSize: 13, color: C.muted } }, label),
    pctLabel
      ? h('div', {
        style: {
          marginTop: 2, padding: '1px 8px',
          backgroundColor: C.track, borderRadius: 999,
          fontSize: 11, fontWeight: 700, color: C.accent,
        },
      }, pctLabel)
      : null,
  )
}

function FunnelArrow() {
  return h('div', { style: { fontSize: 22, color: C.subtle, fontWeight: 700, marginTop: -8 } }, '\u2192')
}

function SectionTitle(emoji: string, title: string) {
  return h('div', {
    style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 10 },
  }, h('span', {}, emoji), h('span', {}, title))
}

function Card(children: (SatoriNode | null)[], extra: Record<string, unknown> = {}) {
  return h('div', {
    style: {
      display: 'flex', flexDirection: 'column',
      backgroundColor: C.card, border: `1px solid ${C.border}`,
      borderRadius: 16, padding: 24, ...extra,
    },
  }, ...children.filter(Boolean) as SatoriNode[])
}

// ─── 메인 렌더 ────────────────────────────────────────────

export async function renderWeeklyImage(data: WeeklyReportData): Promise<Buffer> {
  const { summary: s, targets, achievedCount, totalTargets, sessionFunnel: sf, clients } = data

  const maxClient = clients.length > 0 ? Math.max(...clients.map((c) => c.total)) : 1
  const topClients = clients.slice(0, 5)

  const s2vPct = sf.searchSessions > 0 ? Math.round((sf.viewSessions / sf.searchSessions) * 100) : 0
  const v2dPct = sf.viewSessions > 0 ? Math.round((sf.deploySessions / sf.viewSessions) * 100) : 0
  const d2aPct = sf.deploySessions > 0 ? Math.round((sf.applySessions / sf.deploySessions) * 100) : 0

  const achieved = targets.filter((t) => t.achieved)
  const missed = targets.filter((t) => !t.achieved)

  const tree = h('div', {
    style: {
      display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
      padding: 36, backgroundColor: C.bg, fontFamily: 'Pretendard', gap: 16,
    },
  },
    // Header
    h('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
        h('div', { style: { fontSize: 28, fontWeight: 700, color: C.text, letterSpacing: -0.5 } }, `GPTers AI Toolkit ${data.period.days >= 28 ? '\uC6D4\uAC04' : '\uC8FC\uAC04'} \uB9AC\uD3EC\uD2B8`),
        h('div', { style: { fontSize: 14, color: C.muted } }, `\uCD5C\uADFC ${data.period.days}\uC77C \xB7 ${new Date(data.period.generatedAt).toLocaleDateString('ko-KR')}`),
      ),
      h('div', {
        style: {
          display: 'flex', alignItems: 'center', padding: '6px 14px',
          backgroundColor: achievedCount >= totalTargets * 0.7 ? C.achieved : C.missed,
          border: `1px solid ${achievedCount >= totalTargets * 0.7 ? C.achievedBorder : C.missedBorder}`,
          borderRadius: 999, fontSize: 14, fontWeight: 700,
          color: achievedCount >= totalTargets * 0.7 ? '#166534' : '#991b1b',
        },
      }, `${achievedCount}/${totalTargets} \uBAA9\uD45C \uB2EC\uC131`),
    ),

    // KPI row
    h('div', { style: { display: 'flex', gap: 12 } },
      KpiCard('\uCD1D \uC694\uCCAD', s.effectiveLogs.toLocaleString() + '\uAC74'),
      KpiCard('\uACE0\uC720 \uC0AC\uC6A9\uC790', s.uniqueUsers + '\uBA85'),
      KpiCard('\uD3C9\uADE0 \uC751\uB2F5', s.avgResponseTime + 'ms', `\uAC80\uC0C9 P50: ${s.p50SearchTime}ms`),
      KpiCard('\uC131\uACF5\uB960', s.effectiveLogs > 0 ? (((s.effectiveLogs - s.errorCount) / s.effectiveLogs) * 100).toFixed(1) + '%' : '-'),
    ),

    // Targets: achieved + missed in 2 columns
    h('div', { style: { display: 'flex', gap: 12 } },
      Card([
        SectionTitle('\u2705', `\uB2EC\uC131 (${achieved.length})`),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          ...achieved.map((t) => TargetRow(t)),
        ),
      ], { flex: 1 }),
      Card([
        SectionTitle('\u26A0\uFE0F', `\uBBF8\uB2EC (${missed.length})`),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          ...missed.map((t) => TargetRow(t)),
        ),
      ], { flex: 1 }),
    ),

    // Funnel + Clients
    h('div', { style: { display: 'flex', gap: 12 } },
      Card([
        SectionTitle('\uD83D\uDCC8', '\uC0AC\uC6A9\uC790 \uD37C\uB110'),
        h('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-around', paddingTop: 6 },
        },
          FunnelStage('\uAC80\uC0C9', sf.searchSessions),
          FunnelArrow(),
          FunnelStage('\uC870\uD68C', sf.viewSessions, `${s2vPct}%`),
          FunnelArrow(),
          FunnelStage('\uBC30\uD3EC', sf.deploySessions, `${v2dPct}%`),
          FunnelArrow(),
          FunnelStage('\uC0AC\uC6A9', sf.applySessions, `${d2aPct}%`),
        ),
      ], { flex: 1 }),
      Card([
        SectionTitle('\uD83D\uDC65', '\uD074\uB77C\uC774\uC5B8\uD2B8 TOP 5'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          ...topClients.map((c) => ClientRow(c, maxClient)),
        ),
      ], { flex: 1.2 }),
    ),

    // Footer
    h('div', {
      style: { display: 'flex', justifyContent: 'flex-end', fontSize: 11, color: C.subtle, marginTop: 2 },
    }, 'gpters-ai-toolkit \xB7 auto-generated'),
  )

  const fonts = loadFonts()
  const svg = await satori(tree as unknown as React.ReactNode, {
    width: 1080,
    fonts: [
      { name: 'Pretendard', data: fonts.regular, weight: 400, style: 'normal' as const },
      { name: 'Pretendard', data: fonts.bold, weight: 700, style: 'normal' as const },
    ],
  })

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1080 } })
  return Buffer.from(resvg.render().asPng())
}
