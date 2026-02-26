/**
 * Normalized skill event and rating recording functions
 *
 * Writes individual skill interaction events to the `skill_events` table
 * and rating feedback to the `skill_ratings` table for fine-grained analytics.
 * All functions are fire-and-forget: errors are logged but never thrown.
 */

import { db, skillEvents, skillRatings } from '@gpters/db'
import { createLogger } from '../core/logger'

const log = createLogger('skill-events')

/**
 * Record search events for all skills returned in a search result
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
    if (params.results.length === 0) return

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
 * Record a suggest event for a skill
 *
 * @param params - Suggest event parameters
 * @param params.sessionId - MCP session ID
 * @param params.userId - Authenticated user ID (optional)
 * @param params.skillId - ID of the skill that received a suggestion
 */
export async function recordSuggestEvent(params: {
  sessionId: string
  userId?: string
  skillId: string
}): Promise<void> {
  try {
    await db.insert(skillEvents).values({
      sessionId: params.sessionId,
      userId: params.userId,
      skillId: params.skillId,
      action: 'suggest',
    })
  } catch (error) {
    log.warn('Failed to record suggest event', { error, sessionId: params.sessionId })
  }
}

/**
 * Record a skill rating (1-5 stars with optional comment)
 *
 * @param params - Rating parameters
 * @param params.sessionId - MCP session ID
 * @param params.userId - Authenticated user ID (optional)
 * @param params.skillId - ID of the rated skill
 * @param params.rating - Rating value (1-5)
 * @param params.comment - Optional feedback comment
 */
export async function recordSkillRating(params: {
  sessionId: string
  userId?: string
  skillId: string
  rating: number
  comment?: string
}): Promise<void> {
  try {
    await db.insert(skillRatings).values({
      sessionId: params.sessionId,
      userId: params.userId,
      skillId: params.skillId,
      rating: params.rating,
      comment: params.comment,
    })
  } catch (error) {
    log.warn('Failed to record skill rating', { error, sessionId: params.sessionId })
  }
}
