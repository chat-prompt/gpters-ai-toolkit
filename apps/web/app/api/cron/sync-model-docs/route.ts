/**
 * AI 모델 문서를 동기화하는 Vercel Cron 엔드포인트 (EDU-6875).
 *
 * 매일 17:00 UTC (02:00 KST)에 돈다. Anthropic · Google · OpenAI 공식 페이지에서 모델 목록을
 * 가져와 `ai_model_docs`를 갱신한다.
 *
 * SDK 문서 동기화는 GitHub Actions + chub CLI가 따로 맡는다 (EDU-6880).
 */

import { NextRequest, NextResponse } from 'next/server'
import { syncModelDocs } from '@gpters/lib/mcp'
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

  const result = await runCronJob('sync-model-docs', async () => {
    const summary = await syncModelDocs()
    return {
      stats: { synced: summary.synced, failed: summary.failed, unchanged: summary.unchanged },
      body: { results: summary.results },
    }
  })

  return NextResponse.json(
    { success: result.ok, ...result.stats, ...result.body, ...(result.error ? { error: result.error } : {}), timestamp: new Date().toISOString() },
    { status: result.ok ? 200 : 500 }
  )
}
