/**
 * 배포 시점 중복 검사 — 같은 문서가 새 id로 또 등록되는 것을 막는다.
 *
 * ## 왜 필요한가
 *
 * `deploySkill`의 기존 검증은 **id 완전일치 하나**뿐이었다. `community-docx`가 이미 있어도
 * 같은 내용을 `create-docx`로 올리면 그냥 통과한다. 운영에서 3중복이 만들어진 경로가 정확히 이것이다
 * (`community-docx` · `create-docx` · `docx-creator`가 유사도 0.99로 셋 다 존재한다).
 *
 * 카탈로그 중복 패널(`skill-duplicates`)은 **이미 생긴 중복을 찾는** 쪽이고, 이 모듈은 **생기는 것을
 * 막는** 쪽이다. 둘 다 있어야 정리가 일회성으로 끝나지 않는다.
 *
 * ## 막지 않고 경고만 한다
 *
 * 차단하면 정당한 분기(같은 원본에서 의도적으로 갈라놓은 워크플로 단계 등)까지 막힌다.
 * 대신 **무엇과 얼마나 닮았는지, 업데이트하려면 어떻게 하는지**를 응답에 실어 보낸다.
 * 판단은 배포하는 사람과 에이전트가 한다.
 */

import { catalogItems, db } from '@gpters/db'
import { and, eq, isNotNull, ne } from 'drizzle-orm'
import { createLogger } from '../../core/logger'
import { normalizeSkillDoc, trigramSimilarity } from './skill-diff'
import { bottomKSketch, sketchOverlap } from './skill-duplicates'

const log = createLogger('deploy-duplicate-guard')

/** 이 유사도 이상이면 경고한다. 카탈로그 중복 패널의 후보 경계와 같게 맞춘다 */
export const DEPLOY_SIMILARITY_THRESHOLD = 0.5

/** 정규화 후 사실상 같은 문서로 보는 경계 — 문구를 더 강하게 쓴다 */
const NEAR_IDENTICAL = 0.9

/** 스케치 통과선. 정확 임계값보다 낮게 잡아 추정 오차로 진짜 중복을 놓치지 않는다 */
const SKETCH_THRESHOLD = 0.4

/** 응답에 싣는 최대 건수 — 사람이 판단할 수 있는 만큼만 */
const MAX_MATCHES = 3

/** 닮은 기존 항목 한 건 */
export interface DeployDuplicateMatch {
  /** 기존 항목 id */
  id: string
  /** 표시 이름 */
  name: string
  /** 본문 전체(절단 없음) 3-그램 자카드 */
  similarity: number
  /** 정규화 후 사실상 같은 문서인가 */
  nearIdentical: boolean
}

/** 비교 대상 한 건 — DB를 타지 않는 순수 계산용 */
export interface ExistingDoc {
  id: string
  name: string
  content: string | null
}

/**
 * 새 문서와 닮은 기존 항목을 찾는다.
 *
 * 스케치로 후보를 좁힌 뒤 후보만 정확히 다시 잰다. 돌려주는 `similarity`는 전부 정확값이고,
 * **본문을 자르지 않는다** — 자르면 도입부만 같은 긴 문서가 동일해 보인다.
 *
 * @param content - 배포하려는 본문
 * @param existing - 같은 타입의 기존 항목들
 * @param threshold - 경고 경계 (기본 0.5)
 * @returns 유사도 내림차순 상위 항목
 */
export function findDeployDuplicates(
  content: string,
  existing: ExistingDoc[],
  threshold: number = DEPLOY_SIMILARITY_THRESHOLD
): DeployDuplicateMatch[] {
  const doc = normalizeSkillDoc(content)
  if (doc.length < 3) return []

  const sketch = bottomKSketch(doc)
  const matches: DeployDuplicateMatch[] = []

  for (const item of existing) {
    const other = normalizeSkillDoc(item.content)
    if (other.length < 3) continue
    if (sketchOverlap(sketch, bottomKSketch(other)) < SKETCH_THRESHOLD) continue

    const similarity = trigramSimilarity(doc, other, Infinity)
    if (similarity < threshold) continue
    matches.push({
      id: item.id,
      name: item.name,
      similarity,
      nearIdentical: similarity >= NEAR_IDENTICAL,
    })
  }

  return matches.sort((a, b) => b.similarity - a.similarity).slice(0, MAX_MATCHES)
}

/**
 * 경고 문구를 만든다.
 *
 * 무엇과 닮았는지와 **업데이트하는 방법**을 같이 준다. 방법을 안 주면 배포자가 이름만 바꿔
 * 다시 시도하게 되고, 그게 지금 중복이 쌓인 방식이다.
 *
 * @param matches - 닮은 기존 항목
 * @returns 응답에 실을 경고 문장. 닮은 것이 없으면 null
 */
export function buildDuplicateWarning(matches: DeployDuplicateMatch[]): string | null {
  if (matches.length === 0) return null

  const top = matches[0]
  const listed = matches
    .map((match) => `${match.id}(${match.similarity.toFixed(2)})`)
    .join(' · ')

  const lead = top.nearIdentical
    ? `이미 있는 "${top.id}"와 사실상 같은 문서입니다(유사도 ${top.similarity.toFixed(2)}).`
    : `이미 있는 "${top.id}"와 상당히 닮았습니다(유사도 ${top.similarity.toFixed(2)}).`

  return (
    `${lead} 닮은 항목: ${listed}. ` +
    `같은 것을 고치려는 것이면 새 id 대신 그 id로 다시 배포하세요 — 새 이름으로 올리면 카탈로그에 ` +
    `중복이 하나 더 쌓이고 검색 결과에 둘 다 뜹니다. 의도적으로 갈라놓는 것이면 그대로 진행해도 됩니다.`
  )
}

/**
 * 배포 직전 중복 검사 — DB에서 같은 타입의 기존 항목을 읽어 비교한다.
 *
 * 검사 실패가 배포를 막지 않는다. 이건 경고이지 관문이 아니다.
 *
 * @param params.id - 배포하려는 id (자기 자신은 비교에서 뺀다)
 * @param params.type - 항목 타입. 다른 타입과는 비교하지 않는다
 * @param params.content - 배포하려는 본문
 * @returns 경고 문장과 닮은 항목. 없으면 null
 */
export async function checkDeployDuplicates(params: {
  id: string
  type: string
  content: string
}): Promise<{ message: string; matches: DeployDuplicateMatch[] } | null> {
  try {
    const existing = await db
      .select({ id: catalogItems.id, name: catalogItems.name, content: catalogItems.content })
      .from(catalogItems)
      .where(
        and(
          eq(catalogItems.type, params.type as never),
          ne(catalogItems.id, params.id),
          isNotNull(catalogItems.content)
        )
      )

    const matches = findDeployDuplicates(params.content, existing)
    const message = buildDuplicateWarning(matches)
    if (!message) return null

    log.info('Deploy duplicate warning', {
      id: params.id,
      topMatch: matches[0]?.id,
      similarity: matches[0]?.similarity,
    })
    return { message, matches }
  } catch (error) {
    // 검사가 실패해도 배포는 계속한다 — 경고를 못 만든 것이 배포를 막을 이유는 아니다
    log.warn('Deploy duplicate check failed', { error, id: params.id })
    return null
  }
}
