import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FIRST_PERCENT_BASELINE_COUNT,
  FIRST_PERCENT_BASELINE_TIMESTAMP,
  FIRST_PERCENT_MIGRATION_TIMESTAMP,
  type FirstPercentMigrationState,
  validateFirstPercentAfterMigration,
  validateFirstPercentBeforeMigration,
} from '../src/migration/limit-window-first-percent-guard'

function baseline(production = false): FirstPercentMigrationState {
  return {
    actualProjectId: 'project-test',
    actualBranchId: production ? 'branch-production' : 'branch-child',
    expectedProjectId: 'project-test',
    expectedBranchId: production ? 'branch-production' : 'branch-child',
    productionBranchId: 'branch-production',
    recoveryBranchId: production ? 'branch-recovery' : undefined,
    migrationCount: FIRST_PERCENT_BASELINE_COUNT,
    latestMigrationTimestamp: FIRST_PERCENT_BASELINE_TIMESTAMP,
    usageColumnType: null,
    accountColumnType: null,
    windowCount: 12,
  }
}

function applied(production = false): FirstPercentMigrationState {
  const state = baseline(production)
  state.migrationCount = FIRST_PERCENT_BASELINE_COUNT + 1
  state.latestMigrationTimestamp = FIRST_PERCENT_MIGRATION_TIMESTAMP
  state.usageColumnType = 'numeric'
  state.accountColumnType = 'numeric'
  state.expectedWindowCount = state.windowCount
  return state
}

test('accepts the exact 0047 child and production baselines', () => {
  assert.deepEqual(validateFirstPercentBeforeMigration(baseline(), false), [])
  assert.deepEqual(validateFirstPercentBeforeMigration(baseline(true), true), [])
})

test('rejects a database that has not reached the 0047 baseline', () => {
  const input = baseline()
  input.migrationCount = FIRST_PERCENT_BASELINE_COUNT - 1
  input.latestMigrationTimestamp = '1793000000000'
  const errors = validateFirstPercentBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('recorded migrations before apply')))
  assert.ok(errors.some((error) => error.includes('0047 baseline')))
})

test('refuses to run the child migration against the production branch', () => {
  const input = baseline()
  input.expectedBranchId = input.productionBranchId
  input.actualBranchId = input.productionBranchId
  assert.ok(validateFirstPercentBeforeMigration(input, false).some((error) => error.includes('refusing to run the child migration')))
})

test('requires a distinct recovery branch in production mode', () => {
  const missing = baseline(true)
  missing.recoveryBranchId = undefined
  assert.ok(validateFirstPercentBeforeMigration(missing, true).some((error) => error.includes('recovery branch ID is required')))
  const same = baseline(true)
  same.recoveryBranchId = same.productionBranchId
  assert.ok(validateFirstPercentBeforeMigration(same, true).some((error) => error.includes('recovery branch ID must differ')))
})

test('refuses to re-apply when either column already exists', () => {
  for (const key of ['usageColumnType', 'accountColumnType'] as const) {
    const input = baseline()
    input[key] = 'numeric'
    assert.ok(validateFirstPercentBeforeMigration(input, false).some((error) => error.includes('already exists')))
  }
})

test('accepts a clean apply, including live reports that land before verification', () => {
  assert.deepEqual(validateFirstPercentAfterMigration(applied(), false), [])
  const live = applied(true)
  live.windowCount += 1
  assert.deepEqual(validateFirstPercentAfterMigration(live, true), [])
})

test('rejects a missing or wrong column type, or lost window rows', () => {
  const input = applied()
  input.usageColumnType = 'text'
  input.accountColumnType = null
  input.windowCount -= 1
  const errors = validateFirstPercentAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('ax_usage_limit_windows.first_used_percent is missing or not numeric')))
  assert.ok(errors.some((error) => error.includes('ax_account_limit_windows.first_used_percent is missing or not numeric')))
  assert.ok(errors.some((error) => error.includes('row count decreased')))
})

test('requires the pre-migration window count for verification', () => {
  const input = applied()
  input.expectedWindowCount = undefined
  assert.ok(validateFirstPercentAfterMigration(input, false).some((error) => error.includes('pre-migration limit window count')))
})
