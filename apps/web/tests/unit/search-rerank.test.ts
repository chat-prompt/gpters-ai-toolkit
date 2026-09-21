/**
 * semantic_search 재랭킹(JEV) 단위 테스트
 *
 * 재랭킹 모듈의 판정·폴백과, vector-search가 overfetch 후 재랭킹 순서로 잘라 전/후 순위를 남기는지 확인한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const limitCalls: number[] = []
let dbRows: Array<Record<string, unknown>> = []
vi.mock('@gpters/db', async (original) => {
  const actual = await original<typeof import('@gpters/db')>()
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async (n: number) => {
      limitCalls.push(n)
      return dbRows.slice(0, n)
    },
  }
  return { ...actual, db: { select: () => chain } }
})
vi.mock('../../../../packages/lib/src/search/embedding', () => ({ generateEmbedding: vi.fn() }))

import {
  RERANK_THRESHOLDS,
  buildJevRequest,
  isEmbeddingConfident,
  isJevDecisive,
  rerankCandidates,
  type RerankCandidate,
} from '../../../../packages/lib/src/search/rerank'
import { semanticSearch } from '../../../../packages/lib/src/search/vector-search'

function candidate(id: string, similarity: number): RerankCandidate {
  return { id, name: id, description: `${id} description`, tags: ['t'], similarity }
}

/** 후보 순서대로 noul 점수를 돌려주는 가짜 JEV 응답 */
function jevResponse(nouls: number[]) {
  return vi.fn(async () =>
    new Response(JSON.stringify({ answers: Object.fromEntries(nouls.map((n, i) => [`c${i}`, { type: 'noul', noul: n }])) }), {
      status: 200,
    }),
  ) as unknown as typeof fetch
}

const bunched = [candidate('kakao', 0.405), candidate('slack-archive', 0.388), candidate('epub', 0.387)]

describe('rerank decisions', () => {
  it('treats a clear embedding gap as confident', () => {
    expect(isEmbeddingConfident([candidate('a', 0.6), candidate('b', 0.6 - RERANK_THRESHOLDS.embeddingGapBelow)])).toBe(true)
    expect(isEmbeddingConfident(bunched)).toBe(false)
  })

  it('needs both a high top score and a margin from JEV', () => {
    expect(isJevDecisive([0.87, 0.14])).toBe(true)
    expect(isJevDecisive([0.87, 0.8])).toBe(false)
    expect(isJevDecisive([0.3, 0.01])).toBe(false)
  })

  it('puts every candidate into one request with one noul question each', () => {
    const body = buildJevRequest('슬랙 요약', bunched, '  사내 봇  ')
    expect(body.state.candidates).toHaveLength(3)
    expect(body.state.request).toEqual({ query: '슬랙 요약', context: '사내 봇' })
    expect(Object.keys(body.questions)).toEqual(['c0', 'c1', 'c2'])
    expect(JSON.stringify(body.questions.c2)).toContain('`candidates[2]`')
  })
})

describe('rerankCandidates', () => {
  it('reorders by JEV when the answer is decisive', async () => {
    const out = await rerankCandidates('슬랙 요약', bunched, { apiKey: 'k', fetchImpl: jevResponse([0.04, 0.87, 0.1]) })
    expect(out.applied).toBe(true)
    expect(out.items.map((c) => c.id)).toEqual(['slack-archive', 'epub', 'kakao'])
    expect(out.scores).toEqual({ kakao: 0.04, 'slack-archive': 0.87, epub: 0.1 })
  })

  it('keeps the original order without an API key', async () => {
    const out = await rerankCandidates('q', bunched, { apiKey: '', fetchImpl: jevResponse([0, 1, 0]) })
    expect(out).toMatchObject({ applied: false, skipReason: 'no_api_key' })
    expect(out.items).toBe(bunched)
  })

  it('does not call JEV when embedding scores are already apart', async () => {
    const fetchImpl = jevResponse([0, 1])
    const out = await rerankCandidates('q', [candidate('a', 0.7), candidate('b', 0.4)], { apiKey: 'k', fetchImpl })
    expect(out.skipReason).toBe('embedding_confident')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('falls back to the original order when JEV fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('overloaded', { status: 529 })) as unknown as typeof fetch
    const out = await rerankCandidates('q', bunched, { apiKey: 'k', fetchImpl })
    expect(out).toMatchObject({ applied: false, skipReason: 'jev_error' })
    expect(out.items).toBe(bunched)
  })

  it('falls back when an answer is missing', async () => {
    const out = await rerankCandidates('q', bunched, { apiKey: 'k', fetchImpl: jevResponse([0.9, 0.1]) })
    expect(out.skipReason).toBe('jev_error')
  })

  it('keeps the original order when JEV cannot separate the candidates', async () => {
    const out = await rerankCandidates('q', bunched, { apiKey: 'k', fetchImpl: jevResponse([0.5, 0.52, 0.48]) })
    expect(out).toMatchObject({ applied: false, skipReason: 'jev_uncertain' })
    expect(out.items).toBe(bunched)
    expect(out.scores).toBeDefined()
  })
})

describe('semanticSearch with rerank', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: `item-${i}`, name: `item-${i}`, description: '', tags: [], similarity: 0.4 - i * 0.001 }))

  beforeEach(() => {
    limitCalls.length = 0
    dbRows = rows
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('keeps the old limit and shape without a key', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', '')
    const result = await semanticSearch({ query: 'slack summary', limit: 5, queryEmbedding: [0.1] })
    expect(limitCalls).toEqual([5])
    expect(result.items.map((i) => i.id)).toEqual(['item-0', 'item-1', 'item-2', 'item-3', 'item-4'])
    expect(result.rerank).toBeUndefined()
  })

  it('overfetches, reranks, cuts to the limit, and records both rankings', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'k')
    const nouls = rows.slice(0, 20).map((_, i) => (i === 7 ? 0.9 : 0.05))
    vi.stubGlobal('fetch', jevResponse(nouls))
    const result = await semanticSearch({ query: 'slack summary', limit: 5, queryEmbedding: [0.1] })
    expect(limitCalls).toEqual([20])
    expect(result.items).toHaveLength(5)
    expect(result.items[0].id).toBe('item-7')
    expect(result.rerank).toMatchObject({ applied: true, candidateCount: 20 })
    expect(result.rerank?.embeddingRanks['item-7']).toBe(8)
    expect(result.rerank?.scores?.['item-7']).toBe(0.9)
  })

  it('caps the candidate pool', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'k')
    vi.stubGlobal('fetch', jevResponse([]))
    await semanticSearch({ query: 'slack summary', limit: 20, queryEmbedding: [0.1] })
    expect(limitCalls).toEqual([40])
  })

  it('skips reranking when the caller opts out', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'k')
    const result = await semanticSearch({ query: 'slack summary', limit: 5, queryEmbedding: [0.1], rerank: false })
    expect(limitCalls).toEqual([5])
    expect(result.rerank).toBeUndefined()
  })
})
