/** Safety invariants for AX migration 0032 (sessionless skill events). */

export const SESSIONLESS_SKILL_EVENTS_BASELINE_COUNT = 21
export const SESSIONLESS_SKILL_EVENTS_BASELINE_TIMESTAMP = '1787821200000'
export const SESSIONLESS_SKILL_EVENTS_TARGET_COUNT = 22
export const SESSIONLESS_SKILL_EVENTS_TARGET_TIMESTAMP = '1788138000000'

interface SessionlessSkillEventsIdentity {
  actualProjectId: string | null
  actualBranchId: string | null
  expectedProjectId: string
  expectedBranchId: string
  productionBranchId: string
  recoveryBranchId?: string
}

export interface SessionlessSkillEventsMigrationState extends SessionlessSkillEventsIdentity {
  migrationCount: number
  latestMigrationTimestamp: string | null
  hasBaselineObjects: boolean
  sessionIdNullable: boolean
  hasSourceAuditLogColumn: boolean
  hasSourceAuditForeignKey: boolean
  hasSourceAuditIndex: boolean
  hasSourceUniqueIndex: boolean
  skillEventRows: number
  sourceLinkedRows: number
  expectedSkillEventRows?: number
}

function validateIdentity(
  input: SessionlessSkillEventsIdentity,
  production: boolean,
): string[] {
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

export interface SessionlessSkillEventsBackfillState extends SessionlessSkillEventsIdentity {
  migrationCount: number
  latestMigrationTimestamp: string | null
  schemaReady: boolean
  targetAuditRows: number
  candidateRows: number
  eligibleRows: number
  unmatchedRows: number
  unresolvedAuditRows: number
  alreadyBackfilledRows: number
  requestedInsertRows: number
  acknowledgedUnmatchedRows: number
  acknowledgedUnresolvedAuditRows: number
}

/** Validate an exact, count-only dry run before any historical rows are inserted. */
export function validateSessionlessSkillEventsBackfill(
  input: SessionlessSkillEventsBackfillState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== SESSIONLESS_SKILL_EVENTS_TARGET_COUNT ||
    input.latestMigrationTimestamp !== SESSIONLESS_SKILL_EVENTS_TARGET_TIMESTAMP) {
    errors.push('AX 0032 must be the latest recorded migration before backfill')
  }
  if (!input.schemaReady) errors.push('sessionless skill event schema is not ready')
  const counts = [
    input.targetAuditRows,
    input.candidateRows,
    input.eligibleRows,
    input.unmatchedRows,
    input.unresolvedAuditRows,
    input.alreadyBackfilledRows,
    input.requestedInsertRows,
  ]
  if (counts.some((value) => !Number.isInteger(value) || value < 0)) {
    errors.push('backfill counts must be non-negative integers')
  }
  if (input.candidateRows !== input.eligibleRows + input.unmatchedRows) {
    errors.push('candidate rows do not reconcile with eligible and unmatched rows')
  }
  if (input.alreadyBackfilledRows > input.eligibleRows ||
    input.requestedInsertRows !== input.eligibleRows - input.alreadyBackfilledRows) {
    errors.push('requested insert rows do not reconcile with eligible and existing rows')
  }
  if (input.unmatchedRows !== input.acknowledgedUnmatchedRows) {
    errors.push('unmatched candidate count was not explicitly acknowledged')
  }
  if (input.unresolvedAuditRows !== input.acknowledgedUnresolvedAuditRows) {
    errors.push('unresolved audit count was not explicitly acknowledged')
  }
  return errors
}

export function validateSessionlessSkillEventsBeforeMigration(
  input: SessionlessSkillEventsMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== SESSIONLESS_SKILL_EVENTS_BASELINE_COUNT) {
    errors.push(`expected ${SESSIONLESS_SKILL_EVENTS_BASELINE_COUNT} recorded migrations before apply`)
  }
  if (input.latestMigrationTimestamp !== SESSIONLESS_SKILL_EVENTS_BASELINE_TIMESTAMP) {
    errors.push('latest recorded migration is not the AX 0031 baseline')
  }
  if (!input.hasBaselineObjects) errors.push('skill_events or mcp_audit_logs baseline is missing')
  if (input.sessionIdNullable) errors.push('session_id is already nullable; refusing a partial apply')
  if (
    input.hasSourceAuditLogColumn || input.hasSourceAuditForeignKey ||
    input.hasSourceAuditIndex || input.hasSourceUniqueIndex
  ) {
    errors.push('one or more 0032 objects already exist; refusing a partial apply')
  }
  if (input.sourceLinkedRows !== 0) errors.push('source-linked rows exist before migration 0032')
  return errors
}

export function validateSessionlessSkillEventsAfterMigration(
  input: SessionlessSkillEventsMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== SESSIONLESS_SKILL_EVENTS_TARGET_COUNT) {
    errors.push(`expected ${SESSIONLESS_SKILL_EVENTS_TARGET_COUNT} recorded migrations after apply`)
  }
  if (input.latestMigrationTimestamp !== SESSIONLESS_SKILL_EVENTS_TARGET_TIMESTAMP) {
    errors.push('latest recorded migration is not the AX 0032 target')
  }
  if (!input.hasBaselineObjects) errors.push('skill_events or mcp_audit_logs baseline is missing')
  if (!input.sessionIdNullable || !input.hasSourceAuditLogColumn ||
    !input.hasSourceAuditForeignKey || !input.hasSourceAuditIndex ||
    !input.hasSourceUniqueIndex) {
    errors.push('sessionless skill event schema is incomplete after apply')
  }
  if (input.sourceLinkedRows !== 0) {
    errors.push('0032 unexpectedly created source-linked skill events')
  }
  if (
    input.expectedSkillEventRows !== undefined &&
    input.skillEventRows !== input.expectedSkillEventRows
  ) {
    errors.push('0032 unexpectedly changed the skill_events row count')
  }
  return errors
}
