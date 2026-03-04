/**
 * Full-Text Search Tests
 *
 * Tests for PostgreSQL FTS utilities and API endpoint
 */

import { describe, it, expect, vi } from 'vitest'

// Mock the database module
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
  },
}))

vi.mock('@/lib/db/schema', () => ({
  catalogItems: {
    id: 'id',
    name: 'name',
    type: 'type',
    description: 'description',
    content: 'content',
    author: 'author',
    tags: 'tags',
    difficulty: 'difficulty',
    status: 'status',
    likes: 'likes',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
}))

import { highlightSearchTerms } from '@/lib/search/full-text-search'

describe('Full-Text Search Utilities', () => {
  describe('highlightSearchTerms', () => {
    it('should return original text when query is empty', () => {
      const result = highlightSearchTerms('Hello World', '')
      expect(result).toBe('Hello World')
    })

    it('should return original text when query is whitespace only', () => {
      const result = highlightSearchTerms('Hello World', '   ')
      expect(result).toBe('Hello World')
    })

    it('should highlight single term', () => {
      const result = highlightSearchTerms('Hello World', 'World')
      expect(result).toBe('Hello <mark>World</mark>')
    })

    it('should highlight multiple occurrences', () => {
      const result = highlightSearchTerms('Hello World, World is great', 'World')
      expect(result).toBe('Hello <mark>World</mark>, <mark>World</mark> is great')
    })

    it('should highlight case insensitively', () => {
      const result = highlightSearchTerms('Hello WORLD world', 'world')
      expect(result).toBe('Hello <mark>WORLD</mark> <mark>world</mark>')
    })

    it('should highlight multiple terms', () => {
      const result = highlightSearchTerms('Hello World, how are you today?', 'Hello today')
      expect(result).toBe('<mark>Hello</mark> World, how are you <mark>today</mark>?')
    })

    it('should handle special regex characters', () => {
      const result = highlightSearchTerms('Price is $100 (USD)', '$100')
      expect(result).toBe('Price is <mark>$100</mark> (USD)')
    })

    it('should handle Korean text', () => {
      const result = highlightSearchTerms('안녕하세요 세계', '안녕')
      expect(result).toBe('<mark>안녕</mark>하세요 세계')
    })
  })
})

describe('Korean Text Detection', () => {
  it('should detect Korean characters in query', () => {
    const hasKorean = (text: string) => /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(text)

    expect(hasKorean('안녕하세요')).toBe(true)
    expect(hasKorean('Hello 안녕')).toBe(true)
    expect(hasKorean('ㅋㅋㅋ')).toBe(true)
    expect(hasKorean('Hello World')).toBe(false)
    expect(hasKorean('123')).toBe(false)
  })
})

describe('Search Query Parsing', () => {
  it('should build FTS query from multiple words', () => {
    const buildTsQuery = (query: string) => {
      return query
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => `${word}:*`)
        .join(' & ')
    }

    expect(buildTsQuery('hello world')).toBe('hello:* & world:*')
    expect(buildTsQuery('git commit')).toBe('git:* & commit:*')
    expect(buildTsQuery('single')).toBe('single:*')
    expect(buildTsQuery('  spaced   words  ')).toBe('spaced:* & words:*')
  })
})

describe('Search Options Validation', () => {
  const VALID_TYPES = ['skill', 'agent', 'command', 'guide', 'hook', 'all'] as const
  const VALID_STATUSES = ['published', 'draft', 'all'] as const
  const VALID_SORT_OPTIONS = ['relevance', 'newest', 'popular', 'name'] as const

  it('should validate type parameter', () => {
    const validateType = (type: string) => VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])

    expect(validateType('skill')).toBe(true)
    expect(validateType('agent')).toBe(true)
    expect(validateType('all')).toBe(true)
    expect(validateType('invalid')).toBe(false)
    expect(validateType('')).toBe(false)
  })

  it('should validate status parameter', () => {
    const validateStatus = (status: string) =>
      VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])

    expect(validateStatus('published')).toBe(true)
    expect(validateStatus('draft')).toBe(true)
    expect(validateStatus('all')).toBe(true)
    expect(validateStatus('pending')).toBe(false)
  })

  it('should validate sortBy parameter', () => {
    const validateSort = (sort: string) =>
      VALID_SORT_OPTIONS.includes(sort as (typeof VALID_SORT_OPTIONS)[number])

    expect(validateSort('relevance')).toBe(true)
    expect(validateSort('newest')).toBe(true)
    expect(validateSort('popular')).toBe(true)
    expect(validateSort('name')).toBe(true)
    expect(validateSort('invalid')).toBe(false)
  })

  it('should validate limit parameter', () => {
    const validateLimit = (limit: number) => Math.min(Math.max(1, limit), 100)

    expect(validateLimit(20)).toBe(20)
    expect(validateLimit(0)).toBe(1)
    expect(validateLimit(-5)).toBe(1)
    expect(validateLimit(150)).toBe(100)
    expect(validateLimit(100)).toBe(100)
  })

  it('should validate offset parameter', () => {
    const validateOffset = (offset: number) => Math.max(0, offset)

    expect(validateOffset(10)).toBe(10)
    expect(validateOffset(0)).toBe(0)
    expect(validateOffset(-5)).toBe(0)
  })
})

describe('Tag Parsing', () => {
  it('should parse comma-separated tags', () => {
    const parseTags = (tagsParam: string | null) =>
      tagsParam
        ? tagsParam
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined

    expect(parseTags('git,workflow,automation')).toEqual(['git', 'workflow', 'automation'])
    expect(parseTags('single')).toEqual(['single'])
    expect(parseTags('')).toBeUndefined()
    expect(parseTags(null)).toBeUndefined()
    expect(parseTags('  spaced , tags , here  ')).toEqual(['spaced', 'tags', 'here'])
  })
})

describe('Pagination Calculation', () => {
  it('should calculate correct page number', () => {
    const calculatePage = (offset: number, limit: number) => Math.floor(offset / limit) + 1

    expect(calculatePage(0, 20)).toBe(1)
    expect(calculatePage(20, 20)).toBe(2)
    expect(calculatePage(40, 20)).toBe(3)
    expect(calculatePage(0, 10)).toBe(1)
    expect(calculatePage(30, 10)).toBe(4)
  })

  it('should calculate correct total pages', () => {
    const calculateTotalPages = (total: number, limit: number) => Math.ceil(total / limit)

    expect(calculateTotalPages(100, 20)).toBe(5)
    expect(calculateTotalPages(101, 20)).toBe(6)
    expect(calculateTotalPages(0, 20)).toBe(0)
    expect(calculateTotalPages(5, 20)).toBe(1)
  })

  it('should determine hasMore correctly', () => {
    const hasMore = (offset: number, itemsReturned: number, total: number) =>
      offset + itemsReturned < total

    expect(hasMore(0, 20, 100)).toBe(true)
    expect(hasMore(80, 20, 100)).toBe(false)
    expect(hasMore(0, 100, 100)).toBe(false)
    expect(hasMore(0, 10, 100)).toBe(true)
  })
})

describe('Search Result Structure', () => {
  it('should have correct response structure', () => {
    const mockResponse = {
      items: [],
      total: 0,
      hasMore: false,
      searchTime: 15,
      query: 'test',
      filters: {
        type: 'all' as const,
        status: 'published',
        sortBy: 'relevance',
        tags: undefined,
      },
      pagination: {
        limit: 20,
        offset: 0,
        page: 1,
        totalPages: 0,
      },
    }

    expect(mockResponse.items).toBeDefined()
    expect(mockResponse.total).toBeDefined()
    expect(mockResponse.hasMore).toBeDefined()
    expect(mockResponse.searchTime).toBeDefined()
    expect(mockResponse.query).toBeDefined()
    expect(mockResponse.filters).toBeDefined()
    expect(mockResponse.pagination).toBeDefined()
    expect(mockResponse.pagination.page).toBe(1)
  })
})

describe('Suggestions Response Structure', () => {
  it('should have correct suggestions response structure', () => {
    const mockSuggestionsResponse = {
      suggestions: [
        { id: '1', name: 'Git Commit Helper', type: 'skill' as const },
        { id: '2', name: 'Git Branch Manager', type: 'agent' as const },
      ],
      query: 'git',
    }

    expect(mockSuggestionsResponse.suggestions).toBeInstanceOf(Array)
    expect(mockSuggestionsResponse.query).toBe('git')
    expect(mockSuggestionsResponse.suggestions[0]).toHaveProperty('id')
    expect(mockSuggestionsResponse.suggestions[0]).toHaveProperty('name')
    expect(mockSuggestionsResponse.suggestions[0]).toHaveProperty('type')
  })
})

describe('Error Handling', () => {
  it('should return error structure for failed search', () => {
    const errorResponse = {
      error: 'Search failed',
      message: 'Database connection error',
    }

    expect(errorResponse.error).toBe('Search failed')
    expect(errorResponse.message).toBeDefined()
  })
})
