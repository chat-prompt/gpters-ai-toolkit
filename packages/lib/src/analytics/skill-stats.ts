/**
 * Skill funnel statistics.
 *
 * Provides queries over the skill_events table
 * to compute per-skill conversion funnels (search -> load -> apply).
 * Results are cached in-memory with a 5-minute TTL.
 */

import { db } from '@gpters/db'
import { sql } from 'drizzle-orm'
import { createLogger } from '../core/logger'

const log = createLogger('skill-stats')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Per-skill funnel statistics showing conversion through the
 * search -> load -> apply pipeline.
 */
export interface SkillFunnelStats {
  /** Skill identifier */
  skillId: string
  /** Total search events for this skill */
  searches: number
  /** Total load events */
  loads: number
  /** Total apply events */
  applies: number
  /** Total skip events */
  skips: number
  /** Conversion rate from search to load (0-1) */
  searchToLoadRate: number
  /** Conversion rate from load to apply (0-1) */
  loadToApplyRate: number
}

/** Valid time period filters for statistics queries */
export type StatsPeriod = '7d' | '30d' | '90d'

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000

interface CacheEntry<T> {
  data: T
  cachedAt: number
}

const funnelCache = new Map<string, CacheEntry<SkillFunnelStats[]>>()

/**
 * Build a cache key from query parameters.
 *
 * @param prefix - Cache namespace prefix
 * @param skillId - Optional skill filter
 * @param period - Optional time period filter
 * @returns Unique cache key string
 */
function cacheKey(prefix: string, skillId?: string, period?: StatsPeriod): string {
  return `${prefix}:${skillId ?? 'all'}:${period ?? 'all'}`
}

/**
 * Invalidate all skill-stats caches.
 *
 * Mainly useful in tests.
 */
export function invalidateSkillStatsCache(): void {
  funnelCache.clear()
}

// ---------------------------------------------------------------------------
// Period SQL helper
// ---------------------------------------------------------------------------

/**
 * Convert a period string to an interval SQL fragment.
 *
 * @param period - Time period filter
 * @returns SQL fragment for the interval, or null for no filter
 */
function periodToInterval(period?: StatsPeriod): ReturnType<typeof sql> | null {
  switch (period) {
    case '7d':
      return sql`INTERVAL '7 days'`
    case '30d':
      return sql`INTERVAL '30 days'`
    case '90d':
      return sql`INTERVAL '90 days'`
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get per-skill funnel statistics (search -> load -> apply conversion rates).
 *
 * Queries skill_events to count actions per skill and computes
 * conversion rates between funnel stages.
 *
 * @param params - Optional filters for skillId and time period
 * @returns Array of funnel statistics per skill
 */
export async function getSkillFunnelStats(params: {
  skillId?: string
  period?: StatsPeriod
} = {}): Promise<SkillFunnelStats[]> {
  const { skillId, period } = params
  const key = cacheKey('funnel', skillId, period)

  const cached = funnelCache.get(key)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data
  }

  try {
    const interval = periodToInterval(period)

    const whereClause = [
      skillId ? sql`skill_id = ${skillId}` : null,
      interval ? sql`created_at >= NOW() - ${interval}` : null,
    ].filter((x): x is NonNullable<typeof x> => x !== null)

    const whereSQL = whereClause.length > 0
      ? sql`WHERE ${sql.join(whereClause, sql` AND `)}`
      : sql``

    const rows = await db.execute<{
      skill_id: string
      searches: string
      loads: string
      applies: string
      skips: string
    }>(sql`
      SELECT
        skill_id,
        COUNT(*) FILTER (WHERE action = 'search')::text AS searches,
        COUNT(*) FILTER (WHERE action = 'load')::text AS loads,
        COUNT(*) FILTER (WHERE action = 'apply')::text AS applies,
        COUNT(*) FILTER (WHERE action = 'skip')::text AS skips
      FROM skill_events
      ${whereSQL}
      GROUP BY skill_id
      ORDER BY applies DESC
    `)

    const results: SkillFunnelStats[] = rows.rows.map((row) => {
      const searches = parseInt(row.searches, 10) || 0
      const loads = parseInt(row.loads, 10) || 0
      const applies = parseInt(row.applies, 10) || 0
      const skips = parseInt(row.skips, 10) || 0

      return {
        skillId: row.skill_id,
        searches,
        loads,
        applies,
        skips,
        searchToLoadRate: searches > 0 ? loads / searches : 0,
        loadToApplyRate: loads > 0 ? applies / loads : 0,
      }
    })

    funnelCache.set(key, { data: results, cachedAt: Date.now() })
    log.info('Skill funnel stats loaded', { count: results.length, skillId, period })
    return results
  } catch (err) {
    log.warn('Failed to load skill funnel stats', {
      error: (err as Error).message,
    })
    return []
  }
}

