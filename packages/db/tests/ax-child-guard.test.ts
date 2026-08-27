import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AX_BASELINE_LATEST_TIMESTAMP,
  AX_TARGET_LATEST_TIMESTAMP,
  type AxChildMigrationGuardInput,
  type AxProductionMigrationGuardInput,
  validateAxChildAfterMigration,
  validateAxChildBeforeMigration,
  validateAxProductionAfterMigration,
  validateAxProductionBeforeMigration,
} from '../src/migration/ax-child-guard'

function safeInput(): AxChildMigrationGuardInput {
  return {
    actualProjectId: 'project-test',
    actualBranchId: 'branch-child',
    expectedProjectId: 'project-test',
    expectedBranchId: 'branch-child',
    productionBranchId: 'branch-production',
    migrationCount: 15,
    latestMigrationTimestamp: AX_BASELINE_LATEST_TIMESTAMP,
    objects: {
      hasCollectorState: false,
      hasAccountStatus: false,
      hasMembershipStatus: false,
      hasUsageUserId: false,
      hasExecutionAttempts: false,
      hasExecutionEvents: false,
    },
    impact: {
      usageRows: 48,
      uniquelyMatchedRows: 48,
      ambiguousRows: 0,
      unmatchedRows: 0,
      duplicateGroups: 0,
      rowsDeletedByDedupe: 0,
    },
  }
}

function safeProductionInput(): AxProductionMigrationGuardInput {
  const child = safeInput()
  return {
    actualProjectId: child.actualProjectId,
    actualBranchId: child.productionBranchId,
    expectedProjectId: child.expectedProjectId,
    productionBranchId: child.productionBranchId,
    recoveryBranchId: 'branch-recovery',
    migrationCount: child.migrationCount,
    latestMigrationTimestamp: child.latestMigrationTimestamp,
    objects: child.objects,
    impact: child.impact,
  }
}

test('accepts an exact child branch baseline with zero data loss', () => {
  assert.deepEqual(validateAxChildBeforeMigration(safeInput()), [])
})

test('rejects production and branch identity mismatches', () => {
  const input = safeInput()
  input.actualBranchId = 'branch-production'
  assert.match(validateAxChildBeforeMigration(input).join('\n'), /production branch/)

  const sameExpected = safeInput()
  sameExpected.expectedBranchId = sameExpected.productionBranchId
  assert.match(validateAxChildBeforeMigration(sameExpected).join('\n'), /must differ/)
})

test('rejects a changed baseline or partially applied schema', () => {
  const input = safeInput()
  input.migrationCount = 16
  input.objects.hasCollectorState = true
  const errors = validateAxChildBeforeMigration(input).join('\n')
  assert.match(errors, /15 recorded migrations/)
  assert.match(errors, /partial apply/)
})

test('rejects ambiguous, unmatched, duplicate, or deleting backfills', () => {
  const input = safeInput()
  input.impact = {
    usageRows: 48,
    uniquelyMatchedRows: 43,
    ambiguousRows: 1,
    unmatchedRows: 4,
    duplicateGroups: 1,
    rowsDeletedByDedupe: 2,
  }
  const errors = validateAxChildBeforeMigration(input).join('\n')
  assert.match(errors, /ambiguous/)
  assert.match(errors, /unmatched/)
  assert.match(errors, /duplicate groups/)
  assert.match(errors, /delete usage rows/)
})

test('accepts only the complete 0030 post-migration state', () => {
  const input = safeInput()
  input.migrationCount = 20
  input.latestMigrationTimestamp = AX_TARGET_LATEST_TIMESTAMP
  for (const key of Object.keys(input.objects) as Array<keyof typeof input.objects>) {
    input.objects[key] = true
  }
  assert.deepEqual(validateAxChildAfterMigration(input), [])

  input.objects.hasExecutionEvents = false
  assert.match(validateAxChildAfterMigration(input).join('\n'), /missing after apply/)
})

test('accepts an exact production baseline only with a distinct recovery branch', () => {
  assert.deepEqual(validateAxProductionBeforeMigration(safeProductionInput()), [])

  const missingRecovery = safeProductionInput()
  missingRecovery.recoveryBranchId = ''
  assert.match(validateAxProductionBeforeMigration(missingRecovery).join('\n'), /recovery branch/)

  const sameRecovery = safeProductionInput()
  sameRecovery.recoveryBranchId = sameRecovery.productionBranchId
  assert.match(validateAxProductionBeforeMigration(sameRecovery).join('\n'), /must differ/)
})

test('production guard rejects a different target branch or data-loss impact', () => {
  const wrongTarget = safeProductionInput()
  wrongTarget.actualBranchId = 'branch-child'
  assert.match(validateAxProductionBeforeMigration(wrongTarget).join('\n'), /confirmed production/)

  const deleting = safeProductionInput()
  deleting.impact.rowsDeletedByDedupe = 1
  assert.match(validateAxProductionBeforeMigration(deleting).join('\n'), /delete usage rows/)
})

test('production guard accepts only the complete 0030 post-migration state', () => {
  const input = safeProductionInput()
  input.migrationCount = 20
  input.latestMigrationTimestamp = AX_TARGET_LATEST_TIMESTAMP
  for (const key of Object.keys(input.objects) as Array<keyof typeof input.objects>) {
    input.objects[key] = true
  }
  assert.deepEqual(validateAxProductionAfterMigration(input), [])
})
