/**
 * AX 0038 크론 실행 기록 테이블 마이그레이션 가드.
 *
 * 0038은 새 테이블 하나와 enum 하나를 만들 뿐 기존 테이블을 건드리지 않는다. 그래서 검증의 핵심은
 * "정확히 0037까지 적용된 DB에서 0038 한 건만 적용되는가"와 "기존 행이 그대로인가"다.
 */

/** 0038 적용 직전에 기록돼 있어야 하는 마이그레이션 수 (0037까지) */
export const CRON_RUNS_BASELINE_COUNT = 27
/** 0038 적용 직전의 마지막 마이그레이션 타임스탬프 (0037_session_delete_keeps_events) */
export const CRON_RUNS_BASELINE_TIMESTAMP = '1788751000000'
/** 0038_cron_runs 자신의 타임스탬프 */
export const CRON_RUNS_MIGRATION_TIMESTAMP = '1788754000000'

/** 0038 적용 전후로 검사하는 DB 상태 */
export interface CronRunsMigrationState {
  actualProjectId: string | null
  actualBranchId: string | null
  expectedProjectId: string
  expectedBranchId: string
  productionBranchId: string
  recoveryBranchId?: string
  migrationCount: number
  latestMigrationTimestamp: string | null
  /** 새로 만들 테이블의 존재 여부 */
  hasCronRunsTable: boolean
  /** 새로 만들 enum 타입의 존재 여부 */
  hasStatusEnum: boolean
  /** 스킬 이벤트 행 수. 새 테이블만 만들므로 적용 전후로 같아야 한다 */
  skillEventCount: number
  /** 적용 후 검증에서만 채운다 */
  expectedSkillEventCount?: number
}

function validateIdentity(input: CronRunsMigrationState, production: boolean): string[] {
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
 * 적용 전 검증. 정확히 0037까지 적용된 상태만 통과시킨다.
 *
 * @param input - 관측한 DB 상태
 * @param production - 운영 브랜치 적용 여부
 * @returns 막아야 할 이유. 비어 있으면 통과
 */
export function validateCronRunsBeforeMigration(
  input: CronRunsMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== CRON_RUNS_BASELINE_COUNT) {
    errors.push(`expected ${CRON_RUNS_BASELINE_COUNT} recorded migrations before apply`)
  }
  if (input.latestMigrationTimestamp !== CRON_RUNS_BASELINE_TIMESTAMP) {
    errors.push('latest recorded migration is not the AX 0037 baseline')
  }
  if (input.hasCronRunsTable) errors.push('cron_runs already exists; refusing to re-apply')
  return errors
}

/**
 * 적용 후 검증. 새 테이블과 enum만 생기고 기존 행은 그대로여야 한다.
 *
 * @param input - 관측한 DB 상태
 * @param production - 운영 브랜치 적용 여부
 * @returns 막아야 할 이유. 비어 있으면 통과
 */
export function validateCronRunsAfterMigration(
  input: CronRunsMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== CRON_RUNS_BASELINE_COUNT + 1) {
    errors.push(`expected ${CRON_RUNS_BASELINE_COUNT + 1} recorded migrations after apply`)
  }
  if (input.latestMigrationTimestamp !== CRON_RUNS_MIGRATION_TIMESTAMP) {
    errors.push('latest recorded migration is not AX 0038')
  }
  if (!input.hasCronRunsTable) errors.push('cron_runs is missing after apply')
  if (!input.hasStatusEnum) errors.push('cron_run_status enum is missing after apply')
  if (input.expectedSkillEventCount === undefined) {
    errors.push('pre-migration skill event count is required for verification')
  } else if (input.skillEventCount !== input.expectedSkillEventCount) {
    errors.push('skill events changed; 0038 must only create a new table')
  }
  return errors
}
