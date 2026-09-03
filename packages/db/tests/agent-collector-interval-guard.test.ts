import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COLLECTOR_INTERVAL_BASELINE_COUNT,
  COLLECTOR_INTERVAL_BASELINE_TIMESTAMP,
  COLLECTOR_INTERVAL_MIGRATION_TIMESTAMP,
  type CollectorIntervalMigrationState,
  validateCollectorIntervalAfterMigration,
  validateCollectorIntervalBeforeMigration,
} from '../src/migration/agent-collector-interval-guard'

function baseline(production = false): CollectorIntervalMigrationState {
  return {
    actualProjectId: 'project-test',
    actualBranchId: production ? 'branch-production' : 'branch-child',
    expectedProjectId: 'project-test',
    expectedBranchId: production ? 'branch-production' : 'branch-child',
    productionBranchId: 'branch-production',
    recoveryBranchId: production ? 'branch-recovery' : undefined,
    migrationCount: COLLECTOR_INTERVAL_BASELINE_COUNT,
    latestMigrationTimestamp: COLLECTOR_INTERVAL_BASELINE_TIMESTAMP,
    hasCollectorTable: true,
    columnDefault: '21600',
    intervalHistogram: [{ intervalSeconds: 3600, count: 2 }],
  }
}

function applied(production = false): CollectorIntervalMigrationState {
  const state = baseline(production)
  state.migrationCount = COLLECTOR_INTERVAL_BASELINE_COUNT + 1
  state.latestMigrationTimestamp = COLLECTOR_INTERVAL_MIGRATION_TIMESTAMP
  state.columnDefault = '3600'
  state.expectedIntervalHistogram = [{ intervalSeconds: 3600, count: 2 }]
  return state
}

test('accepts the exact AX 0033 child baseline', () => {
  assert.deepEqual(validateCollectorIntervalBeforeMigration(baseline(), false), [])
})

test('rejects a database that has not reached the AX 0033 baseline', () => {
  const input = baseline()
  input.migrationCount = COLLECTOR_INTERVAL_BASELINE_COUNT - 1
  input.latestMigrationTimestamp = '1788138000000'
  const errors = validateCollectorIntervalBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('recorded migrations before apply')))
  assert.ok(errors.some((error) => error.includes('AX 0033 baseline')))
})

test('refuses to run the child migration against the production branch', () => {
  const input = baseline()
  input.expectedBranchId = input.productionBranchId
  input.actualBranchId = input.productionBranchId
  const errors = validateCollectorIntervalBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('refusing to run the child migration')))
})

test('requires a distinct recovery branch for production', () => {
  const input = baseline(true)
  input.recoveryBranchId = input.productionBranchId
  const errors = validateCollectorIntervalBeforeMigration(input, true)
  assert.ok(errors.some((error) => error.includes('recovery branch ID must differ')))
})

test('requires a recovery branch in production mode', () => {
  const input = baseline(true)
  input.recoveryBranchId = undefined
  const errors = validateCollectorIntervalBeforeMigration(input, true)
  assert.ok(errors.some((error) => error.includes('recovery branch ID is required')))
})

test('refuses to re-apply when the default is already hourly', () => {
  const input = baseline()
  input.columnDefault = '3600'
  const errors = validateCollectorIntervalBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('already 3600')))
})

test('requires the collector table to exist', () => {
  const input = baseline()
  input.hasCollectorTable = false
  const errors = validateCollectorIntervalBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('AX 0031 is not applied')))
})

test('accepts a verified post-migration state', () => {
  assert.deepEqual(validateCollectorIntervalAfterMigration(applied(), false), [])
})

test('rejects a post-migration state that applied more than one migration', () => {
  const input = applied()
  input.migrationCount = COLLECTOR_INTERVAL_BASELINE_COUNT + 2
  const errors = validateCollectorIntervalAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('recorded migrations after apply')))
})

test('rejects a post-migration state whose latest migration is not 0034', () => {
  const input = applied()
  input.latestMigrationTimestamp = COLLECTOR_INTERVAL_BASELINE_TIMESTAMP
  const errors = validateCollectorIntervalAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('not AX 0034')))
})

test('rejects a post-migration state where existing collector intervals changed', () => {
  const input = applied()
  input.intervalHistogram = [{ intervalSeconds: 3600, count: 1 }, { intervalSeconds: 21600, count: 1 }]
  const errors = validateCollectorIntervalAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('existing collector intervals changed')))
})

test('requires the pre-migration histogram for verification', () => {
  const input = applied()
  input.expectedIntervalHistogram = undefined
  const errors = validateCollectorIntervalAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('pre-migration interval histogram is required')))
})

test('rejects a post-migration state whose default did not change', () => {
  const input = applied()
  input.columnDefault = '21600'
  const errors = validateCollectorIntervalAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('expected 3600')))
})
