/**
 * 크론 감시 Vercel Cron 엔드포인트.
 *
 * 매일 05:00 UTC에 돈다 — 감시 대상 중 가장 늦은 일간 잡(04:20 스냅숏)보다 뒤다.
 *
 * 예외로 실패한 잡은 `runCronJob`이 그 자리에서 알린다. 여기서 잡는 것은 **알림조차 못 보내는
 * 실패**다 — 라우트가 404라 아예 안 불렸거나, 성공하는데 산출이 계속 0인 경우.
 *
 * 문제가 없으면 Slack에 아무것도 보내지 않는다. 매일 "이상 없음"을 보내면 그 채널을 아무도
 * 안 읽게 되고, 그러면 진짜 알림도 같이 묻힌다.
 *
 * 자기 자신은 감시하지 못한다. 이 잡이 죽으면 `cron_runs`에 기록이 끊기므로 대시보드에서 보인다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkCronHealth, cleanupCronRuns, runCronJob } from '@gpters/lib/ops'
import { notifySlackCronHealth } from '@gpters/lib/notifications'

export const dynamic = 'force-dynamic'

/**
 * 크론 실행 진입점
 *
 * `CRON_SECRET`이 설정돼 있으면 Bearer 토큰을 확인한다.
 * `?quiet=1`을 붙이면 판정만 하고 Slack으로 보내지 않는다 — 사람이 확인할 때 쓴다.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const quiet = request.nextUrl.searchParams.get('quiet') === '1'
  const result = await runCronJob('cron-health', async () => {
    const report = await checkCronHealth()
    if (!quiet) await notifySlackCronHealth({ checked: report.checked, issues: report.issues })
    // 감시가 실행 기록을 쌓으므로 정리도 같이 맡는다
    const removed = await cleanupCronRuns()
    return {
      stats: { checked: report.checked, issues: report.issues.length, removed },
      body: { issues: report.issues, checkedAt: report.checkedAt },
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
