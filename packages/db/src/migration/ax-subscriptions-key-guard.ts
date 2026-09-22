/**
 * AX 0043 구독 키 유니크 제약 마이그레이션 가드 (DEV-4491).
 *
 * 0043은 `ax_subscriptions` 에 `(vendor, plan, owner_name, renewal_day)` UNIQUE NULLS NOT DISTINCT
 * 제약 하나를 더할 뿐 행을 바꾸지 않는다. 그래서 검증의 핵심은
 * "정확히 0042까지 적용된 DB 에 중복 키가 없는가", "0043 한 건만 적용됐는가", "행 수가 그대로인가",
 * "제약이 NULLS NOT DISTINCT 로 생겼는가"다.
 */

/** 0043 적용 직전에 기록돼 있어야 하는 마이그레이션 수 (0042까지). 2026-09-22 운영 확인값 */
export const AX_SUBSCRIPTIONS_KEY_BASELINE_COUNT = 32
/** 0043 적용 직전의 마지막 마이그레이션 타임스탬프 (0042_ax_task_expectations) */
export const AX_SUBSCRIPTIONS_KEY_BASELINE_TIMESTAMP = '1789020000000'
/** 0043_ax_subscriptions_key_unique 자신의 타임스탬프 */
export const AX_SUBSCRIPTIONS_KEY_MIGRATION_TIMESTAMP = '1790036000000'
/** 만들 제약 이름 (스키마의 unique() 이름과 같다) */
export const AX_SUBSCRIPTIONS_KEY_CONSTRAINT = 'ax_subscriptions_key_uniq'

/** 0043 적용 전후로 검사하는 DB 상태 */
export interface AxSubscriptionsKeyMigrationState {
  actualProjectId: string | null
  actualBranchId: string | null
  expectedProjectId: string
  expectedBranchId: string
  productionBranchId: string
  recoveryBranchId?: string
  /** PostgreSQL server_version_num. NULLS NOT DISTINCT 는 150000 이상에서만 된다 */
  serverVersionNum: number
  migrationCount: number
  latestMigrationTimestamp: string | null
  /** 제약 존재 여부 */
  hasConstraint: boolean
  /** 제약의 인덱스가 NULLS NOT DISTINCT 인지 (제약이 없으면 false) */
  constraintNullsNotDistinct: boolean
  /** NULL 을 같은 값으로 묶어 센 중복 키 묶음 수. 0이 아니면 제약을 걸 수 없다 */
  duplicateKeyGroups: number
  /** 구독 행 수. 제약만 더하므로 적용 전후로 같아야 한다 */
  subscriptionCount: number
  /** 적용 후 검증에서만 채운다 */
  expectedSubscriptionCount?: number
}

function validateIdentity(input: AxSubscriptionsKeyMigrationState, production: boolean): string[] {
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
 * 적용 전 검증. 정확히 0042까지 적용됐고 중복 키가 없는 상태만 통과시킨다.
 *
 * @param input - 관측한 DB 상태
 * @param production - 운영 브랜치 적용 여부
 * @returns 막아야 할 이유. 비어 있으면 통과
 */
export function validateAxSubscriptionsKeyBeforeMigration(
  input: AxSubscriptionsKeyMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.serverVersionNum < 150000) {
    errors.push('PostgreSQL 15+ is required for UNIQUE NULLS NOT DISTINCT')
  }
  if (input.migrationCount !== AX_SUBSCRIPTIONS_KEY_BASELINE_COUNT) {
    errors.push(`expected ${AX_SUBSCRIPTIONS_KEY_BASELINE_COUNT} recorded migrations before apply`)
  }
  if (input.latestMigrationTimestamp !== AX_SUBSCRIPTIONS_KEY_BASELINE_TIMESTAMP) {
    errors.push('latest recorded migration is not the AX 0042 baseline')
  }
  if (input.hasConstraint) errors.push(`${AX_SUBSCRIPTIONS_KEY_CONSTRAINT} already exists; refusing to re-apply`)
  if (input.duplicateKeyGroups > 0) {
    errors.push(`ax_subscriptions has ${input.duplicateKeyGroups} duplicate key group(s); resolve them before adding the constraint`)
  }
  return errors
}

/**
 * 적용 후 검증. 제약이 NULLS NOT DISTINCT 로 생기고 행은 그대로여야 한다.
 *
 * @param input - 관측한 DB 상태
 * @param production - 운영 브랜치 적용 여부
 * @returns 막아야 할 이유. 비어 있으면 통과
 */
export function validateAxSubscriptionsKeyAfterMigration(
  input: AxSubscriptionsKeyMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== AX_SUBSCRIPTIONS_KEY_BASELINE_COUNT + 1) {
    errors.push(`expected ${AX_SUBSCRIPTIONS_KEY_BASELINE_COUNT + 1} recorded migrations after apply`)
  }
  if (input.latestMigrationTimestamp !== AX_SUBSCRIPTIONS_KEY_MIGRATION_TIMESTAMP) {
    errors.push('latest recorded migration is not AX 0043')
  }
  if (!input.hasConstraint) errors.push(`${AX_SUBSCRIPTIONS_KEY_CONSTRAINT} is missing after apply`)
  else if (!input.constraintNullsNotDistinct) {
    errors.push(`${AX_SUBSCRIPTIONS_KEY_CONSTRAINT} must be NULLS NOT DISTINCT`)
  }
  if (input.expectedSubscriptionCount === undefined) {
    errors.push('pre-migration subscription count is required for verification')
  } else if (input.subscriptionCount !== input.expectedSubscriptionCount) {
    errors.push('ax_subscriptions row count changed; 0043 must only add a constraint')
  }
  return errors
}
