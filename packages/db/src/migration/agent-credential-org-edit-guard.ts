/**
 * 0044 에이전트 자격증명 조직 범위 수정 옵션 마이그레이션 가드 (DEV-4618).
 *
 * 0044는 `aitk_agent_credentials` 에 `allow_org_edit boolean not null default false` 컬럼 하나를 더할 뿐
 * 행을 바꾸지 않는다. 그래서 검증의 핵심은 "정확히 0043까지 적용된 DB 인가", "0044 한 건만 적용됐는가",
 * "컬럼이 not null default false 로 생겼는가", "모든 기존 자격증명이 false 인가"다.
 */

/** 0044 적용 직전에 기록돼 있어야 하는 마이그레이션 수 (0043까지). 2026-10-12 운영 확인값 */
export const AGENT_ORG_EDIT_BASELINE_COUNT = 33
/** 0044 적용 직전의 마지막 마이그레이션 타임스탬프 (0043_ax_subscriptions_key_unique) */
export const AGENT_ORG_EDIT_BASELINE_TIMESTAMP = '1790036000000'
/** 0044_agent_credential_org_edit 자신의 타임스탬프 */
export const AGENT_ORG_EDIT_MIGRATION_TIMESTAMP = '1791800000000'

/** 0044 적용 전후로 검사하는 DB 상태 */
export interface AgentOrgEditMigrationState {
  actualProjectId: string | null
  actualBranchId: string | null
  expectedProjectId: string
  expectedBranchId: string
  productionBranchId: string
  recoveryBranchId?: string
  migrationCount: number
  latestMigrationTimestamp: string | null
  /** allow_org_edit 컬럼 존재 여부 */
  hasColumn: boolean
  /** 컬럼이 NOT NULL 인지 (컬럼이 없으면 false) */
  columnNotNull: boolean
  /** 컬럼 기본값 식 (컬럼이 없으면 null) */
  columnDefault: string | null
  /** 자격증명 행 수. 컬럼만 더하므로 적용 전후로 같아야 한다 */
  credentialCount: number
  /** allow_org_edit = true 인 행 수 (적용 직후엔 0이어야 한다) */
  orgEditCount: number
  /** 적용 후 검증에서만 채운다 */
  expectedCredentialCount?: number
}

function validateIdentity(input: AgentOrgEditMigrationState, production: boolean): string[] {
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
 * 적용 전 검증. 정확히 0043까지 적용됐고 컬럼이 아직 없는 상태만 통과시킨다.
 *
 * @param input - 관측한 DB 상태
 * @param production - 운영 브랜치 적용 여부
 * @returns 막아야 할 이유. 비어 있으면 통과
 */
export function validateAgentOrgEditBeforeMigration(
  input: AgentOrgEditMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== AGENT_ORG_EDIT_BASELINE_COUNT) {
    errors.push(`expected ${AGENT_ORG_EDIT_BASELINE_COUNT} recorded migrations before apply`)
  }
  if (input.latestMigrationTimestamp !== AGENT_ORG_EDIT_BASELINE_TIMESTAMP) {
    errors.push('latest recorded migration is not the 0043 baseline')
  }
  if (input.hasColumn) errors.push('aitk_agent_credentials.allow_org_edit already exists; refusing to re-apply')
  return errors
}

/**
 * 적용 후 검증. 컬럼이 not null default false 로 생기고, 행은 그대로이며 아무도 켜져 있지 않아야 한다.
 *
 * @param input - 관측한 DB 상태
 * @param production - 운영 브랜치 적용 여부
 * @returns 막아야 할 이유. 비어 있으면 통과
 */
export function validateAgentOrgEditAfterMigration(
  input: AgentOrgEditMigrationState,
  production: boolean,
): string[] {
  const errors = validateIdentity(input, production)
  if (input.migrationCount !== AGENT_ORG_EDIT_BASELINE_COUNT + 1) {
    errors.push(`expected ${AGENT_ORG_EDIT_BASELINE_COUNT + 1} recorded migrations after apply`)
  }
  if (input.latestMigrationTimestamp !== AGENT_ORG_EDIT_MIGRATION_TIMESTAMP) {
    errors.push('latest recorded migration is not 0044')
  }
  if (!input.hasColumn) errors.push('aitk_agent_credentials.allow_org_edit is missing after apply')
  else {
    if (!input.columnNotNull) errors.push('allow_org_edit must be NOT NULL')
    if (input.columnDefault !== 'false') errors.push('allow_org_edit must default to false')
  }
  if (input.orgEditCount !== 0) errors.push('no credential may have allow_org_edit enabled right after apply')
  if (input.expectedCredentialCount === undefined) {
    errors.push('pre-migration credential count is required for verification')
  } else if (input.credentialCount !== input.expectedCredentialCount) {
    errors.push('aitk_agent_credentials row count changed; 0044 must only add a column')
  }
  return errors
}
