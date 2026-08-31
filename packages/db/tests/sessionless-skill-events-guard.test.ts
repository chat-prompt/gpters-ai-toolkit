import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SESSIONLESS_SKILL_EVENTS_BASELINE_COUNT,
  SESSIONLESS_SKILL_EVENTS_BASELINE_TIMESTAMP,
  SESSIONLESS_SKILL_EVENTS_TARGET_COUNT,
  SESSIONLESS_SKILL_EVENTS_TARGET_TIMESTAMP,
  type SessionlessSkillEventsBackfillState,
  type SessionlessSkillEventsMigrationState,
  validateSessionlessSkillEventsBackfill,
  validateSessionlessSkillEventsAfterMigration,
  validateSessionlessSkillEventsBeforeMigration,
} from '../src/migration/sessionless-skill-events-guard'

function baseline(production = false): SessionlessSkillEventsMigrationState {
  return {
    actualProjectId: 'project-test',
    actualBranchId: production ? 'branch-production' : 'branch-child',
    expectedProjectId: 'project-test',
    expectedBranchId: production ? 'branch-production' : 'branch-child',
    productionBranchId: 'branch-production',
    recoveryBranchId: production ? 'branch-recovery' : undefined,
    migrationCount: SESSIONLESS_SKILL_EVENTS_BASELINE_COUNT,
    latestMigrationTimestamp: SESSIONLESS_SKILL_EVENTS_BASELINE_TIMESTAMP,
    hasBaselineObjects: true,
    sessionIdNullable: false,
    hasSourceAuditLogColumn: false,
    hasSourceAuditForeignKey: false,
    hasSourceAuditIndex: false,
    hasSourceUniqueIndex: false,
    skillEventRows: 123,
    sourceLinkedRows: 0,
  }
}

test('accepts the exact AX 0031 child baseline', () => {
  assert.deepEqual(validateSessionlessSkillEventsBeforeMigration(baseline(), false), [])
})

function backfill(production = false): SessionlessSkillEventsBackfillState {
  return {
    actualProjectId: 'project-test',
    actualBranchId: production ? 'branch-production' : 'branch-child',
    expectedProjectId: 'project-test',
    expectedBranchId: production ? 'branch-production' : 'branch-child',
    productionBranchId: 'branch-production',
    recoveryBranchId: production ? 'branch-recovery' : undefined,
    migrationCount: SESSIONLESS_SKILL_EVENTS_TARGET_COUNT,
    latestMigrationTimestamp: SESSIONLESS_SKILL_EVENTS_TARGET_TIMESTAMP,
    schemaReady: true,
    targetAuditRows: 10,
    candidateRows: 12,
    eligibleRows: 11,
    unmatchedRows: 1,
    unresolvedAuditRows: 2,
    alreadyBackfilledRows: 3,
    requestedInsertRows: 8,
    acknowledgedUnmatchedRows: 1,
    acknowledgedUnresolvedAuditRows: 2,
  }
}

test('accepts an explicitly reconciled and acknowledged backfill dry run', () => {
  assert.deepEqual(validateSessionlessSkillEventsBackfill(backfill(), false), [])
})

test('rejects silent candidate loss or unacknowledged audit gaps', () => {
  const input = backfill()
  input.acknowledgedUnmatchedRows = 0
  input.acknowledgedUnresolvedAuditRows = 0
  const errors = validateSessionlessSkillEventsBackfill(input, false).join('\n')
  assert.match(errors, /unmatched candidate/)
  assert.match(errors, /unresolved audit/)

  input.acknowledgedUnmatchedRows = 1
  input.acknowledgedUnresolvedAuditRows = 2
  input.requestedInsertRows = 7
  assert.match(
    validateSessionlessSkillEventsBackfill(input, false).join('\n'),
    /do not reconcile/,
  )
})

test('requires a distinct recovery branch for production', () => {
  const input = baseline(true)
  input.recoveryBranchId = input.productionBranchId
  assert.match(
    validateSessionlessSkillEventsBeforeMigration(input, true).join('\n'),
    /must differ/,
  )
})

test('rejects a partially applied 0032 schema', () => {
  const input = baseline()
  input.hasSourceAuditLogColumn = true
  input.sessionIdNullable = true
  assert.match(
    validateSessionlessSkillEventsBeforeMigration(input, false).join('\n'),
    /partial apply/,
  )
})

test('accepts a complete 0032 schema only when existing rows are unchanged', () => {
  const input = baseline()
  Object.assign(input, {
    migrationCount: SESSIONLESS_SKILL_EVENTS_TARGET_COUNT,
    latestMigrationTimestamp: SESSIONLESS_SKILL_EVENTS_TARGET_TIMESTAMP,
    sessionIdNullable: true,
    hasSourceAuditLogColumn: true,
    hasSourceAuditForeignKey: true,
    hasSourceAuditIndex: true,
    hasSourceUniqueIndex: true,
    expectedSkillEventRows: 123,
  })
  assert.deepEqual(validateSessionlessSkillEventsAfterMigration(input, false), [])

  input.skillEventRows = 124
  assert.match(
    validateSessionlessSkillEventsAfterMigration(input, false).join('\n'),
    /row count/,
  )
})
