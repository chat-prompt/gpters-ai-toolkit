/** 검증 가능한 스킬 실행 시도를 eventId 멱등으로 저장한다 */

import { axSkillExecutionAttempts, axSkillExecutionEvents, db } from '@gpters/db'
import { and, eq } from 'drizzle-orm'
import type { AxSkillExecutionReport, AxSkillExecutionStartReport } from '../features/ax/execution-report'
import { createLogger } from '../core/logger'

const log = createLogger('skill-execution')

export async function recordSkillExecutionStart(params: {
  sessionId: string
  userId?: string
  report: AxSkillExecutionStartReport
}): Promise<void> {
  const { report } = params
  const startedAt = new Date(report.occurredAt)
  try {
    await db
      .insert(axSkillExecutionAttempts)
      .values({
        attemptId: report.attemptId,
        eventId: report.eventId,
        sessionId: params.sessionId,
        userId: params.userId,
        source: report.source,
        skillId: report.skillId,
        skillVersion: report.skillVersion,
        agent: report.agent,
        agentId: report.agentId,
        status: 'running',
        validationMethod: 'none',
        occurredAt: startedAt,
        startObserved: true,
        startedAt,
      })
      .onConflictDoNothing({ target: axSkillExecutionAttempts.attemptId })

    // 완료가 먼저 들어온 구형/지연 보고에는 최초 시작 시각만 보완한다.
    await db
      .update(axSkillExecutionAttempts)
      .set({ startObserved: true, startedAt })
      .where(and(
        eq(axSkillExecutionAttempts.attemptId, report.attemptId),
        eq(axSkillExecutionAttempts.startObserved, false),
      ))

    const [matchingAttempt] = await db
      .select({ attemptId: axSkillExecutionAttempts.attemptId })
      .from(axSkillExecutionAttempts)
      .where(and(
        eq(axSkillExecutionAttempts.attemptId, report.attemptId),
        eq(axSkillExecutionAttempts.source, report.source),
        eq(axSkillExecutionAttempts.skillId, report.skillId),
        eq(axSkillExecutionAttempts.agent, report.agent),
        eq(axSkillExecutionAttempts.agentId, report.agentId),
      ))
      .limit(1)
    if (!matchingAttempt) {
      log.warn('Execution start identity did not match existing attempt', { attemptId: report.attemptId })
      return
    }

    await db
      .insert(axSkillExecutionEvents)
      .values({
        eventId: report.eventId,
        attemptId: report.attemptId,
        phase: 'started',
        occurredAt: startedAt,
      })
      .onConflictDoNothing({ target: axSkillExecutionEvents.eventId })
  } catch (error) {
    log.warn('Failed to record skill execution start', {
      error,
      eventId: report.eventId,
      attemptId: report.attemptId,
    })
  }
}

export async function recordSkillExecutionAttempt(params: {
  sessionId: string
  userId?: string
  report: AxSkillExecutionReport
}): Promise<boolean> {
  const { report } = params
  const completedAt = new Date(report.occurredAt)
  try {
    await db
      .insert(axSkillExecutionAttempts)
      .values({
        attemptId: report.attemptId,
        eventId: report.eventId,
        sessionId: params.sessionId,
        userId: params.userId,
        source: report.source,
        skillId: report.skillId,
        skillVersion: report.skillVersion,
        agent: report.agent,
        agentId: report.agentId,
        status: report.status,
        failureStage: report.failureStage,
        errorCode: report.errorCode,
        validationMethod: report.validation.method,
        validationPassed: report.validation.passed,
        validationSummary: report.validation.summary,
        userAccepted: report.userAccepted,
        occurredAt: completedAt,
        startObserved: false,
        startedAt: completedAt,
        completedAt,
      })
      .onConflictDoNothing({ target: axSkillExecutionAttempts.attemptId })

    const updatedAttempts = await db
      .update(axSkillExecutionAttempts)
      .set({
        skillVersion: report.skillVersion,
        agent: report.agent,
        agentId: report.agentId,
        status: report.status,
        failureStage: report.failureStage,
        errorCode: report.errorCode,
        validationMethod: report.validation.method,
        validationPassed: report.validation.passed,
        validationSummary: report.validation.summary,
        userAccepted: report.userAccepted,
        completedAt,
        occurredAt: completedAt,
        updatedAt: new Date(),
      })
      .where(and(
        eq(axSkillExecutionAttempts.attemptId, report.attemptId),
        eq(axSkillExecutionAttempts.source, report.source),
        eq(axSkillExecutionAttempts.skillId, report.skillId),
        eq(axSkillExecutionAttempts.agent, report.agent),
        eq(axSkillExecutionAttempts.agentId, report.agentId),
      ))
      .returning({ attemptId: axSkillExecutionAttempts.attemptId })

    if (updatedAttempts.length === 0) {
      log.warn('Execution completion identity did not match existing attempt', { attemptId: report.attemptId })
      return false
    }

    const insertedEvents = await db
      .insert(axSkillExecutionEvents)
      .values({
        eventId: report.eventId,
        attemptId: report.attemptId,
        phase: 'completed',
        occurredAt: completedAt,
      })
      .onConflictDoNothing({ target: axSkillExecutionEvents.eventId })
      .returning({ eventId: axSkillExecutionEvents.eventId })
    return insertedEvents.length > 0
  } catch (error) {
    log.warn('Failed to record skill execution attempt', {
      error,
      eventId: report.eventId,
      attemptId: report.attemptId,
    })
    return false
  }
}
