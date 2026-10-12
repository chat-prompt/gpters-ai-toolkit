import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AGENT_ORG_EDIT_BASELINE_COUNT,
  AGENT_ORG_EDIT_BASELINE_TIMESTAMP,
  AGENT_ORG_EDIT_MIGRATION_TIMESTAMP,
  type AgentOrgEditMigrationState,
  validateAgentOrgEditAfterMigration,
  validateAgentOrgEditBeforeMigration,
} from '../src/migration/agent-credential-org-edit-guard'

function baseline(production = false): AgentOrgEditMigrationState {
  return {
    actualProjectId: 'project-test',
    actualBranchId: production ? 'branch-production' : 'branch-child',
    expectedProjectId: 'project-test',
    expectedBranchId: production ? 'branch-production' : 'branch-child',
    productionBranchId: 'branch-production',
    recoveryBranchId: production ? 'branch-recovery' : undefined,
    migrationCount: AGENT_ORG_EDIT_BASELINE_COUNT,
    latestMigrationTimestamp: AGENT_ORG_EDIT_BASELINE_TIMESTAMP,
    hasColumn: false,
    columnNotNull: false,
    columnDefault: null,
    credentialCount: 1,
    orgEditCount: 0,
  }
}

function applied(production = false): AgentOrgEditMigrationState {
  const state = baseline(production)
  state.migrationCount = AGENT_ORG_EDIT_BASELINE_COUNT + 1
  state.latestMigrationTimestamp = AGENT_ORG_EDIT_MIGRATION_TIMESTAMP
  state.hasColumn = true
  state.columnNotNull = true
  state.columnDefault = 'false'
  state.expectedCredentialCount = state.credentialCount
  return state
}

test('accepts the exact 0043 child and production baselines', () => {
  assert.deepEqual(validateAgentOrgEditBeforeMigration(baseline(), false), [])
  assert.deepEqual(validateAgentOrgEditBeforeMigration(baseline(true), true), [])
})

test('rejects a database that has not reached the 0043 baseline', () => {
  const input = baseline()
  input.migrationCount = AGENT_ORG_EDIT_BASELINE_COUNT - 1
  input.latestMigrationTimestamp = '1789020000000'
  const errors = validateAgentOrgEditBeforeMigration(input, false)
  assert.ok(errors.some((error) => error.includes('recorded migrations before apply')))
  assert.ok(errors.some((error) => error.includes('0043 baseline')))
})

test('refuses to run the child migration against the production branch', () => {
  const input = baseline()
  input.expectedBranchId = input.productionBranchId
  input.actualBranchId = input.productionBranchId
  assert.ok(validateAgentOrgEditBeforeMigration(input, false).some((error) => error.includes('refusing to run the child migration')))
})

test('requires a distinct recovery branch in production mode', () => {
  const missing = baseline(true)
  missing.recoveryBranchId = undefined
  assert.ok(validateAgentOrgEditBeforeMigration(missing, true).some((error) => error.includes('recovery branch ID is required')))
  const same = baseline(true)
  same.recoveryBranchId = same.productionBranchId
  assert.ok(validateAgentOrgEditBeforeMigration(same, true).some((error) => error.includes('recovery branch ID must differ')))
})

test('이미 컬럼이 있으면 다시 적용하지 않는다', () => {
  const input = baseline()
  input.hasColumn = true
  assert.ok(validateAgentOrgEditBeforeMigration(input, false).some((error) => error.includes('already exists')))
})

test('accepts a verified 0044 apply', () => {
  assert.deepEqual(validateAgentOrgEditAfterMigration(applied(), false), [])
  assert.deepEqual(validateAgentOrgEditAfterMigration(applied(true), true), [])
})

test('컬럼은 NOT NULL DEFAULT false 여야 하고 적용 직후 켜진 자격증명은 없어야 한다', () => {
  const nullable = applied()
  nullable.columnNotNull = false
  assert.ok(validateAgentOrgEditAfterMigration(nullable, false).some((error) => error.includes('NOT NULL')))
  const wrongDefault = applied()
  wrongDefault.columnDefault = 'true'
  assert.ok(validateAgentOrgEditAfterMigration(wrongDefault, false).some((error) => error.includes('default to false')))
  const enabled = applied()
  enabled.orgEditCount = 1
  assert.ok(validateAgentOrgEditAfterMigration(enabled, false).some((error) => error.includes('enabled right after apply')))
})

test('자격증명 행 수가 바뀌면 실패한다', () => {
  const input = applied()
  input.credentialCount = 0
  assert.ok(validateAgentOrgEditAfterMigration(input, false).some((error) => error.includes('row count changed')))
  const missing = applied()
  missing.expectedCredentialCount = undefined
  assert.ok(validateAgentOrgEditAfterMigration(missing, false).some((error) => error.includes('pre-migration credential count')))
})
