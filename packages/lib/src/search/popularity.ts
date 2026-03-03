/**
 * Skill popularity scoring based on usage data.
 *
 * Primarily queries the normalised skill_events table for apply counts.
 * Falls back to mcp_audit_logs
 * when skill_events is empty (initial migration period).
 *
 * Results are cached in-memory with a 5-minute TTL to avoid
 * per-search DB overhead.
 */

import { db, skillEvents } from '@gpters/db'
import { sql, count } from 'drizzle-orm'
import { createLogger } from '../core/logger'

const log = createLogger('popularity')

/** Aggregated popularity metrics for a single skill */
export interface SkillPopularity {
  /** Number of times the skill was applied */
  applyCount: number
}

/** Normalised popularity score (0-1) */
export type PopularityMap = Map<string, SkillPopularity>

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000

let cachedMap: PopularityMap | null = null
let cachedAt = 0

/**
 * Check whether the cached popularity data is still valid.
 *
 * @returns true if a cached map exists and is younger than CACHE_TTL_MS
 */
function isCacheValid(): boolean {
  return cachedMap !== null && Date.now() - cachedAt < CACHE_TTL_MS
}

/**
 * Invalidate the in-memory popularity cache.
 *
 * Mainly useful in tests.
 */
export function invalidatePopularityCache(): void {
  cachedMap = null
  cachedAt = 0
}

// ---------------------------------------------------------------------------
// Data fetching — skill_events (primary)
// ---------------------------------------------------------------------------

/**
 * Fetch popularity data from the normalised skill_events table.
 *
 * Counts apply events per skill.
 *
 * @returns Map of skillId to aggregated popularity metrics, or null if skill_events is empty
 */
async function fetchFromSkillEvents(): Promise<PopularityMap | null> {
  try {
    // Check whether skill_events has any data at all
    const countResult = await db
      .select({ total: count() })
      .from(skillEvents)

    if (!countResult[0] || countResult[0].total === 0) {
      log.info('skill_events table is empty, will fall back to audit_logs')
      return null
    }

    // Aggregate apply counts from skill_events
    const applyRows = await db.execute<{
      skill_id: string
      apply_count: string
    }>(sql`
      SELECT
        skill_id,
        COUNT(*)::text AS apply_count
      FROM skill_events
      WHERE action = 'apply'
      GROUP BY skill_id
    `)

    const map: PopularityMap = new Map()

    for (const row of applyRows.rows) {
      map.set(row.skill_id, {
        applyCount: parseInt(row.apply_count, 10) || 0,
      })
    }

    log.info('Popularity data loaded from skill_events', { skillCount: map.size })
    return map
  } catch (err) {
    log.warn('Failed to load from skill_events, will try audit_logs fallback', {
      error: (err as Error).message,
    })
    return null
  }
}

// ---------------------------------------------------------------------------
// Data fetching — mcp_audit_logs (fallback)
// ---------------------------------------------------------------------------

/**
 * Fetch popularity data from mcp_audit_logs (legacy fallback).
 *
 * For `report_skill_outcome` calls we extract:
 * - `skillId` from `request_params->'params'->'arguments'->>'skillId'`
 * - `applied` (boolean) from `request_params->'params'->'arguments'->>'applied'`
 *
 * @returns Map of skillId to aggregated popularity metrics
 */
async function fetchFromAuditLogs(): Promise<PopularityMap> {
  try {
    const rows = await db.execute<{
      skill_id: string
      apply_count: string
    }>(sql`
      SELECT
        request_params->'params'->'arguments'->>'skillId' AS skill_id,
        COUNT(*) FILTER (
          WHERE request_params->'params'->'arguments'->>'applied' = 'true'
        )::text AS apply_count
      FROM mcp_audit_logs
      WHERE tool = 'report_skill_outcome'
        AND response_status = 'success'
        AND request_params->'params'->'arguments'->>'skillId' IS NOT NULL
      GROUP BY skill_id
    `)

    const map: PopularityMap = new Map()

    for (const row of rows.rows) {
      map.set(row.skill_id, {
        applyCount: parseInt(row.apply_count, 10) || 0,
      })
    }

    log.info('Popularity data loaded from audit_logs (fallback)', { skillCount: map.size })
    return map
  } catch (err) {
    log.warn('Failed to load popularity data from audit_logs, returning empty map', {
      error: (err as Error).message,
    })
    return new Map()
  }
}

// ---------------------------------------------------------------------------
// Combined fetcher with fallback
// ---------------------------------------------------------------------------

/**
 * Fetch popularity data with automatic fallback.
 *
 * Tries skill_events first; if the table is empty or errors,
 * falls back to the legacy mcp_audit_logs query.
 *
 * @returns Map of skillId to aggregated popularity metrics
 */
async function fetchPopularityData(): Promise<PopularityMap> {
  const fromEvents = await fetchFromSkillEvents()
  if (fromEvents !== null) {
    return fromEvents
  }
  return fetchFromAuditLogs()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the cached (or freshly fetched) popularity map.
 *
 * @returns Map of skillId to SkillPopularity
 */
export async function getPopularityMap(): Promise<PopularityMap> {
  if (isCacheValid()) {
    return cachedMap!
  }

  cachedMap = await fetchPopularityData()
  cachedAt = Date.now()
  return cachedMap
}

/**
 * Compute a normalised popularity score (0-1) for a single skill.
 *
 * Formula:
 * - score = min(applyCount / 10, 1.0)
 *
 * @param popularity - Aggregated metrics for the skill, or undefined for unknown skills
 * @returns A number between 0 and 1 (inclusive)
 */
export function computePopularityScore(
  popularity: SkillPopularity | undefined,
): number {
  if (!popularity) return 0

  return Math.min(popularity.applyCount / 10, 1.0)
}

/**
 * Blend a vector similarity score with a popularity score.
 *
 * finalScore = similarity * 0.8 + popularityScore * 0.2
 *
 * @param similarity - Original cosine similarity (0-1)
 * @param popularityScore - Normalised popularity score (0-1)
 * @returns Blended score in the 0-1 range
 */
export function blendScore(similarity: number, popularityScore: number): number {
  return similarity * 0.8 + popularityScore * 0.2
}
