/**
 * 카탈로그 위생 스냅숏을 찍는 Vercel Cron 엔드포인트.
 *
 * 매일 04:20 UTC에 돈다. 중복 계산이 카탈로그 전수 비교라 다른 크론과 시간을 벌려 둔다.
 * 같은 날 다시 돌면 덮어쓰므로 재시도가 안전하다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { captureCatalogHealth } from '@/lib/features/ax'
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

  const result = await runCronJob('catalog-health-snapshot', async () => {
    const snapshot = await captureCatalogHealth()
    return {
      // totalItems가 0이면 카탈로그를 못 읽은 것이다 — 감시가 이 값을 본다
      stats: {
        totalItems: snapshot.totalItems,
        duplicateGroups: snapshot.duplicateGroups,
        neverLoaded: snapshot.neverLoaded,
      },
      body: { snapshotDate: snapshot.snapshotDate },
    }
  })

  return NextResponse.json(
    { success: result.ok, ...result.stats, ...result.body, ...(result.error ? { error: result.error } : {}), timestamp: new Date().toISOString() },
    { status: result.ok ? 200 : 500 }
  )
}
