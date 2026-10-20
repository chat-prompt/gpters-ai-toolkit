/**
 * 0046 수집기 한도 연결 상태 컬럼 마이그레이션 가드 (EDU-11519).
 *
 * 0046은 `ax_usage_collector_state.limit_capture`(jsonb, nullable) 하나를 더할 뿐 기존 행을 바꾸지 않는다.
 * 검증의 핵심은 "정확히 0045까지 적용된 DB 인가", "0046 한 건만 적용됐는가",
 * "컬럼이 jsonb 로 생겼는가", "점검 행이 줄지 않았는가"다.
 *
 * 운영 보고는 적용 중에도 들어오므로 점검 행이 늘어나는 건 정상이라 등식으로 검사하지 않는다.
 */

/** 0046 적용 직전에 기록돼 있어야 하는 마이그레이션 수 (0045까지) */
export const COLLECTOR_LIMIT_CAPTURE_BASELINE_COUNT = 35
/** 0046 적용 직전의 마지막 마이그레이션 타임스탬프 (0045_ax_usage_limit_windows) */
export const COLLECTOR_LIMIT_CAPTURE_BASELINE_TIMESTAMP = '1792400000000'
/** 0046_ax_collector_limit_capture 자신의 타임스탬프 */
export const COLLECTOR_LIMIT_CAPTURE_MIGRATION_TIMESTAMP = '1793000000000'

/** 0046 적용 전후로 검사하는 DB 상태 */
export interface CollectorLimitCaptureMigrationState {
  actualProjectId: string | null
  actualBranchId: string | null
  expectedProjectId: string
  expectedBranchId: string
  productionBranchId: string
  recoveryBranchId?: string
  migrationCount: number
  latestMigrationTimestamp: string | null
  /** limit_capture 컬럼의 데이터 타입. 없으면 null */
  columnType: string | null
  /** ax_usage_collector_state 행 수. 컬럼만 더하므로 줄어들면 안 된다(운영 보고로 늘어나는 건 정상) */
  collectorCount: number
  /** 적용 후 검증에서만 채운다 */
  expectedCollectorCount?: number
}

function validateIdentity(input: CollectorLimitCaptureMigrationState, production: boolean): string[] {
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
 * 적용 전 검증. 정확히 0045까지 적용됐고 컬럼이 아직 없는 상태만 통과시킨다.
 *
 * @param input - 관측한 DB 상태
 * @param production - 운영 브랜치 적용 여부
 * @returns 막아야 할 이유. 비어 있으면 통과
 */
export function validateCollectorLimitCaptureBeforeMigration(
  input: CollectorLimitCaptureMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== COLLECTOR_LIMIT_CAPTURE_BASELINE_COUNT) {
    errors.push(`expected ${COLLECTOR_LIMIT_CAPTURE_BASELINE_COUNT} recorded migrations before apply`)
  }
  if (input.latestMigrationTimestamp !== COLLECTOR_LIMIT_CAPTURE_BASELINE_TIMESTAMP) {
    errors.push('latest recorded migration is not the 0045 baseline')
  }
  if (input.columnType !== null) errors.push('ax_usage_collector_state.limit_capture already exists; refusing to re-apply')
  return errors
}

/**
 * 적용 후 검증. 컬럼이 jsonb 로 생기고, 점검 행이 줄지 않아야 한다.
 *
 * @param input - 관측한 DB 상태
 * @param production - 운영 브랜치 적용 여부
 * @returns 막아야 할 이유. 비어 있으면 통과
 */
export function validateCollectorLimitCaptureAfterMigration(
  input: CollectorLimitCaptureMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== COLLECTOR_LIMIT_CAPTURE_BASELINE_COUNT + 1) {
    errors.push(`expected ${COLLECTOR_LIMIT_CAPTURE_BASELINE_COUNT + 1} recorded migrations after apply`)
  }
  if (input.latestMigrationTimestamp !== COLLECTOR_LIMIT_CAPTURE_MIGRATION_TIMESTAMP) {
    errors.push('latest recorded migration is not 0046')
  }
  if (input.columnType !== 'jsonb') errors.push('ax_usage_collector_state.limit_capture is missing or not jsonb after apply')
  if (input.expectedCollectorCount === undefined) {
    errors.push('pre-migration ax_usage_collector_state count is required for verification')
  } else if (input.collectorCount < input.expectedCollectorCount) {
    errors.push('ax_usage_collector_state row count decreased; 0046 must only add a column')
  }
  return errors
}
