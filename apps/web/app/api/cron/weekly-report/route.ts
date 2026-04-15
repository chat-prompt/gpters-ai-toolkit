/**
 * Vercel Cron endpoint for weekly Slack report
 *
 * Runs every Monday at 00:00 UTC (09:00 KST).
 * Generates analytics data, renders an image, and sends to Slack.
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateWeeklyReport, type WeeklyReportData } from '@/lib/analytics'
import { renderWeeklyImage } from '@gpters/lib/reports/render-weekly-image'
import { put } from '@vercel/blob'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const days = Number(request.nextUrl.searchParams.get('days')) || 7
    const data = await generateWeeklyReport(days)
    const slackUrl = process.env.SLACK_WEEKLY_REPORT_WEBHOOK_URL

    let imageUrl: string | null = null
    let imageFailed = false

    // 이미지 렌더링 시도 → 실패 시 텍스트 폴백
    try {
      const png = await renderWeeklyImage(data)
      const dateStr = new Date().toISOString().split('T')[0]
      const label = days >= 28 ? 'monthly' : 'weekly'
      const blob = await put(`${label}-reports/${dateStr}.png`, png, {
        access: 'public',
        contentType: 'image/png',
      })
      imageUrl = blob.url
    } catch (imgError) {
      console.error('[weekly-report] Image render failed, falling back to text:', imgError)
      imageFailed = true
    }

    if (slackUrl) {
      if (imageUrl) {
        await sendSlackWithImage(slackUrl, data, imageUrl)
      } else {
        await sendSlackText(slackUrl, data)
      }
    }

    return NextResponse.json({
      success: true,
      achievedCount: data.achievedCount,
      totalTargets: data.totalTargets,
      uniqueUsers: data.summary.uniqueUsers,
      imageUrl,
      imageFailed,
      slackSent: !!slackUrl,
      timestamp: data.period.generatedAt,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[weekly-report] Failed:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/** 이미지 첨부 Slack 발송 */
async function sendSlackWithImage(url: string, data: WeeklyReportData, imageUrl: string) {
  const { achievedCount, totalTargets, summary: s } = data
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📊 GPTers ${data.period.days >= 28 ? '월간' : '주간'} 리포트 · ${achievedCount}/${totalTargets} 달성` },
    },
    {
      type: 'image',
      image_url: imageUrl,
      alt_text: `주간 리포트 - ${achievedCount}/${totalTargets} 목표 달성, ${s.uniqueUsers}명 사용`,
    },
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `${s.effectiveLogs.toLocaleString()}건 요청 · ${s.uniqueUsers}명 사용자 · 응답 ${s.avgResponseTime}ms · 검색 P50 ${s.p50SearchTime}ms`,
      }],
    },
  ]

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  })
  if (!res.ok) console.error('[weekly-report] Slack error:', res.status, await res.text())
}

/** 텍스트 폴백 Slack 발송 */
async function sendSlackText(url: string, data: WeeklyReportData) {
  const { summary: s, targets, achievedCount, totalTargets, sessionFunnel: sf } = data

  const targetRows = targets
    .map((t) => `${t.achieved ? '✅' : '⚠️'} ${t.name}: *${t.actual}${t.unit}* (목표 ${t.target}${t.unit})`)
    .join('\n')

  const s2vPct = sf.searchSessions > 0 ? Math.round((sf.viewSessions / sf.searchSessions) * 100) : 0
  const v2dPct = sf.viewSessions > 0 ? Math.round((sf.deploySessions / sf.viewSessions) * 100) : 0

  const clientTop = data.clients.slice(0, 5)
    .map((c) => `${c.client} *${c.total.toLocaleString()}*`)
    .join(' · ')

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `📊 GPTers ${data.period.days >= 28 ? '월간' : '주간'} 리포트 · ${achievedCount}/${totalTargets} 달성` } },
    { type: 'section', fields: [
      { type: 'mrkdwn', text: `*기간*\n최근 ${data.period.days}일` },
      { type: 'mrkdwn', text: `*총 요청*\n*${s.effectiveLogs.toLocaleString()}건*` },
      { type: 'mrkdwn', text: `*고유 사용자*\n*${s.uniqueUsers}명*` },
    ] },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: `*🎯 목표 달성 (${achievedCount}/${totalTargets})*\n${targetRows}` } },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: `*📊 퍼널*\n검색 *${sf.searchSessions}* → 조회 *${sf.viewSessions}* (${s2vPct}%) → 배포 *${sf.deploySessions}* (${v2dPct}%)` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `클라이언트: ${clientTop}` }] },
  ]

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  })
  if (!res.ok) console.error('[weekly-report] Slack error:', res.status, await res.text())
}
