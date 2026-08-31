/** 검증 가능한 스킬 실행 결과 보고 */

import { randomUUID } from 'node:crypto'
import { jsonRpcCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, info, error } from '../output.js'
import {
  markJourneyReported,
  rememberExecutionAttempt,
  resolveJourneyForAttempt,
  resolveJourneyForSkill,
} from '../journey.js'

export type ExecutionStatus = 'success' | 'partial' | 'failed' | 'abandoned'
export type FailureStage = 'load' | 'instruction' | 'dependency' | 'execution' | 'validation'
export type ValidationMethod = 'test' | 'command' | 'artifact' | 'user_confirmation' | 'none'

export interface ReportExecutionOptions {
  skillId: string
  status: ExecutionStatus
  agent: 'claude-code' | 'codex' | 'openclaw' | 'hermes' | 'test-agent'
  agentId?: string
  source?: 'aitk' | 'bbopters-shared'
  attemptId?: string
  journeyId?: string
  eventId?: string
  skillVersion?: string
  failureStage?: FailureStage
  errorCode?: string
  validationMethod?: ValidationMethod
  validationPassed?: boolean
  validationSummary?: string
  userAccepted?: boolean
  occurredAt?: string
}

export interface ReportExecutionStartOptions {
  skillId: string
  agent: 'claude-code' | 'codex' | 'openclaw' | 'hermes' | 'test-agent'
  agentId?: string
  source?: 'aitk' | 'bbopters-shared'
  attemptId?: string
  journeyId?: string
  eventId?: string
  skillVersion?: string
  occurredAt?: string
}

function assertToolSuccess(data: unknown, fallback: string): void {
  const result = data as { isError?: boolean; content?: Array<{ text?: string }> } | undefined
  if (result?.isError) error(result.content?.[0]?.text ?? fallback)
}

export async function runReportExecutionStart(opts: ReportExecutionStartOptions): Promise<void> {
  const token = resolveToken()
  const attemptId = opts.attemptId ?? randomUUID()
  const eventId = opts.eventId ?? randomUUID()
  const agentId = opts.agentId ?? opts.agent
  const journeyId = await resolveJourneyForSkill(opts.skillId, opts.journeyId)
  const result = await jsonRpcCall(
    'tools/call',
    {
      name: 'report_skill_execution_started',
      arguments: {
        eventId,
        attemptId,
        journeyId,
        source: opts.source ?? 'aitk',
        skillId: opts.skillId,
        skillVersion: opts.skillVersion ?? null,
        agent: opts.agent,
        agentId,
        occurredAt: opts.occurredAt ?? new Date().toISOString(),
      },
    },
    token
  )

  if (!result.ok) {
    if (result.status === 401) error(result.error!, 2)
    error(result.error!)
  }
  assertToolSuccess(result.data, 'Execution start report rejected')
  await rememberExecutionAttempt(attemptId, journeyId, opts.skillId)
  info(`Execution started · attempt ${attemptId}`)
  jsonOut({ attemptId, eventId, result: result.data })
}

export async function runReportExecution(opts: ReportExecutionOptions): Promise<void> {
  const token = resolveToken()
  const attemptId = opts.attemptId ?? randomUUID()
  const eventId = opts.eventId ?? randomUUID()
  const validationMethod = opts.validationMethod ?? 'none'
  const agentId = opts.agentId ?? opts.agent
  const journeyId = await resolveJourneyForAttempt(opts.attemptId, opts.skillId, opts.journeyId)

  const result = await jsonRpcCall(
    'tools/call',
    {
      name: 'report_skill_execution',
      arguments: {
        eventId,
        attemptId,
        journeyId,
        source: opts.source ?? 'aitk',
        skillId: opts.skillId,
        skillVersion: opts.skillVersion ?? null,
        agent: opts.agent,
        agentId,
        status: opts.status,
        failureStage: opts.failureStage ?? null,
        errorCode: opts.errorCode ?? null,
        validation: {
          method: validationMethod,
          passed: validationMethod === 'none' ? null : opts.validationPassed ?? null,
          summary: opts.validationSummary ?? null,
        },
        userAccepted: opts.userAccepted ?? null,
        occurredAt: opts.occurredAt ?? new Date().toISOString(),
      },
    },
    token
  )

  if (!result.ok) {
    if (result.status === 401) error(result.error!, 2)
    error(result.error!)
  }

  assertToolSuccess(result.data, 'Execution report rejected')
  await markJourneyReported(journeyId)
  info(`Execution reported · attempt ${attemptId}`)
  jsonOut(result.data)
}
