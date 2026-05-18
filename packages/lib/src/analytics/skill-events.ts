/**
 * Normalized skill event recording functions
 *
 * Writes individual skill interaction events to the `skill_events` table for fine-grained analytics.
 * All functions are fire-and-forget: errors are logged but never thrown.
 */

import { db, skillEvents } from '@gpters/db'
import { createLogger } from '../core/logger'

const log = createLogger('skill-events')

/** Sentinel skill ID for zero-result search events */
export const ZERO_RESULT_SKILL_ID = '__zero_result__'

/**
 * Record search events for all skills returned in a search result.
 * When results are empty, records a single zero-result event
 * to enable accurate zero-result rate measurement.
 *
 * @param params - Search event parameters
 * @param params.sessionId - MCP session ID
 * @param params.userId - Authenticated user ID (optional)
 * @param params.query - Search query string
 * @param params.results - Array of search result items with rank and score
 */
export async function recordSearchEvents(params: {
  sessionId: string
  userId?: string
  query: string
  results: Array<{ itemId: string; rank: number; score: number }>
}): Promise<void> {
  try {
    if (params.results.length === 0) {
      // Record zero-result search event for accurate zero-result rate tracking
      await db.insert(skillEvents).values({
        sessionId: params.sessionId,
        userId: params.userId,
        skillId: ZERO_RESULT_SKILL_ID,
        action: 'search' as const,
        query: params.query,
        rank: 0,
        score: 0,
      })
      return
    }

    const rows = params.results.map((r) => ({
      sessionId: params.sessionId,
      userId: params.userId,
      skillId: r.itemId,
      action: 'search' as const,
      query: params.query,
      rank: r.rank,
      score: Math.round(r.score * 100),
    }))

    await db.insert(skillEvents).values(rows)
  } catch (error) {
    log.warn('Failed to record search events', { error, sessionId: params.sessionId })
  }
}

/**
 * Record a skill load event (get_plugin_content)
 *
 * @param params - Load event parameters
 * @param params.sessionId - MCP session ID
 * @param params.userId - Authenticated user ID (optional)
 * @param params.skillId - ID of the loaded skill
 */
export async function recordLoadEvent(params: {
  sessionId: string
  userId?: string
  skillId: string
}): Promise<void> {
  try {
    await db.insert(skillEvents).values({
      sessionId: params.sessionId,
      userId: params.userId,
      skillId: params.skillId,
      action: 'load',
    })
  } catch (error) {
    log.warn('Failed to record load event', { error, sessionId: params.sessionId })
  }
}

/**
 * Record a skill outcome event (apply or skip)
 *
 * @param params - Outcome event parameters
 * @param params.sessionId - MCP session ID
 * @param params.userId - Authenticated user ID (optional)
 * @param params.skillId - ID of the skill
 * @param params.applied - Whether the skill was applied (true) or skipped (false)
 * @param params.summary - Optional summary of what happened
 */
export async function recordOutcomeEvent(params: {
  sessionId: string
  userId?: string
  skillId: string
  applied: boolean
  summary?: string
}): Promise<void> {
  try {
    await db.insert(skillEvents).values({
      sessionId: params.sessionId,
      userId: params.userId,
      skillId: params.skillId,
      action: params.applied ? 'apply' : 'skip',
      context: params.summary,
    })
  } catch (error) {
    log.warn('Failed to record outcome event', { error, sessionId: params.sessionId })
  }
}

/**
 * Record auto-skip outcome events for skills loaded but not explicitly reported
 *
 * Called when a session ends or times out. For each unreported skill,
 * inserts a 'skip' event with an auto-generated context message.
 *
 * @param params - Auto-skip event parameters
 * @param params.sessionId - MCP session ID
 * @param params.userId - Authenticated user ID (optional)
 * @param params.loadedSkillIds - Skill IDs loaded via get_plugin_content
 * @param params.reportedSkillIds - Skill IDs explicitly reported via report_skill_outcome
 */
export async function recordAutoSkipEvents(params: {
  sessionId: string
  userId?: string
  loadedSkillIds: string[]
  reportedSkillIds: string[]
}): Promise<void> {
  const reportedSet = new Set(params.reportedSkillIds)
  const unreported = params.loadedSkillIds.filter(id => !reportedSet.has(id))
  if (unreported.length === 0) return

  try {
    const rows = unreported.map(skillId => ({
      sessionId: params.sessionId,
      userId: params.userId,
      skillId,
      action: 'skip' as const,
      context: 'auto: 세션 종료까지 명시적 보고 없음',
    }))

    await db.insert(skillEvents).values(rows)
    log.debug('Auto-skip events recorded', {
      sessionId: params.sessionId,
      count: unreported.length,
      skills: unreported,
    })
  } catch (error) {
    log.warn('Failed to record auto-skip events', { error, sessionId: params.sessionId })
  }
}

/**
 * Record search skip events for all results that were skipped
 *
 * @param params - Search skip event parameters
 * @param params.sessionId - MCP session ID
 * @param params.userId - Authenticated user ID (optional)
 * @param params.query - Original search query
 * @param params.resultIds - IDs of skills that were in results but skipped
 * @param params.reason - Reason for skipping
 */
export async function recordSearchSkipEvent(params: {
  sessionId: string
  userId?: string
  query: string
  resultIds: string[]
  reason: string
}): Promise<void> {
  try {
    if (params.resultIds.length === 0) return

    const rows = params.resultIds.map((id) => ({
      sessionId: params.sessionId,
      userId: params.userId,
      skillId: id,
      action: 'skip' as const,
      query: params.query,
      context: params.reason,
    }))

    await db.insert(skillEvents).values(rows)
  } catch (error) {
    log.warn('Failed to record search skip events', { error, sessionId: params.sessionId })
  }
}

/**
 * Record a deploy event for a skill
 *
 * @param params - Deploy event parameters
 * @param params.sessionId - MCP session ID
 * @param params.userId - Authenticated user ID (optional)
 * @param params.skillId - ID of the deployed skill
 */
export async function recordDeployEvent(params: {
  sessionId: string
  userId?: string
  skillId: string
}): Promise<void> {
  try {
    await db.insert(skillEvents).values({
      sessionId: params.sessionId,
      userId: params.userId,
      skillId: params.skillId,
      action: 'deploy',
    })
  } catch (error) {
    log.warn('Failed to record deploy event', { error, sessionId: params.sessionId })
  }
}

/**
 * Record exercise search events when Rona searches for skills during exercise generation.
 *
 * Similar to {@link recordSearchEvents}, but uses the `exercise_search` action
 * to distinguish exercise-driven searches from regular MCP searches.
 * When results are empty, records a single zero-result event.
 *
 * @param params - Exercise search event parameters
 * @param params.sessionId - MCP or service session ID
 * @param params.skillIds - IDs of skills returned in the exercise search results
 * @param params.exerciseTopic - Exercise topic used as the search query
 * @param params.referralSource - Origin of the exercise search request
 */
export async function recordExerciseSearchEvents(params: {
  sessionId: string
  skillIds: string[]
  exerciseTopic?: string
  referralSource?: string
}): Promise<void> {
  try {
    if (params.skillIds.length === 0) {
      await db.insert(skillEvents).values({
        sessionId: params.sessionId,
        skillId: ZERO_RESULT_SKILL_ID,
        action: 'exercise_search' as const,
        query: params.exerciseTopic,
        context: params.referralSource,
        rank: 0,
        score: 0,
      })
      return
    }

    const rows = params.skillIds.map((skillId, index) => ({
      sessionId: params.sessionId,
      skillId,
      action: 'exercise_search' as const,
      query: params.exerciseTopic,
      context: params.referralSource,
      rank: index + 1,
    }))

    await db.insert(skillEvents).values(rows)
  } catch (error) {
    log.warn('Failed to record exercise search events', { error, sessionId: params.sessionId })
  }
}

/**
 * Record an exercise apply event when a student uses a skill from an exercise.
 *
 * Tracks individual skill adoption originating from exercise-generated content,
 * enabling exercise-to-apply conversion analysis.
 *
 * @param params - Exercise apply event parameters
 * @param params.sessionId - MCP or service session ID
 * @param params.skillId - ID of the skill applied via exercise
 * @param params.userId - Authenticated user ID (optional)
 * @param params.exerciseSummary - Brief summary of the exercise context
 */
export async function recordExerciseApplyEvent(params: {
  sessionId: string
  skillId: string
  userId?: string
  exerciseSummary?: string
}): Promise<void> {
  try {
    await db.insert(skillEvents).values({
      sessionId: params.sessionId,
      userId: params.userId,
      skillId: params.skillId,
      action: 'exercise_apply' as const,
      context: params.exerciseSummary,
    })
  } catch (error) {
    log.warn('Failed to record exercise apply event', { error, sessionId: params.sessionId })
  }
}

