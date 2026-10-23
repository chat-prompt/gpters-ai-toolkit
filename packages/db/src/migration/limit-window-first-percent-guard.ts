/**
 * 0048 주간 한도 회차 첫 관측 사용률 컬럼 마이그레이션 가드 (EDU-11519).
 *
 * 0048은 `ax_usage_limit_windows`·`ax_account_limit_windows` 에 `first_used_percent`(numeric, nullable) 를 하나씩 더할 뿐
 * 기존 행을 바꾸지 않는다. 검증의 핵심은 "정확히 0047까지 적용된 DB 인가", "0048 한 건만 적용됐는가",
 * "두 컬럼이 numeric 으로 생겼는가", "회차 행이 줄지 않았는가"다.
 *
 * 운영 보고는 적용 중에도 들어오므로 회차 행이 늘어나는 건 정상이라 등식으로 검사하지 않는다.
 */

/** 0048 적용 직전에 기록돼 있어야 하는 마이그레이션 수 (0047까지) */
export const FIRST_PERCENT_BASELINE_COUNT = 37
/** 0048 적용 직전의 마지막 마이그레이션 타임스탬프 (0047_ax_account_limit_windows) */
export const FIRST_PERCENT_BASELINE_TIMESTAMP = '1793600000000'
/** 0048_ax_limit_window_first_percent 자신의 타임스탬프 */
export const FIRST_PERCENT_MIGRATION_TIMESTAMP = '1794200000000'

/** 0048 적용 전후로 검사하는 DB 상태 */
export interface FirstPercentMigrationState {
  actualProjectId: string | null
  actualBranchId: string | null
  expectedProjectId: string
  expectedBranchId: string
  productionBranchId: string
  recoveryBranchId?: string
  migrationCount: number
  latestMigrationTimestamp: string | null
  /** ax_usage_limit_windows.first_used_percent 의 데이터 타입. 없으면 null */
  usageColumnType: string | null
  /** ax_account_limit_windows.first_used_percent 의 데이터 타입. 없으면 null */
  accountColumnType: string | null
  /** 두 회차 테이블 행 수 합. 컬럼만 더하므로 줄어들면 안 된다(운영 보고로 늘어나는 건 정상) */
  windowCount: number
  /** 적용 후 검증에서만 채운다 */
  expectedWindowCount?: number
}

function validateIdentity(input: FirstPercentMigrationState, production: boolean): string[] {
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
 * 적용 전 검증. 정확히 0047까지 적용됐고 두 컬럼이 아직 없는 상태만 통과시킨다.
 *
 * @param input - 관측한 DB 상태
 * @param production - 운영 브랜치 적용 여부
 * @returns 막아야 할 이유. 비어 있으면 통과
 */
export function validateFirstPercentBeforeMigration(
  input: FirstPercentMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== FIRST_PERCENT_BASELINE_COUNT) {
    errors.push(`expected ${FIRST_PERCENT_BASELINE_COUNT} recorded migrations before apply`)
  }
  if (input.latestMigrationTimestamp !== FIRST_PERCENT_BASELINE_TIMESTAMP) {
    errors.push('latest recorded migration is not the 0047 baseline')
  }
  if (input.usageColumnType !== null) errors.push('ax_usage_limit_windows.first_used_percent already exists; refusing to re-apply')
  if (input.accountColumnType !== null) errors.push('ax_account_limit_windows.first_used_percent already exists; refusing to re-apply')
  return errors
}

/**
 * 적용 후 검증. 두 컬럼이 numeric 으로 생기고, 회차 행이 줄지 않아야 한다.
 *
 * @param input - 관측한 DB 상태
 * @param production - 운영 브랜치 적용 여부
 * @returns 막아야 할 이유. 비어 있으면 통과
 */
export function validateFirstPercentAfterMigration(
  input: FirstPercentMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== FIRST_PERCENT_BASELINE_COUNT + 1) {
    errors.push(`expected ${FIRST_PERCENT_BASELINE_COUNT + 1} recorded migrations after apply`)
  }
  if (input.latestMigrationTimestamp !== FIRST_PERCENT_MIGRATION_TIMESTAMP) {
    errors.push('latest recorded migration is not 0048')
  }
  if (input.usageColumnType !== 'numeric') errors.push('ax_usage_limit_windows.first_used_percent is missing or not numeric after apply')
  if (input.accountColumnType !== 'numeric') errors.push('ax_account_limit_windows.first_used_percent is missing or not numeric after apply')
  if (input.expectedWindowCount === undefined) {
    errors.push('pre-migration limit window count is required for verification')
  } else if (input.windowCount < input.expectedWindowCount) {
    errors.push('limit window row count decreased; 0048 must only add columns')
  }
  return errors
}
