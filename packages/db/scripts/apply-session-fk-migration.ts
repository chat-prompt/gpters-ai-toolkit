/** Guarded AX 0037 session foreign-key (cascade → set null) migration runner for Neon. */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'
import { sql } from 'drizzle-orm'

import {
  type SessionFkMigrationState,
  type SessionForeignKeyState,
  SESSION_FK_TABLES,
  validateSessionFkAfterMigration,
  validateSessionFkBeforeMigration,
} from '../src/migration/session-fk-guard'

const PRODUCTION_CONFIRMATION = 'apply-ax-0037'

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
  expectedSkillEventCount?: number,
  expectedAttemptCount?: number,
): Promise<SessionFkMigrationState> {
  const [identityResult, migrationResult, fkResult, eventResult, attemptResult] = await Promise.all([
    db.execute(sql`
      SELECT current_setting('neon.branch_id', true) AS branch_id,
             current_setting('neon.project_id', true) AS project_id
    `),
    db.execute(sql`
      SELECT count(*)::int AS recorded_count, max(created_at)::text AS latest_created_at
      FROM drizzle.__drizzle_migrations
    `),
    // 이름을 가정하지 않고 mcp_sessions를 참조하는 FK를 전부 센다.
    // 개수를 세는 이유는 DROP이 조용히 실패해 CASCADE가 남는 경우를 잡기 위해서다.
    db.execute(sql`
      SELECT c.conrelid::regclass::text AS child,
             count(*)::int AS constraint_count,
             min(CASE c.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
                                    WHEN 'a' THEN 'NO ACTION' ELSE c.confdeltype::text END) AS on_delete,
             count(DISTINCT c.confdeltype)::int AS rule_variants
      FROM pg_constraint c
      WHERE c.contype = 'f' AND c.confrelid = 'public.mcp_sessions'::regclass
      GROUP BY 1
    `),
    db.execute(sql`SELECT count(*)::int AS c FROM skill_events`),
    db.execute(sql`SELECT count(*)::int AS c FROM ax_skill_execution_attempts`),
  ])
  const identity = identityResult.rows[0] as Record<string, unknown>
  const migrations = migrationResult.rows[0] as Record<string, unknown>

  const foreignKeys: SessionForeignKeyState[] = SESSION_FK_TABLES.map((table) => {
    const row = fkResult.rows.find((r) => (r as Record<string, unknown>).child === table) as
      | Record<string, unknown>
      | undefined
    if (!row) return { table, constraintCount: 0, onDelete: 'MISSING' }
    // 규칙이 섞여 있으면(옛 CASCADE + 새 SET NULL) 단일 값으로 보고하지 않는다
    const mixed = count(row.rule_variants) > 1
    return {
      table,
      constraintCount: count(row.constraint_count),
      onDelete: mixed ? 'MIXED' : String(row.on_delete),
    }
  })

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
    foreignKeys,
    skillEventCount: count((eventResult.rows[0] as Record<string, unknown>)?.c),
    attemptCount: count((attemptResult.rows[0] as Record<string, unknown>)?.c),
    expectedSkillEventCount,
    expectedAttemptCount,
  }
}

function assertSafe(stage: string, errors: string[]): void {
  if (errors.length > 0) throw new Error(`${stage} blocked:\n- ${errors.join('\n- ')}`)
}

function summary(label: string, state: SessionFkMigrationState): void {
  const fks = state.foreignKeys
    .map((fk) => `${fk.table}=${fk.onDelete}(${fk.constraintCount})`)
    .join(', ')
  console.log(
    `${label}: branch=${state.actualBranchId ?? 'unknown'}, migrations=${state.migrationCount}, ` +
      `${fks}, skillEvents=${state.skillEventCount}, attempts=${state.attemptCount}`
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
  // 운영 적용은 운영과 다른 복구 브랜치를 반드시 명시해야 한다 (0033~0036 runner와 같은 규칙)
  const recoveryBranchId = production ? requiredArgument('--recovery-branch-id') : undefined
  const apply = process.argv.includes('--apply')
  if (production && apply && argument('--confirm-production-migration') !== PRODUCTION_CONFIRMATION) {
    throw new Error(`production apply requires --confirm-production-migration ${PRODUCTION_CONFIRMATION}`)
  }

  const db = drizzle(neon(databaseUrl))
  const before = await inspect(db, expectedProjectId, expectedBranchId, productionBranchId, recoveryBranchId)
  summary('AX 0037 preflight', before)
  assertSafe('AX 0037 preflight', validateSessionFkBeforeMigration(before, production))
  if (!apply) {
    console.log(production
      ? `Ready. Re-run with --apply --confirm-production-migration ${PRODUCTION_CONFIRMATION}.`
      : 'Ready. Re-run the same command with --apply to execute migration 0037.')
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
    before.skillEventCount,
    before.attemptCount,
  )
  summary('AX 0037 verification', after)
  assertSafe('AX 0037 verification', validateSessionFkAfterMigration(after, production))
  console.log('AX 0037 session foreign keys now keep events when a session is deleted.')
}

main().catch((error) => {
  const raw = error instanceof Error ? error.message : 'unknown error'
  const safe = raw
    .replace(process.env.DATABASE_URL ?? '__no_database_url__', '[redacted database URL]')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted database URL]')
  console.error(safe)
  process.exitCode = 1
})
