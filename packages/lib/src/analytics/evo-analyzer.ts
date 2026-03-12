/**
 * EvoSkill failure pattern analyzer
 *
 * Detects three types of failure signals from skill_events:
 * 1. zero_result_cluster — same query fails 3+ times with no results
 * 2. low_conversion — skill has STL<10% or LTA<5% with 30+ searches
 * 3. repeated_skip — skill skipped 5+ times
 *
 * Results are upserted into evo_failure_patterns for downstream processing.
 */

import { db, evoFailurePatterns, evoRunLogs } from '@gpters/db'
import { sql, eq, and } from 'drizzle-orm'
import { createLogger } from '../core/logger'
import { ZERO_RESULT_SKILL_ID } from './skill-events'
import { getSkillFunnelStats } from './skill-stats'

const log = createLogger('evo-analyzer')

// ---------------------------------------------------------------------------
// Configuration (env-overridable)
// ---------------------------------------------------------------------------

function envInt(key: string, fallback: number): number {
  const val = process.env[key]
  return val ? parseInt(val, 10) : fallback
}

const ANALYSIS_PERIOD_DAYS = envInt('EVOSKILL_ANALYSIS_PERIOD_DAYS', 14)
const ZERO_RESULT_MIN_COUNT = envInt('EVOSKILL_ZERO_RESULT_MIN_COUNT', 3)
const LOW_CONV_MIN_SEARCHES = envInt('EVOSKILL_LOW_CONV_MIN_SEARCHES', 30)
const SKIP_MIN_COUNT = envInt('EVOSKILL_SKIP_MIN_COUNT', 5)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FailurePattern {
  patternType: 'zero_result_cluster' | 'low_conversion' | 'repeated_skip'
  signalData: Record<string, unknown>
  severity: 'low' | 'medium' | 'high'
}

export interface AnalysisResult {
  patternsFound: number
  byType: { zero_result_cluster: number; low_conversion: number; repeated_skip: number }
  errors: number
}

// ---------------------------------------------------------------------------
// Signal detectors
// ---------------------------------------------------------------------------

/**
 * Detect zero-result query clusters.
 *
 * Groups zero-result search events by query, keeping only those
 * that appear >= ZERO_RESULT_MIN_COUNT times in the analysis period.
 */
export async function detectZeroResultClusters(): Promise<FailurePattern[]> {
  const rows = await db.execute<{
    query: string
    count: string
    first_seen: string
    last_seen: string
  }>(sql`
    SELECT
      query,
      COUNT(*)::text AS count,
      MIN(created_at)::text AS first_seen,
      MAX(created_at)::text AS last_seen
    FROM skill_events
    WHERE skill_id = ${ZERO_RESULT_SKILL_ID}
      AND action = 'search'
      AND query IS NOT NULL
      AND created_at >= NOW() - make_interval(days => ${ANALYSIS_PERIOD_DAYS})
    GROUP BY query
    HAVING COUNT(*) >= ${ZERO_RESULT_MIN_COUNT}
    ORDER BY COUNT(*) DESC
    LIMIT 50
  `)

  return rows.rows.map((row) => {
    const count = parseInt(row.count, 10)
    return {
      patternType: 'zero_result_cluster' as const,
      signalData: {
        query: row.query,
        occurrences: count,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
      },
      severity: count >= 10 ? 'high' : count >= 5 ? 'medium' : 'low',
    }
  })
}

/**
 * Detect skills with low funnel conversion.
 *
 * Uses getSkillFunnelStats to find skills where:
 * - searches >= LOW_CONV_MIN_SEARCHES AND
 * - (searchToLoadRate < 10% OR loadToApplyRate < 5%)
 */
export async function detectLowConversion(): Promise<FailurePattern[]> {
  const stats = await getSkillFunnelStats({ period: '30d' })

  return stats
    .filter((s) => {
      if (s.searches < LOW_CONV_MIN_SEARCHES) return false
      if (s.skillId === ZERO_RESULT_SKILL_ID) return false
      return s.searchToLoadRate < 0.10 || s.loadToApplyRate < 0.05
    })
    .map((s) => {
      const isVeryLow = s.searchToLoadRate < 0.05 && s.searches >= 50
      return {
        patternType: 'low_conversion' as const,
        signalData: {
          skillId: s.skillId,
          searches: s.searches,
          loads: s.loads,
          applies: s.applies,
          searchToLoadRate: Math.round(s.searchToLoadRate * 100),
          loadToApplyRate: Math.round(s.loadToApplyRate * 100),
        },
        severity: isVeryLow ? 'high' : s.searchToLoadRate < 0.10 ? 'medium' : 'low',
      }
    })
}

/**
 * Detect repeatedly skipped skills.
 *
 * Groups skip events by skill_id, keeping those with >= SKIP_MIN_COUNT.
 */
export async function detectRepeatedSkips(): Promise<FailurePattern[]> {
  const rows = await db.execute<{
    skill_id: string
    skip_count: string
    unique_sessions: string
    sample_contexts: string
  }>(sql`
    SELECT
      skill_id,
      COUNT(*)::text AS skip_count,
      COUNT(DISTINCT session_id)::text AS unique_sessions,
      (ARRAY_AGG(DISTINCT context) FILTER (WHERE context IS NOT NULL))[1:3]::text AS sample_contexts
    FROM skill_events
    WHERE action = 'skip'
      AND skill_id != ${ZERO_RESULT_SKILL_ID}
      AND created_at >= NOW() - make_interval(days => ${ANALYSIS_PERIOD_DAYS})
    GROUP BY skill_id
    HAVING COUNT(*) >= ${SKIP_MIN_COUNT}
    ORDER BY COUNT(*) DESC
    LIMIT 50
  `)

  return rows.rows.map((row) => {
    const skipCount = parseInt(row.skip_count, 10)
    const uniqueSessions = parseInt(row.unique_sessions, 10)
    return {
      patternType: 'repeated_skip' as const,
      signalData: {
        skillId: row.skill_id,
        skipCount,
        uniqueSessions,
        sampleContexts: row.sample_contexts,
      },
      severity: skipCount >= 15 ? 'high' : skipCount >= 8 ? 'medium' : 'low',
    }
  })
}

// ---------------------------------------------------------------------------
// Deduplication helper
// ---------------------------------------------------------------------------

/**
 * Build a deterministic key for a pattern to detect duplicates.
 */
function patternKey(p: FailurePattern): string {
  if (p.patternType === 'zero_result_cluster') {
    return `zrc:${(p.signalData.query as string).toLowerCase().trim()}`
  }
  if (p.patternType === 'low_conversion') {
    return `lc:${p.signalData.skillId}`
  }
  return `rs:${p.signalData.skillId}`
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run all three failure pattern detectors and upsert results
 * into the evo_failure_patterns table.
 *
 * Skips patterns that already exist in pending/processing status
 * to avoid duplicate entries.
 */
export async function analyzeFailurePatterns(): Promise<AnalysisResult> {
  const runId = crypto.randomUUID()
  const startedAt = new Date()
  const result: AnalysisResult = {
    patternsFound: 0,
    byType: { zero_result_cluster: 0, low_conversion: 0, repeated_skip: 0 },
    errors: 0,
  }

  try {
    // Run all three detectors in parallel
    const [zeroResults, lowConv, skips] = await Promise.all([
      detectZeroResultClusters().catch((err) => {
        log.warn('detectZeroResultClusters failed', { error: (err as Error).message })
        result.errors++
        return [] as FailurePattern[]
      }),
      detectLowConversion().catch((err) => {
        log.warn('detectLowConversion failed', { error: (err as Error).message })
        result.errors++
        return [] as FailurePattern[]
      }),
      detectRepeatedSkips().catch((err) => {
        log.warn('detectRepeatedSkips failed', { error: (err as Error).message })
        result.errors++
        return [] as FailurePattern[]
      }),
    ])

    const allPatterns = [...zeroResults, ...lowConv, ...skips]

    // Fetch existing pending/processing patterns to deduplicate
    const existing = await db
      .select({
        id: evoFailurePatterns.id,
        patternType: evoFailurePatterns.patternType,
        signalData: evoFailurePatterns.signalData,
      })
      .from(evoFailurePatterns)
      .where(
        sql`${evoFailurePatterns.status} IN ('pending', 'processing')`
      )

    const existingKeys = new Set(
      existing.map((e) =>
        patternKey({
          patternType: e.patternType,
          signalData: e.signalData as Record<string, unknown>,
          severity: 'low',
        })
      )
    )

    // Insert only new patterns
    const newPatterns = allPatterns.filter((p) => !existingKeys.has(patternKey(p)))

    if (newPatterns.length > 0) {
      await db.insert(evoFailurePatterns).values(
        newPatterns.map((p) => ({
          patternType: p.patternType,
          signalData: p.signalData,
          severity: p.severity,
          status: 'pending' as const,
          analyzedAt: new Date(),
        }))
      )
    }

    result.patternsFound = newPatterns.length
    for (const p of newPatterns) {
      result.byType[p.patternType]++
    }

    log.info('EvoSkill analysis complete', {
      total: allPatterns.length,
      new: newPatterns.length,
      deduplicated: allPatterns.length - newPatterns.length,
      byType: result.byType,
    })
  } catch (err) {
    result.errors++
    log.error('analyzeFailurePatterns failed', err)

    // Log the failed run
    await db.insert(evoRunLogs).values({
      runType: 'analyze',
      startedAt,
      completedAt: new Date(),
      stats: result as unknown as Record<string, number>,
      error: (err as Error).message,
    }).catch(() => {})

    throw err
  }

  // Log successful run
  await db.insert(evoRunLogs).values({
    runType: 'analyze',
    startedAt,
    completedAt: new Date(),
    stats: result as unknown as Record<string, number>,
  }).catch((err) => {
    log.warn('Failed to log evo run', { error: (err as Error).message })
  })

  return result
}
