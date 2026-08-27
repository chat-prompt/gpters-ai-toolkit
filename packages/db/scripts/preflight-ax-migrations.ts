/**
 * AX dashboard migrations 0026-0030 read-only preflight.
 *
 * This script never changes schema or data. It reports the target without
 * credentials, checks whether the four migrations are already reflected,
 * and calculates the identity backfill / deduplication impact of 0028.
 *
 * Usage:
 *   pnpm --filter @gpters/db db:preflight:ax -- --env-file ../../apps/web/.env.ax-local
 *   pnpm --filter @gpters/db db:preflight:ax -- --json
 */

import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'

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
  target.hostname
)

const { db, closeDatabase } = await import('../src/index')

const [identity, objects, migrationTable] = await Promise.all([
  db.execute(sql`
    SELECT
      current_database() AS database,
      current_setting('neon.branch_id', true) AS branch_id,
      current_setting('neon.project_id', true) AS project_id,
      pg_is_in_recovery() AS replica
  `),
  db.execute(sql`
    SELECT
      to_regclass('public.ax_usage_collector_state') IS NOT NULL AS has_collector_state,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'account_status'
      ) AS has_account_status,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'org_memberships'
          AND column_name = 'status'
      ) AS has_membership_status,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ax_client_usage'
          AND column_name = 'user_id'
      ) AS has_usage_user_id,
      to_regclass('public.ax_skill_execution_attempts') IS NOT NULL AS has_execution_attempts,
      to_regclass('public.ax_skill_execution_events') IS NOT NULL AS has_execution_events,
      to_regclass('public.users') IS NOT NULL AS has_users,
      to_regclass('public.ax_client_usage') IS NOT NULL AS has_client_usage
  `),
  db.execute(sql`
    SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS has_migration_table
  `),
])

const hasMigrationTable = migrationTable.rows[0]?.has_migration_table === true
const migrationState = hasMigrationTable
  ? (await db.execute(sql`
      SELECT count(*)::int AS recorded_count, max(created_at) AS latest_created_at
      FROM drizzle.__drizzle_migrations
    `)).rows[0]
  : { recorded_count: null, latest_created_at: null }

const objectState = objects.rows[0] as Record<string, unknown> | undefined
const hasBaseTables = objectState?.has_users === true && objectState.has_client_usage === true
const impact = hasBaseTables ? (await db.execute(sql`
  WITH identity_matches AS (
    SELECT
      usage.id AS usage_id,
      min(member.id) AS user_id,
      count(DISTINCT member.id)::int AS match_count
    FROM ax_client_usage AS usage
    JOIN users AS member
      ON lower(trim(usage.member_name)) = lower(trim(coalesce(member.name, '')))
      OR lower(trim(usage.member_name)) = lower(split_part(member.email, '@', 1))
    GROUP BY usage.id
  ),
  resolved AS (
    SELECT
      usage.id,
      usage.client,
      usage.period_start,
      matches.user_id,
      matches.match_count
    FROM ax_client_usage AS usage
    LEFT JOIN identity_matches AS matches ON matches.usage_id = usage.id
  ),
  duplicate_groups AS (
    SELECT user_id, client, period_start, count(*)::int AS row_count
    FROM resolved
    WHERE match_count = 1
    GROUP BY user_id, client, period_start
    HAVING count(*) > 1
  )
  SELECT
    (SELECT count(*)::int FROM ax_client_usage) AS usage_rows,
    (SELECT count(*)::int FROM resolved WHERE match_count = 1) AS uniquely_matched_rows,
    (SELECT count(*)::int FROM resolved WHERE match_count > 1) AS ambiguous_rows,
    (SELECT count(*)::int FROM resolved WHERE match_count IS NULL) AS unmatched_rows,
    (SELECT count(*)::int FROM duplicate_groups) AS duplicate_groups,
    coalesce((SELECT sum(row_count - 1)::int FROM duplicate_groups), 0) AS rows_deleted_by_dedupe
`)).rows[0] : null

const result = {
  target: {
    protocol: target.protocol,
    host: target.hostname,
    port: target.port || 'default',
    database: target.pathname.replace(/^\//, '') || '(none)',
    classification: isLocal ? 'local' : 'remote',
  },
  identity: identity.rows[0],
  objects: objects.rows[0],
  migrationState: {
    hasMigrationTable,
    ...migrationState,
  },
  impact0028: impact,
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2))
} else {
  const impactRow = result.impact0028 as Record<string, unknown> | null
  const objectRow = result.objects as Record<string, unknown>
  const migrationRow = result.migrationState as Record<string, unknown>

  console.log(`Target: ${result.target.host}/${result.target.database} (${result.target.classification})`)
  console.log(
    `Schema: 0026=${objectRow.has_collector_state ? 'applied' : 'pending'}, ` +
      `0027=${objectRow.has_account_status && objectRow.has_membership_status ? 'applied' : 'pending'}, ` +
      `0028=${objectRow.has_usage_user_id ? 'applied' : 'pending'}, ` +
      `0029=${objectRow.has_execution_attempts ? 'applied' : 'pending'}, ` +
      `0030=${objectRow.has_execution_events ? 'applied' : 'pending'}`
  )
  console.log(
    `Drizzle records: ${migrationRow.recorded_count ?? 'missing'} ` +
      `(latest timestamp: ${migrationRow.latest_created_at ?? 'none'})`
  )
  if (impactRow) {
    console.log(
      `0028 impact: ${impactRow.usage_rows} rows, ${impactRow.uniquely_matched_rows} unique matches, ` +
        `${impactRow.ambiguous_rows} ambiguous, ${impactRow.unmatched_rows} unmatched, ` +
        `${impactRow.rows_deleted_by_dedupe} rows deleted by dedupe`
    )
  } else {
    console.log('0028 impact: unavailable (users or ax_client_usage base table is missing)')
  }

  if (!isLocal) {
    console.warn('WARNING: remote database. This preflight was read-only; do not apply local migrations here.')
  }
}

await closeDatabase()
