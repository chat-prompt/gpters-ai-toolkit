/**
 * Count-only dry run and guarded backfill for pre-0032 sessionless AITK CLI events.
 *
 * The script never prints request bodies, search queries, summaries, user IDs, or skill IDs.
 * It defaults to dry-run; production writes require a recovery branch and explicit phrase.
 */

import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { sql, type SQL } from 'drizzle-orm'
import {
  type SessionlessSkillEventsBackfillState,
  validateSessionlessSkillEventsBackfill,
} from '../src/migration/sessionless-skill-events-guard'

const PRODUCTION_CONFIRMATION = 'backfill-ax-0032'

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function requiredArgument(name: string): string {
  const value = argument(name)
  if (!value || value.startsWith('--')) throw new Error(`${name} is required`)
  return value
}

function integerArgument(name: string, fallback = 0): number {
  const raw = argument(name)
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`)
  return value
}

function utcArgument(name: string, fallback?: Date): Date {
  const raw = argument(name)
  if (!raw) {
    if (fallback) return fallback
    throw new Error(`${name} is required`)
  }
  const value = new Date(raw)
  if (Number.isNaN(value.getTime()) || !raw.endsWith('Z')) {
    throw new Error(`${name} must be an ISO 8601 UTC timestamp ending in Z`)
  }
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

/** Shared candidate definition for the dry run and the write CTE. */
function candidateCtes(from: Date, to: Date): SQL {
  return sql`
    target_audits AS (
      SELECT
        logs.id AS source_audit_log_id,
        tokens.user_id,
        CASE
          WHEN logs.tool IS NOT NULL THEN logs.tool
          WHEN logs.method = 'rest:get' THEN 'get_plugin_content'
          WHEN logs.method = 'rest:search' THEN 'search_plugins'
          WHEN logs.method = 'rest:deploy' THEN 'deploy_skill'
          ELSE NULL
        END AS effective_tool,
        logs.request_params,
        logs.search_results,
        logs.created_at
      FROM mcp_audit_logs logs
      LEFT JOIN oauth_access_tokens tokens ON tokens.id = logs.access_token_id
      WHERE logs.session_id IS NULL
        AND logs.response_status = 'success'
        AND logs.created_at >= ${from}
        AND logs.created_at < ${to}
        AND COALESCE(
          logs.tool,
          CASE
            WHEN logs.method = 'rest:get' THEN 'get_plugin_content'
            WHEN logs.method = 'rest:search' THEN 'search_plugins'
            WHEN logs.method = 'rest:deploy' THEN 'deploy_skill'
            ELSE NULL
          END
        ) IN (
          'semantic_search', 'search_plugins', 'get_plugin_content', 'deploy_skill',
          'report_skill_outcome', 'report_skill_execution'
        )
    ),
    candidate_rows_raw AS (
      SELECT
        audit.source_audit_log_id,
        audit.user_id,
        NULLIF(result.value ->> 'itemId', '') AS skill_id,
        'search'::text AS action,
        COALESCE(
          audit.request_params ->> 'query',
          audit.request_params #>> '{params,arguments,query}',
          ''
        ) AS query,
        COALESCE((result.value ->> 'rank')::int, result.ordinality::int) AS rank,
        round(COALESCE((result.value ->> 'score')::numeric, 0) * 100)::int AS score,
        audit.created_at
      FROM target_audits audit
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(audit.search_results, '[]'::jsonb))
        WITH ORDINALITY AS result(value, ordinality)
      WHERE audit.effective_tool IN ('semantic_search', 'search_plugins')

      UNION ALL

      SELECT
        audit.source_audit_log_id,
        audit.user_id,
        '__zero_result__',
        'search',
        COALESCE(
          audit.request_params ->> 'query',
          audit.request_params #>> '{params,arguments,query}',
          ''
        ),
        0,
        0,
        audit.created_at
      FROM target_audits audit
      WHERE audit.effective_tool IN ('semantic_search', 'search_plugins')
        AND jsonb_typeof(audit.search_results) = 'array'
        AND jsonb_array_length(audit.search_results) = 0

      UNION ALL

      SELECT
        audit.source_audit_log_id,
        audit.user_id,
        NULLIF(COALESCE(
          audit.request_params ->> 'pluginId',
          audit.request_params #>> '{params,arguments,pluginId}'
        ), ''),
        'load',
        NULL,
        NULL,
        NULL,
        audit.created_at
      FROM target_audits audit
      WHERE audit.effective_tool = 'get_plugin_content'

      UNION ALL

      SELECT
        audit.source_audit_log_id,
        audit.user_id,
        NULLIF(COALESCE(
          audit.request_params ->> 'skillId',
          audit.request_params #>> '{params,arguments,skillId}'
        ), ''),
        CASE WHEN COALESCE(
          audit.request_params ->> 'applied',
          audit.request_params #>> '{params,arguments,applied}'
        ) = 'true' THEN 'apply' ELSE 'skip' END,
        NULL,
        NULL,
        NULL,
        audit.created_at
      FROM target_audits audit
      WHERE audit.effective_tool = 'report_skill_outcome'

      UNION ALL

      SELECT
        audit.source_audit_log_id,
        audit.user_id,
        NULLIF(COALESCE(
          audit.request_params ->> 'id',
          audit.request_params ->> 'name',
          audit.request_params #>> '{params,arguments,id}',
          audit.request_params #>> '{params,arguments,name}'
        ), ''),
        'deploy',
        NULL,
        NULL,
        NULL,
        audit.created_at
      FROM target_audits audit
      WHERE audit.effective_tool = 'deploy_skill'

      UNION ALL

      SELECT
        audit.source_audit_log_id,
        audit.user_id,
        NULLIF(COALESCE(
          audit.request_params ->> 'skillId',
          audit.request_params #>> '{params,arguments,skillId}'
        ), ''),
        'apply',
        NULL,
        NULL,
        NULL,
        audit.created_at
      FROM target_audits audit
      WHERE audit.effective_tool = 'report_skill_execution'
    ),
    candidate_rows AS (
      SELECT DISTINCT ON (source_audit_log_id, skill_id, action)
        source_audit_log_id, user_id, skill_id, action, query, rank, score, created_at
      FROM candidate_rows_raw
      ORDER BY source_audit_log_id, skill_id, action, rank ASC NULLS LAST
    ),
    eligible_rows AS (
      SELECT candidates.*
      FROM candidate_rows candidates
      LEFT JOIN catalog_items catalog ON catalog.id = candidates.skill_id
      WHERE candidates.skill_id = '__zero_result__' OR catalog.id IS NOT NULL
    ),
    existing_rows AS (
      SELECT eligible.source_audit_log_id, eligible.skill_id, eligible.action
      FROM eligible_rows eligible
      INNER JOIN skill_events events
        ON events.source_audit_log_id = eligible.source_audit_log_id
        AND events.skill_id = eligible.skill_id
        AND events.action::text = eligible.action
    )
  `
}

async function inspectIdentityAndSchema(db: ReturnType<typeof drizzle>) {
  const [identityResult, migrationResult, schemaResult] = await Promise.all([
    db.execute(sql`
      SELECT current_setting('neon.branch_id', true) AS branch_id,
             current_setting('neon.project_id', true) AS project_id
    `),
    db.execute(sql`
      SELECT count(*)::int AS recorded_count, max(created_at)::text AS latest_created_at
      FROM drizzle.__drizzle_migrations
    `),
    db.execute(sql`
      SELECT
        coalesce((
          SELECT is_nullable = 'YES' FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'skill_events' AND column_name = 'session_id'
        ), false) AS session_id_nullable,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'skill_events'
            AND column_name = 'source_audit_log_id'
        ) AS has_source_column,
        to_regclass('public.skill_events_source_skill_action_uidx') IS NOT NULL AS has_unique_index
    `),
  ])
  const identity = identityResult.rows[0] as Record<string, unknown>
  const migrations = migrationResult.rows[0] as Record<string, unknown>
  const schema = schemaResult.rows[0] as Record<string, unknown>
  return {
    actualProjectId: typeof identity.project_id === 'string' ? identity.project_id : null,
    actualBranchId: typeof identity.branch_id === 'string' ? identity.branch_id : null,
    migrationCount: count(migrations.recorded_count),
    latestMigrationTimestamp: typeof migrations.latest_created_at === 'string'
      ? migrations.latest_created_at
      : null,
    schemaReady: schema.session_id_nullable === true &&
      schema.has_source_column === true && schema.has_unique_index === true,
  }
}

async function inspectCandidates(db: ReturnType<typeof drizzle>, from: Date, to: Date) {
  const result = await db.execute(sql`
    WITH ${candidateCtes(from, to)}
    SELECT
      (SELECT count(*)::int FROM target_audits) AS target_audit_rows,
      (SELECT count(*)::int FROM candidate_rows) AS candidate_rows,
      (SELECT count(*)::int FROM eligible_rows) AS eligible_rows,
      (SELECT count(*)::int FROM candidate_rows candidates
        WHERE NOT EXISTS (
          SELECT 1 FROM eligible_rows eligible
          WHERE eligible.source_audit_log_id = candidates.source_audit_log_id
            AND eligible.skill_id IS NOT DISTINCT FROM candidates.skill_id
            AND eligible.action = candidates.action
        )) AS unmatched_rows,
      (SELECT count(*)::int FROM target_audits audits
        WHERE NOT EXISTS (
          SELECT 1 FROM candidate_rows candidates
          WHERE candidates.source_audit_log_id = audits.source_audit_log_id
        )) AS unresolved_audit_rows,
      (SELECT count(*)::int FROM existing_rows) AS already_backfilled_rows,
      (SELECT count(*)::int FROM eligible_rows) -
        (SELECT count(*)::int FROM existing_rows) AS requested_insert_rows,
      (SELECT count(*)::int FROM candidate_rows_raw) -
        (SELECT count(*)::int FROM candidate_rows) AS duplicate_candidate_rows
  `)
  const row = result.rows[0] as Record<string, unknown>
  return {
    targetAuditRows: count(row.target_audit_rows),
    candidateRows: count(row.candidate_rows),
    eligibleRows: count(row.eligible_rows),
    unmatchedRows: count(row.unmatched_rows),
    unresolvedAuditRows: count(row.unresolved_audit_rows),
    alreadyBackfilledRows: count(row.already_backfilled_rows),
    requestedInsertRows: count(row.requested_insert_rows),
    duplicateCandidateRows: count(row.duplicate_candidate_rows),
  }
}

async function insertCandidates(db: ReturnType<typeof drizzle>, from: Date, to: Date): Promise<number> {
  const result = await db.execute(sql`
    WITH ${candidateCtes(from, to)},
    inserted AS (
      INSERT INTO skill_events (
        id, session_id, source_audit_log_id, user_id, skill_id,
        action, query, rank, score, created_at
      )
      SELECT
        gen_random_uuid()::text,
        NULL,
        eligible.source_audit_log_id,
        eligible.user_id,
        eligible.skill_id,
        eligible.action::skill_event_action,
        eligible.query,
        eligible.rank,
        eligible.score,
        eligible.created_at
      FROM eligible_rows eligible
      ON CONFLICT (source_audit_log_id, skill_id, action)
        WHERE source_audit_log_id IS NOT NULL
        DO NOTHING
      RETURNING id
    )
    SELECT count(*)::int AS inserted_rows FROM inserted
  `)
  return count(result.rows[0]?.inserted_rows)
}

function assertSafe(stage: string, errors: string[]): void {
  if (errors.length > 0) throw new Error(`${stage} blocked:\n- ${errors.join('\n- ')}`)
}

async function main(): Promise<void> {
  loadEnvFile(argument('--env-file'))
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is not set')
  const target = new URL(databaseUrl)
  if (['localhost', '127.0.0.1', '::1'].includes(target.hostname)) {
    throw new Error('this guarded backfill accepts Neon branches only')
  }

  const from = utcArgument('--from-utc')
  const to = utcArgument('--to-utc', new Date())
  if (from >= to) throw new Error('--from-utc must be earlier than --to-utc')

  const production = process.argv.includes('--production')
  const expectedProjectId = requiredArgument('--expected-project-id')
  const productionBranchId = requiredArgument('--production-branch-id')
  const expectedBranchId = production ? productionBranchId : requiredArgument('--expected-branch-id')
  const recoveryBranchId = production ? requiredArgument('--recovery-branch-id') : undefined
  const apply = process.argv.includes('--apply')
  if (production && apply && argument('--confirm-production-backfill') !== PRODUCTION_CONFIRMATION) {
    throw new Error(`production apply requires --confirm-production-backfill ${PRODUCTION_CONFIRMATION}`)
  }

  const db = drizzle(neon(databaseUrl))
  const [identity, metrics] = await Promise.all([
    inspectIdentityAndSchema(db),
    inspectCandidates(db, from, to),
  ])
  const state: SessionlessSkillEventsBackfillState = {
    ...identity,
    expectedProjectId,
    expectedBranchId,
    productionBranchId,
    recoveryBranchId,
    ...metrics,
    acknowledgedUnmatchedRows: integerArgument('--acknowledge-unmatched'),
    acknowledgedUnresolvedAuditRows: integerArgument('--acknowledge-unresolved'),
  }

  console.log(
    `AX 0032 sessionless backfill dry-run: branch=${state.actualBranchId ?? 'unknown'}, ` +
      `window=${from.toISOString()}..${to.toISOString()}, targetAudits=${state.targetAuditRows}, ` +
      `candidates=${state.candidateRows}, eligible=${state.eligibleRows}, ` +
      `alreadyBackfilled=${state.alreadyBackfilledRows}, toInsert=${state.requestedInsertRows}, ` +
      `unmatched=${state.unmatchedRows}, unresolvedAudits=${state.unresolvedAuditRows}, ` +
      `deduplicated=${metrics.duplicateCandidateRows}`
  )
  assertSafe('AX 0032 backfill preflight', validateSessionlessSkillEventsBackfill(state, production))
  if (!apply) {
    console.log('Dry run only. No skill_events rows were written.')
    return
  }

  const insertedRows = await insertCandidates(db, from, to)
  if (insertedRows !== state.requestedInsertRows) {
    throw new Error(
      `backfill verification failed: expected ${state.requestedInsertRows} inserts, got ${insertedRows}`
    )
  }
  const after = await inspectCandidates(db, from, to)
  if (after.requestedInsertRows !== 0 ||
    after.alreadyBackfilledRows !== state.eligibleRows) {
    throw new Error('backfill verification failed: eligible rows are not fully source-linked')
  }
  console.log(`AX 0032 backfill applied and verified: inserted=${insertedRows}, remaining=0`)
}

main().catch((error) => {
  const raw = error instanceof Error ? error.message : 'unknown error'
  const safe = raw
    .replace(process.env.DATABASE_URL ?? '__no_database_url__', '[redacted database URL]')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted database URL]')
  console.error(safe)
  process.exitCode = 1
})
