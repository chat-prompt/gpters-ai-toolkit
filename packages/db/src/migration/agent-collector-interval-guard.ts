/**
 * AX 0034 수집기 기본 주기(21600 → 3600) 마이그레이션 가드.
 *
 * 0034는 컬럼 기본값만 바꾸고 기존 행은 건드리지 않는다. 그래서 검증의 핵심은
 * "정확히 0033까지 적용된 DB에서 0034 한 건만 적용되는가"와 "기존 수집기의 interval이 그대로인가"다.
 */

/** 0034 적용 직전에 기록돼 있어야 하는 마이그레이션 수 (0033까지) */
export const COLLECTOR_INTERVAL_BASELINE_COUNT = 23
/** 0034 적용 직전의 마지막 마이그레이션 타임스탬프 (0033_ax_skill_journeys) */
export const COLLECTOR_INTERVAL_BASELINE_TIMESTAMP = '1788141600000'
/** 0034_agent_collector_hourly_default 자신의 타임스탬프 */
export const COLLECTOR_INTERVAL_MIGRATION_TIMESTAMP = '1788414275714'
/** 적용 후 컬럼 기본값 */
export const COLLECTOR_INTERVAL_EXPECTED_DEFAULT = 3600

/** 수집기 interval 분포. 기본값만 바뀌므로 적용 전후로 같아야 한다. */
export interface CollectorIntervalBucket {
  intervalSeconds: number
  count: number
}

/** 0034 적용 전후로 검사하는 DB 상태 */
export interface CollectorIntervalMigrationState {
  actualProjectId: string | null
  actualBranchId: string | null
  expectedProjectId: string
  expectedBranchId: string
  productionBranchId: string
  recoveryBranchId?: string
  migrationCount: number
  latestMigrationTimestamp: string | null
  hasCollectorTable: boolean
  /** information_schema가 돌려주는 column_default 원문 (예: '3600') */
  columnDefault: string | null
  intervalHistogram: CollectorIntervalBucket[]
  /** 적용 후 검증에서만 채운다 */
  expectedIntervalHistogram?: CollectorIntervalBucket[]
}

/** 기본값 문자열이 기대한 정수인지. Postgres는 '3600'처럼 돌려준다. */
function defaultEquals(columnDefault: string | null, expected: number): boolean {
  if (!columnDefault) return false
  const match = columnDefault.match(/-?\d+/)
  return match !== null && Number.parseInt(match[0], 10) === expected
}

function histogramEquals(left: CollectorIntervalBucket[], right: CollectorIntervalBucket[]): boolean {
  if (left.length !== right.length) return false
  const key = (bucket: CollectorIntervalBucket) => `${bucket.intervalSeconds}:${bucket.count}`
  const sorted = (buckets: CollectorIntervalBucket[]) => buckets.map(key).sort()
  return sorted(left).join('|') === sorted(right).join('|')
}

function validateIdentity(input: CollectorIntervalMigrationState, production: boolean): string[] {
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
 * 적용 전 검증. 정확히 0033까지 적용된 상태만 통과시킨다.
 *
 * drizzle의 migrate()는 미적용 마이그레이션을 모두 적용하므로, 기준선을 여기서 막지 않으면
 * 0032·0033까지 함께 적용된 뒤에야 사후 검증이 실패한다.
 */
export function validateCollectorIntervalBeforeMigration(
  input: CollectorIntervalMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== COLLECTOR_INTERVAL_BASELINE_COUNT) {
    errors.push(`expected ${COLLECTOR_INTERVAL_BASELINE_COUNT} recorded migrations before apply`)
  }
  if (input.latestMigrationTimestamp !== COLLECTOR_INTERVAL_BASELINE_TIMESTAMP) {
    errors.push('latest recorded migration is not the AX 0033 baseline')
  }
  if (!input.hasCollectorTable) errors.push('ax_agent_telemetry_collectors is missing; AX 0031 is not applied')
  if (defaultEquals(input.columnDefault, COLLECTOR_INTERVAL_EXPECTED_DEFAULT)) {
    errors.push('interval_seconds default is already 3600; refusing to re-apply')
  }
  return errors
}

/** 적용 후 검증. 기본값만 바뀌고 기존 수집기 행은 그대로여야 한다. */
export function validateCollectorIntervalAfterMigration(
  input: CollectorIntervalMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== COLLECTOR_INTERVAL_BASELINE_COUNT + 1) {
    errors.push(`expected ${COLLECTOR_INTERVAL_BASELINE_COUNT + 1} recorded migrations after apply`)
  }
  if (input.latestMigrationTimestamp !== COLLECTOR_INTERVAL_MIGRATION_TIMESTAMP) {
    errors.push('latest recorded migration is not AX 0034')
  }
  if (!defaultEquals(input.columnDefault, COLLECTOR_INTERVAL_EXPECTED_DEFAULT)) {
    errors.push(`interval_seconds default is ${input.columnDefault ?? 'null'}, expected 3600`)
  }
  if (!input.expectedIntervalHistogram) {
    errors.push('pre-migration interval histogram is required for verification')
  } else if (!histogramEquals(input.intervalHistogram, input.expectedIntervalHistogram)) {
    errors.push('existing collector intervals changed; 0034 must only change the column default')
  }
  return errors
}
