/** Safety invariants for AX migration 0033 (sessionless skill journeys). */

export const SKILL_JOURNEY_BASELINE_COUNT = 22
export const SKILL_JOURNEY_BASELINE_TIMESTAMP = '1788138000000'
export const SKILL_JOURNEY_TARGET_COUNT = 23
export const SKILL_JOURNEY_TARGET_TIMESTAMP = '1788141600000'

export interface SkillJourneyMigrationState {
  actualProjectId: string | null
  actualBranchId: string | null
  expectedProjectId: string
  expectedBranchId: string
  productionBranchId: string
  recoveryBranchId?: string
  migrationCount: number
  latestMigrationTimestamp: string | null
  hasBaselineTables: boolean
  executionSessionNullable: boolean
  hasSkillEventJourneyColumn: boolean
  hasSkillEventJourneyIndex: boolean
  hasExecutionJourneyColumn: boolean
  hasExecutionJourneyIndex: boolean
  skillEventRows: number
  executionAttemptRows: number
  expectedSkillEventRows?: number
  expectedExecutionAttemptRows?: number
}

function validateIdentity(input: SkillJourneyMigrationState, production: boolean): string[] {
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

export function validateSkillJourneyBeforeMigration(
  input: SkillJourneyMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== SKILL_JOURNEY_BASELINE_COUNT) {
    errors.push(`expected ${SKILL_JOURNEY_BASELINE_COUNT} recorded migrations before apply`)
  }
  if (input.latestMigrationTimestamp !== SKILL_JOURNEY_BASELINE_TIMESTAMP) {
    errors.push('latest recorded migration is not the AX 0032 baseline')
  }
  if (!input.hasBaselineTables) errors.push('skill journey baseline tables are missing')
  if (input.executionSessionNullable) errors.push('execution session_id is already nullable; refusing a partial apply')
  if (
    input.hasSkillEventJourneyColumn || input.hasSkillEventJourneyIndex ||
    input.hasExecutionJourneyColumn || input.hasExecutionJourneyIndex
  ) {
    errors.push('one or more 0033 objects already exist; refusing a partial apply')
  }
  return errors
}

export function validateSkillJourneyAfterMigration(
  input: SkillJourneyMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== SKILL_JOURNEY_TARGET_COUNT) {
    errors.push(`expected ${SKILL_JOURNEY_TARGET_COUNT} recorded migrations after apply`)
  }
  if (input.latestMigrationTimestamp !== SKILL_JOURNEY_TARGET_TIMESTAMP) {
    errors.push('latest recorded migration is not the AX 0033 target')
  }
  if (!input.hasBaselineTables) errors.push('skill journey baseline tables are missing')
  if (
    !input.executionSessionNullable || !input.hasSkillEventJourneyColumn ||
    !input.hasSkillEventJourneyIndex || !input.hasExecutionJourneyColumn ||
    !input.hasExecutionJourneyIndex
  ) {
    errors.push('skill journey schema is incomplete after apply')
  }
  if (
    input.expectedSkillEventRows !== undefined &&
    input.skillEventRows !== input.expectedSkillEventRows
  ) {
    errors.push('0033 unexpectedly changed the skill_events row count')
  }
  if (
    input.expectedExecutionAttemptRows !== undefined &&
    input.executionAttemptRows !== input.expectedExecutionAttemptRows
  ) {
    errors.push('0033 unexpectedly changed the execution attempt row count')
  }
  return errors
}
