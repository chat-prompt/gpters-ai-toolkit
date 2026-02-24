/**
 * 임베딩 LRU 캐시 테스트
 *
 * EmbeddingCache 클래스의 캐시 히트/미스, LRU 정책,
 * TTL 만료, 쿼리 정규화, 통계 정확성을 검증합니다.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EmbeddingCache, normalizeQuery } from '@gpters/lib/search'

describe('EmbeddingCache', () => {
  let cache: EmbeddingCache

  beforeEach(() => {
    cache = new EmbeddingCache(5, 60_000) // maxSize=5, TTL=60s
  })

  describe('기본 캐시 동작', () => {
    it('캐시 미스 시 null을 반환한다', () => {
      const result = cache.get('unknown query')
      expect(result).toBeNull()
    })

    it('캐시에 저장한 임베딩을 히트로 반환한다', () => {
      const embedding = [0.1, 0.2, 0.3]
      cache.set('test query', embedding)
      const result = cache.get('test query')
      expect(result).toEqual(embedding)
    })

    it('여러 엔트리를 독립적으로 저장하고 조회한다', () => {
      const emb1 = [1.0, 2.0]
      const emb2 = [3.0, 4.0]
      cache.set('query1', emb1)
      cache.set('query2', emb2)

      expect(cache.get('query1')).toEqual(emb1)
      expect(cache.get('query2')).toEqual(emb2)
    })
  })

  describe('쿼리 정규화', () => {
    it('대소문자를 구분하지 않는다', () => {
      cache.set('Hello World', [1.0])
      expect(cache.get('hello world')).toEqual([1.0])
      expect(cache.get('HELLO WORLD')).toEqual([1.0])
    })

    it('앞뒤 공백을 제거한다', () => {
      cache.set('  test  ', [2.0])
      expect(cache.get('test')).toEqual([2.0])
    })

    it('다중 공백을 단일 공백으로 정규화한다', () => {
      cache.set('hello   world', [3.0])
      expect(cache.get('hello world')).toEqual([3.0])
      expect(cache.get('hello    world')).toEqual([3.0])
    })

    it('정규화 결과가 동일하면 같은 캐시 엔트리를 사용한다', () => {
      cache.set('  Hello   WORLD  ', [4.0])
      expect(cache.get('hello world')).toEqual([4.0])
    })
  })

  describe('LRU 정책', () => {
    it('maxSize 초과 시 가장 오래 접근되지 않은 항목을 제거한다', () => {
      // maxSize=5인 캐시에 6개 삽입
      cache.set('q1', [1])
      cache.set('q2', [2])
      cache.set('q3', [3])
      cache.set('q4', [4])
      cache.set('q5', [5])
      cache.set('q6', [6]) // q1이 제거되어야 함

      expect(cache.get('q1')).toBeNull()
      expect(cache.get('q2')).toEqual([2])
      expect(cache.get('q6')).toEqual([6])
    })

    it('접근한 항목은 LRU 순서가 갱신되어 유지된다', () => {
      cache.set('q1', [1])
      cache.set('q2', [2])
      cache.set('q3', [3])
      cache.set('q4', [4])
      cache.set('q5', [5])

      // q1에 접근하여 LRU 순서 갱신
      cache.get('q1')

      // q6 삽입 시 q2가 가장 오래된 항목이므로 제거
      cache.set('q6', [6])

      expect(cache.get('q1')).toEqual([1]) // 접근했으므로 유지
      expect(cache.get('q2')).toBeNull() // 제거됨
      expect(cache.get('q6')).toEqual([6])
    })

    it('동일 키 재삽입 시 maxSize를 초과하지 않는다', () => {
      cache.set('q1', [1])
      cache.set('q2', [2])
      cache.set('q3', [3])

      // 동일 키 업데이트
      cache.set('q1', [10])

      const stats = cache.getStats()
      expect(stats.size).toBe(3)
      expect(cache.get('q1')).toEqual([10])
    })
  })

  describe('TTL 만료', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('TTL 내에서는 캐시가 유효하다', () => {
      cache.set('query', [1.0])

      // 30초 경과 (TTL=60초)
      vi.advanceTimersByTime(30_000)

      expect(cache.get('query')).toEqual([1.0])
    })

    it('TTL 만료 시 캐시 미스로 처리한다', () => {
      cache.set('query', [1.0])

      // 61초 경과 (TTL=60초 초과)
      vi.advanceTimersByTime(61_000)

      expect(cache.get('query')).toBeNull()
    })

    it('TTL 만료된 엔트리는 캐시에서 삭제된다', () => {
      cache.set('query', [1.0])
      expect(cache.getStats().size).toBe(1)

      vi.advanceTimersByTime(61_000)

      // get 호출 시 만료 엔트리 삭제
      cache.get('query')
      expect(cache.getStats().size).toBe(0)
    })
  })

  describe('getStats()', () => {
    it('초기 상태에서 모든 카운터가 0이다', () => {
      const stats = cache.getStats()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.size).toBe(0)
      expect(stats.maxSize).toBe(5)
      expect(stats.hitRate).toBe(0)
    })

    it('히트/미스 카운터를 정확하게 추적한다', () => {
      cache.set('q1', [1])

      cache.get('q1') // hit
      cache.get('q1') // hit
      cache.get('q2') // miss

      const stats = cache.getStats()
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBeCloseTo(2 / 3)
    })

    it('현재 캐시 크기를 정확하게 보고한다', () => {
      cache.set('q1', [1])
      cache.set('q2', [2])
      expect(cache.getStats().size).toBe(2)

      cache.set('q3', [3])
      expect(cache.getStats().size).toBe(3)
    })

    it('히트율을 올바르게 계산한다', () => {
      cache.set('q1', [1])
      cache.get('q1') // hit
      cache.get('q2') // miss
      cache.get('q1') // hit
      cache.get('q3') // miss

      // 2 hits / 4 total = 0.5
      expect(cache.getStats().hitRate).toBeCloseTo(0.5)
    })
  })

  describe('clear()', () => {
    it('모든 엔트리와 카운터를 초기화한다', () => {
      cache.set('q1', [1])
      cache.set('q2', [2])
      cache.get('q1') // hit

      cache.clear()

      const stats = cache.getStats()
      expect(stats.size).toBe(0)
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(cache.get('q1')).toBeNull()
    })
  })
})

describe('normalizeQuery', () => {
  it('소문자로 변환한다', () => {
    expect(normalizeQuery('Hello World')).toBe('hello world')
  })

  it('앞뒤 공백을 제거한다', () => {
    expect(normalizeQuery('  hello  ')).toBe('hello')
  })

  it('다중 공백을 단일 공백으로 치환한다', () => {
    expect(normalizeQuery('hello   world')).toBe('hello world')
  })

  it('탭과 개행을 공백으로 처리한다', () => {
    expect(normalizeQuery("hello\tworld\nfoo")).toBe('hello world foo')
  })

  it('빈 문자열을 올바르게 처리한다', () => {
    expect(normalizeQuery('')).toBe('')
    expect(normalizeQuery('   ')).toBe('')
  })

  it('한국어 텍스트를 올바르게 처리한다', () => {
    expect(normalizeQuery('  코드  리뷰   가이드  ')).toBe('코드 리뷰 가이드')
  })
})

describe('generateEmbedding 캐시 통합', () => {
  it('캐시 미스 시 API를 호출한다', async () => {
    const mockEmbedContent = vi.fn().mockResolvedValue({
      embeddings: [{ values: [0.1, 0.2, 0.3] }],
    })

    vi.doMock('@google/genai', () => ({
      GoogleGenAI: vi.fn().mockImplementation(() => ({
        models: { embedContent: mockEmbedContent },
      })),
    }))

    // 캐시 미스 확인: 새 캐시 인스턴스에서 조회 시 null
    const freshCache = new EmbeddingCache()
    expect(freshCache.get('new query')).toBeNull()
    expect(freshCache.getStats().misses).toBe(1)
  })

  it('캐시 히트 시 캐시된 결과를 반환한다', () => {
    const testCache = new EmbeddingCache()
    const embedding = [0.5, 0.6, 0.7]
    testCache.set('cached query', embedding)

    const result = testCache.get('cached query')
    expect(result).toEqual(embedding)
    expect(testCache.getStats().hits).toBe(1)
  })
})

describe('TTL 만료 시 미스 카운터 정확성', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('TTL 만료된 조회는 미스로 카운트한다', () => {
    const cache = new EmbeddingCache(100, 1000) // TTL=1초
    cache.set('q', [1])

    cache.get('q') // hit
    vi.advanceTimersByTime(1500)
    cache.get('q') // miss (TTL 만료)

    const stats = cache.getStats()
    expect(stats.hits).toBe(1)
    expect(stats.misses).toBe(1)
  })
})
