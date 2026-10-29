import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CLIENT_USAGE_ACCOUNT_KEY_BASELINE_COUNT,
  CLIENT_USAGE_ACCOUNT_KEY_BASELINE_TIMESTAMP,
  CLIENT_USAGE_ACCOUNT_KEY_MIGRATION_TIMESTAMP,
  type ClientUsageAccountKeyMigrationState,
  validateClientUsageAccountKeyAfterMigration,
  validateClientUsageAccountKeyBeforeMigration,
} from '../src/migration/client-usage-account-key-guard'

function baseline(production = false): ClientUsageAccountKeyMigrationState {
  return {
    actualProjectId: 'project-test',
    actualBranchId: production ? 'branch-production' : 'branch-child',
    expectedProjectId: 'project-test',
    expectedBranchId: production ? 'branch-production' : 'branch-child',
    productionBranchId: 'branch-production',
    recoveryBranchId: production ? 'branch-recovery' : undefined,
    migrationCount: CLIENT_USAGE_ACCOUNT_KEY_BASELINE_COUNT,
    latestMigrationTimestamp: CLIENT_USAGE_ACCOUNT_KEY_BASELINE_TIMESTAMP,
    columnType: null,
    hasCheck: false,
    rowCount: 12,
  }
}

function applied(production = false): ClientUsageAccountKeyMigrationState {
  const state = baseline(production)
  state.migrationCount = CLIENT_USAGE_ACCOUNT_KEY_BASELINE_COUNT + 1
  state.latestMigrationTimestamp = CLIENT_USAGE_ACCOUNT_KEY_MIGRATION_TIMESTAMP
  state.columnType = 'text'
  state.hasCheck = true
  state.expectedRowCount = state.rowCount
  return state
}

test('accepts the exact 0048 child and production baselines', () => {
  assert.deepEqual(validateClientUsageAccountKeyBeforeMigration(baseline(), false), [])
  assert.deepEqual(validateClientUsageAccountKeyBeforeMigration(baseline(true), true), [])
})

test('rejects a database that has not reached the 0048 baseline', () => {
  const input = baseline()
  input.migrationCount = CLIENT_USAGE_ACCOUNT_KEY_BASELINE_COUNT - 1
  input.latestMigrationTimestamp = '1793600000000'
  const errors = validateClientUsageAccountKeyBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('recorded migrations before apply')))
  assert.ok(errors.some((error) => error.includes('0048 baseline')))
})

test('refuses to run the child migration against the production branch', () => {
  const input = baseline()
  input.expectedBranchId = input.productionBranchId
  input.actualBranchId = input.productionBranchId
  assert.ok(validateClientUsageAccountKeyBeforeMigration(input, false).some((error) => error.includes('refusing to run the child migration')))
})

test('requires a distinct recovery branch in production mode', () => {
  const missing = baseline(true)
  missing.recoveryBranchId = undefined
  assert.ok(validateClientUsageAccountKeyBeforeMigration(missing, true).some((error) => error.includes('recovery branch ID is required')))
  const same = baseline(true)
  same.recoveryBranchId = same.productionBranchId
  assert.ok(validateClientUsageAccountKeyBeforeMigration(same, true).some((error) => error.includes('recovery branch ID must differ')))
})

test('refuses to re-apply when the column or check already exists', () => {
  const column = baseline()
  column.columnType = 'text'
  assert.ok(validateClientUsageAccountKeyBeforeMigration(column, false).some((error) => error.includes('account_key already exists')))
  const check = baseline()
  check.hasCheck = true
  assert.ok(validateClientUsageAccountKeyBeforeMigration(check, false).some((error) => error.includes('check already exists')))
})

test('accepts a clean apply, including live reports that land before verification', () => {
  assert.deepEqual(validateClientUsageAccountKeyAfterMigration(applied(), false), [])
  const live = applied(true)
  live.rowCount += 1
  assert.deepEqual(validateClientUsageAccountKeyAfterMigration(live, true), [])
})

test('rejects a missing or wrong column, a missing check, or lost usage rows', () => {
  const input = applied()
  input.columnType = 'integer'
  input.hasCheck = false
  input.rowCount -= 1
  const errors = validateClientUsageAccountKeyAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('account_key is missing or not text')))
  assert.ok(errors.some((error) => error.includes('check is missing')))
  assert.ok(errors.some((error) => error.includes('row count decreased')))
})

test('requires the pre-migration row count for verification', () => {
  const input = applied()
  input.expectedRowCount = undefined
  assert.ok(validateClientUsageAccountKeyAfterMigration(input, false).some((error) => error.includes('pre-migration client usage row count')))
})
