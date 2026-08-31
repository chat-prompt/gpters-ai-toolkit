/** Guarded AX 0033 skill-journey migration runner for Neon. */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'
import { sql } from 'drizzle-orm'
import {
  type SkillJourneyMigrationState,
  validateSkillJourneyAfterMigration,
  validateSkillJourneyBeforeMigration,
} from '../src/migration/skill-journey-guard'

const PRODUCTION_CONFIRMATION = 'apply-ax-0033'

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

async function inspect(
  db: ReturnType<typeof drizzle>,
  expectedProjectId: string,
  expectedBranchId: string,
  productionBranchId: string,
  recoveryBranchId?: string,
  expectedSkillEventRows?: number,
  expectedExecutionAttemptRows?: number,
): Promise<SkillJourneyMigrationState> {
  const [identityResult, migrationResult, schemaResult, skillRows, attemptRows] = await Promise.all([
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
        (
          to_regclass('public.skill_events') IS NOT NULL AND
          to_regclass('public.ax_skill_execution_attempts') IS NOT NULL
        ) AS has_baseline_tables,
        coalesce((
          SELECT is_nullable = 'YES'
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'ax_skill_execution_attempts'
            AND column_name = 'session_id'
        ), false) AS execution_session_nullable,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'skill_events' AND column_name = 'journey_id'
        ) AS has_skill_event_journey_column,
        to_regclass('public.skill_events_journey_idx') IS NOT NULL AS has_skill_event_journey_index,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'ax_skill_execution_attempts'
            AND column_name = 'journey_id'
        ) AS has_execution_journey_column,
        to_regclass('public.ax_skill_execution_attempts_journey_idx') IS NOT NULL
          AS has_execution_journey_index
    `),
    db.execute(sql`SELECT count(*)::int AS count FROM skill_events`),
    db.execute(sql`SELECT count(*)::int AS count FROM ax_skill_execution_attempts`),
  ])

  const identity = identityResult.rows[0] as Record<string, unknown>
  const migrations = migrationResult.rows[0] as Record<string, unknown>
  const schema = schemaResult.rows[0] as Record<string, unknown>
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
    hasBaselineTables: schema.has_baseline_tables === true,
    executionSessionNullable: schema.execution_session_nullable === true,
    hasSkillEventJourneyColumn: schema.has_skill_event_journey_column === true,
    hasSkillEventJourneyIndex: schema.has_skill_event_journey_index === true,
    hasExecutionJourneyColumn: schema.has_execution_journey_column === true,
    hasExecutionJourneyIndex: schema.has_execution_journey_index === true,
    skillEventRows: count(skillRows.rows[0]?.count),
    executionAttemptRows: count(attemptRows.rows[0]?.count),
    expectedSkillEventRows,
    expectedExecutionAttemptRows,
  }
}

function assertSafe(stage: string, errors: string[]): void {
  if (errors.length > 0) throw new Error(`${stage} blocked:\n- ${errors.join('\n- ')}`)
}

function summary(label: string, state: SkillJourneyMigrationState): void {
  console.log(
    `${label}: branch=${state.actualBranchId ?? 'unknown'}, migrations=${state.migrationCount}, ` +
      `skillEvents=${state.skillEventRows}, attempts=${state.executionAttemptRows}, ` +
      `nullableExecutionSession=${state.executionSessionNullable}`
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
  const recoveryBranchId = production ? requiredArgument('--recovery-branch-id') : undefined
  const apply = process.argv.includes('--apply')
  if (production && apply && argument('--confirm-production-migration') !== PRODUCTION_CONFIRMATION) {
    throw new Error(`production apply requires --confirm-production-migration ${PRODUCTION_CONFIRMATION}`)
  }

  const db = drizzle(neon(databaseUrl))
  const before = await inspect(db, expectedProjectId, expectedBranchId, productionBranchId, recoveryBranchId)
  summary('AX 0033 preflight', before)
  assertSafe('AX 0033 preflight', validateSkillJourneyBeforeMigration(before, production))
  if (!apply) {
    console.log(production
      ? `Ready. Re-run with --apply --confirm-production-migration ${PRODUCTION_CONFIRMATION}.`
      : 'Ready. Re-run the same command with --apply to execute migration 0033.')
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
    before.skillEventRows,
    before.executionAttemptRows,
  )
  summary('AX 0033 verification', after)
  assertSafe('AX 0033 verification', validateSkillJourneyAfterMigration(after, production))
  console.log('AX 0033 sessionless skill journey migration applied and verified.')
}

main().catch((error) => {
  const raw = error instanceof Error ? error.message : 'unknown error'
  const safe = raw
    .replace(process.env.DATABASE_URL ?? '__no_database_url__', '[redacted database URL]')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted database URL]')
  console.error(safe)
  process.exitCode = 1
})
