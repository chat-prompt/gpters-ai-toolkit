/**
 * 정리 후보 — 한 번도 열리지 않은 스킬을 우선순위와 함께.
 *
 * 운영에서 489개 중 306개가 **로드 0건**이다(2026-09-07). 총계는 이미 스킬 탭에 있지만
 * "그중 뭘 먼저 볼까"를 답하는 화면이 없었다. 306개를 그냥 나열하면 아무도 손대지 못한다.
 *
 * ## 무엇을 먼저 보나
 *
 * **검색에 뜨는데 안 열리는 것이 가장 나쁘다.** 검색 자리를 차지하면서 아무 값도 못 준다.
 * 한 번도 노출된 적 없는 스킬은 조용히 자리만 차지하므로 급하지 않다.
 *
 * ## 새 스킬은 후보가 아니다
 *
 * 만든 지 얼마 안 된 스킬이 안 쓰인 것은 당연하다. 유예 기간을 두지 않으면 이번 주에 올린 스킬이
 * 정리 목록 맨 위에 뜨고, 그 목록은 아무도 안 믿게 된다.
 *
 * ## 중복은 여기서 세지 않는다
 *
 * 이미 중복 묶음에 걸린 스킬은 거기서 판단한다. 양쪽에 다 뜨면 같은 항목을 두 번 처리하게 된다.
 */

import { catalogItems, db, skillEvents, users } from '@gpters/db'
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { createLogger } from '../../core/logger'
import type { AxUnusedSkillRow, AxUnusedSkillsData } from './types'

const log = createLogger('ax-unused-skills')

/**
 * 만든 지 이 기간이 안 된 스킬은 후보에서 뺀다.
 *
 * 30일은 팀의 검색·로드 주기를 감안한 값이다 — 운영에서 한 스킬이 처음 로드되기까지
 * 걸린 시간의 대부분이 이 안에 들어온다.
 */
export const NEW_SKILL_GRACE_DAYS = 30

/** 화면에 내려보내는 최대 줄 수 */
const CANDIDATE_LIMIT = 25

// 화면 계약은 types.ts가 정본이다. 여기서 같은 모양을 다시 선언하면 둘이 갈린다.
export type { AxUnusedSkillRow as UnusedSkillRow, AxUnusedSkillsData as UnusedSkillsData } from './types'

/**
 * 정리 후보를 계산한다.
 *
 * @param duplicateIds - 이미 중복 묶음에 걸린 id. 여기서 뺀다
 * @returns 후보 목록과 집계
 */
export async function computeUnusedSkills(duplicateIds: Set<string>): Promise<AxUnusedSkillsData> {
  const rows = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      authorName: users.name,
      createdAt: catalogItems.createdAt,
      loads: sql<number>`(
        SELECT count(*)::int FROM ${skillEvents}
        WHERE ${skillEvents.skillId} = ${catalogItems.id} AND ${skillEvents.action} = 'load'
      )`,
      shown: sql<number>`(
        SELECT count(*)::int FROM ${skillEvents}
        WHERE ${skillEvents.skillId} = ${catalogItems.id} AND ${skillEvents.action} = 'search'
      )`,
    })
    .from(catalogItems)
    .leftJoin(users, eq(users.id, catalogItems.authorId))
    .where(
      and(
        eq(catalogItems.type, 'skill'),
        // 발행된 적 없는 초안은 정리 대상이 아니다 — 다른 패널과 같은 모집단
        or(eq(catalogItems.status, 'published'), isNull(catalogItems.status))
      )
    )

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const neverLoadedRows = rows.filter((row) => Number(row.loads ?? 0) === 0)

  let excludedAsDuplicate = 0
  const candidates: AxUnusedSkillRow[] = []

  for (const row of neverLoadedRows) {
    if (duplicateIds.has(row.id)) {
      excludedAsDuplicate += 1
      continue
    }
    const created = row.createdAt ? new Date(row.createdAt) : null
    const ageDays = created ? Math.floor((now - created.getTime()) / dayMs) : 0
    // 만든 지 얼마 안 된 스킬이 안 쓰인 것은 당연하다
    if (ageDays < NEW_SKILL_GRACE_DAYS) continue

    candidates.push({
      id: row.id,
      name: row.name,
      authorName: row.authorName ?? null,
      createdAt: created ? created.toISOString().slice(0, 10) : '',
      shown: Number(row.shown ?? 0),
      ageDays,
    })
  }

  // 검색에 뜨는데 안 열리는 것부터. 노출이 같으면 오래된 것부터
  candidates.sort((a, b) => b.shown - a.shown || b.ageDays - a.ageDays || a.id.localeCompare(b.id))

  const authorCounts = new Map<string | null, number>()
  for (const row of candidates) {
    authorCounts.set(row.authorName, (authorCounts.get(row.authorName) ?? 0) + 1)
  }

  const data: AxUnusedSkillsData = {
    totalItems: rows.length,
    neverLoaded: neverLoadedRows.length,
    candidates: candidates.length,
    shownButUnused: candidates.filter((row) => row.shown > 0).length,
    excludedAsDuplicate,
    graceDays: NEW_SKILL_GRACE_DAYS,
    rows: candidates.slice(0, CANDIDATE_LIMIT),
    byAuthor: [...authorCounts.entries()]
      .map(([authorName, count]) => ({ authorName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  }

  log.info('Computed unused skill candidates', {
    neverLoaded: data.neverLoaded,
    candidates: data.candidates,
    excludedAsDuplicate,
  })
  return data
}
