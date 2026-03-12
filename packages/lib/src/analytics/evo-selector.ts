/**
 * EvoSkill Pareto selector
 *
 * Evaluates draft skills (evoGenerated=true) against funnel metrics
 * and automatically promotes or retires them:
 *
 * - Promote: 7+ days old, 10+ searches, STL≥15%, LTA≥10%
 * - Retire: 30+ days old, STL<5% OR searches<5
 * - Hold: everything else stays draft
 */

import { db, catalogItems, evoRunLogs } from '@gpters/db'
import { eq, and, sql } from 'drizzle-orm'
import { createLogger } from '../core/logger'
import { getSkillFunnelStats } from './skill-stats'

const log = createLogger('evo-selector')

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function envInt(key: string, fallback: number): number {
  const val = process.env[key]
  return val ? parseInt(val, 10) : fallback
}

const PROMOTE_MIN_DAYS = envInt('EVOSKILL_PROMOTE_MIN_DAYS', 7)
const RETIRE_MAX_DAYS = envInt('EVOSKILL_RETIRE_MAX_DAYS', 30)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Verdict = 'promote' | 'retire' | 'hold'

export interface SelectionDecision {
  skillId: string
  skillName: string
  verdict: Verdict
  reason: string
  metrics: {
    ageDays: number
    searches: number
    searchToLoadRate: number
    loadToApplyRate: number
  }
}

export interface SelectionResult {
  promoted: number
  retired: number
  held: number
  decisions: SelectionDecision[]
  errors: number
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Determine verdict for a single draft skill based on its funnel metrics.
 */
function judge(
  ageDays: number,
  searches: number,
  stlRate: number,
  ltaRate: number
): { verdict: Verdict; reason: string } {
  // Promote: mature + high conversion
  if (
    ageDays >= PROMOTE_MIN_DAYS &&
    searches >= 10 &&
    stlRate >= 0.15 &&
    ltaRate >= 0.10
  ) {
    return {
      verdict: 'promote',
      reason: `${ageDays}일 경과, ${searches}회 검색, STL ${Math.round(stlRate * 100)}%, LTA ${Math.round(ltaRate * 100)}% — 승격 기준 충족`,
    }
  }

  // Retire: old + no traction
  if (ageDays >= RETIRE_MAX_DAYS && (stlRate < 0.05 || searches < 5)) {
    return {
      verdict: 'retire',
      reason: `${ageDays}일 경과, ${searches}회 검색, STL ${Math.round(stlRate * 100)}% — 폐기 기준 충족`,
    }
  }

  return {
    verdict: 'hold',
    reason: `${ageDays}일 경과, ${searches}회 검색 — 판정 보류`,
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Evaluate all evo-generated draft skills and apply promote/retire decisions.
 */
export async function evaluateEvoDrafts(): Promise<SelectionResult> {
  const startedAt = new Date()
  const result: SelectionResult = {
    promoted: 0,
    retired: 0,
    held: 0,
    decisions: [],
    errors: 0,
  }

  try {
    // Fetch evo-generated draft skills
    const drafts = await db
      .select({
        id: catalogItems.id,
        name: catalogItems.name,
        createdAt: catalogItems.createdAt,
      })
      .from(catalogItems)
      .where(
        and(
          eq(catalogItems.evoGenerated, true),
          eq(catalogItems.status, 'draft')
        )
      )

    if (drafts.length === 0) {
      log.info('No evo drafts to evaluate')
      return result
    }

    // Get funnel stats for all skills at once (cached)
    const funnelStats = await getSkillFunnelStats({ period: '30d' })
    const funnelMap = new Map(funnelStats.map((s) => [s.skillId, s]))

    for (const draft of drafts) {
      const ageDays = Math.floor(
        (Date.now() - new Date(draft.createdAt!).getTime()) / (1000 * 60 * 60 * 24)
      )
      const funnel = funnelMap.get(draft.id)
      const searches = funnel?.searches ?? 0
      const stlRate = funnel?.searchToLoadRate ?? 0
      const ltaRate = funnel?.loadToApplyRate ?? 0

      const { verdict, reason } = judge(ageDays, searches, stlRate, ltaRate)

      const decision: SelectionDecision = {
        skillId: draft.id,
        skillName: draft.name,
        verdict,
        reason,
        metrics: { ageDays, searches, searchToLoadRate: stlRate, loadToApplyRate: ltaRate },
      }
      result.decisions.push(decision)

      try {
        if (verdict === 'promote') {
          await db.update(catalogItems)
            .set({ status: 'published', updatedAt: new Date() })
            .where(eq(catalogItems.id, draft.id))
          result.promoted++
        } else if (verdict === 'retire') {
          await db.update(catalogItems)
            .set({ status: 'retired' as string, updatedAt: new Date() })
            .where(eq(catalogItems.id, draft.id))
          result.retired++
        } else {
          result.held++
        }
      } catch (err) {
        log.warn(`Failed to update skill ${draft.id}`, { error: (err as Error).message })
        result.errors++
      }
    }

    log.info('EvoSkill selection complete', {
      total: drafts.length,
      promoted: result.promoted,
      retired: result.retired,
      held: result.held,
    })
  } catch (err) {
    result.errors++
    log.error('evaluateEvoDrafts failed', err)

    await db.insert(evoRunLogs).values({
      runType: 'promote',
      startedAt,
      completedAt: new Date(),
      stats: { promoted: result.promoted, retired: result.retired, held: result.held, errors: result.errors },
      error: (err as Error).message,
    }).catch(() => {})

    throw err
  }

  await db.insert(evoRunLogs).values({
    runType: 'promote',
    startedAt,
    completedAt: new Date(),
    stats: { promoted: result.promoted, retired: result.retired, held: result.held, errors: result.errors },
  }).catch((err) => {
    log.warn('Failed to log evo run', { error: (err as Error).message })
  })

  return result
}
