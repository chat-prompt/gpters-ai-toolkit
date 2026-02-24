/**
 * 임베딩 생성 모듈
 *
 * Gemini API를 사용하여 텍스트의 벡터 임베딩을 생성합니다.
 * LRU 캐시를 통해 동일 쿼리에 대한 중복 API 호출을 방지하며,
 * 서버리스 환경에서 검색 응답 시간을 단축합니다.
 */

import { GoogleGenAI } from '@google/genai'
import { createLogger } from '../core/logger'
import { embeddingCache } from './embedding-cache'

const log = createLogger('embedding')

/** Gemini 임베딩 모델 ID */
const EMBEDDING_MODEL = 'gemini-embedding-001'

/** 임베딩 벡터 차원 수 */
const EMBEDDING_DIMENSIONS = 3072

let geminiClient: GoogleGenAI | null = null

/**
 * Gemini API 클라이언트 싱글턴을 반환합니다.
 *
 * @returns GoogleGenAI 클라이언트 인스턴스
 * @throws GEMINI_API_KEY 환경 변수가 없는 경우
 */
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set')
    }
    geminiClient = new GoogleGenAI({ apiKey })
  }
  return geminiClient
}

/**
 * 텍스트에 대한 임베딩 벡터를 생성합니다.
 *
 * LRU 캐시를 먼저 확인하고, 히트 시 캐시된 결과를 즉시 반환합니다.
 * 미스 시 Gemini API를 호출하여 임베딩을 생성하고 캐시에 저장합니다.
 *
 * @param text - 임베딩을 생성할 텍스트
 * @returns 임베딩 벡터 (number 배열)
 * @throws 빈 텍스트가 입력된 경우
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const input = text.replaceAll('\n', ' ').trim()

  if (!input) {
    throw new Error('Cannot generate embedding for empty text')
  }

  // 캐시 확인
  const cached = embeddingCache.get(input)
  if (cached) {
    const stats = embeddingCache.getStats()
    log.debug('Embedding cache hit', {
      hitRate: Math.round(stats.hitRate * 100),
      cacheSize: stats.size,
    })
    return cached
  }

  // 캐시 미스: Gemini API 호출
  const start = Date.now()
  const client = getGeminiClient()
  const response = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: input,
  })

  const embedding = response.embeddings?.[0]?.values ?? []

  // 결과 캐시 저장
  embeddingCache.set(input, embedding)

  const stats = embeddingCache.getStats()
  log.info('Gemini embedding generated', {
    duration: Date.now() - start,
    cacheSize: stats.size,
    hitRate: Math.round(stats.hitRate * 100),
  })

  return embedding
}

/**
 * 여러 텍스트에 대한 임베딩 벡터를 배치로 생성합니다.
 *
 * 각 텍스트에 대해 캐시를 먼저 확인하고,
 * 캐시 미스인 텍스트만 Gemini API를 호출합니다.
 *
 * @param texts - 임베딩을 생성할 텍스트 배열
 * @returns 임베딩 벡터 배열
 * @throws 모든 텍스트가 빈 문자열인 경우
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const inputs = texts.map(text => text.replaceAll('\n', ' ').trim()).filter(Boolean)

  if (inputs.length === 0) {
    throw new Error('Cannot generate embeddings for empty texts')
  }

  // 캐시 히트/미스 분리
  const results: Array<{ index: number; embedding: number[] | null }> = inputs.map(
    (input, index) => ({
      index,
      embedding: embeddingCache.get(input),
    })
  )

  const uncachedInputs = results
    .filter(r => r.embedding === null)
    .map(r => ({ index: r.index, input: inputs[r.index]! }))

  // 캐시 미스 항목만 API 호출
  if (uncachedInputs.length > 0) {
    const client = getGeminiClient()
    const apiResults = await Promise.all(
      uncachedInputs.map(async ({ index, input }) => {
        const response = await client.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: input,
        })
        const embedding = response.embeddings?.[0]?.values ?? []
        embeddingCache.set(input, embedding)
        return { index, embedding }
      })
    )

    // API 결과를 병합
    for (const { index, embedding } of apiResults) {
      results[index]!.embedding = embedding
    }
  }

  const cachedCount = inputs.length - uncachedInputs.length
  if (cachedCount > 0) {
    log.debug('Batch embedding cache utilization', {
      total: inputs.length,
      cached: cachedCount,
      apiCalls: uncachedInputs.length,
    })
  }

  return results.map(r => r.embedding!)
}

/**
 * 카탈로그 아이템을 임베딩용 텍스트로 변환합니다.
 *
 * 이름, 설명, 태그, readme, content를 결합하여
 * 임베딩 생성에 적합한 단일 텍스트로 만듭니다.
 *
 * @param item - 카탈로그 아이템 데이터
 * @returns 임베딩 생성용 결합 텍스트
 */
export function prepareTextForEmbedding(item: {
  name: string
  description: string
  content?: string | null
  tags?: string[] | null
  readme?: string | null
}): string {
  const parts = [
    item.name,
    item.description,
    item.tags?.join(' ') || '',
    item.readme?.slice(0, 1000) || '',
    item.content?.slice(0, 2000) || '',
  ]

  return parts.filter(Boolean).join(' ').trim()
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS }
