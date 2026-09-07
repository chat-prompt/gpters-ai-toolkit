/**
 * AX 0037 세션 FK 삭제 규칙 마이그레이션 가드.
 *
 * 0037은 데이터를 옮기지 않고 `skill_events`·`ax_skill_execution_attempts`의 `session_id` 외래키를
 * `cascade` → `set null`로 바꾼다. 그래서 검증의 핵심은 두 가지다.
 *
 * 1. **적용 후 두 제약이 정확히 하나씩, `SET NULL`로 존재하는가.** 제약조건 이름이 운영과 스키마에서
 *    다르다(`..._fkey` vs `..._mcp_sessions_session_id_fk`). 이름을 틀리게 적으면 DROP이 조용히
 *    넘어가고 CASCADE가 남은 채 새 제약이 하나 더 붙는다 — 개수까지 세는 이유다.
 * 2. **행이 사라지지 않았는가.** FK 규칙만 바꾸므로 두 테이블의 행 수는 적용 전후로 같아야 한다.
 */

/** 0037 적용 직전에 기록돼 있어야 하는 마이그레이션 수 (0036까지) */
export const SESSION_FK_BASELINE_COUNT = 26
/** 0037 적용 직전의 마지막 마이그레이션 타임스탬프 (0036_ax_catalog_health_snapshots) */
export const SESSION_FK_BASELINE_TIMESTAMP = '1788745000000'
/** 0037_session_delete_keeps_events 자신의 타임스탬프 */
export const SESSION_FK_MIGRATION_TIMESTAMP = '1788751000000'

/** `mcp_sessions`를 참조하는 자식 테이블 하나의 FK 상태 */
export interface SessionForeignKeyState {
  /** 자식 테이블 이름 */
  table: string
  /** 이 테이블에서 mcp_sessions를 참조하는 FK 개수. 정확히 1이어야 한다 */
  constraintCount: number
  /** 삭제 규칙. 'CASCADE' | 'SET NULL' | 그 외 */
  onDelete: string
}

/** 0037 적용 전후로 검사하는 DB 상태 */
export interface SessionFkMigrationState {
  actualProjectId: string | null
  actualBranchId: string | null
  expectedProjectId: string
  expectedBranchId: string
  productionBranchId: string
  recoveryBranchId?: string
  migrationCount: number
  latestMigrationTimestamp: string | null
  /** 두 자식 테이블의 FK 상태 */
  foreignKeys: SessionForeignKeyState[]
  /** 행 수. FK 규칙만 바꾸므로 적용 전후로 같아야 한다 */
  skillEventCount: number
  attemptCount: number
  /** 적용 후 검증에서만 채운다 */
  expectedSkillEventCount?: number
  expectedAttemptCount?: number
}

/** 반드시 검사해야 하는 자식 테이블 */
export const SESSION_FK_TABLES = ['skill_events', 'ax_skill_execution_attempts'] as const

function validateIdentity(input: SessionFkMigrationState, production: boolean): string[] {
  const errors: string[] = []
  if (!input.expectedProjectId) errors.push('expected project ID is required')
  if (!input.productionBranchId) errors.push('production branch ID is required')
  if (!input.actualProjectId || input.actualProjectId !== input.expectedProjectId) {
    errors.push('database project ID does not match the expected project')
  }
  if (!input.actualBranchId || input.actualBranchId !== input.expectedBranchId) {
    errors.push('database branch ID does not match the expected branch')
  }
  if (production) {
    if (input.expectedBranchId !== input.productionBranchId) {
      errors.push('production target must equal the confirmed production branch')
    }
    if (!input.recoveryBranchId) errors.push('recovery branch ID is required')
    if (input.recoveryBranchId === input.productionBranchId) {
      errors.push('recovery branch ID must differ from the production branch ID')
    }
  } else if (
    input.expectedBranchId === input.productionBranchId ||
    input.actualBranchId === input.productionBranchId
  ) {
    errors.push('refusing to run the child migration on the production branch')
  }
  return errors
}

function findState(input: SessionFkMigrationState, table: string): SessionForeignKeyState | undefined {
  return input.foreignKeys.find((fk) => fk.table === table)
}

/**
 * 적용 전 검증. 정확히 0036까지 적용됐고 두 FK가 아직 CASCADE인 상태만 통과시킨다.
 *
 * @param input - 관측한 DB 상태
 * @param production - 운영 브랜치 적용 여부
 * @returns 막아야 할 이유. 비어 있으면 통과
 */
export function validateSessionFkBeforeMigration(
  input: SessionFkMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== SESSION_FK_BASELINE_COUNT) {
    errors.push(`expected ${SESSION_FK_BASELINE_COUNT} recorded migrations before apply`)
  }
  if (input.latestMigrationTimestamp !== SESSION_FK_BASELINE_TIMESTAMP) {
    errors.push('latest recorded migration is not the AX 0036 baseline')
  }
  for (const table of SESSION_FK_TABLES) {
    const state = findState(input, table)
    if (!state) {
      errors.push(`${table}: no foreign key to mcp_sessions found`)
      continue
    }
    if (state.constraintCount !== 1) {
      errors.push(`${table}: expected exactly 1 foreign key to mcp_sessions, found ${state.constraintCount}`)
    }
    if (state.onDelete !== 'CASCADE') {
      errors.push(`${table}: expected CASCADE before apply, found ${state.onDelete}`)
    }
  }
  return errors
}

/**
 * 적용 후 검증. 두 FK가 하나씩 SET NULL이고 행이 그대로여야 한다.
 *
 * @param input - 관측한 DB 상태
 * @param production - 운영 브랜치 적용 여부
 * @returns 막아야 할 이유. 비어 있으면 통과
 */
export function validateSessionFkAfterMigration(
  input: SessionFkMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== SESSION_FK_BASELINE_COUNT + 1) {
    errors.push(`expected ${SESSION_FK_BASELINE_COUNT + 1} recorded migrations after apply`)
  }
  if (input.latestMigrationTimestamp !== SESSION_FK_MIGRATION_TIMESTAMP) {
    errors.push('latest recorded migration is not AX 0037')
  }
  for (const table of SESSION_FK_TABLES) {
    const state = findState(input, table)
    if (!state) {
      errors.push(`${table}: no foreign key to mcp_sessions after apply`)
      continue
    }
    // 이름을 틀리게 적으면 옛 CASCADE가 남은 채 새 제약이 하나 더 붙는다
    if (state.constraintCount !== 1) {
      errors.push(`${table}: expected exactly 1 foreign key to mcp_sessions, found ${state.constraintCount}`)
    }
    if (state.onDelete !== 'SET NULL') {
      errors.push(`${table}: expected SET NULL after apply, found ${state.onDelete}`)
    }
  }
  if (input.expectedSkillEventCount === undefined || input.expectedAttemptCount === undefined) {
    errors.push('pre-migration row counts are required for verification')
  } else {
    if (input.skillEventCount !== input.expectedSkillEventCount) {
      errors.push('skill_events row count changed; 0037 must only alter foreign key rules')
    }
    if (input.attemptCount !== input.expectedAttemptCount) {
      errors.push('ax_skill_execution_attempts row count changed; 0037 must only alter foreign key rules')
    }
  }
  return errors
}
