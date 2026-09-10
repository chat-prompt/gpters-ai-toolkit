/**
 * 지난 주 많이 쓴 스킬을 알리는 Vercel Cron 엔드포인트 (DEV-4280).
 *
 * 월요일 01:00 UTC (10:00 KST)에 돈다 — 주간 리포트(00:00 UTC)보다 뒤, 사람들이 한 주를
 * 시작하는 시각이다.
 *
 * AITK 인기·신규 스킬은 본문, 업데이트·설명 요청은 스레드로 보낸다.
 * 인기·신규가 모두 비어 있으면 아무것도 보내지 않는다.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  buildPopularSkillsMessages,
  collectPopularSkills,
  formatCreatedLines,
  formatDigestLines,
  formatMissingDescriptionLines,
  formatUpdatedLines,
  notifySlackPopularSkills,
} from '@gpters/lib/notifications'
import { runCronJob } from '@gpters/lib/ops'

export const dynamic = 'force-dynamic'

/** 스킬 상세 링크의 앞부분. 없으면 운영 주소로 떨어진다 */
const FALLBACK_BASE_URL = 'https://ai-toolkit.gpters.org'

/**
 * 크론 실행 진입점
 *
 * `CRON_SECRET`이 설정돼 있으면 Bearer 토큰을 확인한다.
 * `?days=`로 집계 창을, `?quiet=1`로 본문·답글 미리보기를 볼 수 있다.
 * quiet는 크론 기록과 실패 알림도 만들지 않는다.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const days = Number(request.nextUrl.searchParams.get('days')) || 7
  const quiet = request.nextUrl.searchParams.get('quiet') === '1'

  const collect = async () => {
    const digest = await collectPopularSkills(days)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? FALLBACK_BASE_URL
    const lines = formatDigestLines(digest, baseUrl)
    const createdLines = formatCreatedLines(digest, baseUrl)
    const updatedLines = formatUpdatedLines(digest, baseUrl)
    const missingLines = formatMissingDescriptionLines(digest, baseUrl)

    const params = {
      days,
      totalApplies: digest.totalApplies,
      distinctSkills: digest.distinctSkills,
      lines,
      createdLines,
      updatedLines,
      missingLines,
    }
    const delivery = quiet ? null : await notifySlackPopularSkills(params)

    return {
      // 조용한 주는 알림을 건너뛰므로, 감시는 이 값이 아니라 실행 여부만 본다
      stats: {
        days,
        totalApplies: digest.totalApplies,
        distinctSkills: digest.distinctSkills,
        created: digest.created.length,
        updated: digest.updated.length,
        missingDescriptions: digest.missingDescriptionTotal,
        ...(delivery ? { sent: Number(delivery.sent), repliesSent: delivery.repliesSent } : {}),
      },
      body: {
        top: digest.top,
        firstTimers: digest.firstTimers,
        created: digest.created,
        updated: digest.updated,
        missingDescriptions: digest.missingDescriptions,
        ...(quiet ? { preview: buildPopularSkillsMessages(params) } : { delivery }),
      },
    }
  }

  // 미리보기는 조회만 한다. runCronJob을 통과하면 실패 시 Slack 알림과 DB 쓰기가 발생한다.
  if (quiet) {
    try {
      const result = await collect()
      return NextResponse.json({ success: true, quiet: true, ...result.stats, ...result.body })
    } catch {
      return NextResponse.json(
        { success: false, quiet: true, error: 'Failed to preview skill digest' },
        { status: 500 }
      )
    }
  }
  const result = await runCronJob('popular-skills', collect)

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
