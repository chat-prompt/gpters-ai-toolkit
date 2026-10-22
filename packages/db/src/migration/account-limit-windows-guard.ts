/**
 * 0047 공용 계정 주간 한도 회차 마이그레이션 가드 (EDU-11519).
 *
 * 0047은 `ax_account_limit_windows` 테이블·인덱스와 `ax_subscriptions.account_key`(nullable) 열을 더할 뿐
 * 기존 행을 바꾸지 않는다. 그래서 검증의 핵심은 "정확히 0046까지 적용된 DB 인가", "0047 한 건만 적용됐는가",
 * "테이블·기본 키·인덱스·열이 생겼는가", "구독 행이 줄지 않았는가"다.
 *
 * 운영 보고·구독 동기화는 적용 중에도 들어온다 — 새 테이블에 행이 생기거나 구독 행이 늘어나는 건 정상이라
 * 등식으로 검사하지 않는다(그러면 이미 커밋된 적용을 실패로 판정한다).
 */

/** 0047 적용 직전에 기록돼 있어야 하는 마이그레이션 수 (0046까지) */
export const ACCOUNT_LIMIT_WINDOWS_BASELINE_COUNT = 36
/** 0047 적용 직전의 마지막 마이그레이션 타임스탬프 (0046_ax_collector_limit_capture) */
export const ACCOUNT_LIMIT_WINDOWS_BASELINE_TIMESTAMP = '1793000000000'
/** 0047_ax_account_limit_windows 자신의 타임스탬프 */
export const ACCOUNT_LIMIT_WINDOWS_MIGRATION_TIMESTAMP = '1793600000000'

/** 0047 적용 전후로 검사하는 DB 상태 */
export interface AccountLimitWindowsMigrationState {
  actualProjectId: string | null
  actualBranchId: string | null
  expectedProjectId: string
  expectedBranchId: string
  productionBranchId: string
  recoveryBranchId?: string
  migrationCount: number
  latestMigrationTimestamp: string | null
  /** ax_account_limit_windows 테이블 존재 여부 */
  hasTable: boolean
  /** (client, account_key, resets_at) 기본 키 존재 여부 */
  hasPrimaryKey: boolean
  /** resets_at 인덱스 존재 여부 */
  hasResetsAtIndex: boolean
  /** ax_subscriptions.account_key 열 존재 여부 */
  hasSubscriptionAccountKey: boolean
  /** 새 테이블 행 수 (테이블이 없으면 0). 적용 직후부터 운영 보고가 쌓일 수 있어 기록만 한다 */
  windowCount: number
  /** ax_subscriptions 행 수. 열만 더하므로 적용 뒤에 줄어들면 안 된다(동기화로 늘어나는 건 정상) */
  subscriptionCount: number
  /** 적용 후 검증에서만 채운다 */
  expectedSubscriptionCount?: number
}

function validateIdentity(input: AccountLimitWindowsMigrationState, production: boolean): string[] {
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
 * 적용 전 검증. 정확히 0046까지 적용됐고 테이블·열이 아직 없는 상태만 통과시킨다.
 *
 * @param input - 관측한 DB 상태
 * @param production - 운영 브랜치 적용 여부
 * @returns 막아야 할 이유. 비어 있으면 통과
 */
export function validateAccountLimitWindowsBeforeMigration(
  input: AccountLimitWindowsMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== ACCOUNT_LIMIT_WINDOWS_BASELINE_COUNT) {
    errors.push(`expected ${ACCOUNT_LIMIT_WINDOWS_BASELINE_COUNT} recorded migrations before apply`)
  }
  if (input.latestMigrationTimestamp !== ACCOUNT_LIMIT_WINDOWS_BASELINE_TIMESTAMP) {
    errors.push('latest recorded migration is not the 0046 baseline')
  }
  if (input.hasTable) errors.push('ax_account_limit_windows already exists; refusing to re-apply')
  if (input.hasSubscriptionAccountKey) errors.push('ax_subscriptions.account_key already exists; refusing to re-apply')
  return errors
}

/**
 * 적용 후 검증. 테이블·기본 키·인덱스·열이 생기고, 구독 행이 줄지 않아야 한다.
 *
 * @param input - 관측한 DB 상태
 * @param production - 운영 브랜치 적용 여부
 * @returns 막아야 할 이유. 비어 있으면 통과
 */
export function validateAccountLimitWindowsAfterMigration(
  input: AccountLimitWindowsMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== ACCOUNT_LIMIT_WINDOWS_BASELINE_COUNT + 1) {
    errors.push(`expected ${ACCOUNT_LIMIT_WINDOWS_BASELINE_COUNT + 1} recorded migrations after apply`)
  }
  if (input.latestMigrationTimestamp !== ACCOUNT_LIMIT_WINDOWS_MIGRATION_TIMESTAMP) {
    errors.push('latest recorded migration is not 0047')
  }
  if (!input.hasTable) errors.push('ax_account_limit_windows is missing after apply')
  if (!input.hasPrimaryKey) errors.push('ax_account_limit_windows primary key is missing')
  if (!input.hasResetsAtIndex) errors.push('ax_account_limit_windows_resets_at_idx is missing')
  if (!input.hasSubscriptionAccountKey) errors.push('ax_subscriptions.account_key is missing after apply')
  if (input.expectedSubscriptionCount === undefined) {
    errors.push('pre-migration ax_subscriptions count is required for verification')
  } else if (input.subscriptionCount < input.expectedSubscriptionCount) {
    errors.push('ax_subscriptions row count decreased; 0047 must only add a table and a column')
  }
  return errors
}
