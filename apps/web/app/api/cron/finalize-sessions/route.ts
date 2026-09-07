/**
 * 오래 멈춘 MCP 세션을 마감하고 보관 기한이 지난 세션을 지우는 Vercel Cron 엔드포인트.
 *
 * 매일 03:00 UTC에 돈다. 30분 무활동 세션을 마감하면서 지속 시간과 전환 플래그를 확정하고,
 * 90일 지난 세션 행을 지운다.
 *
 * 세션이 지워져도 `skill_events`는 남는다 (AX 0037에서 외래키를 `set null`로 바꿨다).
 */

import { NextRequest, NextResponse } from 'next/server'
import { cleanupOldSessions, finalizeStaleSessions } from '@/lib/analytics'
import { runCronJob } from '@gpters/lib/ops'

export const dynamic = 'force-dynamic'

/**
 * 크론 실행 진입점
 *
 * `CRON_SECRET`이 설정돼 있으면 Bearer 토큰을 확인한다.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runCronJob('finalize-sessions', async () => {
    const [finalized, deleted] = await Promise.all([
      finalizeStaleSessions(30),
      cleanupOldSessions(90),
    ])
    return { stats: { finalized, deleted } }
  })

  return NextResponse.json(
    { success: result.ok, ...result.stats, ...(result.error ? { error: result.error } : {}), timestamp: new Date().toISOString() },
    { status: result.ok ? 200 : 500 }
  )
}
