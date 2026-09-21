/**
 * 검색 후보 재랭킹 (TypeSafe JEV)
 *
 * 임베딩 코사인 점수가 후보를 갈라내지 못할 때(상위 점수가 뭉칠 때)만
 * JEV에게 "이 후보가 질문에 답이 되는가"를 후보별 noul로 묻고 그 확률로 다시 줄 세운다.
 *
 * - 후보는 한 요청에 묶어 보낸다. 나눠 보내면 후보끼리 비교가 안 돼 점수가 뭉갠다(2026-09-21 실측).
 * - 키가 없거나, 호출이 실패하거나, JEV도 확신하지 못하면 원래 순서를 그대로 쓴다.
 * - 문턱은 절대값 하나가 아니라 1등 점수와 (1등−2등) 여유를 같이 본다.
 *
 * 문턱값의 근거는 `docs/plans/2026-09-21-rerank-thresholds.md`에 있다.
 */

import { createLogger } from '../core/logger'

const log = createLogger('rerank')

/** TypeSafe System One 엔드포인트 */
const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'

/** 사용할 JEV 모델 */
const JEV_MODEL = 'jev-latest'

/**
 * 재랭킹 동작 문턱값
 *
 * 값의 근거는 파일 헤더의 문서를 따른다. 테스트와 실측 스크립트가 같은 값을 쓰도록 export 한다.
 */
export const RERANK_THRESHOLDS = {
  /** 임베딩 1등과 2등의 점수 차이가 이보다 작으면 "뭉쳤다"고 보고 재랭킹한다 */
  embeddingGapBelow: 0.05,
  /** JEV 1등 점수가 이보다 낮으면 JEV도 확신하지 못한 것으로 보고 원래 순서를 쓴다 */
  jevTopAtLeast: 0.5,
  /** JEV 1등과 2등의 차이가 이보다 작으면 JEV도 가르지 못한 것으로 보고 원래 순서를 쓴다 */
  jevMarginAtLeast: 0.2,
  /** JEV 호출 제한 시간(ms). 넘기면 원래 순서를 쓴다 */
  timeoutMs: 2500,
} as const

/** 후보에서 JEV state로 보낼 설명의 최대 길이(자) */
const MAX_DESCRIPTION_CHARS = 400

/**
 * 재랭킹 대상 후보의 최소 형태
 */
export interface RerankCandidate {
  /** 카탈로그 항목 ID */
  id: string
  /** 항목 이름 */
  name: string
  /** 항목 설명 */
  description: string | null
  /** 태그 */
  tags: string[] | null
  /** 임베딩 기반 점수 (보너스 포함, 재랭킹 전 정렬 기준) */
  similarity: number
}

/**
 * 재랭킹을 건너뛰었거나 되돌린 이유
 */
export type RerankSkipReason =
  | 'no_api_key'
  | 'too_few_candidates'
  | 'embedding_confident'
  | 'jev_error'
  | 'jev_uncertain'

/**
 * 재랭킹 결과
 */
export interface RerankOutcome<T extends RerankCandidate> {
  /** 최종 순서의 후보 (재랭킹이 적용되지 않았으면 입력 순서 그대로) */
  items: T[]
  /** JEV 순서가 실제로 적용됐는지 */
  applied: boolean
  /** 적용되지 않았을 때의 이유 */
  skipReason?: RerankSkipReason
  /** 후보 ID별 JEV noul 점수 (JEV를 불렀을 때만) */
  scores?: Record<string, number>
  /** JEV 호출에 걸린 시간(ms) (불렀을 때만) */
  jevMs?: number
}

/** fetch 주입용 타입 (테스트에서 교체) */
type FetchLike = typeof fetch

/**
 * 재랭킹 옵션
 */
export interface RerankOptions {
  /** 사용자가 덧붙인 작업 맥락 */
  userContext?: string
  /** JEV API 키 (생략 시 `TYPESAFE_API_KEY` 환경 변수) */
  apiKey?: string
  /** 테스트용 fetch 교체 */
  fetchImpl?: FetchLike
}

/**
 * 임베딩 점수만으로 순위를 믿어도 되는지 판단한다.
 *
 * @param candidates - 임베딩 점수 내림차순 후보
 * @returns 1등과 2등의 차이가 문턱 이상이면 true
 */
export function isEmbeddingConfident(candidates: RerankCandidate[]): boolean {
  if (candidates.length < 2) return true
  return candidates[0].similarity - candidates[1].similarity >= RERANK_THRESHOLDS.embeddingGapBelow
}

/**
 * JEV 점수가 원래 순서를 뒤집을 만큼 분명한지 판단한다.
 *
 * @param sortedScores - 내림차순 JEV 점수
 * @returns 1등 점수와 1·2등 여유가 모두 문턱 이상이면 true
 */
export function isJevDecisive(sortedScores: number[]): boolean {
  const top = sortedScores[0] ?? 0
  const second = sortedScores[1] ?? 0
  return top >= RERANK_THRESHOLDS.jevTopAtLeast && top - second >= RERANK_THRESHOLDS.jevMarginAtLeast
}

/**
 * JEV 요청 본문을 만든다. 후보 전부를 한 state에 넣고 후보마다 noul 질문을 하나씩 건다.
 *
 * @param query - 사용자 검색 질문
 * @param candidates - 후보 목록
 * @param userContext - 작업 맥락
 * @returns `/v1/systemone` 요청 본문
 */
export function buildJevRequest(query: string, candidates: RerankCandidate[], userContext?: string) {
  const state = {
    request: {
      query,
      ...(userContext?.trim() ? { context: userContext.trim() } : {}),
    },
    candidates: candidates.map((c) => ({
      name: c.name,
      description: (c.description ?? '').slice(0, MAX_DESCRIPTION_CHARS),
      tags: c.tags ?? [],
    })),
  }

  const questions: Record<string, unknown> = {}
  candidates.forEach((_, i) => {
    questions[`c${i}`] = {
      type: 'noul',
      instructions:
        `A user is searching a team catalog of AI coding-agent skills and tools with the request in \`request.query\` ` +
        `(extra working context, if any, is in \`request.context\`). Would the tool described in \`candidates[${i}]\` ` +
        `directly do what the user is asking for, compared with the other candidates?`,
      criteria: {
        true: 'The candidate performs the requested task on the requested kind of input or system.',
        false:
          'The candidate only shares a topic or keyword, works on a different platform or input than the one requested, or does something else.',
      },
    }
  })

  return { state, model: JEV_MODEL, questions }
}

/**
 * 후보를 JEV로 재랭킹한다. 실패하거나 확신이 없으면 입력 순서를 그대로 돌려준다.
 *
 * @param query - 사용자 검색 질문 (정제된 형태)
 * @param candidates - 임베딩 점수 내림차순 후보
 * @param options - 맥락·키·fetch 교체
 * @returns 최종 순서와 적용 여부, JEV 점수
 */
export async function rerankCandidates<T extends RerankCandidate>(
  query: string,
  candidates: T[],
  options: RerankOptions = {},
): Promise<RerankOutcome<T>> {
  const apiKey = options.apiKey ?? process.env.TYPESAFE_API_KEY
  if (!apiKey) return { items: candidates, applied: false, skipReason: 'no_api_key' }
  if (candidates.length < 2) return { items: candidates, applied: false, skipReason: 'too_few_candidates' }
  if (isEmbeddingConfident(candidates)) {
    return { items: candidates, applied: false, skipReason: 'embedding_confident' }
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const start = Date.now()
  let scores: Record<string, number>
  try {
    const response = await fetchImpl(JEV_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildJevRequest(query, candidates, options.userContext)),
      signal: AbortSignal.timeout(RERANK_THRESHOLDS.timeoutMs),
    })
    if (!response.ok) throw new Error(`JEV HTTP ${response.status}`)
    const body = (await response.json()) as { answers?: Record<string, { noul?: number }> }
    scores = {}
    candidates.forEach((c, i) => {
      const noul = body.answers?.[`c${i}`]?.noul
      if (typeof noul !== 'number') throw new Error(`JEV answer missing for c${i}`)
      scores[c.id] = noul
    })
  } catch (err) {
    const jevMs = Date.now() - start
    log.warn('Rerank skipped: JEV call failed', {
      jevMs,
      error: err instanceof Error ? err.message : String(err),
    })
    return { items: candidates, applied: false, skipReason: 'jev_error', jevMs }
  }
  const jevMs = Date.now() - start

  // 동점이면 원래(임베딩) 순서를 유지한다 — Array.prototype.sort는 안정 정렬이다.
  const reordered = [...candidates].sort((a, b) => scores[b.id] - scores[a.id])
  const sortedScores = reordered.map((c) => scores[c.id])
  if (!isJevDecisive(sortedScores)) {
    return { items: candidates, applied: false, skipReason: 'jev_uncertain', scores, jevMs }
  }
  return { items: reordered, applied: true, scores, jevMs }
}
