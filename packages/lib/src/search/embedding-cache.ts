/**
 * 임베딩 LRU 캐시
 *
 * 서버리스 환경(Vercel)에서 프로세스 레벨로 동작하며,
 * 동일 쿼리에 대한 Gemini API 재호출을 방지합니다.
 * Cold start 시 캐시가 초기화되지만, warm 상태에서는
 * 반복 쿼리의 응답 시간을 크게 단축합니다.
 */

import { createLogger } from '../core/logger'

const log = createLogger('embedding-cache')

/**
 * 캐시 엔트리 구조
 *
 * LRU 관리를 위해 마지막 접근 시각과 생성 시각을 함께 저장합니다.
 */
interface CacheEntry {
  /** 임베딩 벡터 (float64 배열) */
  embedding: number[]
  /** 캐시에 저장된 시각 (ms) */
  createdAt: number
  /** 마지막 접근 시각 (ms) — LRU 판단에 사용 */
  lastAccessedAt: number
}

/**
 * 캐시 통계 정보
 *
 * 모니터링 및 디버깅을 위해 히트/미스 카운터를 관리합니다.
 */
export interface EmbeddingCacheStats {
  /** 캐시 히트 횟수 */
  hits: number
  /** 캐시 미스 횟수 */
  misses: number
  /** 현재 캐시에 저장된 엔트리 수 */
  size: number
  /** 최대 캐시 엔트리 수 */
  maxSize: number
  /** 히트율 (0~1) */
  hitRate: number
}

/** 기본 최대 캐시 엔트리 수 */
const DEFAULT_MAX_SIZE = 500

/** 기본 TTL: 1시간 (밀리초) */
const DEFAULT_TTL_MS = 60 * 60 * 1000

/**
 * 쿼리 텍스트를 캐시 키로 정규화
 *
 * 소문자 변환, trim, 다중 공백 제거를 수행하여
 * 동일 의미의 쿼리가 같은 캐시 키를 갖도록 합니다.
 *
 * @param query - 원본 쿼리 텍스트
 * @returns 정규화된 캐시 키 문자열
 */
export function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Map 기반 LRU 임베딩 캐시
 *
 * 외부 라이브러리 없이 Map을 활용하여 LRU 정책을 구현합니다.
 * maxSize 초과 시 가장 오래 접근되지 않은 엔트리를 제거하고,
 * TTL 만료 엔트리는 조회 시 자동으로 무효화합니다.
 */
export class EmbeddingCache {
  private cache: Map<string, CacheEntry>
  private maxSize: number
  private ttlMs: number
  private hits: number
  private misses: number

  /**
   * EmbeddingCache 인스턴스를 생성합니다.
   *
   * @param maxSize - 최대 캐시 엔트리 수 (기본값: 500)
   * @param ttlMs - TTL 밀리초 (기본값: 3,600,000 = 1시간)
   */
  constructor(maxSize: number = DEFAULT_MAX_SIZE, ttlMs: number = DEFAULT_TTL_MS) {
    this.cache = new Map()
    this.maxSize = maxSize
    this.ttlMs = ttlMs
    this.hits = 0
    this.misses = 0
  }

  /**
   * 캐시에서 임베딩을 조회합니다.
   *
   * TTL이 만료된 엔트리는 자동으로 삭제되며 null을 반환합니다.
   * 히트 시 lastAccessedAt을 갱신하여 LRU 순서를 유지합니다.
   *
   * @param query - 검색 쿼리 텍스트 (정규화 전)
   * @returns 캐시된 임베딩 벡터 또는 null
   */
  get(query: string): number[] | null {
    const key = normalizeQuery(query)
    const entry = this.cache.get(key)

    if (!entry) {
      this.misses++
      return null
    }

    // TTL 만료 확인
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key)
      this.misses++
      return null
    }

    // LRU 갱신: Map에서 삭제 후 재삽입하여 순서 유지
    this.cache.delete(key)
    entry.lastAccessedAt = Date.now()
    this.cache.set(key, entry)

    this.hits++
    return entry.embedding
  }

  /**
   * 캐시에 임베딩을 저장합니다.
   *
   * maxSize를 초과하면 가장 오래 접근되지 않은 엔트리(Map의 첫 번째)를 제거합니다.
   * Map의 삽입 순서 특성과 get() 시 재삽입을 활용하여 LRU를 구현합니다.
   *
   * @param query - 검색 쿼리 텍스트 (정규화 전)
   * @param embedding - 저장할 임베딩 벡터
   */
  set(query: string, embedding: number[]): void {
    const key = normalizeQuery(query)

    // 이미 존재하면 삭제 후 재삽입 (순서 갱신)
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }

    // maxSize 초과 시 가장 오래된 엔트리 제거 (Map의 첫 번째 항목)
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey)
        log.debug('LRU eviction', { evictedKey: oldestKey })
      }
    }

    const now = Date.now()
    this.cache.set(key, {
      embedding,
      createdAt: now,
      lastAccessedAt: now,
    })
  }

  /**
   * 캐시 통계를 반환합니다.
   *
   * @returns 히트/미스 카운터, 현재 크기, 히트율 등의 통계 정보
   */
  getStats(): EmbeddingCacheStats {
    const total = this.hits + this.misses
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? this.hits / total : 0,
    }
  }

  /**
   * 캐시를 완전히 초기화합니다.
   *
   * 모든 엔트리와 통계 카운터를 리셋합니다.
   */
  clear(): void {
    this.cache.clear()
    this.hits = 0
    this.misses = 0
    log.debug('Cache cleared')
  }
}

/**
 * 프로세스 레벨 싱글턴 임베딩 캐시 인스턴스
 *
 * 서버리스 환경에서 warm 상태 동안 공유됩니다.
 */
export const embeddingCache = new EmbeddingCache()
