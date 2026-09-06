/**
 * 스킬 이벤트 자유 텍스트의 보관 기한을 적용하는 Vercel Cron 엔드포인트.
 *
 * 매일 03:20 UTC에 돈다 (세션 정리 03:00 바로 뒤). 90일이 지난 검색어 원문과 사유를 지우되
 * 자동 스킵을 가리키는 `auto:` 표식은 남긴다 — 그 표식이 지표 판정에 쓰인다.
 *
 * `?dryRun=1`을 붙이면 대상 건수만 세고 아무것도 바꾸지 않는다. 처음 돌리기 전에 영향 범위를
 * 확인하는 용도다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { redactOldSkillText } from '@/lib/analytics'

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
    const dryRun = request.nextUrl.searchParams.get('dryRun') === '1'
    const result = await redactOldSkillText({ dryRun })
    return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
