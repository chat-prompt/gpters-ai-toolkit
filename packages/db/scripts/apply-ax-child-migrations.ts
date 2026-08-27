/**
 * Guarded AX 0026-0030 migration runner for a Neon child or production branch.
 *
 * Child mode refuses production. Production mode requires the exact production
 * identity, a distinct recovery branch ID and an explicit confirmation phrase.
 * Both modes validate the exact 0025 baseline and zero-loss 0028 impact.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'
import { sql } from 'drizzle-orm'
import {
  type AxChildMigrationGuardInput,
  type AxMigrationImpact,
  type AxMigrationObjectState,
  type AxProductionMigrationGuardInput,
  validateAxChildAfterMigration,
  validateAxChildBeforeMigration,
  validateAxProductionAfterMigration,
  validateAxProductionBeforeMigration,
} from '../src/migration/ax-child-guard'

const PRODUCTION_CONFIRMATION = 'apply-ax-0026-0030'

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

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

async function inspectTarget(
  db: ReturnType<typeof drizzle>,
  expectedProjectId: string,
  expectedBranchId: string,
  productionBranchId: string,
): Promise<AxChildMigrationGuardInput> {
  const [identityResult, objectResult, migrationResult, impactResult] = await Promise.all([
    db.execute(sql`
      SELECT
        current_setting('neon.branch_id', true) AS branch_id,
        current_setting('neon.project_id', true) AS project_id
    `),
    db.execute(sql`
      SELECT
        to_regclass('public.ax_usage_collector_state') IS NOT NULL AS has_collector_state,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'account_status'
        ) AS has_account_status,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'org_memberships' AND column_name = 'status'
        ) AS has_membership_status,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'ax_client_usage' AND column_name = 'user_id'
        ) AS has_usage_user_id,
        to_regclass('public.ax_skill_execution_attempts') IS NOT NULL AS has_execution_attempts,
        to_regclass('public.ax_skill_execution_events') IS NOT NULL AS has_execution_events
    `),
    db.execute(sql`
      SELECT count(*)::int AS recorded_count, max(created_at)::text AS latest_created_at
      FROM drizzle.__drizzle_migrations
    `),
    db.execute(sql`
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
        SELECT usage.id, usage.client, usage.period_start, matches.user_id, matches.match_count
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
    `),
  ])

  const identity = identityResult.rows[0] as Record<string, unknown>
  const objects = objectResult.rows[0] as Record<string, unknown>
  const migrations = migrationResult.rows[0] as Record<string, unknown>
  const impact = impactResult.rows[0] as Record<string, unknown>

  return {
    actualProjectId: typeof identity.project_id === 'string' ? identity.project_id : null,
    actualBranchId: typeof identity.branch_id === 'string' ? identity.branch_id : null,
    expectedProjectId,
    expectedBranchId,
    productionBranchId,
    migrationCount: numberValue(migrations.recorded_count),
    latestMigrationTimestamp:
      typeof migrations.latest_created_at === 'string' ? migrations.latest_created_at : null,
    objects: {
      hasCollectorState: objects.has_collector_state === true,
      hasAccountStatus: objects.has_account_status === true,
      hasMembershipStatus: objects.has_membership_status === true,
      hasUsageUserId: objects.has_usage_user_id === true,
      hasExecutionAttempts: objects.has_execution_attempts === true,
      hasExecutionEvents: objects.has_execution_events === true,
    } satisfies AxMigrationObjectState,
    impact: {
      usageRows: numberValue(impact.usage_rows),
      uniquelyMatchedRows: numberValue(impact.uniquely_matched_rows),
      ambiguousRows: numberValue(impact.ambiguous_rows),
      unmatchedRows: numberValue(impact.unmatched_rows),
      duplicateGroups: numberValue(impact.duplicate_groups),
      rowsDeletedByDedupe: numberValue(impact.rows_deleted_by_dedupe),
    } satisfies AxMigrationImpact,
  }
}

function printSafeSummary(label: string, state: AxChildMigrationGuardInput): void {
  console.log(
    `${label}: branch=${state.actualBranchId ?? 'unknown'}, migrations=${state.migrationCount}, ` +
      `usage=${state.impact.usageRows}, ambiguous=${state.impact.ambiguousRows}, ` +
      `unmatched=${state.impact.unmatchedRows}, deletions=${state.impact.rowsDeletedByDedupe}`
  )
}

function assertNoErrors(stage: string, errors: string[]): void {
  if (errors.length > 0) throw new Error(`${stage} blocked:\n- ${errors.join('\n- ')}`)
}

async function main(): Promise<void> {
  loadEnvFile(argument('--env-file'))
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is not set')

  const target = new URL(databaseUrl)
  if (['localhost', '127.0.0.1', '::1'].includes(target.hostname)) {
    throw new Error('this runner only accepts an explicitly identified Neon child branch')
  }

  const expectedProjectId = requiredArgument('--expected-project-id')
  const productionBranchId = requiredArgument('--production-branch-id')
  const isProduction = process.argv.includes('--production')
  const expectedBranchId = isProduction
    ? productionBranchId
    : requiredArgument('--expected-branch-id')
  const recoveryBranchId = isProduction ? requiredArgument('--recovery-branch-id') : undefined
  const shouldApply = process.argv.includes('--apply')

  if (
    isProduction &&
    shouldApply &&
    argument('--confirm-production-migration') !== PRODUCTION_CONFIRMATION
  ) {
    throw new Error(
      `production apply requires --confirm-production-migration ${PRODUCTION_CONFIRMATION}`
    )
  }

  const db = drizzle(neon(databaseUrl))
  const before = await inspectTarget(db, expectedProjectId, expectedBranchId, productionBranchId)
  const productionBefore = isProduction
    ? ({ ...before, recoveryBranchId: recoveryBranchId! } satisfies AxProductionMigrationGuardInput)
    : null
  const beforeLabel = isProduction ? 'AX production preflight' : 'AX child preflight'
  printSafeSummary(beforeLabel, before)
  assertNoErrors(
    beforeLabel,
    productionBefore
      ? validateAxProductionBeforeMigration(productionBefore)
      : validateAxChildBeforeMigration(before)
  )

  if (!shouldApply) {
    console.log(
      isProduction
        ? `Ready. Re-run with --apply --confirm-production-migration ${PRODUCTION_CONFIRMATION}.`
        : 'Ready. Re-run the same command with --apply to execute migrations 0026-0030.'
    )
    return
  }

  const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))
  await migrate(db, { migrationsFolder })

  const after = await inspectTarget(db, expectedProjectId, expectedBranchId, productionBranchId)
  const productionAfter = isProduction
    ? ({ ...after, recoveryBranchId: recoveryBranchId! } satisfies AxProductionMigrationGuardInput)
    : null
  const afterLabel = isProduction ? 'AX production verification' : 'AX child verification'
  printSafeSummary(afterLabel, after)
  assertNoErrors(
    afterLabel,
    productionAfter
      ? validateAxProductionAfterMigration(productionAfter)
      : validateAxChildAfterMigration(after)
  )
  console.log(
    `AX ${isProduction ? 'production' : 'child'} migrations 0026-0030 applied and verified.`
  )
}

main().catch((error) => {
  const raw = error instanceof Error ? error.message : 'unknown error'
  const safe = raw
    .replace(process.env.DATABASE_URL ?? '__no_database_url__', '[redacted database URL]')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted database URL]')
  console.error(safe)
  process.exitCode = 1
})
