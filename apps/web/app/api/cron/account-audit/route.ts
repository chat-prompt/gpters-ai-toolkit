/**
 * 계정 점검 Vercel Cron 엔드포인트.
 *
 * 매일 05:30 UTC에 돈다. 휴면 계정·반쪽 정지·이름 중복을 찾아 Slack에 목록을 낸다.
 * 퇴사 여부는 앱이 판정할 수 없다 — 이 잡은 **물어볼 목록**을 만드는 것이고, 조직 멤버 제거는
 * 사람이 admin 화면에서 한다.
 *
 * 문제가 없으면 Slack에 아무것도 보내지 않는다 (`cron-health`와 같은 이유 — 매일 "이상 없음"은
 * 채널을 죽인다).
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkAccountHygiene, DEFAULT_DORMANT_DAYS, runCronJob } from '@gpters/lib/ops'
import { notifySlackAccountAudit } from '@gpters/lib/notifications'

export const dynamic = 'force-dynamic'

/** 허용 휴면 기준(일). 너무 짧으면 매일 시끄럽고, 너무 길면 의미가 없다 */
const MIN_DORMANT_DAYS = 30
const MAX_DORMANT_DAYS = 365

/**
 * 크론 실행 진입점
 *
 * `CRON_SECRET`이 설정돼 있으면 Bearer 토큰을 확인한다.
 * `?quiet=1`이면 판정만 하고 Slack으로 보내지 않는다 — 사람이 확인할 때 쓴다.
 * `?days=N`으로 휴면 기준을 바꿀 수 있다 (30~365).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const quiet = request.nextUrl.searchParams.get('quiet') === '1'
  const rawDays = Number(request.nextUrl.searchParams.get('days'))
  const dormantDays = Number.isInteger(rawDays) && rawDays >= MIN_DORMANT_DAYS && rawDays <= MAX_DORMANT_DAYS
    ? rawDays
    : DEFAULT_DORMANT_DAYS

  const result = await runCronJob('account-audit', async () => {
    const report = await checkAccountHygiene({ dormantDays })
    if (!quiet) await notifySlackAccountAudit(report)
    return {
      stats: {
        checked: report.checked,
        dormant: report.dormant.length,
        inconsistent: report.inconsistentSuspended.length,
        duplicates: report.duplicateNames.length,
      },
      // 인터페이스는 인덱스 시그니처가 없어 Record<string, unknown>에 못 들어간다 — 풀어서 넘긴다
      body: { ...report },
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
