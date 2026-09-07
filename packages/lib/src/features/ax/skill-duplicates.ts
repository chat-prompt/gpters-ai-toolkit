/**
 * AX Dashboard — 카탈로그 내부 중복 패널
 *
 * `skill-diff`가 카탈로그 ↔ bbopters-shared **교차** 비교라면, 이 패널은 카탈로그 **안에서**
 * 같은 문서가 여러 id로 등록된 경우를 찾는다. 포크 관계는 못 쓴다 —
 * `catalog_items.forked_from`이 운영 491개 전부 NULL이라 메타데이터로는 추적할 방법이 없다.
 *
 * ## 왜 본문 전체를 비교하나
 *
 * `skill-diff`는 비용 때문에 앞 8,000자만 비교한다. 카탈로그 내부에서는 그 절단이 오탐을 만든다 —
 * 2026-09-04 실측에서 8,000자 캡으로 재면 170쌍이 나오는데 캡 없이 재면 134쌍이다.
 * 사라진 36쌍은 전부 같은 저장소에서 가져온 gstack 계열로, 도입부가 비슷하고 본론이 다른 문서였다
 * (예: `gstack-setup-browser-cookies` ↔ `gstack-ship` 0.938 → **0.428**).
 * 그래서 여기서는 자르지 않고 전체를 비교한다.
 *
 * ## 그 비용을 어떻게 감당하나
 *
 * 491개를 전수 비교하면 12만 쌍이다. 바닥-k 스케치로 후보를 좁힌 뒤, 후보만 정확히 다시 잰다.
 * 스케치는 후보 생성에만 쓰고 **화면에 나가는 유사도는 전부 정확값**이다.
 *
 * ## 이 패널이 답하지 않는 것
 *
 * 유사도는 "합쳐라"가 아니라 "사람이 봐야 한다"는 뜻이다. 의도적으로 갈라놓은 워크플로 단계도
 * 어휘가 겹치면 높게 나온다. 처리 절차는 `docs/plans/2026-09-04-skill-duplicate-cleanup.md`에 있다.
 */

import { catalogItems, db, skillEvents, users } from '@gpters/db'
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { createLogger } from '../../core/logger'
import { panelError, panelOk } from './panel'
import { normalizeSkillDoc, trigramSimilarity } from './skill-diff'
import { readCatalogHealthTrend, summarizeCatalogTrend } from './catalog-health'
import { computeUnusedSkills } from './unused-skills'
import type {
  AxPanel,
  AxPanelMeta,
  AxPanelResult,
  AxSkillDuplicateData,
  AxSkillDuplicatePair,
} from './types'

const log = createLogger('ax-skill-duplicates')

/** 이 유사도 이상이면 중복 후보로 올린다 — `skill-diff`의 임계값과 같게 맞춘다 */
const DUPLICATE_THRESHOLD = 0.5
/** 정규화 후 완전히 같은 것으로 보는 경계 */
const IDENTICAL_THRESHOLD = 0.99
/** 바닥-k 스케치 크기 — 후보 생성 전용이다 */
const SKETCH_SIZE = 200
/**
 * 스케치 기준 후보 통과선.
 *
 * 운영 491개로 재현율을 재서 정했다 (전수 비교로 얻은 정답 134쌍 대비):
 *
 * | 통과선 | 후보 | 놓친 진짜 중복 |
 * | -- | -- | -- |
 * | 0.3 | 8,286 | 0 |
 * | **0.4** | **1,096** | **0** |
 * | 0.5 | 199 | 1 |
 * | 0.6 | 110 | 28 |
 *
 * 0.5부터 놓치기 시작하므로 그 바로 아래에 둔다. 0.3은 걸러내는 일을 거의 하지 않아
 * 정확 검증 단계가 패널 시간의 대부분을 먹는다.
 */
const SKETCH_THRESHOLD = 0.4
/**
 * 묶음을 만들 때 쓰는 유사도 경계.
 *
 * 후보 경계(0.5)로 이어 붙이면 사슬이 생긴다 — 운영에서 gstack 계열 17개가 0.5대 쌍으로 줄줄이
 * 이어져 묶음 하나가 됐다. 그건 판단 단위가 아니다. 묶음은 "같은 문서가 여러 id로 등록된 것"만
 * 대상으로 하므로 훨씬 높게 잡고, 그 아래는 묶지 않고 쌍으로만 보여준다.
 */
const GROUP_THRESHOLD = 0.9
/** 추세로 읽어 오는 스냅숏 일수 */
const TREND_DAYS = 30
/** 화면에 내려보내는 최대 쌍 수 */
const PAIR_LIMIT = 60
/** 캐시 TTL — 무거운 계산이고 스킬 본문은 분 단위로 바뀌지 않는다 */
const CACHE_TTL_MS = 60 * 60 * 1000

const meta: AxPanelMeta = {
  // id는 `skill-duplicates` 그대로 둔다 — 이미 배포된 API 경로이고, 바꿔서 얻을 것이 없다.
  // 화면에 보이는 것은 제목이고, 이 탭이 답하는 질문은 "이번 주에 뭘 정리할까"로 넓어졌다.
  id: 'skill-duplicates',
  title: '정리 후보',
  description: '중복 묶음과 한 번도 열리지 않은 스킬 — 정리 우선순위와 추세',
  source: 'aitk DB (catalog_items)',
  visibility: 'org',
  parentId: 'skill-usage',
  usesPeriod: false,
}

let cache: { result: AxPanelResult<AxSkillDuplicateData>; expiresAt: number } | null = null

/** 테스트에서 캐시를 초기화하기 위한 헬퍼 */
export function __resetSkillDuplicateCache(): void {
  cache = null
}

/** 비교 대상 스킬 한 건 */
export interface DuplicateCandidate {
  id: string
  name: string
  authorName: string | null
  applies: number
  doc: string
}

/**
 * 위치 `start`에서 시작하는 3글자의 32비트 해시 (FNV-1a).
 *
 * 부분 문자열을 만들지 않고 코드 포인트에서 바로 접는다. 이 루프가 패널 시간을 좌우한다 —
 * 491개 문서면 3-그램이 300만 개가 넘고, 그때마다 `slice`로 문자열을 만들면 그 할당만으로
 * 몇 초가 나간다. 암호학적 성질은 필요 없다 (후보를 좁히는 용도이고, 최종 유사도는 정확히 다시 잰다).
 *
 * @param text - 원본 문자열
 * @param start - 3-그램 시작 위치
 * @returns 부호 없는 32비트 해시
 */
function trigramHash(text: string, start: number): number {
  let hash = 0x811c9dc5
  for (let offset = 0; offset < 3; offset++) {
    hash ^= text.charCodeAt(start + offset)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * 본문의 바닥-k 스케치 — 3-그램 해시 중 가장 작은 k개.
 *
 * 두 스케치의 겹침 비율이 자카드 유사도의 추정치가 된다. 문서 길이와 무관하게 k개로 고정되므로
 * 쌍 비교 비용이 본문 길이에 좌우되지 않는다.
 *
 * @param doc - 정규화된 본문
 * @returns 오름차순 해시 배열 (최대 SKETCH_SIZE개)
 */
export function bottomKSketch(doc: string): number[] {
  if (doc.length < 3) return []
  const seen = new Set<number>()
  for (let index = 0; index <= doc.length - 3; index++) {
    seen.add(trigramHash(doc, index))
  }
  // 정렬 대신 가장 작은 SKETCH_SIZE개만 골라도 되지만, 스케치 하나당 한 번뿐이라 비용이 크지 않다
  return [...seen].sort((left, right) => left - right).slice(0, SKETCH_SIZE)
}

/**
 * 두 바닥-k 스케치의 겹침 비율.
 *
 * @param left - 오름차순 스케치
 * @param right - 오름차순 스케치
 * @returns 추정 자카드 0~1
 */
export function sketchOverlap(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0) return 0
  // 둘 다 오름차순이라 병합 스캔으로 센다. 12만 쌍을 도는 루프라 여기서 Set을 새로 만들면
  // 할당이 비교보다 비싸진다.
  const size = Math.min(left.length, right.length)
  let shared = 0
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < size && rightIndex < size) {
    const a = left[leftIndex]
    const b = right[rightIndex]
    if (a === b) {
      shared += 1
      leftIndex += 1
      rightIndex += 1
    } else if (a < b) {
      leftIndex += 1
    } else {
      rightIndex += 1
    }
  }
  return shared / size
}

/**
 * 중복 후보 쌍을 만든다.
 *
 * 스케치로 후보를 좁히고, 후보만 정확한 3-그램 자카드로 다시 잰다.
 * 돌려주는 `similarity`는 전부 정확값이다.
 *
 * @param candidates - 비교 대상 스킬 목록
 * @returns 유사도 내림차순 쌍 목록
 */
export function findDuplicatePairs(candidates: DuplicateCandidate[]): AxSkillDuplicatePair[] {
  const sketches = candidates.map((candidate) => bottomKSketch(candidate.doc))
  const pairs: AxSkillDuplicatePair[] = []

  for (let left = 0; left < candidates.length; left++) {
    for (let right = left + 1; right < candidates.length; right++) {
      if (sketchOverlap(sketches[left], sketches[right]) < SKETCH_THRESHOLD) continue
      // 정확값으로 다시 잰다. cap을 Infinity로 넘겨 본문 전체를 비교한다.
      const similarity = trigramSimilarity(candidates[left].doc, candidates[right].doc, Infinity)
      if (similarity < DUPLICATE_THRESHOLD) continue
      pairs.push({
        left: toSide(candidates[left]),
        right: toSide(candidates[right]),
        similarity,
        identical: similarity >= IDENTICAL_THRESHOLD,
      })
    }
  }

  return pairs.sort((a, b) => b.similarity - a.similarity)
}

function toSide(candidate: DuplicateCandidate): AxSkillDuplicatePair['left'] {
  return {
    id: candidate.id,
    name: candidate.name,
    authorName: candidate.authorName,
    applies: candidate.applies,
  }
}

/**
 * 쌍을 이어 붙여 묶음을 만든다.
 *
 * `community-docx` ↔ `create-docx` ↔ `docx-creator`처럼 셋 이상이 같은 문서인 경우가 있어,
 * 쌍만 보여주면 같은 판단을 세 번 하게 된다. 한 묶음에 하나의 결정을 내리도록 이어 붙인다.
 *
 * 이어 붙이는 기준은 후보 경계보다 높다. 낮은 유사도로 이으면 사슬이 생겨
 * 서로 관계없는 스킬이 한 묶음이 된다.
 *
 * @param pairs - 중복 쌍 목록
 * @param threshold - 이어 붙일 최소 유사도
 * @returns 묶음별 스킬 id 배열 (큰 묶음 순)
 */
export function groupDuplicates(
  pairs: AxSkillDuplicatePair[],
  threshold: number = GROUP_THRESHOLD
): string[][] {
  const linked = pairs.filter((pair) => pair.similarity >= threshold)
  const parent = new Map<string, string>()
  const find = (id: string): string => {
    let root = parent.get(id) ?? id
    while (root !== (parent.get(root) ?? root)) root = parent.get(root) ?? root
    parent.set(id, root)
    return root
  }
  for (const pair of linked) {
    const a = find(pair.left.id)
    const b = find(pair.right.id)
    if (a !== b) parent.set(a, b)
  }

  const groups = new Map<string, string[]>()
  for (const pair of linked) {
    for (const id of [pair.left.id, pair.right.id]) {
      const root = find(id)
      const members = groups.get(root) ?? []
      if (!members.includes(id)) members.push(id)
      groups.set(root, members)
    }
  }
  return [...groups.values()].map((ids) => ids.sort()).sort((a, b) => b.length - a.length)
}

export const skillDuplicatesPanel: AxPanel<AxSkillDuplicateData> = {
  meta,
  async load(): Promise<AxPanelResult<AxSkillDuplicateData>> {
    if (cache && cache.expiresAt > Date.now()) return cache.result

    try {
      const rows = await db
        .select({
          id: catalogItems.id,
          name: catalogItems.name,
          authorName: users.name,
          content: catalogItems.content,
          applies: sql<number>`(
            SELECT count(*)::int FROM ${skillEvents}
            WHERE ${skillEvents.skillId} = ${catalogItems.id} AND ${skillEvents.action} = 'apply'
          )`,
        })
        .from(catalogItems)
        .leftJoin(users, eq(users.id, catalogItems.authorId))
        // 발행된 적 없는 초안은 정리 대상이 아니다. 추세 스냅숏과 같은 모집단을 써야
        // 화면 머리말의 개수와 추세의 개수가 갈리지 않는다.
        .where(
          and(
            eq(catalogItems.type, 'skill'),
            or(eq(catalogItems.status, 'published'), isNull(catalogItems.status))
          )
        )

      const candidates: DuplicateCandidate[] = rows
        .map((row) => ({
          id: row.id,
          name: row.name,
          authorName: row.authorName ?? null,
          applies: Number(row.applies ?? 0),
          doc: normalizeSkillDoc(row.content),
        }))
        // 본문이 없는 항목은 비교할 것이 없다. 0과 미작성을 같이 세지 않는다.
        .filter((candidate) => candidate.doc.length >= 3)

      const pairs = findDuplicatePairs(candidates)
      const groups = groupDuplicates(pairs)
      const involved = new Set(pairs.flatMap((pair) => [pair.left.id, pair.right.id]))

      // 추세는 크론이 매일 찍어 둔 스냅숏에서 온다. 카탈로그가 과거 상태를 보존하지 않아
      // 여기서 소급 계산할 수 없다. 스냅숏이 없으면 화면은 "아직 추세 없음"을 적는다.
      const trend = await readCatalogHealthTrend('skill', TREND_DAYS).catch(() => [])
      const trendSummary = summarizeCatalogTrend(trend)

      // 중복 묶음에 이미 걸린 것은 미사용 후보에서 뺀다 — 같은 항목을 두 번 처리하지 않게
      const unused = await computeUnusedSkills(involved)

      const data: AxSkillDuplicateData = {
        basis: {
          skills: rows.length,
          compared: candidates.length,
          threshold: DUPLICATE_THRESHOLD,
          groupThreshold: GROUP_THRESHOLD,
        },
        pairCount: pairs.length,
        identicalCount: pairs.filter((pair) => pair.identical).length,
        involvedSkills: involved.size,
        groups: groups.map((ids) => ({
          ids,
          // 묶음 안에 적용 이력이 있는 스킬이 있으면 그쪽이 남길 후보다
          appliedIds: ids.filter((id) => {
            const candidate = candidates.find((entry) => entry.id === id)
            return candidate !== undefined && candidate.applies > 0
          }),
        })),
        pairs: pairs.slice(0, PAIR_LIMIT),
        truncated: Math.max(0, pairs.length - PAIR_LIMIT),
        trend: trend.map((row) => ({
          date: row.snapshotDate,
          duplicateGroups: row.duplicateGroups,
          neverLoaded: row.neverLoaded,
          totalItems: row.totalItems,
        })),
        trendSummary,
        unused,
      }

      const result = panelOk(meta, data, [
        { label: '중복 후보 묶음', value: String(data.groups.length), hint: `스킬 ${data.involvedSkills}개` },
        { label: '미사용 정리 후보', value: String(unused.candidates), hint: `로드 0건 ${unused.neverLoaded}개 중` },
      ])
      cache = { result, expiresAt: Date.now() + CACHE_TTL_MS }
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error('Skill duplicates panel failed', { message })
      return panelError(meta, '카탈로그 중복 후보를 계산하지 못했습니다')
    }
  },
}
