import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AGENT_COLLECTOR_BASELINE_TIMESTAMP,
  AGENT_COLLECTOR_TARGET_TIMESTAMP,
  type AgentCollectorMigrationState,
  validateAgentCollectorAfterMigration,
  validateAgentCollectorBeforeMigration,
} from '../src/migration/agent-telemetry-collector-guard'

function baseline(production = false): AgentCollectorMigrationState {
  return {
    actualProjectId: 'project-test',
    actualBranchId: production ? 'branch-production' : 'branch-child',
    expectedProjectId: 'project-test',
    expectedBranchId: production ? 'branch-production' : 'branch-child',
    productionBranchId: 'branch-production',
    recoveryBranchId: production ? 'branch-recovery' : undefined,
    migrationCount: 20,
    latestMigrationTimestamp: AGENT_COLLECTOR_BASELINE_TIMESTAMP,
    hasBaselineObjects: true,
    hasCollectorTable: false,
    hasRequiredColumns: false,
    hasRequiredIndexes: false,
    hasRequiredConstraints: false,
    collectorRows: 0,
  }
}

test('accepts an exact 0030 child baseline', () => {
  assert.deepEqual(validateAgentCollectorBeforeMigration(baseline(), false), [])
})

test('rejects production identity in child mode and requires recovery in production', () => {
  const child = baseline()
  child.actualBranchId = child.productionBranchId
  assert.match(validateAgentCollectorBeforeMigration(child, false).join('\n'), /production branch/)

  const production = baseline(true)
  production.recoveryBranchId = production.productionBranchId
  assert.match(validateAgentCollectorBeforeMigration(production, true).join('\n'), /must differ/)
})

test('rejects a changed baseline or partially-created collector table', () => {
  const input = baseline()
  input.migrationCount = 21
  input.hasCollectorTable = true
  const errors = validateAgentCollectorBeforeMigration(input, false).join('\n')
  assert.match(errors, /20 recorded migrations/)
  assert.match(errors, /partial apply/)
})

test('accepts only a complete and empty 0031 registry', () => {
  const input = baseline()
  input.migrationCount = 21
  input.latestMigrationTimestamp = AGENT_COLLECTOR_TARGET_TIMESTAMP
  input.hasCollectorTable = true
  input.hasRequiredColumns = true
  input.hasRequiredIndexes = true
  input.hasRequiredConstraints = true
  assert.deepEqual(validateAgentCollectorAfterMigration(input, false), [])

  input.collectorRows = 1
  assert.match(validateAgentCollectorAfterMigration(input, false).join('\n'), /unexpectedly created/)
})
