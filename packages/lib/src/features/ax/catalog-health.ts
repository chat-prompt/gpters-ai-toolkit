/**
 * 카탈로그 위생 지표의 일별 스냅숏 — 중복·미사용이 늘고 있나 줄고 있나.
 *
 * ## 왜 저장하나
 *
 * 중복 패널은 **스냅숏**이라 "지금 묶음 8개"만 말한다. 정리가 먹히는지, 새로 쌓이고 있는지는
 * 추세로만 알 수 있는데 **카탈로그는 과거 상태를 보존하지 않는다** — 스킬이 지워지면 흔적이 없고
 * 본문이 바뀌면 예전 유사도를 다시 잴 수 없다. 그래서 소급 계산이 불가능하고, 매일 찍어 두는 수밖에 없다.
 *
 * ## 무엇을 찍나
 *
 * 정리 대상 세 갈래를 한 줄에 담는다 — 중복(묶음·항목·사실상 동일 쌍), 미사용(로드 0·적용 0),
 * 1인 전용. [DEV-4275] 병목 진단이 짚은 것과 같은 축이다.
 *
 * 같은 날 다시 돌리면 덮어쓴다(복합 기본키). 크론이 두 번 돌아도 하루에 한 줄이다.
 */

import { axCatalogHealthSnapshots, catalogItems, db, skillEvents } from '@gpters/db'
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm'
import { createLogger } from '../../core/logger'
import { normalizeSkillDoc } from './skill-diff'
import { findDuplicatePairs, groupDuplicates, type DuplicateCandidate } from './skill-duplicates'

const log = createLogger('ax-catalog-health')

/** 사실상 같은 문서로 보는 경계 — 중복 패널과 같은 값 */
const NEAR_IDENTICAL = 0.99


/** 한 줄의 스냅숏 값 */
export interface CatalogHealthMetrics {
  totalItems: number
  neverLoaded: number
  neverApplied: number
  singleUserApplied: number
  duplicateGroups: number
  duplicateItems: number
  nearIdenticalPairs: number
}

/** 스냅숏 한 줄 (날짜 포함) */
export interface CatalogHealthSnapshot extends CatalogHealthMetrics {
  snapshotDate: string
}

/**
 * 위생 지표의 원천 행을 읽는 질의를 만든다.
 *
 * 실행하지 않고 만들기만 하는 이유는 **생성된 SQL을 테스트가 검사할 수 있게** 하기 위해서다.
 * 여기서 틀리면 오류 없이 조용히 0이 나오므로, 숫자가 아니라 SQL의 모양을 봐야 잡힌다.
 *
 * @param itemType - 대상 타입
 * @returns 실행 전 질의
 */
export function buildCatalogHealthQuery(itemType = 'skill') {
  // 상관 서브쿼리에서 쓸 **테이블을 한정한** 컬럼 참조.
  //
  // drizzle은 조인이 없는 select에서 컬럼을 접두 없이 렌더한다 — `catalogItems.id`가 그냥
  // `"id"`가 된다. 그 조각을 `FROM "skill_events"` 서브쿼리 안에 넣으면 `"id"`가 바깥
  // catalog_items.id가 아니라 **skill_events.id(이벤트 자신의 UUID)로 해석된다.**
  // 조건이 `skill_events.skill_id = skill_events.id`가 되어 절대 참이 되지 않고,
  // 모든 스킬이 "로드 0건"으로 나온다. 오류 없이 조용히 틀린 숫자를 낸다.
  //
  // `unused-skills.ts`·`skill-duplicates.ts`는 leftJoin이 있어 drizzle이 컬럼을 한정하므로
  // 같은 코드가 정상 동작한다. 그 차이 때문에 여기서만 틀렸다.
  //
  // 모듈 최상단이 아니라 함수 안에서 만든다 — 최상단이면 import 시점에 평가되어
  // `@gpters/db`를 부분 모킹하는 테스트가 이 모듈을 끌어올 때 깨진다.
  const catalogId = sql`${catalogItems}."id"`
  const eventSkillId = sql`${skillEvents}."skill_id"`
  const eventAction = sql`${skillEvents}."action"`
  const eventUserId = sql`${skillEvents}."user_id"`

  return db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      content: catalogItems.content,
      loads: sql<number>`(
        SELECT count(*)::int FROM ${skillEvents}
        WHERE ${eventSkillId} = ${catalogId} AND ${eventAction} = 'load'
      )`,
      applies: sql<number>`(
        SELECT count(*)::int FROM ${skillEvents}
        WHERE ${eventSkillId} = ${catalogId} AND ${eventAction} = 'apply'
      )`,
      appliers: sql<number>`(
        SELECT count(DISTINCT ${eventUserId})::int FROM ${skillEvents}
        WHERE ${eventSkillId} = ${catalogId} AND ${eventAction} = 'apply'
          AND ${eventUserId} IS NOT NULL
      )`,
    })
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.type, itemType as never),
        // 발행된 적 없는 초안은 정리 대상이 아니다
        or(eq(catalogItems.status, 'published'), isNull(catalogItems.status))
      )
    )
}

/**
 * 오늘 기준 카탈로그 위생 지표를 계산한다.
 *
 * 중복 계산은 중복 패널과 **같은 함수**를 쓴다. 따로 구현하면 화면 숫자와 추세 숫자가 갈린다.
 *
 * @param itemType - 대상 타입 (기본 skill)
 * @returns 계산된 지표
 */
export async function computeCatalogHealth(itemType = 'skill'): Promise<CatalogHealthMetrics> {
  const rows = await buildCatalogHealthQuery(itemType)

  const candidates: DuplicateCandidate[] = rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      authorName: null,
      applies: Number(row.applies ?? 0),
      doc: normalizeSkillDoc(row.content),
    }))
    .filter((candidate) => candidate.doc.length >= 3)

  const pairs = findDuplicatePairs(candidates)
  const groups = groupDuplicates(pairs)

  return {
    totalItems: rows.length,
    neverLoaded: rows.filter((row) => Number(row.loads ?? 0) === 0).length,
    neverApplied: rows.filter((row) => Number(row.applies ?? 0) === 0).length,
    singleUserApplied: rows.filter((row) => Number(row.appliers ?? 0) === 1).length,
    duplicateGroups: groups.length,
    duplicateItems: groups.reduce((sum, group) => sum + group.length, 0),
    nearIdenticalPairs: pairs.filter((pair) => pair.similarity >= NEAR_IDENTICAL).length,
  }
}

/**
 * 오늘치 스냅숏을 계산해 저장한다.
 *
 * 같은 날 다시 돌리면 덮어쓴다 — 크론이 재시도돼도 하루에 한 줄이다.
 *
 * @param itemType - 대상 타입 (기본 skill)
 * @returns 저장한 스냅숏
 */
export async function captureCatalogHealth(itemType = 'skill'): Promise<CatalogHealthSnapshot> {
  const metrics = await computeCatalogHealth(itemType)
  const snapshotDate = new Date().toISOString().slice(0, 10)

  await db
    .insert(axCatalogHealthSnapshots)
    .values({ snapshotDate, itemType: itemType as never, ...metrics, capturedAt: new Date() })
    .onConflictDoUpdate({
      target: [axCatalogHealthSnapshots.snapshotDate, axCatalogHealthSnapshots.itemType],
      set: { ...metrics, capturedAt: new Date() },
    })

  log.info('Captured catalog health snapshot', { snapshotDate, itemType, ...metrics })
  return { snapshotDate, ...metrics }
}

/**
 * 최근 스냅숏을 오래된 순으로 읽는다.
 *
 * @param itemType - 대상 타입
 * @param limit - 최대 줄 수
 * @returns 날짜 오름차순 스냅숏
 */
export async function readCatalogHealthTrend(
  itemType = 'skill',
  limit = 90
): Promise<CatalogHealthSnapshot[]> {
  const rows = await db
    .select()
    .from(axCatalogHealthSnapshots)
    .where(eq(axCatalogHealthSnapshots.itemType, itemType as never))
    .orderBy(desc(axCatalogHealthSnapshots.snapshotDate))
    .limit(limit)

  return rows
    .map((row) => ({
      snapshotDate: row.snapshotDate,
      totalItems: row.totalItems,
      neverLoaded: row.neverLoaded,
      neverApplied: row.neverApplied,
      singleUserApplied: row.singleUserApplied,
      duplicateGroups: row.duplicateGroups,
      duplicateItems: row.duplicateItems,
      nearIdenticalPairs: row.nearIdenticalPairs,
    }))
    .reverse()
}

/**
 * 추세에서 "나빠지고 있는가"를 판정한다.
 *
 * 하루치 흔들림에 반응하지 않도록 **처음과 마지막**을 비교한다. 스냅숏이 두 줄 미만이면
 * 판정하지 않는다 — 0이 아니라 미관측이다.
 *
 * @param trend - 날짜 오름차순 스냅숏
 * @returns 시작 대비 변화. 판정할 수 없으면 null
 */
export function summarizeCatalogTrend(trend: CatalogHealthSnapshot[]): {
  from: string
  to: string
  duplicateGroupsDelta: number
  neverLoadedDelta: number
  worsening: boolean
} | null {
  if (trend.length < 2) return null
  const first = trend[0]
  const last = trend[trend.length - 1]
  const duplicateGroupsDelta = last.duplicateGroups - first.duplicateGroups
  const neverLoadedDelta = last.neverLoaded - first.neverLoaded
  return {
    from: first.snapshotDate,
    to: last.snapshotDate,
    duplicateGroupsDelta,
    neverLoadedDelta,
    // 둘 중 하나라도 늘면 나빠지는 것으로 본다
    worsening: duplicateGroupsDelta > 0 || neverLoadedDelta > 0,
  }
}
