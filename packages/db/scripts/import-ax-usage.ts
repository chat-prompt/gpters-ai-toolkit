/**
 * AX 클라이언트 사용량 import 스크립트 (클라이언트 사용량 패널 데이터 소스)
 *
 * 각 팀원 머신의 수집기가 만든 JSON을 `ax_client_usage` 테이블로 옮긴다.
 * 수집기 출력에는 대화 내용도, 인증 토큰도 들어 있지 않다 — 집계 수치와
 * 플랜 문자열뿐이다.
 *
 * 사용:
 *   pnpm --filter @gpters/db exec tsx scripts/import-ax-usage.ts <json경로> --member "현진우" [--dry-run]
 *
 * 입력 JSON: 수집기가 내보내는 UsageRecord 배열
 *   [{ client, planRaw, plan, periodStart, periodEnd,
 *      inputTokens, outputTokens, cachedTokens, sessions, models,
 *      limitUsedPercent, limitResetsAt }]
 *
 * 갱신 방식: (member_name, client, period_start)을 키로 upsert 한다.
 * 같은 사람이 같은 구간을 다시 수집하면 덮어쓴다 — 재실행해도 총량이 부풀지 않는다.
 *
 * --dry-run: DB에 쓰지 않고 파싱·검증 결과만 출력한다 (DB 접속 불필요).
 */

import { readFileSync } from 'fs'
import { and, eq } from 'drizzle-orm'

/**
 * `DATABASE_URL`이 셸에 없으면 레포 루트 `.env`에서 읽어 온다
 *
 * import-ax-subscriptions.ts와 같은 이유로 최소한만 직접 파싱한다.
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

/** 수집기가 내보내는 레코드 (필요한 필드만) */
interface UsageRecord {
  client: string
  planRaw?: string | null
  plan?: string | null
  periodStart: string
  periodEnd: string
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  sessions: number
  models?: Record<string, number> | null
  limitUsedPercent?: number | null
  limitResetsAt?: string | null
}

/** 허용되는 클라이언트 값 — 스키마 enum과 일치해야 한다 */
const VALID_CLIENTS = new Set(['claude-code', 'codex'])

/**
 * 레코드 하나를 검증한다
 *
 * @param record - 파싱된 레코드
 * @param index - 배열 내 위치 (오류 메시지용)
 * @returns 오류 메시지 목록. 비어 있으면 통과
 */
function validate(record: UsageRecord, index: number): string[] {
  const errors: string[] = []
  const at = `[${index}]`

  if (!VALID_CLIENTS.has(record.client)) {
    errors.push(`${at} client가 'claude-code' 또는 'codex'가 아님: ${record.client}`)
  }
  for (const field of ['periodStart', 'periodEnd'] as const) {
    if (!record[field] || Number.isNaN(new Date(record[field]).getTime())) {
      errors.push(`${at} ${field}가 유효한 시각이 아님: ${record[field]}`)
    }
  }
  for (const field of ['inputTokens', 'outputTokens', 'cachedTokens', 'sessions'] as const) {
    const value = record[field]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      errors.push(`${at} ${field}가 0 이상의 수가 아님: ${value}`)
    }
  }
  // 한도는 없을 수 있다(Claude Code). 있다면 범위를 확인한다.
  if (record.limitUsedPercent != null) {
    const pct = record.limitUsedPercent
    if (typeof pct !== 'number' || pct < 0 || pct > 100) {
      errors.push(`${at} limitUsedPercent가 0~100 범위 밖: ${pct}`)
    }
  }
  return errors
}

async function main() {
  const args = process.argv.slice(2)
  const jsonPath = args.find((arg) => !arg.startsWith('--'))
  const memberIndex = args.indexOf('--member')
  const memberName = memberIndex >= 0 ? args[memberIndex + 1] : undefined

  if (!jsonPath || !memberName) {
    console.error(
      '사용법: tsx scripts/import-ax-usage.ts <json경로> --member "이름" [--dry-run]'
    )
    process.exit(1)
  }

  let records: UsageRecord[]
  try {
    const parsed = JSON.parse(readFileSync(jsonPath, 'utf-8'))
    records = Array.isArray(parsed) ? parsed : [parsed]
  } catch (err) {
    console.error(`JSON을 읽지 못했습니다: ${(err as Error).message}`)
    process.exit(1)
  }

  const errors = records.flatMap((record, i) => validate(record, i))
  if (errors.length > 0) {
    console.error('검증 실패:')
    for (const error of errors) console.error(`  ${error}`)
    process.exit(1)
  }

  console.log(`${memberName} · 레코드 ${records.length}건`)
  for (const record of records) {
    const total = record.inputTokens + record.outputTokens + record.cachedTokens
    const limit =
      record.limitUsedPercent != null ? `한도 ${record.limitUsedPercent}%` : '한도 미제공'
    console.log(
      `  ${record.client.padEnd(12)} ${(record.plan ?? '—').padEnd(20)} ` +
        `세션 ${String(record.sessions).padStart(3)} · 토큰 ${total.toLocaleString('ko-KR')} · ${limit}`
    )
  }

  if (DRY_RUN) {
    console.log('\n--dry-run — DB에 쓰지 않았습니다.')
    return
  }

  loadDatabaseUrlFromEnvFile()
  const { db, axClientUsage } = await import('../src/index')

  let inserted = 0
  let updated = 0

  for (const record of records) {
    const periodStart = new Date(record.periodStart)
    const values = {
      memberName,
      client: record.client as 'claude-code' | 'codex',
      planRaw: record.planRaw ?? null,
      plan: record.plan ?? null,
      periodStart,
      periodEnd: new Date(record.periodEnd),
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      cachedTokens: record.cachedTokens,
      sessions: record.sessions,
      models: record.models ?? {},
      // numeric 컬럼은 문자열로 넣는다. null은 "한도를 안 준 클라이언트"라는 뜻이다.
      limitUsedPercent:
        record.limitUsedPercent != null ? record.limitUsedPercent.toFixed(2) : null,
      limitResetsAt: record.limitResetsAt ? new Date(record.limitResetsAt) : null,
      syncedAt: new Date(),
      updatedAt: new Date(),
    }

    const [existing] = await db
      .select({ id: axClientUsage.id })
      .from(axClientUsage)
      .where(
        and(
          eq(axClientUsage.memberName, memberName),
          eq(axClientUsage.client, values.client),
          eq(axClientUsage.periodStart, periodStart)
        )
      )
      .limit(1)

    if (existing) {
      await db.update(axClientUsage).set(values).where(eq(axClientUsage.id, existing.id))
      updated++
    } else {
      await db.insert(axClientUsage).values(values)
      inserted++
    }
  }

  console.log(`\n완료 — 신규 ${inserted}건, 갱신 ${updated}건`)
}

await main()
