/**
 * 스킬 이벤트 자유 텍스트의 보관 기한을 적용하는 Vercel Cron 엔드포인트.
 *
 * 매일 03:20 UTC에 돈다 (세션 정리 03:00 바로 뒤). 90일이 지난 검색어 원문과 사유를 지우되
 * 자동 스킵을 가리키는 `auto:` 표식은 남긴다 — 그 표식이 지표 판정에 쓰인다.
 *
 * 지우는 것은 `query`·`context` 두 칸뿐이다. 누가·언제·무슨 스킬을·어떻게 했는지는 그대로 남아
 * 지표가 바뀌지 않는다.
 *
 * `?dryRun=1`을 붙이면 대상 건수만 세고 아무것도 바꾸지 않는다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { redactOldSkillText } from '@/lib/analytics'
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

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1'
  const result = await runCronJob('redact-skill-text', async () => {
    const outcome = await redactOldSkillText({ dryRun })
    return {
      stats: { queries: outcome.queries, contexts: outcome.contexts, autoMarkers: outcome.autoMarkers },
      body: { cutoff: outcome.cutoff, dryRun: outcome.dryRun },
    }
  })

  return NextResponse.json(
    { success: result.ok, ...result.stats, ...result.body, ...(result.error ? { error: result.error } : {}), timestamp: new Date().toISOString() },
    { status: result.ok ? 200 : 500 }
  )
}
