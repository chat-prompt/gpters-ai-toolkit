/**
 * Agent telemetry production-pilot preflight.
 *
 * This script is strictly read-only. It verifies that the target database is
 * still on the audited Drizzle baseline, or that the telemetry-only migration
 * has already been applied exactly once.
 *
 * Usage:
 *   pnpm --filter @gpters/db db:preflight:agent-telemetry -- --env-file ../../.env.local
 *   pnpm --filter @gpters/db db:preflight:agent-telemetry -- --env-file ../../.env.local --json
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'

const BASELINE_RECORDED_COUNT = 14
const BASELINE_LATEST_CREATED_AT = '1768964811913'
const TELEMETRY_MIGRATION_TAG = '0025_ax_agent_telemetry_batches'

const envFileIndex = process.argv.indexOf('--env-file')
const envFile = envFileIndex >= 0 ? process.argv[envFileIndex + 1] : undefined

if (envFile) {
  const allowedKeys = new Set(['DATABASE_URL', 'DATABASE_DRIVER', 'TEST_DATABASE_URL'])
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (!match || !allowedKeys.has(match[1]) || process.env[match[1]]) continue
    process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
  }
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const target = new URL(databaseUrl)
const isLocal = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(
  target.hostname,
)

const journal = JSON.parse(readFileSync('./drizzle/meta/_journal.json', 'utf8')) as {
  entries: Array<{ tag: string; when: number }>
}
const migrationEntry = journal.entries.find((entry) => entry.tag === TELEMETRY_MIGRATION_TAG)
if (!migrationEntry) {
  console.error(`Missing ${TELEMETRY_MIGRATION_TAG} in drizzle journal`)
  process.exit(1)
}

const migrationSql = readFileSync(`./drizzle/${TELEMETRY_MIGRATION_TAG}.sql`, 'utf8')
const expectedHash = createHash('sha256').update(migrationSql).digest('hex')
const expectedCreatedAt = String(migrationEntry.when)

const { db } = await import('../src/index')

{
  const [migrationTableResult, schemaResult] = await Promise.all([
    db.execute(sql`
      SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists
    `),
    db.execute(sql`
      SELECT
        to_regclass('public.ax_agent_telemetry_batches') IS NOT NULL AS table_exists,
        (
          SELECT count(*)::int
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'ax_agent_telemetry_batches'
        ) AS column_count,
        (
          SELECT count(*)::int
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'ax_agent_telemetry_batches'
        ) AS index_count,
        (
          SELECT count(*)::int
          FROM pg_constraint
          WHERE conrelid = to_regclass('public.ax_agent_telemetry_batches')
        ) AS constraint_count
    `),
  ])

  const hasMigrationTable = migrationTableResult.rows[0]?.exists === true
  const migrationState = hasMigrationTable
    ? (await db.execute(sql`
        SELECT
          count(*)::int AS recorded_count,
          max(created_at)::text AS latest_created_at,
          count(*) FILTER (WHERE created_at = ${migrationEntry.when})::int AS telemetry_rows,
          bool_or(
            created_at = ${migrationEntry.when} AND hash = ${expectedHash}
          ) AS telemetry_hash_matches
        FROM drizzle.__drizzle_migrations
      `)).rows[0]
    : {
        recorded_count: 0,
        latest_created_at: null,
        telemetry_rows: 0,
        telemetry_hash_matches: false,
      }

  const schemaState = schemaResult.rows[0] as Record<string, unknown>
  const recordedCount = Number(migrationState?.recorded_count ?? 0)
  const latestCreatedAt = migrationState?.latest_created_at == null
    ? null
    : String(migrationState.latest_created_at)
  const telemetryRows = Number(migrationState?.telemetry_rows ?? 0)
  const telemetryHashMatches = migrationState?.telemetry_hash_matches === true
  const tableExists = schemaState.table_exists === true
  const schemaShapeMatches = tableExists
    && Number(schemaState.column_count) === 23
    && Number(schemaState.index_count) === 4
    && Number(schemaState.constraint_count) === 5

  const baselineReady = hasMigrationTable
    && recordedCount === BASELINE_RECORDED_COUNT
    && latestCreatedAt === BASELINE_LATEST_CREATED_AT
    && telemetryRows === 0
    && !tableExists
  const applied = hasMigrationTable
    && recordedCount === BASELINE_RECORDED_COUNT + 1
    && latestCreatedAt === expectedCreatedAt
    && telemetryRows === 1
    && telemetryHashMatches
    && schemaShapeMatches

  const status = baselineReady ? 'ready' : applied ? 'applied' : 'blocked'
  const result = {
    status,
    target: {
      classification: isLocal ? 'local' : 'remote',
      database: target.pathname.replace(/^\//, '') || '(none)',
    },
    expected: {
      baselineRecordedCount: BASELINE_RECORDED_COUNT,
      baselineLatestCreatedAt: BASELINE_LATEST_CREATED_AT,
      migrationTag: TELEMETRY_MIGRATION_TAG,
      migrationCreatedAt: expectedCreatedAt,
    },
    observed: {
      hasMigrationTable,
      recordedCount,
      latestCreatedAt,
      telemetryRows,
      telemetryHashMatches,
      tableExists,
      columnCount: Number(schemaState.column_count),
      indexCount: Number(schemaState.index_count),
      constraintCount: Number(schemaState.constraint_count),
    },
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`Agent telemetry preflight: ${status}`)
    console.log(`Target: ${result.target.classification} database ${result.target.database}`)
    console.log(
      `Drizzle: ${recordedCount} records, latest ${latestCreatedAt ?? 'none'}, `
        + `telemetry rows ${telemetryRows}`,
    )
    console.log(
      `Schema: table=${tableExists}, columns=${result.observed.columnCount}, `
        + `indexes=${result.observed.indexCount}, constraints=${result.observed.constraintCount}`,
    )
  }

  if (status === 'blocked') process.exitCode = 2
}
