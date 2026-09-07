import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CRON_RUNS_BASELINE_COUNT,
  CRON_RUNS_BASELINE_TIMESTAMP,
  CRON_RUNS_MIGRATION_TIMESTAMP,
  type CronRunsMigrationState,
  validateCronRunsAfterMigration,
  validateCronRunsBeforeMigration,
} from '../src/migration/cron-runs-guard'

function baseline(production = false): CronRunsMigrationState {
  return {
    actualProjectId: 'project-test',
    actualBranchId: production ? 'branch-production' : 'branch-child',
    expectedProjectId: 'project-test',
    expectedBranchId: production ? 'branch-production' : 'branch-child',
    productionBranchId: 'branch-production',
    recoveryBranchId: production ? 'branch-recovery' : undefined,
    migrationCount: CRON_RUNS_BASELINE_COUNT,
    latestMigrationTimestamp: CRON_RUNS_BASELINE_TIMESTAMP,
    hasCronRunsTable: false,
    hasStatusEnum: false,
    skillEventCount: 13022,
  }
}

function applied(production = false): CronRunsMigrationState {
  const state = baseline(production)
  state.migrationCount = CRON_RUNS_BASELINE_COUNT + 1
  state.latestMigrationTimestamp = CRON_RUNS_MIGRATION_TIMESTAMP
  state.hasCronRunsTable = true
  state.hasStatusEnum = true
  state.expectedSkillEventCount = state.skillEventCount
  return state
}

test('accepts the exact AX 0037 child baseline', () => {
  assert.deepEqual(validateCronRunsBeforeMigration(baseline(), false), [])
})

test('rejects a database that has not reached the AX 0037 baseline', () => {
  const input = baseline()
  input.migrationCount = CRON_RUNS_BASELINE_COUNT - 1
  input.latestMigrationTimestamp = '1788414275714'
  const errors = validateCronRunsBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('recorded migrations before apply')))
  assert.ok(errors.some((error) => error.includes('AX 0037 baseline')))
})

test('refuses to run the child migration against the production branch', () => {
  const input = baseline()
  input.expectedBranchId = input.productionBranchId
  input.actualBranchId = input.productionBranchId
  const errors = validateCronRunsBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('refusing to run the child migration')))
})

test('requires a distinct recovery branch for production', () => {
  const input = baseline(true)
  input.recoveryBranchId = input.productionBranchId
  const errors = validateCronRunsBeforeMigration(input, true)
  assert.ok(errors.some((error) => error.includes('recovery branch ID must differ')))
})

test('requires a recovery branch in production mode', () => {
  const input = baseline(true)
  input.recoveryBranchId = undefined
  const errors = validateCronRunsBeforeMigration(input, true)
  assert.ok(errors.some((error) => error.includes('recovery branch ID is required')))
})

test('refuses to re-apply when the table already exists', () => {
  const input = baseline()
  input.hasCronRunsTable = true
  const errors = validateCronRunsBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('already exists')))
})

test('accepts a verified post-migration state', () => {
  assert.deepEqual(validateCronRunsAfterMigration(applied(), false), [])
})

test('rejects a post-migration state that applied more than one migration', () => {
  const input = applied()
  input.migrationCount = CRON_RUNS_BASELINE_COUNT + 2
  const errors = validateCronRunsAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('recorded migrations after apply')))
})

test('rejects a post-migration state whose latest migration is not 0036', () => {
  const input = applied()
  input.latestMigrationTimestamp = CRON_RUNS_BASELINE_TIMESTAMP
  const errors = validateCronRunsAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('not AX 0038')))
})

test('rejects a post-migration state where the table is missing', () => {
  const input = applied()
  input.hasCronRunsTable = false
  const errors = validateCronRunsAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('missing after apply')))
})

test('rejects a post-migration state where skill events changed', () => {
  const input = applied()
  input.skillEventCount = 13021
  const errors = validateCronRunsAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('skill events changed')))
})

test('requires the pre-migration catalog count for verification', () => {
  const input = applied()
  input.expectedSkillEventCount = undefined
  const errors = validateCronRunsAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('pre-migration skill event count is required')))
})

test('enum이 안 생겼으면 잡는다 — 테이블만 보고 통과시키지 않는다', () => {
  const input = applied()
  input.hasStatusEnum = false
  const errors = validateCronRunsAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('cron_run_status enum is missing')))
})
