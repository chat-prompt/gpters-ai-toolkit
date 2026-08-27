export const AX_BASELINE_MIGRATION_COUNT = 15
export const AX_BASELINE_LATEST_TIMESTAMP = '1787722904000'
export const AX_TARGET_MIGRATION_COUNT = 20
export const AX_TARGET_LATEST_TIMESTAMP = '1787792561023'

export interface AxMigrationObjectState {
  hasCollectorState: boolean
  hasAccountStatus: boolean
  hasMembershipStatus: boolean
  hasUsageUserId: boolean
  hasExecutionAttempts: boolean
  hasExecutionEvents: boolean
}

export interface AxMigrationImpact {
  usageRows: number
  uniquelyMatchedRows: number
  ambiguousRows: number
  unmatchedRows: number
  duplicateGroups: number
  rowsDeletedByDedupe: number
}

export interface AxChildMigrationGuardInput {
  actualProjectId: string | null
  actualBranchId: string | null
  expectedProjectId: string
  expectedBranchId: string
  productionBranchId: string
  migrationCount: number
  latestMigrationTimestamp: string | null
  objects: AxMigrationObjectState
  impact: AxMigrationImpact
}

function validateIdentity(input: AxChildMigrationGuardInput): string[] {
  const errors: string[] = []
  if (!input.expectedProjectId) errors.push('expected project ID is required')
  if (!input.expectedBranchId) errors.push('expected child branch ID is required')
  if (!input.productionBranchId) errors.push('production branch ID is required')
  if (input.expectedBranchId === input.productionBranchId) {
    errors.push('expected child branch ID must differ from the production branch ID')
  }
  if (!input.actualProjectId || input.actualProjectId !== input.expectedProjectId) {
    errors.push('database project ID does not match the expected project')
  }
  if (!input.actualBranchId || input.actualBranchId !== input.expectedBranchId) {
    errors.push('database branch ID does not match the expected child branch')
  }
  if (input.actualBranchId === input.productionBranchId) {
    errors.push('refusing to run AX follow-up migrations on the production branch')
  }
  return errors
}

function validateImpact(impact: AxMigrationImpact): string[] {
  const errors: string[] = []
  if (impact.ambiguousRows !== 0) errors.push('0028 has ambiguous identity matches')
  if (impact.unmatchedRows !== 0) errors.push('0028 has unmatched usage rows')
  if (impact.duplicateGroups !== 0) errors.push('0028 would collapse duplicate groups')
  if (impact.rowsDeletedByDedupe !== 0) errors.push('0028 would delete usage rows')
  if (
    impact.uniquelyMatchedRows + impact.ambiguousRows + impact.unmatchedRows !==
    impact.usageRows
  ) {
    errors.push('0028 impact counters do not reconcile with usage rows')
  }
  return errors
}

function objectValues(objects: AxMigrationObjectState): boolean[] {
  return [
    objects.hasCollectorState,
    objects.hasAccountStatus,
    objects.hasMembershipStatus,
    objects.hasUsageUserId,
    objects.hasExecutionAttempts,
    objects.hasExecutionEvents,
  ]
}

export function validateAxChildBeforeMigration(input: AxChildMigrationGuardInput): string[] {
  const errors = [...validateIdentity(input), ...validateImpact(input.impact)]
  if (input.migrationCount !== AX_BASELINE_MIGRATION_COUNT) {
    errors.push(`expected ${AX_BASELINE_MIGRATION_COUNT} recorded migrations before apply`)
  }
  if (input.latestMigrationTimestamp !== AX_BASELINE_LATEST_TIMESTAMP) {
    errors.push('latest recorded migration is not the production 0025 baseline')
  }
  if (objectValues(input.objects).some(Boolean)) {
    errors.push('one or more AX follow-up objects already exist; refusing a partial apply')
  }
  return errors
}

export function validateAxChildAfterMigration(input: AxChildMigrationGuardInput): string[] {
  const errors = [...validateIdentity(input), ...validateImpact(input.impact)]
  if (input.migrationCount !== AX_TARGET_MIGRATION_COUNT) {
    errors.push(`expected ${AX_TARGET_MIGRATION_COUNT} recorded migrations after apply`)
  }
  if (input.latestMigrationTimestamp !== AX_TARGET_LATEST_TIMESTAMP) {
    errors.push('latest recorded migration is not the AX 0030 target')
  }
  if (objectValues(input.objects).some((value) => !value)) {
    errors.push('one or more AX follow-up objects are missing after apply')
  }
  return errors
}
