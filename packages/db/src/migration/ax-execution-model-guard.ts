/**
 * AX 0035 실행 보고 model 컬럼 마이그레이션 가드.
 *
 * 0035는 `ax_skill_execution_attempts`에 nullable 컬럼 하나를 더한다. 기존 행을 건드리지 않으므로
 * 검증의 핵심은 "정확히 0034까지 적용된 DB에서 0035 한 건만 적용되는가"와
 * "기존 시도 행 수가 그대로인가" 두 가지다.
 */

/** 0035 적용 직전에 기록돼 있어야 하는 마이그레이션 수 (0034까지) */
export const EXECUTION_MODEL_BASELINE_COUNT = 24
/** 0035 적용 직전의 마지막 마이그레이션 타임스탬프 (0034_agent_collector_hourly_default) */
export const EXECUTION_MODEL_BASELINE_TIMESTAMP = '1788414275714'
/** 0035_ax_execution_model 자신의 타임스탬프 */
export const EXECUTION_MODEL_MIGRATION_TIMESTAMP = '1788555600000'

/** 0035 적용 전후로 검사하는 DB 상태 */
export interface ExecutionModelMigrationState {
  actualProjectId: string | null
  actualBranchId: string | null
  expectedProjectId: string
  expectedBranchId: string
  productionBranchId: string
  recoveryBranchId?: string
  migrationCount: number
  latestMigrationTimestamp: string | null
  hasAttemptsTable: boolean
  /** information_schema 기준 model 컬럼 존재 여부 */
  hasModelColumn: boolean
  /** model 컬럼이 nullable인지. NOT NULL이면 기존 행을 못 담는다. */
  modelColumnIsNullable: boolean | null
  /** 기존 시도 행 수. 컬럼만 추가하므로 적용 전후로 같아야 한다. */
  attemptCount: number
  /** 적용 후 검증에서만 채운다 */
  expectedAttemptCount?: number
}

function validateIdentity(input: ExecutionModelMigrationState, production: boolean): string[] {
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

/**
 * 적용 전 검증. 정확히 0034까지 적용된 상태만 통과시킨다.
 *
 * drizzle의 migrate()는 미적용 마이그레이션을 모두 적용하므로 기준선을 여기서 막는다.
 */
export function validateExecutionModelBeforeMigration(
  input: ExecutionModelMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== EXECUTION_MODEL_BASELINE_COUNT) {
    errors.push(`expected ${EXECUTION_MODEL_BASELINE_COUNT} recorded migrations before apply`)
  }
  if (input.latestMigrationTimestamp !== EXECUTION_MODEL_BASELINE_TIMESTAMP) {
    errors.push('latest recorded migration is not the AX 0034 baseline')
  }
  if (!input.hasAttemptsTable) errors.push('ax_skill_execution_attempts is missing; AX 0029 is not applied')
  if (input.hasModelColumn) errors.push('model column already exists; refusing to re-apply')
  return errors
}

/** 적용 후 검증. nullable 컬럼만 늘고 기존 시도 행은 그대로여야 한다. */
export function validateExecutionModelAfterMigration(
  input: ExecutionModelMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== EXECUTION_MODEL_BASELINE_COUNT + 1) {
    errors.push(`expected ${EXECUTION_MODEL_BASELINE_COUNT + 1} recorded migrations after apply`)
  }
  if (input.latestMigrationTimestamp !== EXECUTION_MODEL_MIGRATION_TIMESTAMP) {
    errors.push('latest recorded migration is not AX 0035')
  }
  if (!input.hasModelColumn) errors.push('model column is missing after apply')
  if (input.modelColumnIsNullable !== true) {
    errors.push('model column must be nullable; 미보고와 빈 문자열을 구분할 수 없게 된다')
  }
  if (input.expectedAttemptCount === undefined) {
    errors.push('pre-migration attempt count is required for verification')
  } else if (input.attemptCount !== input.expectedAttemptCount) {
    errors.push('existing execution attempts changed; 0035 must only add a nullable column')
  }
  return errors
}
