import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EXECUTION_MODEL_BASELINE_COUNT,
  EXECUTION_MODEL_BASELINE_TIMESTAMP,
  EXECUTION_MODEL_MIGRATION_TIMESTAMP,
  type ExecutionModelMigrationState,
  validateExecutionModelAfterMigration,
  validateExecutionModelBeforeMigration,
} from '../src/migration/ax-execution-model-guard'

function baseline(production = false): ExecutionModelMigrationState {
  return {
    actualProjectId: 'project-test',
    actualBranchId: production ? 'branch-production' : 'branch-child',
    expectedProjectId: 'project-test',
    expectedBranchId: production ? 'branch-production' : 'branch-child',
    productionBranchId: 'branch-production',
    recoveryBranchId: production ? 'branch-recovery' : undefined,
    migrationCount: EXECUTION_MODEL_BASELINE_COUNT,
    latestMigrationTimestamp: EXECUTION_MODEL_BASELINE_TIMESTAMP,
    hasAttemptsTable: true,
    hasModelColumn: false,
    modelColumnIsNullable: null,
    attemptCount: 12,
  }
}

function applied(production = false): ExecutionModelMigrationState {
  const state = baseline(production)
  state.migrationCount = EXECUTION_MODEL_BASELINE_COUNT + 1
  state.latestMigrationTimestamp = EXECUTION_MODEL_MIGRATION_TIMESTAMP
  state.hasModelColumn = true
  state.modelColumnIsNullable = true
  state.expectedAttemptCount = 12
  return state
}

test('accepts the exact AX 0034 child baseline', () => {
  assert.deepEqual(validateExecutionModelBeforeMigration(baseline(), false), [])
})

test('rejects a database that has not reached the AX 0034 baseline', () => {
  const input = baseline()
  input.migrationCount = EXECUTION_MODEL_BASELINE_COUNT - 1
  input.latestMigrationTimestamp = '1788141600000'
  const errors = validateExecutionModelBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('recorded migrations before apply')))
  assert.ok(errors.some((error) => error.includes('AX 0034 baseline')))
})

test('refuses to run the child migration against the production branch', () => {
  const input = baseline()
  input.expectedBranchId = input.productionBranchId
  input.actualBranchId = input.productionBranchId
  const errors = validateExecutionModelBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('refusing to run the child migration')))
})

test('requires a distinct recovery branch for production', () => {
  const input = baseline(true)
  input.recoveryBranchId = input.productionBranchId
  const errors = validateExecutionModelBeforeMigration(input, true)
  assert.ok(errors.some((error) => error.includes('recovery branch ID must differ')))
})

test('requires a recovery branch in production mode', () => {
  const input = baseline(true)
  input.recoveryBranchId = undefined
  const errors = validateExecutionModelBeforeMigration(input, true)
  assert.ok(errors.some((error) => error.includes('recovery branch ID is required')))
})

test('refuses to re-apply when the model column already exists', () => {
  const input = baseline()
  input.hasModelColumn = true
  input.modelColumnIsNullable = true
  const errors = validateExecutionModelBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('already exists')))
})

test('requires the execution attempts table to exist', () => {
  const input = baseline()
  input.hasAttemptsTable = false
  const errors = validateExecutionModelBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('AX 0029 is not applied')))
})

test('accepts a verified post-migration state', () => {
  assert.deepEqual(validateExecutionModelAfterMigration(applied(), false), [])
})

test('rejects a post-migration state that applied more than one migration', () => {
  const input = applied()
  input.migrationCount = EXECUTION_MODEL_BASELINE_COUNT + 2
  const errors = validateExecutionModelAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('recorded migrations after apply')))
})

test('rejects a post-migration state whose latest migration is not 0035', () => {
  const input = applied()
  input.latestMigrationTimestamp = EXECUTION_MODEL_BASELINE_TIMESTAMP
  const errors = validateExecutionModelAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('not AX 0035')))
})

test('rejects a NOT NULL model column', () => {
  const input = applied()
  input.modelColumnIsNullable = false
  const errors = validateExecutionModelAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('must be nullable')))
})

test('rejects a post-migration state where existing attempts changed', () => {
  const input = applied()
  input.attemptCount = 11
  const errors = validateExecutionModelAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('existing execution attempts changed')))
})

test('requires the pre-migration attempt count for verification', () => {
  const input = applied()
  input.expectedAttemptCount = undefined
  const errors = validateExecutionModelAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('pre-migration attempt count is required')))
})
