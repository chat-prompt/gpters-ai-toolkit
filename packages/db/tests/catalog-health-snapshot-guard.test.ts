import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CATALOG_SNAPSHOT_BASELINE_COUNT,
  CATALOG_SNAPSHOT_BASELINE_TIMESTAMP,
  CATALOG_SNAPSHOT_MIGRATION_TIMESTAMP,
  type CatalogSnapshotMigrationState,
  validateCatalogSnapshotAfterMigration,
  validateCatalogSnapshotBeforeMigration,
} from '../src/migration/catalog-health-snapshot-guard'

function baseline(production = false): CatalogSnapshotMigrationState {
  return {
    actualProjectId: 'project-test',
    actualBranchId: production ? 'branch-production' : 'branch-child',
    expectedProjectId: 'project-test',
    expectedBranchId: production ? 'branch-production' : 'branch-child',
    productionBranchId: 'branch-production',
    recoveryBranchId: production ? 'branch-recovery' : undefined,
    migrationCount: CATALOG_SNAPSHOT_BASELINE_COUNT,
    latestMigrationTimestamp: CATALOG_SNAPSHOT_BASELINE_TIMESTAMP,
    hasSnapshotTable: false,
    catalogItemCount: 491,
  }
}

function applied(production = false): CatalogSnapshotMigrationState {
  const state = baseline(production)
  state.migrationCount = CATALOG_SNAPSHOT_BASELINE_COUNT + 1
  state.latestMigrationTimestamp = CATALOG_SNAPSHOT_MIGRATION_TIMESTAMP
  state.hasSnapshotTable = true
  state.expectedCatalogItemCount = 491
  return state
}

test('accepts the exact AX 0034 child baseline', () => {
  assert.deepEqual(validateCatalogSnapshotBeforeMigration(baseline(), false), [])
})

test('rejects a database that has not reached the AX 0034 baseline', () => {
  const input = baseline()
  input.migrationCount = CATALOG_SNAPSHOT_BASELINE_COUNT - 1
  input.latestMigrationTimestamp = '1788141600000'
  const errors = validateCatalogSnapshotBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('recorded migrations before apply')))
  assert.ok(errors.some((error) => error.includes('AX 0034 baseline')))
})

test('refuses to run the child migration against the production branch', () => {
  const input = baseline()
  input.expectedBranchId = input.productionBranchId
  input.actualBranchId = input.productionBranchId
  const errors = validateCatalogSnapshotBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('refusing to run the child migration')))
})

test('requires a distinct recovery branch for production', () => {
  const input = baseline(true)
  input.recoveryBranchId = input.productionBranchId
  const errors = validateCatalogSnapshotBeforeMigration(input, true)
  assert.ok(errors.some((error) => error.includes('recovery branch ID must differ')))
})

test('requires a recovery branch in production mode', () => {
  const input = baseline(true)
  input.recoveryBranchId = undefined
  const errors = validateCatalogSnapshotBeforeMigration(input, true)
  assert.ok(errors.some((error) => error.includes('recovery branch ID is required')))
})

test('refuses to re-apply when the table already exists', () => {
  const input = baseline()
  input.hasSnapshotTable = true
  const errors = validateCatalogSnapshotBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('already exists')))
})

test('accepts a verified post-migration state', () => {
  assert.deepEqual(validateCatalogSnapshotAfterMigration(applied(), false), [])
})

test('rejects a post-migration state that applied more than one migration', () => {
  const input = applied()
  input.migrationCount = CATALOG_SNAPSHOT_BASELINE_COUNT + 2
  const errors = validateCatalogSnapshotAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('recorded migrations after apply')))
})

test('rejects a post-migration state whose latest migration is not 0035', () => {
  const input = applied()
  input.latestMigrationTimestamp = CATALOG_SNAPSHOT_BASELINE_TIMESTAMP
  const errors = validateCatalogSnapshotAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('not AX 0035')))
})

test('rejects a post-migration state where the table is missing', () => {
  const input = applied()
  input.hasSnapshotTable = false
  const errors = validateCatalogSnapshotAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('missing after apply')))
})

test('rejects a post-migration state where catalog items changed', () => {
  const input = applied()
  input.catalogItemCount = 490
  const errors = validateCatalogSnapshotAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('catalog items changed')))
})

test('requires the pre-migration catalog count for verification', () => {
  const input = applied()
  input.expectedCatalogItemCount = undefined
  const errors = validateCatalogSnapshotAfterMigration(input, false)
  assert.ok(errors.some((error) => error.includes('pre-migration catalog item count is required')))
})
