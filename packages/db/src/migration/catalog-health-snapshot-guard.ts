/**
 * AX 0035 카탈로그 위생 스냅숏 테이블 마이그레이션 가드.
 *
 * 0035는 새 테이블 하나를 만들 뿐 기존 테이블을 건드리지 않는다. 그래서 검증의 핵심은
 * "정확히 0034까지 적용된 DB에서 0035 한 건만 적용되는가"와 "기존 카탈로그 행이 그대로인가"다.
 */

/** 0035 적용 직전에 기록돼 있어야 하는 마이그레이션 수 (0034까지) */
export const CATALOG_SNAPSHOT_BASELINE_COUNT = 24
/** 0035 적용 직전의 마지막 마이그레이션 타임스탬프 (0034_agent_collector_hourly_default) */
export const CATALOG_SNAPSHOT_BASELINE_TIMESTAMP = '1788414275714'
/** 0035_ax_catalog_health_snapshots 자신의 타임스탬프 */
export const CATALOG_SNAPSHOT_MIGRATION_TIMESTAMP = '1788742000000'

/** 0035 적용 전후로 검사하는 DB 상태 */
export interface CatalogSnapshotMigrationState {
  actualProjectId: string | null
  actualBranchId: string | null
  expectedProjectId: string
  expectedBranchId: string
  productionBranchId: string
  recoveryBranchId?: string
  migrationCount: number
  latestMigrationTimestamp: string | null
  /** 새로 만들 테이블의 존재 여부 */
  hasSnapshotTable: boolean
  /** 카탈로그 행 수. 새 테이블만 만들므로 적용 전후로 같아야 한다 */
  catalogItemCount: number
  /** 적용 후 검증에서만 채운다 */
  expectedCatalogItemCount?: number
}

function validateIdentity(input: CatalogSnapshotMigrationState, production: boolean): string[] {
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
export function validateCatalogSnapshotBeforeMigration(
  input: CatalogSnapshotMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== CATALOG_SNAPSHOT_BASELINE_COUNT) {
    errors.push(`expected ${CATALOG_SNAPSHOT_BASELINE_COUNT} recorded migrations before apply`)
  }
  if (input.latestMigrationTimestamp !== CATALOG_SNAPSHOT_BASELINE_TIMESTAMP) {
    errors.push('latest recorded migration is not the AX 0034 baseline')
  }
  if (input.hasSnapshotTable) errors.push('ax_catalog_health_snapshots already exists; refusing to re-apply')
  return errors
}

/** 적용 후 검증. 새 테이블만 생기고 카탈로그 행은 그대로여야 한다. */
export function validateCatalogSnapshotAfterMigration(
  input: CatalogSnapshotMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== CATALOG_SNAPSHOT_BASELINE_COUNT + 1) {
    errors.push(`expected ${CATALOG_SNAPSHOT_BASELINE_COUNT + 1} recorded migrations after apply`)
  }
  if (input.latestMigrationTimestamp !== CATALOG_SNAPSHOT_MIGRATION_TIMESTAMP) {
    errors.push('latest recorded migration is not AX 0035')
  }
  if (!input.hasSnapshotTable) errors.push('ax_catalog_health_snapshots is missing after apply')
  if (input.expectedCatalogItemCount === undefined) {
    errors.push('pre-migration catalog item count is required for verification')
  } else if (input.catalogItemCount !== input.expectedCatalogItemCount) {
    errors.push('catalog items changed; 0035 must only create a new table')
  }
  return errors
}
