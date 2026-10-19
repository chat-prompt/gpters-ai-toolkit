/**
 * 0045 주간 한도 회차 테이블 마이그레이션 가드 (EDU-11519).
 *
 * 0045는 `ax_usage_limit_windows` 테이블과 인덱스 하나를 새로 만들 뿐 기존 행을 바꾸지 않는다.
 * 그래서 검증의 핵심은 "정확히 0044까지 적용된 DB 인가", "0045 한 건만 적용됐는가",
 * "테이블·기본 키·인덱스가 생겼는가", "기존 사용량 행이 줄지 않았는가"다.
 *
 * 운영 수집은 적용 중에도 계속 들어온다 — 새 테이블에 행이 생기거나 사용량 행이 늘어나는 건 정상이라
 * 등식으로 검사하지 않는다(그러면 이미 커밋된 적용을 실패로 판정한다).
 */

/** 0045 적용 직전에 기록돼 있어야 하는 마이그레이션 수 (0044까지) */
export const USAGE_LIMIT_WINDOWS_BASELINE_COUNT = 34
/** 0045 적용 직전의 마지막 마이그레이션 타임스탬프 (0044_agent_credential_org_edit) */
export const USAGE_LIMIT_WINDOWS_BASELINE_TIMESTAMP = '1791800000000'
/** 0045_ax_usage_limit_windows 자신의 타임스탬프 */
export const USAGE_LIMIT_WINDOWS_MIGRATION_TIMESTAMP = '1792400000000'

/** 0045 적용 전후로 검사하는 DB 상태 */
export interface UsageLimitWindowsMigrationState {
  actualProjectId: string | null
  actualBranchId: string | null
  expectedProjectId: string
  expectedBranchId: string
  productionBranchId: string
  recoveryBranchId?: string
  migrationCount: number
  latestMigrationTimestamp: string | null
  /** ax_usage_limit_windows 테이블 존재 여부 */
  hasTable: boolean
  /** (user_id, client, resets_at) 기본 키 존재 여부 */
  hasPrimaryKey: boolean
  /** resets_at 인덱스 존재 여부 */
  hasResetsAtIndex: boolean
  /** 새 테이블 행 수 (테이블이 없으면 0). 적용 직후부터 운영 보고가 쌓일 수 있어 기록만 한다 */
  windowCount: number
  /** ax_client_usage 행 수. 새 테이블만 만들므로 적용 뒤에 줄어들면 안 된다(운영 보고로 늘어나는 건 정상) */
  usageCount: number
  /** 적용 후 검증에서만 채운다 */
  expectedUsageCount?: number
}

function validateIdentity(input: UsageLimitWindowsMigrationState, production: boolean): string[] {
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
 * 적용 전 검증. 정확히 0044까지 적용됐고 테이블이 아직 없는 상태만 통과시킨다.
 *
 * @param input - 관측한 DB 상태
 * @param production - 운영 브랜치 적용 여부
 * @returns 막아야 할 이유. 비어 있으면 통과
 */
export function validateUsageLimitWindowsBeforeMigration(
  input: UsageLimitWindowsMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== USAGE_LIMIT_WINDOWS_BASELINE_COUNT) {
    errors.push(`expected ${USAGE_LIMIT_WINDOWS_BASELINE_COUNT} recorded migrations before apply`)
  }
  if (input.latestMigrationTimestamp !== USAGE_LIMIT_WINDOWS_BASELINE_TIMESTAMP) {
    errors.push('latest recorded migration is not the 0044 baseline')
  }
  if (input.hasTable) errors.push('ax_usage_limit_windows already exists; refusing to re-apply')
  return errors
}

/**
 * 적용 후 검증. 테이블·기본 키·인덱스가 생기고, 기존 사용량 행이 줄지 않아야 한다.
 *
 * @param input - 관측한 DB 상태
 * @param production - 운영 브랜치 적용 여부
 * @returns 막아야 할 이유. 비어 있으면 통과
 */
export function validateUsageLimitWindowsAfterMigration(
  input: UsageLimitWindowsMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== USAGE_LIMIT_WINDOWS_BASELINE_COUNT + 1) {
    errors.push(`expected ${USAGE_LIMIT_WINDOWS_BASELINE_COUNT + 1} recorded migrations after apply`)
  }
  if (input.latestMigrationTimestamp !== USAGE_LIMIT_WINDOWS_MIGRATION_TIMESTAMP) {
    errors.push('latest recorded migration is not 0045')
  }
  if (!input.hasTable) errors.push('ax_usage_limit_windows is missing after apply')
  if (!input.hasPrimaryKey) errors.push('ax_usage_limit_windows primary key is missing')
  if (!input.hasResetsAtIndex) errors.push('ax_usage_limit_windows_resets_at_idx is missing')
  if (input.expectedUsageCount === undefined) {
    errors.push('pre-migration ax_client_usage count is required for verification')
  } else if (input.usageCount < input.expectedUsageCount) {
    errors.push('ax_client_usage row count decreased; 0045 must only add a table')
  }
  return errors
}
