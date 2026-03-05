/**
 * 임베딩 생성 모듈
 *
 * OpenAI text-embedding-3-large를 사용하여 텍스트의 벡터 임베딩을 생성합니다.
 * LRU 캐시를 통해 동일 쿼리에 대한 중복 API 호출을 방지하며,
 * 서버리스 환경에서 검색 응답 시간을 단축합니다.
 */

import OpenAI from 'openai'
import { createLogger } from '../core/logger'
import { embeddingCache } from './embedding-cache'

const log = createLogger('embedding')

/** OpenAI 임베딩 모델 ID */
const EMBEDDING_MODEL = 'text-embedding-3-large'

/** 임베딩 벡터 차원 수 */
const EMBEDDING_DIMENSIONS = 3072

/**
 * 임베딩 입력 텍스트 최대 길이 (문자 수).
 *
 * text-embedding-3-large의 토큰 한도는 8,191.
 * 한영 혼재 텍스트의 안전 마진을 고려하여 28,000자로 제한합니다.
 */
const MAX_INPUT_CHARS = 28_000

let openaiClient: OpenAI | null = null

/**
 * OpenAI API 클라이언트 싱글턴을 반환합니다.
 *
 * @returns OpenAI 클라이언트 인스턴스
 * @throws OPENAI_API_KEY 환경 변수가 없는 경우
 */
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }
    openaiClient = new OpenAI({ apiKey })
  }
  return openaiClient
}

/** Query expansion cache to avoid redundant translation calls */
const queryExpansionCache = new Map<string, string>()

/** Maximum cache entries for query expansion */
const MAX_EXPANSION_CACHE = 200

/**
 * 검색 쿼리를 한영 양방향으로 확장합니다.
 *
 * 한글 쿼리는 영어 번역을, 영어 쿼리는 한글 번역을 추가하여
 * 크로스링구얼 임베딩 품질을 향상시킵니다.
 *
 * @param query - 원본 검색 쿼리
 * @returns 원본 + 번역이 결합된 확장 쿼리
 */
export async function expandQuery(query: string): Promise<string> {
  const cached = queryExpansionCache.get(query)
  if (cached) return cached

  try {
    const client = getOpenAIClient()
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Translate the search query. If Korean, output English translation only. If English, output Korean translation only. Output ONLY the translation, nothing else.',
        },
        { role: 'user', content: query },
      ],
      max_tokens: 100,
      temperature: 0,
    })

    const translation = response.choices[0]?.message?.content?.trim()
    if (!translation) return query

    const expanded = `${query} ${translation}`

    // Cache management
    if (queryExpansionCache.size >= MAX_EXPANSION_CACHE) {
      const firstKey = queryExpansionCache.keys().next().value
      if (firstKey) queryExpansionCache.delete(firstKey)
    }
    queryExpansionCache.set(query, expanded)

    log.debug('Query expanded', { original: query, expanded })
    return expanded
  } catch (err) {
    log.warn('Query expansion failed, using original', { query, error: err })
    return query
  }
}

/**
 * 텍스트에 대한 임베딩 벡터를 생성합니다.
 *
 * LRU 캐시를 먼저 확인하고, 히트 시 캐시된 결과를 즉시 반환합니다.
 * 미스 시 OpenAI API를 호출하여 임베딩을 생성하고 캐시에 저장합니다.
 *
 * @param text - 임베딩을 생성할 텍스트
 * @returns 임베딩 벡터 (number 배열)
 * @throws 빈 텍스트가 입력된 경우
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const input = text.replaceAll('\n', ' ').trim().slice(0, MAX_INPUT_CHARS)

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

  // 캐시 미스: OpenAI API 호출 (토큰 초과 시 자동 축소 재시도)
  const start = Date.now()
  const client = getOpenAIClient()
  let truncatedInput = input
  let embedding: number[] = []

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: truncatedInput,
        dimensions: EMBEDDING_DIMENSIONS,
      })
      embedding = response.data[0]?.embedding ?? []
      break
    } catch (err: unknown) {
      const isTokenLimit = err instanceof Error && 'status' in err && (err as { status: number }).status === 400
        && err.message.includes('maximum context length')
      if (isTokenLimit && attempt < 2) {
        truncatedInput = truncatedInput.slice(0, Math.floor(truncatedInput.length * 0.7))
        log.warn('Token limit exceeded, retrying with truncated input', {
          attempt: attempt + 1,
          newLength: truncatedInput.length,
        })
        continue
      }
      throw err
    }
  }

  // 결과 캐시 저장
  embeddingCache.set(input, embedding)

  const stats = embeddingCache.getStats()
  log.info('OpenAI embedding generated', {
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
 * 캐시 미스인 텍스트만 OpenAI API를 호출합니다.
 * OpenAI는 단일 요청에 다수 입력을 배치 처리할 수 있어 효율적입니다.
 *
 * @param texts - 임베딩을 생성할 텍스트 배열
 * @returns 임베딩 벡터 배열
 * @throws 모든 텍스트가 빈 문자열인 경우
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const inputs = texts
    .map(text => text.replaceAll('\n', ' ').trim().slice(0, MAX_INPUT_CHARS))
    .filter(Boolean)

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

  // 캐시 미스 항목만 배치 API 호출
  if (uncachedInputs.length > 0) {
    const client = getOpenAIClient()
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: uncachedInputs.map(u => u.input),
      dimensions: EMBEDDING_DIMENSIONS,
    })

    for (let i = 0; i < response.data.length; i++) {
      const { index } = uncachedInputs[i]!
      const embedding = response.data[i]!.embedding
      embeddingCache.set(uncachedInputs[i]!.input, embedding)
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
 * 이름, 설명, 태그, readme, content를 전체 결합하여
 * 임베딩 생성에 적합한 단일 텍스트로 만듭니다.
 * 최종 텍스트가 MAX_INPUT_CHARS를 초과하면 잘립니다.
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
    item.readme || '',
    item.content || '',
  ]

  return parts.filter(Boolean).join(' ').trim().slice(0, MAX_INPUT_CHARS)
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS }
