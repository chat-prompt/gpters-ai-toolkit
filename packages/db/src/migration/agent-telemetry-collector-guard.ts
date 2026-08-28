export const AGENT_COLLECTOR_BASELINE_COUNT = 20
export const AGENT_COLLECTOR_BASELINE_TIMESTAMP = '1787792561023'
export const AGENT_COLLECTOR_TARGET_COUNT = 21
export const AGENT_COLLECTOR_TARGET_TIMESTAMP = '1787821200000'

export interface AgentCollectorMigrationState {
  actualProjectId: string | null
  actualBranchId: string | null
  expectedProjectId: string
  expectedBranchId: string
  productionBranchId: string
  recoveryBranchId?: string
  migrationCount: number
  latestMigrationTimestamp: string | null
  hasBaselineObjects: boolean
  hasCollectorTable: boolean
  hasRequiredColumns: boolean
  hasRequiredIndexes: boolean
  hasRequiredConstraints: boolean
  collectorRows: number
}

function validateIdentity(input: AgentCollectorMigrationState, production: boolean): string[] {
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
  } else {
    if (input.expectedBranchId === input.productionBranchId || input.actualBranchId === input.productionBranchId) {
      errors.push('refusing to run the child migration on the production branch')
    }
  }
  return errors
}

export function validateAgentCollectorBeforeMigration(
  input: AgentCollectorMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== AGENT_COLLECTOR_BASELINE_COUNT) {
    errors.push(`expected ${AGENT_COLLECTOR_BASELINE_COUNT} recorded migrations before apply`)
  }
  if (input.latestMigrationTimestamp !== AGENT_COLLECTOR_BASELINE_TIMESTAMP) {
    errors.push('latest recorded migration is not the AX 0030 baseline')
  }
  if (!input.hasBaselineObjects) errors.push('one or more AX 0030 baseline objects are missing')
  if (input.hasCollectorTable) errors.push('collector table already exists; refusing a partial apply')
  if (input.collectorRows !== 0) errors.push('collector rows exist before the collector table migration')
  return errors
}

export function validateAgentCollectorAfterMigration(
  input: AgentCollectorMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== AGENT_COLLECTOR_TARGET_COUNT) {
    errors.push(`expected ${AGENT_COLLECTOR_TARGET_COUNT} recorded migrations after apply`)
  }
  if (input.latestMigrationTimestamp !== AGENT_COLLECTOR_TARGET_TIMESTAMP) {
    errors.push('latest recorded migration is not the AX 0031 target')
  }
  if (!input.hasBaselineObjects) errors.push('one or more AX 0030 baseline objects are missing')
  if (!input.hasCollectorTable || !input.hasRequiredColumns ||
    !input.hasRequiredIndexes || !input.hasRequiredConstraints) {
    errors.push('collector registry schema is incomplete after apply')
  }
  // 0031 creates an empty registry; it does not backfill or mutate existing telemetry batches.
  if (input.collectorRows !== 0) errors.push('0031 unexpectedly created collector rows')
  return errors
}
