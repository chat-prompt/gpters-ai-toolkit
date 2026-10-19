/** Guarded 0045 ax_usage_limit_windows migration runner for Neon (EDU-11519). */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'
import { sql } from 'drizzle-orm'

import {
  type UsageLimitWindowsMigrationState,
  validateUsageLimitWindowsAfterMigration,
  validateUsageLimitWindowsBeforeMigration,
} from '../src/migration/usage-limit-windows-guard'

const PRODUCTION_CONFIRMATION = 'apply-0045'

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function requiredArgument(name: string): string {
  const value = argument(name)
  if (!value || value.startsWith('--')) throw new Error(`${name} is required`)
  return value
}

function loadEnvFile(path: string | undefined): void {
  if (!path) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(DATABASE_URL)\s*=\s*(.*)\s*$/)
    if (!match || process.env.DATABASE_URL) continue
    process.env.DATABASE_URL = match[2].trim().replace(/^["\']|["\']$/g, '')
  }
}

function count(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

async function inspect(
  db: ReturnType<typeof drizzle>,
  expectedProjectId: string,
  expectedBranchId: string,
  productionBranchId: string,
  recoveryBranchId?: string,
  expectedUsageCount?: number,
): Promise<UsageLimitWindowsMigrationState> {
  const [identityResult, migrationResult, tableResult, keyResult, indexResult, usageResult] = await Promise.all([
    db.execute(sql`
      SELECT current_setting('neon.branch_id', true) AS branch_id,
             current_setting('neon.project_id', true) AS project_id
    `),
    db.execute(sql`
      SELECT count(*)::int AS recorded_count, max(created_at)::text AS latest_created_at
      FROM drizzle.__drizzle_migrations
    `),
    db.execute(sql`SELECT to_regclass('public.ax_usage_limit_windows') IS NOT NULL AS present`),
    db.execute(sql`
      SELECT count(*)::int AS n FROM pg_constraint
      WHERE conrelid = to_regclass('public.ax_usage_limit_windows') AND contype = 'p'
    `),
    db.execute(sql`SELECT to_regclass('public.ax_usage_limit_windows_resets_at_idx') IS NOT NULL AS present`),
    db.execute(sql`SELECT count(*)::int AS usage_count FROM ax_client_usage`),
  ])
  const identity = identityResult.rows[0] as Record<string, unknown>
  const migrations = migrationResult.rows[0] as Record<string, unknown>
  const hasTable = (tableResult.rows[0] as Record<string, unknown>).present === true
  // 테이블이 생긴 뒤에만 행을 셀 수 있다. 적용 직후부터 운영 보고가 쌓이므로 기록만 한다
  const windowCount = hasTable
    ? count((await db.execute(sql`SELECT count(*)::int AS n FROM ax_usage_limit_windows`)).rows[0]?.n)
    : 0

  return {
    actualProjectId: typeof identity.project_id === 'string' ? identity.project_id : null,
    actualBranchId: typeof identity.branch_id === 'string' ? identity.branch_id : null,
    expectedProjectId,
    expectedBranchId,
    productionBranchId,
    recoveryBranchId,
    migrationCount: count(migrations.recorded_count),
    latestMigrationTimestamp: typeof migrations.latest_created_at === 'string'
      ? migrations.latest_created_at
      : null,
    hasTable,
    hasPrimaryKey: count((keyResult.rows[0] as Record<string, unknown>).n) === 1,
    hasResetsAtIndex: (indexResult.rows[0] as Record<string, unknown>).present === true,
    windowCount,
    usageCount: count((usageResult.rows[0] as Record<string, unknown>).usage_count),
    expectedUsageCount,
  }
}

function assertSafe(stage: string, errors: string[]): void {
  if (errors.length > 0) throw new Error(`${stage} blocked:\n- ${errors.join('\n- ')}`)
}

function summary(label: string, state: UsageLimitWindowsMigrationState): void {
  console.log(
    `${label}: branch=${state.actualBranchId ?? 'unknown'}, migrations=${state.migrationCount}, ` +
      `table=${state.hasTable ? `present(pk=${state.hasPrimaryKey}, index=${state.hasResetsAtIndex}, rows=${state.windowCount})` : 'absent'}, ` +
      `ax_client_usage=${state.usageCount}`
  )
}

async function main(): Promise<void> {
  loadEnvFile(argument('--env-file'))
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is not set')
  const target = new URL(databaseUrl)
  if (['localhost', '127.0.0.1', '::1'].includes(target.hostname)) {
    throw new Error('this guarded runner accepts Neon branches only')
  }

  const production = process.argv.includes('--production')
  const expectedProjectId = requiredArgument('--expected-project-id')
  const productionBranchId = requiredArgument('--production-branch-id')
  const expectedBranchId = production ? productionBranchId : requiredArgument('--expected-branch-id')
  // 운영 적용은 운영과 다른 복구 브랜치를 반드시 명시해야 한다 (0033~0044 runner와 같은 규칙)
  const recoveryBranchId = production ? requiredArgument('--recovery-branch-id') : undefined
  const apply = process.argv.includes('--apply')
  if (production && apply && argument('--confirm-production-migration') !== PRODUCTION_CONFIRMATION) {
    throw new Error(`production apply requires --confirm-production-migration ${PRODUCTION_CONFIRMATION}`)
  }

  const db = drizzle(neon(databaseUrl))
  const before = await inspect(db, expectedProjectId, expectedBranchId, productionBranchId, recoveryBranchId)
  summary('0045 preflight', before)
  assertSafe('0045 preflight', validateUsageLimitWindowsBeforeMigration(before, production))
  if (!apply) {
    console.log(production
      ? `Ready. Re-run with --apply --confirm-production-migration ${PRODUCTION_CONFIRMATION}.`
      : 'Ready. Re-run the same command with --apply to execute migration 0045.')
    return
  }

  const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))
  await migrate(db, { migrationsFolder })
  const after = await inspect(
    db,
    expectedProjectId,
    expectedBranchId,
    productionBranchId,
    recoveryBranchId,
    before.usageCount,
  )
  summary('0045 verification', after)
  assertSafe('0045 verification', validateUsageLimitWindowsAfterMigration(after, production))
  console.log('0045 ax_usage_limit_windows applied and verified.')
}

main().catch((error) => {
  const raw = error instanceof Error ? error.message : 'unknown error'
  const safe = raw
    .replace(process.env.DATABASE_URL ?? '__no_database_url__', '[redacted database URL]')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted database URL]')
  console.error(safe)
  process.exitCode = 1
})
