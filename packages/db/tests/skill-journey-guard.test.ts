import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SKILL_JOURNEY_BASELINE_COUNT,
  SKILL_JOURNEY_BASELINE_TIMESTAMP,
  SKILL_JOURNEY_TARGET_COUNT,
  SKILL_JOURNEY_TARGET_TIMESTAMP,
  type SkillJourneyMigrationState,
  validateSkillJourneyAfterMigration,
  validateSkillJourneyBeforeMigration,
} from '../src/migration/skill-journey-guard'

function baseline(production = false): SkillJourneyMigrationState {
  return {
    actualProjectId: 'project-test',
    actualBranchId: production ? 'branch-production' : 'branch-child',
    expectedProjectId: 'project-test',
    expectedBranchId: production ? 'branch-production' : 'branch-child',
    productionBranchId: 'branch-production',
    recoveryBranchId: production ? 'branch-recovery' : undefined,
    migrationCount: SKILL_JOURNEY_BASELINE_COUNT,
    latestMigrationTimestamp: SKILL_JOURNEY_BASELINE_TIMESTAMP,
    hasBaselineTables: true,
    executionSessionNullable: false,
    hasSkillEventJourneyColumn: false,
    hasSkillEventJourneyIndex: false,
    hasExecutionJourneyColumn: false,
    hasExecutionJourneyIndex: false,
    skillEventRows: 123,
    executionAttemptRows: 45,
  }
}

test('accepts the exact AX 0032 child baseline', () => {
  assert.deepEqual(validateSkillJourneyBeforeMigration(baseline(), false), [])
})

test('requires a distinct recovery branch for production', () => {
  const input = baseline(true)
  input.recoveryBranchId = input.productionBranchId
  assert.match(validateSkillJourneyBeforeMigration(input, true).join('\n'), /must differ/)
})

test('rejects a partially applied 0033 schema', () => {
  const input = baseline()
  input.hasSkillEventJourneyColumn = true
  assert.match(validateSkillJourneyBeforeMigration(input, false).join('\n'), /partial apply/)
})

test('accepts only a complete 0033 schema with unchanged row counts', () => {
  const input = baseline()
  Object.assign(input, {
    migrationCount: SKILL_JOURNEY_TARGET_COUNT,
    latestMigrationTimestamp: SKILL_JOURNEY_TARGET_TIMESTAMP,
    executionSessionNullable: true,
    hasSkillEventJourneyColumn: true,
    hasSkillEventJourneyIndex: true,
    hasExecutionJourneyColumn: true,
    hasExecutionJourneyIndex: true,
    expectedSkillEventRows: 123,
    expectedExecutionAttemptRows: 45,
  })
  assert.deepEqual(validateSkillJourneyAfterMigration(input, false), [])

  input.executionAttemptRows = 46
  assert.match(validateSkillJourneyAfterMigration(input, false).join('\n'), /row count/)
})
