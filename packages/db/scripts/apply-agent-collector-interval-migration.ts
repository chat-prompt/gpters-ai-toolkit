/** Guarded AX 0034 agent-collector interval-default migration runner for Neon. */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'
import { sql } from 'drizzle-orm'

const PRODUCTION_CONFIRMATION = 'apply-ax-0034'
const EXPECTED_DEFAULT = '3600'

interface IntervalMigrationState {
  actualProjectId: string | null
  actualBranchId: string | null
  migrationCount: number
  hasCollectorTable: boolean
  columnDefault: string | null
  collectorRows: number
  intervalHistogram: Array<{ intervalSeconds: number; count: number }>
}

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
    process.env.DATABASE_URL = match[2].trim().replace(/^["']|["']$/g, '')
  }
}

function count(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

async function inspect(db: ReturnType<typeof drizzle>): Promise<IntervalMigrationState> {
  const [identityResult, migrationResult, schemaResult, histogramResult] = await Promise.all([
    db.execute(sql`
      SELECT current_setting('neon.branch_id', true) AS branch_id,
             current_setting('neon.project_id', true) AS project_id
    `),
    db.execute(sql`SELECT count(*)::int AS recorded_count FROM drizzle.__drizzle_migrations`),
    db.execute(sql`
      SELECT to_regclass('public.ax_agent_telemetry_collectors') IS NOT NULL AS has_table,
             (SELECT column_default FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'ax_agent_telemetry_collectors'
                 AND column_name = 'interval_seconds') AS column_default
    `),
    db.execute(sql`
      SELECT interval_seconds, count(*)::int AS count
      FROM ax_agent_telemetry_collectors GROUP BY interval_seconds ORDER BY interval_seconds
    `),
  ])
  const identity = identityResult.rows[0] as Record<string, unknown>
  const schema = schemaResult.rows[0] as Record<string, unknown>
  const histogram = (histogramResult.rows as Array<Record<string, unknown>>).map((row) => ({
    intervalSeconds: count(row.interval_seconds),
    count: count(row.count),
  }))
  return {
    actualProjectId: typeof identity.project_id === 'string' ? identity.project_id : null,
    actualBranchId: typeof identity.branch_id === 'string' ? identity.branch_id : null,
    migrationCount: count((migrationResult.rows[0] as Record<string, unknown>).recorded_count),
    hasCollectorTable: schema.has_table === true,
    columnDefault: typeof schema.column_default === 'string' ? schema.column_default : null,
    collectorRows: histogram.reduce((sum, row) => sum + row.count, 0),
    intervalHistogram: histogram,
  }
}

function validateBefore(state: IntervalMigrationState, expectedProjectId: string, expectedBranchId: string): string[] {
  const errors: string[] = []
  if (state.actualProjectId !== expectedProjectId) errors.push(`project mismatch: ${state.actualProjectId ?? 'unknown'}`)
  if (state.actualBranchId !== expectedBranchId) errors.push(`branch mismatch: ${state.actualBranchId ?? 'unknown'}`)
  if (!state.hasCollectorTable) errors.push('ax_agent_telemetry_collectors does not exist (0031 not applied)')
  if (state.columnDefault !== null && state.columnDefault.includes(EXPECTED_DEFAULT)) {
    errors.push('interval_seconds default is already 3600 (0034 already applied)')
  }
  return errors
}

function validateAfter(state: IntervalMigrationState, before: IntervalMigrationState): string[] {
  const errors: string[] = []
  if (!state.columnDefault || !state.columnDefault.includes(EXPECTED_DEFAULT)) {
    errors.push(`interval_seconds default is ${state.columnDefault ?? 'null'}, expected ${EXPECTED_DEFAULT}`)
  }
  if (state.collectorRows !== before.collectorRows) errors.push('collector row count changed')
  if (JSON.stringify(state.intervalHistogram) !== JSON.stringify(before.intervalHistogram)) {
    errors.push('existing collector intervals changed; 0034 must only change the column default')
  }
  if (state.migrationCount !== before.migrationCount + 1) errors.push('expected exactly one new migration record')
  return errors
}

function assertSafe(stage: string, errors: string[]): void {
  if (errors.length > 0) throw new Error(`${stage} blocked:\n- ${errors.join('\n- ')}`)
}

function summary(label: string, state: IntervalMigrationState): void {
  const histogram = state.intervalHistogram.map((row) => `${row.intervalSeconds}s×${row.count}`).join(', ') || 'none'
  console.log(
    `${label}: branch=${state.actualBranchId ?? 'unknown'}, migrations=${state.migrationCount}, ` +
      `default=${state.columnDefault ?? 'null'}, collectors=${state.collectorRows} (${histogram})`
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
  const apply = process.argv.includes('--apply')
  if (production && apply && argument('--confirm-production-migration') !== PRODUCTION_CONFIRMATION) {
    throw new Error(`production apply requires --confirm-production-migration ${PRODUCTION_CONFIRMATION}`)
  }

  const db = drizzle(neon(databaseUrl))
  const before = await inspect(db)
  summary('AX 0034 preflight', before)
  assertSafe('AX 0034 preflight', validateBefore(before, expectedProjectId, expectedBranchId))
  if (!apply) {
    console.log(production
      ? `Ready. Re-run with --apply --confirm-production-migration ${PRODUCTION_CONFIRMATION}.`
      : 'Ready. Re-run the same command with --apply to execute migration 0034.')
    return
  }

  const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))
  await migrate(db, { migrationsFolder })
  const after = await inspect(db)
  summary('AX 0034 verification', after)
  assertSafe('AX 0034 verification', validateAfter(after, before))
  console.log('AX 0034 agent collector hourly default applied and verified.')
}

main().catch((error) => {
  const raw = error instanceof Error ? error.message : 'unknown error'
  const safe = raw
    .replace(process.env.DATABASE_URL ?? '__no_database_url__', '[redacted database URL]')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted database URL]')
  console.error(safe)
  process.exitCode = 1
})
