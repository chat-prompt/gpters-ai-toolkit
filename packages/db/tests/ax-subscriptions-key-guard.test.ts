import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AX_SUBSCRIPTIONS_KEY_BASELINE_COUNT,
  AX_SUBSCRIPTIONS_KEY_BASELINE_TIMESTAMP,
  AX_SUBSCRIPTIONS_KEY_MIGRATION_TIMESTAMP,
  type AxSubscriptionsKeyMigrationState,
  validateAxSubscriptionsKeyAfterMigration,
  validateAxSubscriptionsKeyBeforeMigration,
} from '../src/migration/ax-subscriptions-key-guard'

function baseline(production = false): AxSubscriptionsKeyMigrationState {
  return {
    actualProjectId: 'project-test',
    actualBranchId: production ? 'branch-production' : 'branch-child',
    expectedProjectId: 'project-test',
    expectedBranchId: production ? 'branch-production' : 'branch-child',
    productionBranchId: 'branch-production',
    recoveryBranchId: production ? 'branch-recovery' : undefined,
    serverVersionNum: 170011,
    migrationCount: AX_SUBSCRIPTIONS_KEY_BASELINE_COUNT,
    latestMigrationTimestamp: AX_SUBSCRIPTIONS_KEY_BASELINE_TIMESTAMP,
    hasConstraint: false,
    constraintNullsNotDistinct: false,
    duplicateKeyGroups: 0,
    subscriptionCount: 26,
  }
}

function applied(production = false): AxSubscriptionsKeyMigrationState {
  const state = baseline(production)
  state.migrationCount = AX_SUBSCRIPTIONS_KEY_BASELINE_COUNT + 1
  state.latestMigrationTimestamp = AX_SUBSCRIPTIONS_KEY_MIGRATION_TIMESTAMP
  state.hasConstraint = true
  state.constraintNullsNotDistinct = true
  state.expectedSubscriptionCount = state.subscriptionCount
  return state
}

test('accepts the exact AX 0042 child and production baselines', () => {
  assert.deepEqual(validateAxSubscriptionsKeyBeforeMigration(baseline(), false), [])
  assert.deepEqual(validateAxSubscriptionsKeyBeforeMigration(baseline(true), true), [])
})

test('rejects a database that has not reached the AX 0042 baseline', () => {
  const input = baseline()
  input.migrationCount = AX_SUBSCRIPTIONS_KEY_BASELINE_COUNT - 1
  input.latestMigrationTimestamp = '1789017000000'
  const errors = validateAxSubscriptionsKeyBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('recorded migrations before apply')))
  assert.ok(errors.some((error) => error.includes('AX 0042 baseline')))
})

test('refuses to run the child migration against the production branch', () => {
  const input = baseline()
  input.expectedBranchId = input.productionBranchId
  input.actualBranchId = input.productionBranchId
  const errors = validateAxSubscriptionsKeyBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('refusing to run the child migration')))
})

test('requires a distinct recovery branch in production mode', () => {
  const missing = baseline(true)
  missing.recoveryBranchId = undefined
  assert.ok(validateAxSubscriptionsKeyBeforeMigration(missing, true).some((error) => error.includes('recovery branch ID is required')))
  const same = baseline(true)
  same.recoveryBranchId = same.productionBranchId
  assert.ok(validateAxSubscriptionsKeyBeforeMigration(same, true).some((error) => error.includes('recovery branch ID must differ')))
})

test('중복 키가 있으면 적용하지 않는다 — 제약이 실패하기 전에 막는다', () => {
  const input = baseline()
  input.duplicateKeyGroups = 2
  const errors = validateAxSubscriptionsKeyBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('2 duplicate key group')))
})

test('PostgreSQL 15 미만이면 NULLS NOT DISTINCT 를 못 쓰므로 막는다', () => {
  const input = baseline()
  input.serverVersionNum = 140010
  const errors = validateAxSubscriptionsKeyBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('PostgreSQL 15+')))
})

test('refuses to re-apply when the constraint already exists', () => {
  const input = baseline()
  input.hasConstraint = true
  const errors = validateAxSubscriptionsKeyBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('already exists')))
})

test('accepts a verified post-migration state', () => {
  assert.deepEqual(validateAxSubscriptionsKeyAfterMigration(applied(), false), [])
  assert.deepEqual(validateAxSubscriptionsKeyAfterMigration(applied(true), true), [])
})

test('rejects a post-migration state that applied more than one migration or not 0043', () => {
  const input = applied()
  input.migrationCount = AX_SUBSCRIPTIONS_KEY_BASELINE_COUNT + 2
  input.latestMigrationTimestamp = AX_SUBSCRIPTIONS_KEY_BASELINE_TIMESTAMP
  const errors = validateAxSubscriptionsKeyAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('recorded migrations after apply')))
  assert.ok(errors.some((error) => error.includes('not AX 0043')))
})

test('제약이 없거나 NULL 을 서로 다르게 보는 제약이면 잡는다', () => {
  const missing = applied()
  missing.hasConstraint = false
  assert.ok(validateAxSubscriptionsKeyAfterMigration(missing, false).some((error) => error.includes('missing after apply')))
  const distinct = applied()
  distinct.constraintNullsNotDistinct = false
  assert.ok(validateAxSubscriptionsKeyAfterMigration(distinct, false).some((error) => error.includes('NULLS NOT DISTINCT')))
})

test('rejects a post-migration state where subscription rows changed or the baseline count is missing', () => {
  const changed = applied()
  changed.subscriptionCount = 25
  assert.ok(validateAxSubscriptionsKeyAfterMigration(changed, false).some((error) => error.includes('row count changed')))
  const unknown = applied()
  unknown.expectedSubscriptionCount = undefined
  assert.ok(validateAxSubscriptionsKeyAfterMigration(unknown, false).some((error) => error.includes('pre-migration subscription count is required')))
})
