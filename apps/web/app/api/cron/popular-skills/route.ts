/**
 * 지난 주 많이 쓴 스킬을 알리는 Vercel Cron 엔드포인트 (DEV-4280).
 *
 * 월요일 01:00 UTC (10:00 KST)에 돈다 — 주간 리포트(00:00 UTC)보다 뒤, 사람들이 한 주를
 * 시작하는 시각이다.
 *
 * 신규 배포 알림은 배포 시점에 이미 나가므로 여기서는 **실제로 쓰인 것**만 다룬다.
 * 적용이 한 건도 없으면 아무것도 보내지 않는다.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  collectPopularSkills,
  formatDigestLines,
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
 * `?days=`로 집계 창을, `?quiet=1`로 발송 없이 집계만 볼 수 있다.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const days = Number(request.nextUrl.searchParams.get('days')) || 7
  const quiet = request.nextUrl.searchParams.get('quiet') === '1'

  const result = await runCronJob('popular-skills', async () => {
    const digest = await collectPopularSkills(days)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? FALLBACK_BASE_URL
    const lines = formatDigestLines(digest, baseUrl)

    if (!quiet) {
      await notifySlackPopularSkills({
        days,
        totalApplies: digest.totalApplies,
        distinctSkills: digest.distinctSkills,
        lines,
      })
    }

    return {
      // totalApplies가 0인 주는 알림을 건너뛰므로, 감시는 이 값이 아니라 실행 여부만 본다
      stats: { days, totalApplies: digest.totalApplies, distinctSkills: digest.distinctSkills },
      body: { top: digest.top, firstTimers: digest.firstTimers },
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
