/**
 * Skill popularity scoring based on usage data from mcp_audit_logs.
 *
 * Queries apply counts (report_skill_outcome with applied=true) and
 * average ratings (report_skill_outcome with rating) to produce a
 * normalised 0–1 popularity score per skill. Results are cached
 * in-memory with a 5-minute TTL to avoid per-search DB overhead.
 */

import { db, mcpAuditLogs } from '@gpters/db'
import { sql, eq, and } from 'drizzle-orm'
import { createLogger } from '../core/logger'

const log = createLogger('popularity')

/** Aggregated popularity metrics for a single skill */
export interface SkillPopularity {
  /** Number of times the skill was applied (outcome reported with applied=true) */
  applyCount: number
  /** Average rating (1–5) from report_skill_outcome, or null if no ratings */
  avgRating: number | null
}

/** Normalised popularity score (0–1) */
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
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetch popularity data from mcp_audit_logs.
 *
 * For `report_skill_outcome` calls we extract:
 * - `skillId` from `request_params->'params'->'arguments'->>'skillId'`
 * - `applied` (boolean) from `request_params->'params'->'arguments'->>'applied'`
 * - `rating` (number 1-5) from `request_params->'params'->'arguments'->>'rating'`
 *
 * @returns Map of skillId to aggregated popularity metrics
 */
async function fetchPopularityData(): Promise<PopularityMap> {
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

    log.info('Popularity data loaded', { skillCount: map.size })
    return map
  } catch (err) {
    log.warn('Failed to load popularity data, falling back to empty map', {
      error: (err as Error).message,
    })
    return new Map()
  }
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
 * Compute a normalised popularity score (0–1) for a single skill.
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
 * @param similarity - Original cosine similarity (0–1)
 * @param popularityScore - Normalised popularity score (0–1)
 * @returns Blended score in the 0–1 range
 */
export function blendScore(similarity: number, popularityScore: number): number {
  return similarity * 0.8 + popularityScore * 0.2
}
