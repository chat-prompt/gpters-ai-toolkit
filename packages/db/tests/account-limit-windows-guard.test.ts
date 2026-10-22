import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACCOUNT_LIMIT_WINDOWS_BASELINE_COUNT,
  ACCOUNT_LIMIT_WINDOWS_BASELINE_TIMESTAMP,
  ACCOUNT_LIMIT_WINDOWS_MIGRATION_TIMESTAMP,
  type AccountLimitWindowsMigrationState,
  validateAccountLimitWindowsAfterMigration,
  validateAccountLimitWindowsBeforeMigration,
} from '../src/migration/account-limit-windows-guard'

function baseline(production = false): AccountLimitWindowsMigrationState {
  return {
    actualProjectId: 'project-test',
    actualBranchId: production ? 'branch-production' : 'branch-child',
    expectedProjectId: 'project-test',
    expectedBranchId: production ? 'branch-production' : 'branch-child',
    productionBranchId: 'branch-production',
    recoveryBranchId: production ? 'branch-recovery' : undefined,
    migrationCount: ACCOUNT_LIMIT_WINDOWS_BASELINE_COUNT,
    latestMigrationTimestamp: ACCOUNT_LIMIT_WINDOWS_BASELINE_TIMESTAMP,
    hasTable: false,
    hasPrimaryKey: false,
    hasResetsAtIndex: false,
    hasSubscriptionAccountKey: false,
    windowCount: 0,
    subscriptionCount: 10,
  }
}

function applied(production = false): AccountLimitWindowsMigrationState {
  const state = baseline(production)
  state.migrationCount = ACCOUNT_LIMIT_WINDOWS_BASELINE_COUNT + 1
  state.latestMigrationTimestamp = ACCOUNT_LIMIT_WINDOWS_MIGRATION_TIMESTAMP
  state.hasTable = true
  state.hasPrimaryKey = true
  state.hasResetsAtIndex = true
  state.hasSubscriptionAccountKey = true
  state.expectedSubscriptionCount = state.subscriptionCount
  return state
}

test('accepts the exact 0046 child and production baselines', () => {
  assert.deepEqual(validateAccountLimitWindowsBeforeMigration(baseline(), false), [])
  assert.deepEqual(validateAccountLimitWindowsBeforeMigration(baseline(true), true), [])
})

test('rejects a database that has not reached the 0046 baseline', () => {
  const input = baseline()
  input.migrationCount = ACCOUNT_LIMIT_WINDOWS_BASELINE_COUNT - 1
  input.latestMigrationTimestamp = '1792400000000'
  const errors = validateAccountLimitWindowsBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('recorded migrations before apply')))
  assert.ok(errors.some((error) => error.includes('0046 baseline')))
})

test('refuses to run the child migration against the production branch', () => {
  const input = baseline()
  input.expectedBranchId = input.productionBranchId
  input.actualBranchId = input.productionBranchId
  assert.ok(validateAccountLimitWindowsBeforeMigration(input, false).some((error) => error.includes('refusing to run the child migration')))
})

test('requires a distinct recovery branch in production mode', () => {
  const missing = baseline(true)
  missing.recoveryBranchId = undefined
  assert.ok(validateAccountLimitWindowsBeforeMigration(missing, true).some((error) => error.includes('recovery branch ID is required')))
  const same = baseline(true)
  same.recoveryBranchId = same.productionBranchId
  assert.ok(validateAccountLimitWindowsBeforeMigration(same, true).some((error) => error.includes('recovery branch ID must differ')))
})

test('refuses to re-apply when the table or the column already exists', () => {
  const table = baseline()
  table.hasTable = true
  assert.ok(validateAccountLimitWindowsBeforeMigration(table, false).some((error) => error.includes('ax_account_limit_windows already exists')))
  const column = baseline()
  column.hasSubscriptionAccountKey = true
  assert.ok(validateAccountLimitWindowsBeforeMigration(column, false).some((error) => error.includes('account_key already exists')))
})

test('accepts a clean apply', () => {
  assert.deepEqual(validateAccountLimitWindowsAfterMigration(applied(), false), [])
  assert.deepEqual(validateAccountLimitWindowsAfterMigration(applied(true), true), [])
})

test('rejects a missing key, index or column, or lost subscription rows', () => {
  const input = applied()
  input.hasPrimaryKey = false
  input.hasResetsAtIndex = false
  input.hasSubscriptionAccountKey = false
  input.subscriptionCount = input.subscriptionCount - 1
  const errors = validateAccountLimitWindowsAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('primary key')))
  assert.ok(errors.some((error) => error.includes('resets_at_idx')))
  assert.ok(errors.some((error) => error.includes('account_key is missing')))
  assert.ok(errors.some((error) => error.includes('row count decreased')))
})

test('accepts live reports and syncs that land between apply and verification', () => {
  const input = applied(true)
  input.windowCount = 3
  input.subscriptionCount = input.subscriptionCount + 2
  assert.deepEqual(validateAccountLimitWindowsAfterMigration(input, true), [])
})

test('requires the pre-migration subscription count for verification', () => {
  const input = applied()
  input.expectedSubscriptionCount = undefined
  assert.ok(validateAccountLimitWindowsAfterMigration(input, false).some((error) => error.includes('pre-migration ax_subscriptions count')))
})
