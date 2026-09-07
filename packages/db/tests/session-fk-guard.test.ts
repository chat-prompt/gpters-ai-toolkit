import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SESSION_FK_BASELINE_COUNT,
  SESSION_FK_BASELINE_TIMESTAMP,
  SESSION_FK_MIGRATION_TIMESTAMP,
  type SessionFkMigrationState,
  validateSessionFkAfterMigration,
  validateSessionFkBeforeMigration,
} from '../src/migration/session-fk-guard'

function baseline(production = false): SessionFkMigrationState {
  return {
    actualProjectId: 'project-test',
    actualBranchId: production ? 'branch-production' : 'branch-child',
    expectedProjectId: 'project-test',
    expectedBranchId: production ? 'branch-production' : 'branch-child',
    productionBranchId: 'branch-production',
    recoveryBranchId: production ? 'branch-recovery' : undefined,
    migrationCount: SESSION_FK_BASELINE_COUNT,
    latestMigrationTimestamp: SESSION_FK_BASELINE_TIMESTAMP,
    foreignKeys: [
      { table: 'skill_events', constraintCount: 1, onDelete: 'CASCADE' },
      { table: 'ax_skill_execution_attempts', constraintCount: 1, onDelete: 'CASCADE' },
    ],
    skillEventCount: 13005,
    attemptCount: 42,
  }
}

function applied(production = false): SessionFkMigrationState {
  const state = baseline(production)
  state.migrationCount = SESSION_FK_BASELINE_COUNT + 1
  state.latestMigrationTimestamp = SESSION_FK_MIGRATION_TIMESTAMP
  state.foreignKeys = [
    { table: 'skill_events', constraintCount: 1, onDelete: 'SET NULL' },
    { table: 'ax_skill_execution_attempts', constraintCount: 1, onDelete: 'SET NULL' },
  ]
  state.expectedSkillEventCount = state.skillEventCount
  state.expectedAttemptCount = state.attemptCount
  return state
}

test('0036까지 적용됐고 두 FK가 CASCADE면 통과한다', () => {
  assert.deepEqual(validateSessionFkBeforeMigration(baseline(), false), [])
})

test('기준선보다 앞선 DB는 막는다', () => {
  const state = baseline()
  state.migrationCount = SESSION_FK_BASELINE_COUNT + 1
  const errors = validateSessionFkBeforeMigration(state, false)
  assert.ok(errors.some((e) => e.includes('recorded migrations before apply')))
})

test('이미 SET NULL이면 적용 전 검증을 막는다', () => {
  const state = baseline()
  state.foreignKeys[0].onDelete = 'SET NULL'
  const errors = validateSessionFkBeforeMigration(state, false)
  assert.ok(errors.some((e) => e.includes('skill_events: expected CASCADE')))
})

test('적용 후 두 FK가 하나씩 SET NULL이고 행 수가 같으면 통과한다', () => {
  assert.deepEqual(validateSessionFkAfterMigration(applied(), false), [])
})

test('DROP이 조용히 실패해 제약이 둘이 되면 잡는다', () => {
  const state = applied()
  // 이름을 틀리게 적으면 옛 CASCADE가 남은 채 새 제약이 하나 더 붙는다
  state.foreignKeys[0] = { table: 'skill_events', constraintCount: 2, onDelete: 'MIXED' }
  const errors = validateSessionFkAfterMigration(state, false)
  assert.ok(errors.some((e) => e.includes('found 2')))
  assert.ok(errors.some((e) => e.includes('expected SET NULL after apply, found MIXED')))
})

test('적용 후에도 CASCADE로 남아 있으면 잡는다', () => {
  const state = applied()
  state.foreignKeys[1].onDelete = 'CASCADE'
  const errors = validateSessionFkAfterMigration(state, false)
  assert.ok(errors.some((e) => e.includes('ax_skill_execution_attempts: expected SET NULL')))
})

test('FK가 사라지면 잡는다', () => {
  const state = applied()
  state.foreignKeys = [state.foreignKeys[0]]
  const errors = validateSessionFkAfterMigration(state, false)
  assert.ok(errors.some((e) => e.includes('no foreign key to mcp_sessions after apply')))
})

test('행이 줄면 잡는다 — 0037은 규칙만 바꾼다', () => {
  const state = applied()
  state.skillEventCount = state.expectedSkillEventCount! - 10
  const errors = validateSessionFkAfterMigration(state, false)
  assert.ok(errors.some((e) => e.includes('skill_events row count changed')))
})

test('적용 전 행 수를 안 넘기면 검증을 거부한다', () => {
  const state = applied()
  state.expectedSkillEventCount = undefined
  const errors = validateSessionFkAfterMigration(state, false)
  assert.ok(errors.some((e) => e.includes('pre-migration row counts are required')))
})

test('운영 적용은 복구 브랜치를 요구한다', () => {
  const state = baseline(true)
  state.recoveryBranchId = undefined
  const errors = validateSessionFkBeforeMigration(state, true)
  assert.ok(errors.some((e) => e.includes('recovery branch ID is required')))
})

test('복구 브랜치가 운영과 같으면 막는다', () => {
  const state = baseline(true)
  state.recoveryBranchId = state.productionBranchId
  const errors = validateSessionFkBeforeMigration(state, true)
  assert.ok(errors.some((e) => e.includes('must differ from the production branch ID')))
})

test('자식 러너가 운영 브랜치를 가리키면 막는다', () => {
  const state = baseline()
  state.expectedBranchId = state.productionBranchId
  state.actualBranchId = state.productionBranchId
  const errors = validateSessionFkBeforeMigration(state, false)
  assert.ok(errors.some((e) => e.includes('refusing to run the child migration on the production branch')))
})
