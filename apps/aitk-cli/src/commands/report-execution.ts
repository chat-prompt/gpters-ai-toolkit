/** 검증 가능한 스킬 실행 결과 보고 */

import { randomUUID } from 'node:crypto'
import { jsonRpcSessionCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, info, error } from '../output.js'

export type ExecutionStatus = 'success' | 'partial' | 'failed' | 'abandoned'
export type FailureStage = 'load' | 'instruction' | 'dependency' | 'execution' | 'validation'
export type ValidationMethod = 'test' | 'command' | 'artifact' | 'user_confirmation' | 'none'

export interface ReportExecutionOptions {
  skillId: string
  status: ExecutionStatus
  agent: 'claude-code' | 'codex' | 'openclaw' | 'test-agent'
  agentId: string
  source?: 'aitk' | 'bbopters-shared'
  attemptId?: string
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
  agent: 'claude-code' | 'codex' | 'openclaw' | 'test-agent'
  agentId: string
  source?: 'aitk' | 'bbopters-shared'
  attemptId?: string
  eventId?: string
  skillVersion?: string
  occurredAt?: string
}

export async function runReportExecutionStart(opts: ReportExecutionStartOptions): Promise<void> {
  const token = resolveToken()
  const attemptId = opts.attemptId ?? randomUUID()
  const eventId = opts.eventId ?? randomUUID()
  const result = await jsonRpcSessionCall(
    'tools/call',
    {
      name: 'report_skill_execution_started',
      arguments: {
        eventId,
        attemptId,
        source: opts.source ?? 'aitk',
        skillId: opts.skillId,
        skillVersion: opts.skillVersion ?? null,
        agent: opts.agent,
        agentId: opts.agentId,
        occurredAt: opts.occurredAt ?? new Date().toISOString(),
      },
    },
    token,
    { name: opts.agentId, version: opts.skillVersion ?? 'local' }
  )

  if (!result.ok) {
    if (result.status === 401) error(result.error!, 2)
    error(result.error!)
  }
  info(`Execution started · attempt ${attemptId}`)
  jsonOut({ attemptId, eventId, result: result.data })
}

export async function runReportExecution(opts: ReportExecutionOptions): Promise<void> {
  const token = resolveToken()
  const attemptId = opts.attemptId ?? randomUUID()
  const eventId = opts.eventId ?? randomUUID()
  const validationMethod = opts.validationMethod ?? 'none'

  const result = await jsonRpcSessionCall(
    'tools/call',
    {
      name: 'report_skill_execution',
      arguments: {
        eventId,
        attemptId,
        source: opts.source ?? 'aitk',
        skillId: opts.skillId,
        skillVersion: opts.skillVersion ?? null,
        agent: opts.agent,
        agentId: opts.agentId,
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
    token,
    { name: opts.agentId, version: opts.skillVersion ?? 'local' }
  )

  if (!result.ok) {
    if (result.status === 401) error(result.error!, 2)
    error(result.error!)
  }

  info(`Execution reported · attempt ${attemptId}`)
  jsonOut(result.data)
}
