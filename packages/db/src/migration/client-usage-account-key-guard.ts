/**
 * 0049 개인 사용 보고 계정 키 컬럼 마이그레이션 가드 (EDU-11835).
 *
 * 0049는 `ax_client_usage` 에 `account_key`(text, nullable)와 형식 CHECK 를 더할 뿐 기존 행을 바꾸지 않는다.
 * 검증의 핵심은 "정확히 0048까지 적용된 DB 인가", "0049 한 건만 적용됐는가",
 * "컬럼이 text 로, CHECK 가 함께 생겼는가", "사용량 행이 줄지 않았는가"다.
 *
 * 운영 보고는 적용 중에도 들어오므로 행이 늘어나는 건 정상이라 등식으로 검사하지 않는다.
 */

/** 0049 적용 직전에 기록돼 있어야 하는 마이그레이션 수 (0048까지) */
export const CLIENT_USAGE_ACCOUNT_KEY_BASELINE_COUNT = 38
/** 0049 적용 직전의 마지막 마이그레이션 타임스탬프 (0048_ax_limit_window_first_percent) */
export const CLIENT_USAGE_ACCOUNT_KEY_BASELINE_TIMESTAMP = '1794200000000'
/** 0049_ax_client_usage_account_key 자신의 타임스탬프 */
export const CLIENT_USAGE_ACCOUNT_KEY_MIGRATION_TIMESTAMP = '1794800000000'

/** 0049 적용 전후로 검사하는 DB 상태 */
export interface ClientUsageAccountKeyMigrationState {
  actualProjectId: string | null
  actualBranchId: string | null
  expectedProjectId: string
  expectedBranchId: string
  productionBranchId: string
  recoveryBranchId?: string
  migrationCount: number
  latestMigrationTimestamp: string | null
  /** ax_client_usage.account_key 의 데이터 타입. 없으면 null */
  columnType: string | null
  /** ax_client_usage_account_key_check 가 있는가 */
  hasCheck: boolean
  /** ax_client_usage 행 수. 컬럼만 더하므로 줄어들면 안 된다(운영 보고로 늘어나는 건 정상) */
  rowCount: number
  /** 적용 후 검증에서만 채운다 */
  expectedRowCount?: number
}

function validateIdentity(input: ClientUsageAccountKeyMigrationState, production: boolean): string[] {
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
 * 적용 전 검증. 정확히 0048까지 적용됐고 컬럼·CHECK 가 아직 없는 상태만 통과시킨다.
 *
 * @param input - 관측한 DB 상태
 * @param production - 운영 브랜치 적용 여부
 * @returns 막아야 할 이유. 비어 있으면 통과
 */
export function validateClientUsageAccountKeyBeforeMigration(
  input: ClientUsageAccountKeyMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== CLIENT_USAGE_ACCOUNT_KEY_BASELINE_COUNT) {
    errors.push(`expected ${CLIENT_USAGE_ACCOUNT_KEY_BASELINE_COUNT} recorded migrations before apply`)
  }
  if (input.latestMigrationTimestamp !== CLIENT_USAGE_ACCOUNT_KEY_BASELINE_TIMESTAMP) {
    errors.push('latest recorded migration is not the 0048 baseline')
  }
  if (input.columnType !== null) errors.push('ax_client_usage.account_key already exists; refusing to re-apply')
  if (input.hasCheck) errors.push('ax_client_usage_account_key_check already exists; refusing to re-apply')
  return errors
}

/**
 * 적용 후 검증. 컬럼이 text 로, CHECK 가 함께 생기고, 사용량 행이 줄지 않아야 한다.
 *
 * @param input - 관측한 DB 상태
 * @param production - 운영 브랜치 적용 여부
 * @returns 막아야 할 이유. 비어 있으면 통과
 */
export function validateClientUsageAccountKeyAfterMigration(
  input: ClientUsageAccountKeyMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== CLIENT_USAGE_ACCOUNT_KEY_BASELINE_COUNT + 1) {
    errors.push(`expected ${CLIENT_USAGE_ACCOUNT_KEY_BASELINE_COUNT + 1} recorded migrations after apply`)
  }
  if (input.latestMigrationTimestamp !== CLIENT_USAGE_ACCOUNT_KEY_MIGRATION_TIMESTAMP) {
    errors.push('latest recorded migration is not 0049')
  }
  if (input.columnType !== 'text') errors.push('ax_client_usage.account_key is missing or not text after apply')
  if (!input.hasCheck) errors.push('ax_client_usage_account_key_check is missing after apply')
  if (input.expectedRowCount === undefined) {
    errors.push('pre-migration client usage row count is required for verification')
  } else if (input.rowCount < input.expectedRowCount) {
    errors.push('client usage row count decreased; 0049 must only add a column')
  }
  return errors
}
