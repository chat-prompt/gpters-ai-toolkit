/**
 * EvoSkill failure pattern analyzer
 *
 * Detects failure signals from mcp_audit_logs (not skill_events, which has
 * a session_id FK to mcp_sessions that silently drops rows for service-token
 * or session-less callers). mcp_audit_logs captures every MCP request with
 * tool name, request_params and search_results, giving a complete picture.
 *
 * Detectors:
 * 1. zero_result_cluster — same query reported via `report_search_skip` 2+ times
 * 2. low_conversion — skill appears in search results 30+ times but get_plugin_content
 *    load ratio is below 10%
 * 3. repeated_skip — disabled (overlaps with low_conversion on the new data source)
 *
 * Results are upserted into evo_failure_patterns for downstream processing.
 */

import { db, evoFailurePatterns, evoRunLogs } from '@gpters/db'
import { sql } from 'drizzle-orm'
import { createLogger } from '../core/logger'

const log = createLogger('evo-analyzer')

// ---------------------------------------------------------------------------
// Configuration (env-overridable)
// ---------------------------------------------------------------------------

function envInt(key: string, fallback: number): number {
  const val = process.env[key]
  return val ? parseInt(val, 10) : fallback
}

const ANALYSIS_PERIOD_DAYS = envInt('EVOSKILL_ANALYSIS_PERIOD_DAYS', 14)
const ZERO_RESULT_MIN_COUNT = envInt('EVOSKILL_ZERO_RESULT_MIN_COUNT', 2)
const LOW_CONV_MIN_SEARCHES = envInt('EVOSKILL_LOW_CONV_MIN_SEARCHES', 30)
const LOW_CONV_LOAD_RATE_THRESHOLD = 0.1

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
 * Detect zero-result query clusters from explicit `report_search_skip` calls.
 *
 * Users (and their Claude Code clients) call the `report_search_skip` MCP tool
 * whenever they give up on a search — typically because no returned skill was
 * relevant. Group those queries and keep clusters of >= ZERO_RESULT_MIN_COUNT.
 */
export async function detectZeroResultClusters(): Promise<FailurePattern[]> {
  const rows = await db.execute<{
    query: string
    count: string
    first_seen: string
    last_seen: string
  }>(sql`
    SELECT
      LOWER(TRIM(request_params->'params'->'arguments'->>'query')) AS query,
      COUNT(*)::text AS count,
      MIN(created_at)::text AS first_seen,
      MAX(created_at)::text AS last_seen
    FROM mcp_audit_logs
    WHERE tool = 'report_search_skip'
      AND request_params->'params'->'arguments'->>'query' IS NOT NULL
      AND created_at >= NOW() - make_interval(days => ${ANALYSIS_PERIOD_DAYS})
    GROUP BY 1
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
 * Detect skills with low search-to-load conversion.
 *
 * Counts how often each skill appears in `semantic_search` / `exercise_skill_search`
 * result sets (search_results jsonb) and compares it to the number of times the
 * same skillId was actually opened via `get_plugin_content`. Skills that show up
 * in search >= LOW_CONV_MIN_SEARCHES times but get opened < LOW_CONV_LOAD_RATE_THRESHOLD
 * are flagged.
 */
export async function detectLowConversion(): Promise<FailurePattern[]> {
  const rows = await db.execute<{
    skill_id: string
    searches: string
    loads: string
    load_rate: string
  }>(sql`
    WITH appearances AS (
      SELECT
        (jsonb_array_elements(search_results)->>'itemId') AS skill_id,
        COUNT(*) AS search_count
      FROM mcp_audit_logs
      WHERE tool IN ('semantic_search', 'exercise_skill_search')
        AND search_results IS NOT NULL
        AND jsonb_typeof(search_results) = 'array'
        AND created_at >= NOW() - make_interval(days => ${ANALYSIS_PERIOD_DAYS})
      GROUP BY 1
    ),
    loads AS (
      SELECT
        COALESCE(
          request_params->'params'->'arguments'->>'pluginId',
          request_params->>'pluginId'
        ) AS skill_id,
        COUNT(*) AS load_count
      FROM mcp_audit_logs
      WHERE tool = 'get_plugin_content'
        AND created_at >= NOW() - make_interval(days => ${ANALYSIS_PERIOD_DAYS})
      GROUP BY 1
    )
    SELECT
      a.skill_id,
      a.search_count::text AS searches,
      COALESCE(l.load_count, 0)::text AS loads,
      ROUND(
        (COALESCE(l.load_count, 0)::numeric / NULLIF(a.search_count, 0)) * 100,
        2
      )::text AS load_rate
    FROM appearances a
    LEFT JOIN loads l ON a.skill_id = l.skill_id
    WHERE a.skill_id IS NOT NULL
      AND a.search_count >= ${LOW_CONV_MIN_SEARCHES}
      AND (COALESCE(l.load_count, 0)::float / a.search_count) < ${LOW_CONV_LOAD_RATE_THRESHOLD}
    ORDER BY a.search_count DESC
    LIMIT 50
  `)

  return rows.rows.map((row) => {
    const searches = parseInt(row.searches, 10)
    const loads = parseInt(row.loads, 10)
    const loadRatePct = parseFloat(row.load_rate)
    const isVeryLow = loadRatePct < 5 && searches >= 50
    return {
      patternType: 'low_conversion' as const,
      signalData: {
        skillId: row.skill_id,
        searches,
        loads,
        searchToLoadRate: loadRatePct,
      },
      severity: isVeryLow ? 'high' : loadRatePct < 5 ? 'medium' : 'low',
    }
  })
}

/**
 * Detect repeatedly skipped skills.
 *
 * Disabled: with the mcp_audit_logs data source there is no reliable
 * per-skill skip signal — `report_search_skip` is a per-query signal
 * (handled by {@link detectZeroResultClusters}) and the low-conversion
 * detector already covers "users kept ignoring this skill".
 */
export async function detectRepeatedSkips(): Promise<FailurePattern[]> {
  return []
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
