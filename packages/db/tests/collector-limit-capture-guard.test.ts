import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COLLECTOR_LIMIT_CAPTURE_BASELINE_COUNT,
  COLLECTOR_LIMIT_CAPTURE_BASELINE_TIMESTAMP,
  COLLECTOR_LIMIT_CAPTURE_MIGRATION_TIMESTAMP,
  type CollectorLimitCaptureMigrationState,
  validateCollectorLimitCaptureAfterMigration,
  validateCollectorLimitCaptureBeforeMigration,
} from '../src/migration/collector-limit-capture-guard'

function baseline(production = false): CollectorLimitCaptureMigrationState {
  return {
    actualProjectId: 'project-test',
    actualBranchId: production ? 'branch-production' : 'branch-child',
    expectedProjectId: 'project-test',
    expectedBranchId: production ? 'branch-production' : 'branch-child',
    productionBranchId: 'branch-production',
    recoveryBranchId: production ? 'branch-recovery' : undefined,
    migrationCount: COLLECTOR_LIMIT_CAPTURE_BASELINE_COUNT,
    latestMigrationTimestamp: COLLECTOR_LIMIT_CAPTURE_BASELINE_TIMESTAMP,
    columnType: null,
    collectorCount: 12,
  }
}

function applied(production = false): CollectorLimitCaptureMigrationState {
  const state = baseline(production)
  state.migrationCount = COLLECTOR_LIMIT_CAPTURE_BASELINE_COUNT + 1
  state.latestMigrationTimestamp = COLLECTOR_LIMIT_CAPTURE_MIGRATION_TIMESTAMP
  state.columnType = 'jsonb'
  state.expectedCollectorCount = state.collectorCount
  return state
}

test('accepts the exact 0045 child and production baselines', () => {
  assert.deepEqual(validateCollectorLimitCaptureBeforeMigration(baseline(), false), [])
  assert.deepEqual(validateCollectorLimitCaptureBeforeMigration(baseline(true), true), [])
})

test('rejects a database that has not reached the 0045 baseline', () => {
  const input = baseline()
  input.migrationCount = COLLECTOR_LIMIT_CAPTURE_BASELINE_COUNT - 1
  input.latestMigrationTimestamp = '1791800000000'
  const errors = validateCollectorLimitCaptureBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('recorded migrations before apply')))
  assert.ok(errors.some((error) => error.includes('0045 baseline')))
})

test('refuses to run the child migration against the production branch', () => {
  const input = baseline()
  input.expectedBranchId = input.productionBranchId
  input.actualBranchId = input.productionBranchId
  assert.ok(validateCollectorLimitCaptureBeforeMigration(input, false).some((error) => error.includes('refusing to run the child migration')))
})

test('requires a distinct recovery branch in production mode', () => {
  const missing = baseline(true)
  missing.recoveryBranchId = undefined
  assert.ok(validateCollectorLimitCaptureBeforeMigration(missing, true).some((error) => error.includes('recovery branch ID is required')))
  const same = baseline(true)
  same.recoveryBranchId = same.productionBranchId
  assert.ok(validateCollectorLimitCaptureBeforeMigration(same, true).some((error) => error.includes('recovery branch ID must differ')))
})

test('refuses to re-apply when the column already exists', () => {
  const input = baseline()
  input.columnType = 'jsonb'
  assert.ok(validateCollectorLimitCaptureBeforeMigration(input, false).some((error) => error.includes('already exists')))
})

test('accepts a clean apply, including live reports that land before verification', () => {
  assert.deepEqual(validateCollectorLimitCaptureAfterMigration(applied(), false), [])
  const live = applied(true)
  live.collectorCount += 1
  assert.deepEqual(validateCollectorLimitCaptureAfterMigration(live, true), [])
})

test('rejects a wrong column type or lost collector rows', () => {
  const input = applied()
  input.columnType = 'text'
  input.collectorCount -= 1
  const errors = validateCollectorLimitCaptureAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('not jsonb')))
  assert.ok(errors.some((error) => error.includes('row count decreased')))
})

test('requires the pre-migration collector count for verification', () => {
  const input = applied()
  input.expectedCollectorCount = undefined
  assert.ok(validateCollectorLimitCaptureAfterMigration(input, false).some((error) => error.includes('pre-migration ax_usage_collector_state count')))
})
