/**
 * 주간·월간 Slack 리포트 Vercel Cron 엔드포인트.
 *
 * 월요일 00:00 UTC (09:00 KST), 그리고 매월 1일에 30일치로 한 번 더 돈다.
 *
 * ## 지금은 Slack으로 나가지 않는다 (2026-09-07 확인)
 *
 * 이 코드가 읽는 `SLACK_WEEKLY_REPORT_WEBHOOK_URL`이 운영에 없다. 운영에 있는 이름은
 * `SLACK_WEBHOOK_URL`이고 레포의 다른 Slack 코드는 전부 그쪽을 쓴다.
 *
 * **환경변수 이름만 맞추면 살아나지만 일부러 그러지 않았다.** 내용이 확정 원칙과 어긋나기 때문이다 —
 * 고정 목표치 대비 달성/미달 판정은 표본 크기를 무시한 백분율이고, `조회→배포`는 `deploy_skill`
 * 기준이라 우리가 정의한 "적용" 퍼널이 아니다. DEV-4276의 "주간 점검 동선 15분"이 정해진 뒤
 * 그 동선을 밀어주는 형태로 다시 설계한다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateWeeklyReport, type WeeklyReportData } from '@/lib/analytics'
import { renderWeeklyImage } from '@gpters/lib/reports'
import { runCronJob } from '@gpters/lib/ops'
import { put } from '@vercel/blob'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * 크론 실행 진입점
 *
 * `CRON_SECRET`이 설정돼 있으면 Bearer 토큰을 확인한다.
 * `?days=30`으로 월간 집계를 만든다.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runCronJob('weekly-report', async () => {
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

    // 웹훅 URL이 없으면 조용히 건너뛴다. 아래 stats의 slackSent가 그 사실을 기록에 남긴다 —
    // 예전 응답은 URL 유무만 보고 slackSent를 참으로 찍어서, 실제로 보냈는지 알 수 없었다.
    let slackSent = false
    if (slackUrl) {
      if (imageUrl) {
        await sendSlackWithImage(slackUrl, data, imageUrl)
      } else {
        await sendSlackText(slackUrl, data)
      }
      slackSent = true
    }

    return {
      stats: {
        days,
        achievedCount: data.achievedCount,
        totalTargets: data.totalTargets,
        uniqueUsers: data.summary.uniqueUsers,
        slackSent: slackSent ? 1 : 0,
        imageFailed: imageFailed ? 1 : 0,
      },
      body: { imageUrl, generatedAt: data.period.generatedAt },
    }
  })

  return NextResponse.json(
    {
      success: result.ok,
      ...result.stats,
      ...result.body,
      ...(result.error ? { error: result.error } : {}),
      timestamp: new Date().toISOString(),
    },
    { status: result.ok ? 200 : 500 }
  )
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
