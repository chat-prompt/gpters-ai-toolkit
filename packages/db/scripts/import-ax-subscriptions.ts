/**
 * AX 구독 데이터 import 스크립트 (팀원별 구독 패널 데이터 소스)
 *
 * "020 비용 처리" 결제내역 트래커 시트가 SSOT(단일 진실 원천)다.
 * `ax_subscriptions` 테이블은 대시보드가 읽는 사본일 뿐이다 — 시트를 CSV로
 * 내보낸 뒤 이 스크립트로 테이블을 동기화한다. 일회성 실행 스크립트.
 *
 * 사용:
 *   pnpm --filter @gpters/db exec tsx scripts/import-ax-subscriptions.ts <csv경로> [--dry-run]
 *
 * CSV 헤더(고정):
 *   vendor,plan,owner_name,renewal_day,payer,amount,currency,billing_cycle,status,note
 *
 * 갱신 방식: (vendor, plan, owner_name, renewal_day) 조합을 키로 upsert 한다.
 * 결제일까지 키에 넣는 이유는 같은 사람이 같은 플랜을 둘 이상 쓰는 경우가 실제로 있어서다.
 * CSV에 없는 기존 행은 지우지 않는다 — 사람이 대시보드 밖에서 직접 관리할 수 있게.
 *
 * --dry-run: DB에 쓰지 않고 파싱·검증 결과와 upsert 예정 내역만 출력한다 (DB 접속 불필요).
 */

import { readFileSync } from 'fs'
import { and, eq, isNull } from 'drizzle-orm'

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

loadDatabaseUrlFromEnvFile()

const { db, axSubscriptions } = await import('../src/index')

const DRY_RUN = process.argv.includes('--dry-run')
const csvPath = process.argv.slice(2).find((arg) => !arg.startsWith('--'))

if (!csvPath) {
  console.error('사용법: tsx scripts/import-ax-subscriptions.ts <csv경로> [--dry-run]')
  process.exit(1)
}

const EXPECTED_HEADER = [
  'vendor', 'plan', 'owner_name', 'renewal_day', 'payer',
  'amount', 'currency', 'billing_cycle', 'status', 'note',
]

/** 한 줄을 필드 배열로 파싱. 따옴표로 감싼 필드와 그 안의 콤마, 이스케이프된 따옴표(`""`)를 처리한다 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current)
  return fields
}

interface ParsedRow {
  vendor: string
  plan: string
  ownerName: string | null
  renewalDay: number | null
  payer: string | null
  amount: number
  currency: string
  billingCycle: 'monthly' | 'yearly'
  status: 'active' | 'canceled'
  note: string | null
}

/** CSV 본문을 파싱해 유효한 행과 스킵 건수를 돌려준다. 잘못된 행은 사유를 stderr로 출력한다 */
function parseCsv(content: string): { rows: ParsedRow[]; skipped: number } {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) {
    return { rows: [], skipped: 0 }
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim())
  const headerMismatch = EXPECTED_HEADER.some((col, i) => header[i] !== col)
  if (headerMismatch) {
    console.error(`CSV 헤더가 예상과 다릅니다.\n  기대: ${EXPECTED_HEADER.join(',')}\n  실제: ${header.join(',')}`)
    process.exit(1)
  }

  const rows: ParsedRow[] = []
  let skipped = 0

  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1
    const [vendor, plan, ownerNameRaw, renewalDayRaw, payerRaw, amountRaw, currencyRaw, billingCycleRaw, statusRaw, noteRaw] =
      parseCsvLine(lines[i])

    if (!vendor?.trim()) {
      console.error(`${lineNo}행 스킵: vendor 누락`)
      skipped++
      continue
    }
    if (!plan?.trim()) {
      console.error(`${lineNo}행 스킵: plan 누락`)
      skipped++
      continue
    }
    if (!amountRaw?.trim() || Number.isNaN(Number(amountRaw))) {
      console.error(`${lineNo}행 스킵: amount가 숫자가 아님 (${amountRaw ?? ''})`)
      skipped++
      continue
    }

    const billingCycle = billingCycleRaw?.trim()
    if (billingCycle !== 'monthly' && billingCycle !== 'yearly') {
      console.error(`${lineNo}행 스킵: billing_cycle은 monthly|yearly만 허용 (${billingCycleRaw ?? ''})`)
      skipped++
      continue
    }

    const status = statusRaw?.trim() || 'active'
    if (status !== 'active' && status !== 'canceled') {
      console.error(`${lineNo}행 스킵: status는 active|canceled만 허용 (${statusRaw ?? ''})`)
      skipped++
      continue
    }

    const renewalDayValue = renewalDayRaw?.trim() ? Number(renewalDayRaw) : null
    if (renewalDayValue !== null && (!Number.isInteger(renewalDayValue) || renewalDayValue < 1 || renewalDayValue > 31)) {
      console.error(`${lineNo}행 스킵: renewal_day는 1~31 정수여야 함 (${renewalDayRaw ?? ''})`)
      skipped++
      continue
    }

    rows.push({
      vendor: vendor.trim(),
      plan: plan.trim(),
      ownerName: ownerNameRaw?.trim() || null,
      renewalDay: renewalDayValue,
      payer: payerRaw?.trim() || null,
      amount: Number(amountRaw),
      currency: currencyRaw?.trim() || 'KRW',
      billingCycle,
      status,
      note: noteRaw?.trim() || null,
    })
  }

  return { rows, skipped }
}

async function main() {
  const content = readFileSync(csvPath!, 'utf-8')
  const { rows, skipped } = parseCsv(content)

  if (DRY_RUN) {
    console.log(`[dry-run] DB에 쓰지 않습니다. upsert 예정 ${rows.length}건:`)
    for (const row of rows) {
      console.log(
        `  - ${row.vendor} / ${row.plan} / ${row.ownerName ?? '(공용)'} / ${row.renewalDay ?? '-'}일 — ${row.amount} ${row.currency} (${row.billingCycle}, ${row.status}, 결제 ${row.payer ?? '-'})`
      )
    }
    console.log(`\n성공 ${rows.length}건 / 스킵 ${skipped}건`)
    return
  }

  let upserted = 0

  for (const row of rows) {
    // 같은 사람이 같은 플랜을 둘 이상 쓰는 경우가 있어(결제일만 다름) 결제일까지 키에 넣는다
    const ownerCondition = row.ownerName
      ? eq(axSubscriptions.ownerName, row.ownerName)
      : isNull(axSubscriptions.ownerName)
    const renewalCondition = row.renewalDay !== null
      ? eq(axSubscriptions.renewalDay, row.renewalDay)
      : isNull(axSubscriptions.renewalDay)

    const existing = await db
      .select({ id: axSubscriptions.id })
      .from(axSubscriptions)
      .where(and(
        eq(axSubscriptions.vendor, row.vendor),
        eq(axSubscriptions.plan, row.plan),
        ownerCondition,
        renewalCondition
      ))
      .limit(1)

    const values = {
      vendor: row.vendor,
      plan: row.plan,
      ownerName: row.ownerName,
      renewalDay: row.renewalDay,
      payer: row.payer,
      // numeric 컬럼이라 문자열로 넣는다 (금액을 float로 통과시키지 않는다)
      amount: row.amount.toFixed(2),
      currency: row.currency,
      billingCycle: row.billingCycle,
      status: row.status,
      note: row.note,
      syncedAt: new Date(),
      updatedAt: new Date(),
    }

    if (existing.length > 0) {
      await db.update(axSubscriptions).set(values).where(eq(axSubscriptions.id, existing[0].id))
    } else {
      await db.insert(axSubscriptions).values(values)
    }
    upserted++
  }

  console.log(`✅ 성공 ${upserted}건 / 스킵 ${skipped}건`)
}

main().catch((err) => {
  console.error('💥 예상치 못한 오류:', err)
  process.exit(1)
})
