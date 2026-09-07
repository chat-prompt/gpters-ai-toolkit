/**
 * 카탈로그 위생 스냅숏을 찍는 Vercel Cron 엔드포인트.
 *
 * 매일 04:20 UTC에 돈다. 중복 계산이 카탈로그 전수 비교라 다른 크론과 시간을 벌려 둔다.
 * 같은 날 다시 돌면 덮어쓰므로 재시도가 안전하다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { captureCatalogHealth } from '@/lib/features/ax'

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

  try {
    const snapshot = await captureCatalogHealth()
    return NextResponse.json({ success: true, ...snapshot, timestamp: new Date().toISOString() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
