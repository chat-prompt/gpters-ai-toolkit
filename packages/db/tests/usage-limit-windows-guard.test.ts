import assert from 'node:assert/strict'
import test from 'node:test'
import {
  USAGE_LIMIT_WINDOWS_BASELINE_COUNT,
  USAGE_LIMIT_WINDOWS_BASELINE_TIMESTAMP,
  USAGE_LIMIT_WINDOWS_MIGRATION_TIMESTAMP,
  type UsageLimitWindowsMigrationState,
  validateUsageLimitWindowsAfterMigration,
  validateUsageLimitWindowsBeforeMigration,
} from '../src/migration/usage-limit-windows-guard'

function baseline(production = false): UsageLimitWindowsMigrationState {
  return {
    actualProjectId: 'project-test',
    actualBranchId: production ? 'branch-production' : 'branch-child',
    expectedProjectId: 'project-test',
    expectedBranchId: production ? 'branch-production' : 'branch-child',
    productionBranchId: 'branch-production',
    recoveryBranchId: production ? 'branch-recovery' : undefined,
    migrationCount: USAGE_LIMIT_WINDOWS_BASELINE_COUNT,
    latestMigrationTimestamp: USAGE_LIMIT_WINDOWS_BASELINE_TIMESTAMP,
    hasTable: false,
    hasPrimaryKey: false,
    hasResetsAtIndex: false,
    windowCount: 0,
    usageCount: 10,
  }
}

function applied(production = false): UsageLimitWindowsMigrationState {
  const state = baseline(production)
  state.migrationCount = USAGE_LIMIT_WINDOWS_BASELINE_COUNT + 1
  state.latestMigrationTimestamp = USAGE_LIMIT_WINDOWS_MIGRATION_TIMESTAMP
  state.hasTable = true
  state.hasPrimaryKey = true
  state.hasResetsAtIndex = true
  state.expectedUsageCount = state.usageCount
  return state
}

test('accepts the exact 0044 child and production baselines', () => {
  assert.deepEqual(validateUsageLimitWindowsBeforeMigration(baseline(), false), [])
  assert.deepEqual(validateUsageLimitWindowsBeforeMigration(baseline(true), true), [])
})

test('rejects a database that has not reached the 0044 baseline', () => {
  const input = baseline()
  input.migrationCount = USAGE_LIMIT_WINDOWS_BASELINE_COUNT - 1
  input.latestMigrationTimestamp = '1790036000000'
  const errors = validateUsageLimitWindowsBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('recorded migrations before apply')))
  assert.ok(errors.some((error) => error.includes('0044 baseline')))
})

test('refuses to run the child migration against the production branch', () => {
  const input = baseline()
  input.expectedBranchId = input.productionBranchId
  input.actualBranchId = input.productionBranchId
  assert.ok(validateUsageLimitWindowsBeforeMigration(input, false).some((error) => error.includes('refusing to run the child migration')))
})

test('requires a distinct recovery branch in production mode', () => {
  const missing = baseline(true)
  missing.recoveryBranchId = undefined
  assert.ok(validateUsageLimitWindowsBeforeMigration(missing, true).some((error) => error.includes('recovery branch ID is required')))
  const same = baseline(true)
  same.recoveryBranchId = same.productionBranchId
  assert.ok(validateUsageLimitWindowsBeforeMigration(same, true).some((error) => error.includes('recovery branch ID must differ')))
})

test('refuses to re-apply when the table already exists', () => {
  const input = baseline()
  input.hasTable = true
  assert.ok(validateUsageLimitWindowsBeforeMigration(input, false).some((error) => error.includes('already exists')))
})

test('accepts a clean apply', () => {
  assert.deepEqual(validateUsageLimitWindowsAfterMigration(applied(), false), [])
  assert.deepEqual(validateUsageLimitWindowsAfterMigration(applied(true), true), [])
})

test('rejects a missing key or index, or lost usage rows', () => {
  const input = applied()
  input.hasPrimaryKey = false
  input.hasResetsAtIndex = false
  input.usageCount = input.usageCount - 1
  const errors = validateUsageLimitWindowsAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('primary key')))
  assert.ok(errors.some((error) => error.includes('resets_at_idx')))
  assert.ok(errors.some((error) => error.includes('row count decreased')))
})

test('accepts live usage reports that land between apply and verification', () => {
  const input = applied(true)
  input.windowCount = 3
  input.usageCount = input.usageCount + 2
  assert.deepEqual(validateUsageLimitWindowsAfterMigration(input, true), [])
})

test('requires the pre-migration usage count for verification', () => {
  const input = applied()
  input.expectedUsageCount = undefined
  assert.ok(validateUsageLimitWindowsAfterMigration(input, false).some((error) => error.includes('pre-migration ax_client_usage count')))
})
