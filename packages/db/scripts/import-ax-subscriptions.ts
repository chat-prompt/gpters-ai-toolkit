/**
 * AX 구독 데이터 import 스크립트 (클라이언트 › 구독 현황 패널의 데이터 소스)
 *
 * 정본은 「지니파이(주) 결제 내역」 시트의 `구독 로스터` 탭이다(EDU-10958, 2026-09-21).
 * `ax_subscriptions` 테이블은 대시보드가 읽는 사본이다 — 탭을 CSV 로 내려받아 이 스크립트로 맞춘다.
 * (2026-08-06 처음 만들 때는 "020 비용 처리" 결제내역 트래커 형식이었다. 로스터로 정본이 바뀌어 형식을 옮겼다)
 *
 * 사용:
 *   pnpm --filter @gpters/db exec tsx scripts/import-ax-subscriptions.ts <csv경로> [--dry-run | --plan]
 *
 * CSV: 로스터 탭 그대로. 헤더 이름으로 `name, account, plan, price_usd, renewal_day, payer` 를 찾는다.
 *   `slack_id`, `card_last4` 는 읽지 않는다. 금액은 USD, 주기는 월간으로 넣는다.
 *
 * 갱신 방식: 전체 동기화. (vendor, plan, owner_name, renewal_day) 로 기존 행을 찾아 갱신·추가하고,
 * **로스터에 없는 기존 행은 지운다** — 로스터가 해지·퇴사 구독의 행을 지우는 방식이라서다.
 *
 *   --dry-run: CSV 파싱 결과만 출력한다 (DB 접속 없음)
 *   --plan:    DB 를 읽어 갱신·추가·삭제 예정을 출력하고 쓰지 않는다. 실제 반영 전에 먼저 돌린다
 */

import { readFileSync } from 'fs'
import { eq, inArray } from 'drizzle-orm'
import { parseRosterCsv, planRosterSync, subscriptionValues, type RosterSubscription } from './lib/ax-subscription-roster'

/**
 * `DATABASE_URL`이 셸에 없으면 레포 루트 `.env`에서 읽어 온다
 *
 * 이 패키지는 dotenv에 의존하지 않는다. 가끔 손으로 돌리는 스크립트라
 * 접속 문자열을 매번 앞에 붙이게 만들지 않으려고 최소한만 직접 파싱한다.
 */
function loadDatabaseUrlFromEnvFile(): void {
  if (process.env.DATABASE_URL) return

  try {
    const line = readFileSync(new URL('../../../.env', import.meta.url), 'utf-8')
      .split('\n')
      .find((l) => l.startsWith('DATABASE_URL='))
    if (!line) return
    process.env.DATABASE_URL = line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '')
  } catch {
    // .env가 없으면 그대로 둔다 — 아래에서 원래의 접속 오류가 난다
  }
}

const DRY_RUN = process.argv.includes('--dry-run')
const PLAN_ONLY = process.argv.includes('--plan')
const csvPath = process.argv.slice(2).find((arg) => !arg.startsWith('--'))

if (!csvPath) {
  console.error('사용법: tsx scripts/import-ax-subscriptions.ts <csv경로> [--dry-run | --plan]')
  process.exit(1)
}

const describe = (row: Pick<RosterSubscription, 'vendor' | 'plan' | 'renewalDay'> & { ownerName: string | null }) =>
  `${row.vendor} / ${row.plan} / ${row.ownerName ?? '(공용)'} / ${row.renewalDay ?? '-'}일`

async function main() {
  const { rows, errors } = parseRosterCsv(readFileSync(csvPath!, 'utf-8'))
  for (const error of errors) console.error(`스킵 ${error}`)

  if (rows.length === 0) {
    // 전체 동기화라 빈 입력을 반영하면 구독이 전부 지워진다 — 잘못 내보낸 파일로 보고 멈춘다
    console.error('읽힌 구독이 0건이라 중단합니다. CSV 가 구독 로스터 탭인지 확인하세요.')
    process.exit(1)
  }

  if (DRY_RUN) {
    console.log(`[dry-run] DB 에 접속하지 않습니다. 로스터에서 읽은 구독 ${rows.length}건:`)
    for (const row of rows) console.log(`  - ${describe(row)} — ${row.amount} ${row.currency} (결제 ${row.payer ?? '-'})`)
    console.log(`\n읽음 ${rows.length}건 / 스킵 ${errors.length}건`)
    return
  }

  loadDatabaseUrlFromEnvFile()
  const { db, axSubscriptions } = await import('../src/index')

  const existing = await db
    .select({
      id: axSubscriptions.id,
      vendor: axSubscriptions.vendor,
      plan: axSubscriptions.plan,
      ownerName: axSubscriptions.ownerName,
      renewalDay: axSubscriptions.renewalDay,
    })
    .from(axSubscriptions)
  const plan = planRosterSync(rows, existing)

  console.log(`${PLAN_ONLY ? '[plan] 쓰지 않습니다. ' : ''}갱신 ${plan.update.length} · 추가 ${plan.insert.length} · 삭제 ${plan.remove.length} (스킵 ${errors.length})`)
  for (const row of plan.insert) console.log(`  + ${describe(row)} — ${row.amount} ${row.currency}`)
  for (const row of plan.remove) console.log(`  - ${describe(row)}`)
  if (PLAN_ONLY) return

  const now = new Date()
  const valuesOf = (row: RosterSubscription) => subscriptionValues(row, now)

  for (const { id, row } of plan.update) {
    await db.update(axSubscriptions).set(valuesOf(row)).where(eq(axSubscriptions.id, id))
  }
  if (plan.insert.length > 0) {
    await db.insert(axSubscriptions).values(plan.insert.map(valuesOf))
  }
  if (plan.remove.length > 0) {
    await db.delete(axSubscriptions).where(inArray(axSubscriptions.id, plan.remove.map((row) => row.id)))
  }

  console.log(`✅ 갱신 ${plan.update.length} · 추가 ${plan.insert.length} · 삭제 ${plan.remove.length}`)
}

main().catch((err) => {
  console.error('💥 예상치 못한 오류:', err)
  process.exit(1)
})
