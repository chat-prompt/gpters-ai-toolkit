/** 검증 가능한 스킬 실행 결과의 수신 계약과 개인정보 최소화 검증 */

import { validateOptionalJourneyId } from './journey'

export const EXECUTION_SOURCES = ['aitk', 'bbopters-shared'] as const
export const EXECUTION_AGENTS = ['claude-code', 'codex', 'openclaw', 'hermes', 'test-agent'] as const
export const EXECUTION_STATUSES = ['success', 'partial', 'failed', 'abandoned'] as const
export const EXECUTION_FAILURE_STAGES = [
  'load',
  'instruction',
  'dependency',
  'execution',
  'validation',
] as const
export const EXECUTION_VALIDATION_METHODS = [
  'test',
  'command',
  'artifact',
  'user_confirmation',
  'none',
] as const

export type AxExecutionSource = (typeof EXECUTION_SOURCES)[number]
export type AxExecutionAgent = (typeof EXECUTION_AGENTS)[number]
export type AxExecutionStatus = (typeof EXECUTION_STATUSES)[number]
export type AxExecutionFailureStage = (typeof EXECUTION_FAILURE_STAGES)[number]
export type AxExecutionValidationMethod = (typeof EXECUTION_VALIDATION_METHODS)[number]

export interface AxSkillExecutionReport {
  eventId: string
  attemptId: string
  journeyId: string | null
  source: AxExecutionSource
  skillId: string
  skillVersion: string | null
  agent: AxExecutionAgent
  agentId: string
  status: AxExecutionStatus
  failureStage: AxExecutionFailureStage | null
  errorCode: string | null
  validation: {
    method: AxExecutionValidationMethod
    passed: boolean | null
    summary: string | null
  }
  userAccepted: boolean | null
  occurredAt: string
}

export interface AxSkillExecutionStartReport {
  eventId: string
  attemptId: string
  journeyId: string | null
  source: AxExecutionSource
  skillId: string
  skillVersion: string | null
  agent: AxExecutionAgent
  agentId: string
  occurredAt: string
}

export type AxSkillExecutionValidation =
  | { ok: true; data: AxSkillExecutionReport }
  | { ok: false; errors: string[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SAFE_CODE = /^[A-Z0-9_:-]{1,64}$/
const SAFE_AGENT_ID = /^[a-z0-9][a-z0-9._:-]{0,79}$/
const SECRET_LIKE = /(bearer\s+[a-z0-9._-]+|(?:password|token|secret)\s*[:=]|postgres(?:ql)?:\/\/|sk-[a-z0-9_-]{12,})/i

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalText(value: unknown, max: number, field: string, errors: string[]): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') {
    errors.push(`${field} must be a string or null`)
    return null
  }
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length > max) errors.push(`${field} must be ${max} characters or fewer`)
  if (SECRET_LIKE.test(compact)) errors.push(`${field} must not contain credentials or connection strings`)
  return compact.slice(0, max)
}

function commonExecutionFields(input: Record<string, unknown>, errors: string[]) {
  const eventId = typeof input.eventId === 'string' ? input.eventId : ''
  const attemptId = typeof input.attemptId === 'string' ? input.attemptId : ''
  if (!UUID.test(eventId)) errors.push('eventId must be a UUID')
  if (!UUID.test(attemptId)) errors.push('attemptId must be a UUID')
  const journey = validateOptionalJourneyId(input.journeyId)
  if (!journey.ok) errors.push(journey.error)

  const source = input.source
  const agent = input.agent
  if (!EXECUTION_SOURCES.includes(source as AxExecutionSource)) errors.push('invalid source')
  if (!EXECUTION_AGENTS.includes(agent as AxExecutionAgent)) errors.push('invalid agent')

  const agentId = typeof input.agentId === 'string' ? input.agentId.trim() : ''
  if (!SAFE_AGENT_ID.test(agentId)) errors.push('agentId must be a lowercase stable identifier (1-80 characters)')
  const skillId = typeof input.skillId === 'string' ? input.skillId.trim() : ''
  if (!skillId || skillId.length > 160) errors.push('skillId must be 1-160 characters')
  const skillVersion = optionalText(input.skillVersion, 80, 'skillVersion', errors)
  const occurred = typeof input.occurredAt === 'string' ? new Date(input.occurredAt) : new Date(Number.NaN)
  const occurredIsInvalid = Number.isNaN(occurred.getTime())
  if (occurredIsInvalid) errors.push('occurredAt must be an ISO 8601 timestamp')

  return {
    eventId,
    attemptId,
    journeyId: journey.ok ? journey.value : null,
    source: source as AxExecutionSource,
    skillId,
    skillVersion,
    agent: agent as AxExecutionAgent,
    agentId,
    occurredAt: occurredIsInvalid ? '' : occurred.toISOString(),
  }
}

/** 실제 적용을 시작한 시점의 최소 payload. 완료 전에 먼저 기록한다. */
export function validateSkillExecutionStart(input: unknown):
  | { ok: true; data: AxSkillExecutionStartReport }
  | { ok: false; errors: string[] } {
  if (!isObject(input)) return { ok: false, errors: ['report must be an object'] }
  const errors: string[] = []
  const common = commonExecutionFields(input, errors)
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, data: common }
}

/** 원문·인증정보를 받지 않는 최종 실행 결과 payload 검증 */
export function validateSkillExecutionReport(input: unknown): AxSkillExecutionValidation {
  if (!isObject(input)) return { ok: false, errors: ['report must be an object'] }
  const errors: string[] = []
  const common = commonExecutionFields(input, errors)

  const status = input.status
  const failureStage = input.failureStage ?? null
  if (!EXECUTION_STATUSES.includes(status as AxExecutionStatus)) errors.push('invalid status')
  if (failureStage !== null && !EXECUTION_FAILURE_STAGES.includes(failureStage as AxExecutionFailureStage)) {
    errors.push('invalid failureStage')
  }

  const errorCode = optionalText(input.errorCode, 64, 'errorCode', errors)
  if (errorCode !== null && !SAFE_CODE.test(errorCode)) errors.push('errorCode has invalid characters')

  const validation = isObject(input.validation) ? input.validation : {}
  const method = validation.method ?? 'none'
  if (!EXECUTION_VALIDATION_METHODS.includes(method as AxExecutionValidationMethod)) {
    errors.push('invalid validation.method')
  }
  const passed = validation.passed === null || validation.passed === undefined
    ? null
    : typeof validation.passed === 'boolean'
      ? validation.passed
      : (errors.push('validation.passed must be boolean or null'), null)
  const summary = optionalText(validation.summary, 240, 'validation.summary', errors)
  if (method === 'none' && passed !== null) errors.push('validation.passed must be null when method is none')
  if (status === 'success' && passed === false) errors.push('success cannot have failed validation')

  const userAccepted = input.userAccepted === null || input.userAccepted === undefined
    ? null
    : typeof input.userAccepted === 'boolean'
      ? input.userAccepted
      : (errors.push('userAccepted must be boolean or null'), null)
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    data: {
      ...common,
      status: status as AxExecutionStatus,
      failureStage: failureStage as AxExecutionFailureStage | null,
      errorCode,
      validation: {
        method: method as AxExecutionValidationMethod,
        passed,
        summary,
      },
      userAccepted,
    },
  }
}
