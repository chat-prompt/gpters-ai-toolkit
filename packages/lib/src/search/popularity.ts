/**
 * Skill popularity scoring based on usage data.
 *
 * Primarily queries the normalised skill_events table for apply counts
 * and skill_ratings for average ratings. Falls back to mcp_audit_logs
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
  /** Average rating (1-5), or null if no ratings */
  avgRating: number | null
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
 * Counts apply events per skill and joins with skill_ratings for
 * average rating.
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

    // Aggregate average ratings from skill_ratings
    const ratingRows = await db.execute<{
      skill_id: string
      avg_rating: string | null
    }>(sql`
      SELECT
        skill_id,
        AVG(rating)::text AS avg_rating
      FROM skill_ratings
      GROUP BY skill_id
    `)

    // Build rating lookup
    const ratingMap = new Map<string, number>()
    for (const row of ratingRows.rows) {
      if (row.avg_rating !== null) {
        ratingMap.set(row.skill_id, parseFloat(row.avg_rating))
      }
    }

    // Merge apply counts and ratings
    const map: PopularityMap = new Map()

    for (const row of applyRows.rows) {
      const skillId = row.skill_id
      map.set(skillId, {
        applyCount: parseInt(row.apply_count, 10) || 0,
        avgRating: ratingMap.get(skillId) ?? null,
      })
    }

    // Include skills that have ratings but no apply events
    for (const [skillId, avgRating] of ratingMap) {
      if (!map.has(skillId)) {
        map.set(skillId, { applyCount: 0, avgRating })
      }
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
 * - `rating` (number 1-5) from `request_params->'params'->'arguments'->>'rating'`
 *
 * @returns Map of skillId to aggregated popularity metrics
 */
async function fetchFromAuditLogs(): Promise<PopularityMap> {
  try {
    const rows = await db.execute<{
      skill_id: string
      apply_count: string
      avg_rating: string | null
    }>(sql`
      SELECT
        request_params->'params'->'arguments'->>'skillId' AS skill_id,
        COUNT(*) FILTER (
          WHERE request_params->'params'->'arguments'->>'applied' = 'true'
        )::text AS apply_count,
        AVG(
          (request_params->'params'->'arguments'->>'rating')::numeric
        ) FILTER (
          WHERE request_params->'params'->'arguments'->>'rating' IS NOT NULL
        )::text AS avg_rating
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
        avgRating: row.avg_rating !== null ? parseFloat(row.avg_rating) : null,
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
 * - applyComponent = min(applyCount / 10, 1.0) * 0.5
 * - ratingComponent = (avgRating / 5) * 0.5   (0 if no ratings)
 * - popularityScore = applyComponent + ratingComponent
 *
 * @param popularity - Aggregated metrics for the skill, or undefined for unknown skills
 * @returns A number between 0 and 1 (inclusive)
 */
export function computePopularityScore(
  popularity: SkillPopularity | undefined,
): number {
  if (!popularity) return 0

  const applyComponent = Math.min(popularity.applyCount / 10, 1.0) * 0.5
  const ratingComponent =
    popularity.avgRating !== null ? (popularity.avgRating / 5) * 0.5 : 0

  return applyComponent + ratingComponent
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
