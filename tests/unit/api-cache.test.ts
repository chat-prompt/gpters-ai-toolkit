import { describe, it, expect, vi } from 'vitest'
import {
  CachePresets,
  generateCacheControl,
  generateETag,
  hasMatchingETag,
  cachedJsonResponse,
  addCacheHeaders,
  invalidateCacheResponse,
  createSurrogateKey,
  addSurrogateKey,
} from '@/lib/api-cache'

describe('API Cache Utilities', () => {
  describe('generateCacheControl', () => {
    it('should generate public cache control with max-age', () => {
      const result = generateCacheControl({ maxAge: 60, public: true })
      expect(result).toBe('public, max-age=60')
    })

    it('should generate private cache control', () => {
      const result = generateCacheControl({ maxAge: 60, public: false })
      expect(result).toBe('private, max-age=60')
    })

    it('should include stale-while-revalidate', () => {
      const result = generateCacheControl({
        maxAge: 60,
        staleWhileRevalidate: 300,
        public: true,
      })
      expect(result).toBe('public, max-age=60, stale-while-revalidate=300')
    })

    it('should include must-revalidate', () => {
      const result = generateCacheControl({
        maxAge: 60,
        mustRevalidate: true,
        public: true,
      })
      expect(result).toBe('public, max-age=60, must-revalidate')
    })

    it('should return no-store for noStore option', () => {
      const result = generateCacheControl({ maxAge: 0, noStore: true })
      expect(result).toBe('no-store, no-cache, must-revalidate')
    })
  })

  describe('generateETag', () => {
    it('should generate consistent ETag for same content', () => {
      const content = { id: 1, name: 'test' }
      const etag1 = generateETag(content)
      const etag2 = generateETag(content)
      expect(etag1).toBe(etag2)
    })

    it('should generate different ETag for different content', () => {
      const etag1 = generateETag({ id: 1 })
      const etag2 = generateETag({ id: 2 })
      expect(etag1).not.toBe(etag2)
    })

    it('should wrap ETag in quotes', () => {
      const etag = generateETag({ test: true })
      expect(etag).toMatch(/^"[a-f0-9]+"$/)
    })
  })

  describe('hasMatchingETag', () => {
    it('should return true for matching ETag', () => {
      const etag = '"abc123"'
      const request = new Request('http://localhost', {
        headers: { 'if-none-match': '"abc123"' },
      })
      expect(hasMatchingETag(request, etag)).toBe(true)
    })

    it('should return true for wildcard', () => {
      const request = new Request('http://localhost', {
        headers: { 'if-none-match': '*' },
      })
      expect(hasMatchingETag(request, '"any"')).toBe(true)
    })

    it('should return false for non-matching ETag', () => {
      const request = new Request('http://localhost', {
        headers: { 'if-none-match': '"other"' },
      })
      expect(hasMatchingETag(request, '"abc123"')).toBe(false)
    })

    it('should return false when no if-none-match header', () => {
      const request = new Request('http://localhost')
      expect(hasMatchingETag(request, '"abc123"')).toBe(false)
    })

    it('should handle multiple ETags', () => {
      const request = new Request('http://localhost', {
        headers: { 'if-none-match': '"first", "second", "third"' },
      })
      expect(hasMatchingETag(request, '"second"')).toBe(true)
      expect(hasMatchingETag(request, '"fourth"')).toBe(false)
    })
  })

  describe('CachePresets', () => {
    it('should have catalogList preset', () => {
      expect(CachePresets.catalogList).toEqual({
        maxAge: 60,
        staleWhileRevalidate: 300,
        public: true,
      })
    })

    it('should have catalogItem preset', () => {
      expect(CachePresets.catalogItem).toEqual({
        maxAge: 120,
        staleWhileRevalidate: 600,
        public: true,
      })
    })

    it('should have noCache preset', () => {
      expect(CachePresets.noCache).toEqual({
        maxAge: 0,
        staleWhileRevalidate: 0,
        public: false,
        noStore: true,
      })
    })
  })

  describe('cachedJsonResponse', () => {
    it('should create response with cache headers', () => {
      const data = { test: true }
      const response = cachedJsonResponse(data, 'catalogList')

      expect(response.headers.get('Cache-Control')).toBe(
        'public, max-age=60, stale-while-revalidate=300'
      )
      expect(response.headers.get('ETag')).toMatch(/^"[a-f0-9]+"$/)
      expect(response.headers.get('Vary')).toBe('Accept-Encoding')
    })

    it('should return 304 for matching ETag', () => {
      const data = { test: true }
      const etag = generateETag(data)
      const request = new Request('http://localhost', {
        headers: { 'if-none-match': etag },
      })

      const response = cachedJsonResponse(data, 'catalogList', request)
      expect(response.status).toBe(304)
    })

    it('should accept CacheOptions object', () => {
      const data = { test: true }
      const response = cachedJsonResponse(data, {
        maxAge: 300,
        staleWhileRevalidate: 600,
        public: true,
      })

      expect(response.headers.get('Cache-Control')).toBe(
        'public, max-age=300, stale-while-revalidate=600'
      )
    })
  })

  describe('invalidateCacheResponse', () => {
    it('should return no-cache headers', () => {
      const response = invalidateCacheResponse({ success: true })

      expect(response.headers.get('Cache-Control')).toBe(
        'no-store, no-cache, must-revalidate'
      )
      expect(response.headers.get('Pragma')).toBe('no-cache')
    })

    it('should accept custom status', () => {
      const response = invalidateCacheResponse({ created: true }, 201)
      expect(response.status).toBe(201)
    })
  })

  describe('createSurrogateKey', () => {
    it('should join keys with spaces', () => {
      const result = createSurrogateKey('catalog', 'skill', 'item-123')
      expect(result).toBe('catalog skill item-123')
    })

    it('should handle single key', () => {
      const result = createSurrogateKey('catalog')
      expect(result).toBe('catalog')
    })
  })

  describe('addSurrogateKey', () => {
    it('should add Surrogate-Key header', async () => {
      const { NextResponse } = await import('next/server')
      const response = NextResponse.json({ test: true })

      addSurrogateKey(response, 'catalog', 'skill')

      expect(response.headers.get('Surrogate-Key')).toBe('catalog skill')
    })

    it('should not add header for empty keys', async () => {
      const { NextResponse } = await import('next/server')
      const response = NextResponse.json({ test: true })

      addSurrogateKey(response)

      expect(response.headers.get('Surrogate-Key')).toBeNull()
    })
  })

  describe('addCacheHeaders', () => {
    it('should add cache headers to response', async () => {
      const { NextResponse } = await import('next/server')
      const response = NextResponse.json({ test: true })

      addCacheHeaders(response, 'catalogList')

      expect(response.headers.get('Cache-Control')).toBe(
        'public, max-age=60, stale-while-revalidate=300'
      )
      expect(response.headers.get('Vary')).toBe('Accept-Encoding')
    })

    it('should add ETag when provided', async () => {
      const { NextResponse } = await import('next/server')
      const response = NextResponse.json({ test: true })

      addCacheHeaders(response, 'catalogList', '"test-etag"')

      expect(response.headers.get('ETag')).toBe('"test-etag"')
    })
  })
})
