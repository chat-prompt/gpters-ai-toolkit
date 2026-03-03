/**
 * Tests for cleanQuery / isNoiseQuery — noise stripping and detection in semantic search.
 *
 * Validates that removable prefixes (image placeholders) are stripped while preserving
 * the search intent, and that structural noise (mode prompts, too short/long) is rejected.
 */

import { describe, it, expect } from 'vitest'
import { isNoiseQuery, cleanQuery } from '@gpters/lib/search'

describe('cleanQuery', () => {
  describe('image placeholder stripping', () => {
    it('should strip [Image N] and return the remaining text', () => {
      expect(cleanQuery('[Image 1] 코드 리뷰 해줘')).toBe('코드 리뷰 해줘')
    })

    it('should handle multiple image placeholders', () => {
      expect(cleanQuery('[Image 1] [Image 2] 이 화면 분석해줘')).toBe('이 화면 분석해줘')
    })

    it('should return null if only image placeholder with no text', () => {
      expect(cleanQuery('[Image 1]')).toBeNull()
    })

    it('should be case-insensitive', () => {
      expect(cleanQuery('[image 3] API 검색')).toBe('API 검색')
    })
  })

  describe('mode prompt rejection', () => {
    it('should reject [analyze-mode] prefix', () => {
      expect(cleanQuery('[analyze-mode] You are a helpful assistant...')).toBeNull()
    })

    it('should reject [search-mode] prefix', () => {
      expect(cleanQuery('[search-mode] Search for relevant plugins...')).toBeNull()
    })

    it('should reject <ultrawork-mode> tag', () => {
      expect(cleanQuery('Please help <ultrawork-mode> with detailed analysis')).toBeNull()
    })

    it('should be case-insensitive for mode patterns', () => {
      expect(cleanQuery('[Analyze-Mode] some text')).toBeNull()
      expect(cleanQuery('[SEARCH-MODE] some text')).toBeNull()
    })
  })

  describe('length validation', () => {
    it('should reject queries under 3 characters', () => {
      expect(cleanQuery('ㄱ')).toBeNull()
      expect(cleanQuery('ㄱㄱ')).toBeNull()
    })

    it('should accept 3+ character queries', () => {
      expect(cleanQuery('API')).toBe('API')
      expect(cleanQuery('git')).toBe('git')
    })

    it('should reject queries over 500 characters', () => {
      expect(cleanQuery('a'.repeat(501))).toBeNull()
    })

    it('should accept queries at 500 characters', () => {
      const q = 'a'.repeat(500)
      expect(cleanQuery(q)).toBe(q)
    })
  })

  describe('legitimate queries', () => {
    it('should return Korean search queries as-is', () => {
      expect(cleanQuery('코드 리뷰')).toBe('코드 리뷰')
      expect(cleanQuery('리팩토링 가이드')).toBe('리팩토링 가이드')
    })

    it('should return English search queries as-is', () => {
      expect(cleanQuery('code review')).toBe('code review')
      expect(cleanQuery('devlog')).toBe('devlog')
    })

    it('should return conversational queries as-is', () => {
      expect(cleanQuery('환불 관련 스킬 찾아줘')).toBe('환불 관련 스킬 찾아줘')
    })
  })
})

describe('isNoiseQuery', () => {
  it('should return true for noise queries', () => {
    expect(isNoiseQuery('[analyze-mode] prompt...')).toBe(true)
    expect(isNoiseQuery('[Image 1]')).toBe(true)
    expect(isNoiseQuery('ㄱㄱ')).toBe(true)
  })

  it('should return false for legitimate queries', () => {
    expect(isNoiseQuery('코드 리뷰')).toBe(false)
    expect(isNoiseQuery('[Image 1] 코드 리뷰 해줘')).toBe(false)
  })
})
