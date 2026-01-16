/**
 * Tests for Advanced Filter System
 * 고급 필터 시스템 테스트
 */

import { describe, it, expect } from 'vitest'
import {
  parseSearchQuery,
  matchSearchTokens,
  levenshteinDistance,
  fuzzyMatchScore,
  findFuzzyMatches,
  applyFilters,
  sortItems,
  calculateFilterCounts,
  filterCatalog,
  applyPreset,
  getPresetById,
  hasActiveFilters,
  countActiveFilters,
  filterStateFromParams,
  filterStateToParams,
  getSortDescription,
  DEFAULT_FILTER_STATE,
  FILTER_PRESETS,
  SORT_OPTIONS,
  FilterState,
  SearchToken,
  SortConfig,
} from '@/lib/search/advanced-filter'
import { CatalogItem } from '@/lib/core/types'

// Mock catalog items for testing
const mockItems: CatalogItem[] = [
  {
    id: 'skill-1',
    name: 'Code Reviewer',
    description: 'AI-powered code review tool',
    type: 'skill',
    authorName: 'alice',
    tags: ['code-quality', 'automation'],
    difficulty: 'easy',
    teamTag: 'dev',
    status: 'published',
    likes: 15,
    mcpEnabled: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-15T00:00:00Z',
  },
  {
    id: 'agent-1',
    name: 'Data Analyzer',
    description: 'Analyze data patterns',
    type: 'agent',
    authorName: 'bob',
    tags: ['data', 'analysis'],
    difficulty: 'medium',
    teamTag: 'data',
    status: 'published',
    likes: 8,
    mcpEnabled: true,
    createdAt: '2025-01-05T00:00:00Z',
    updatedAt: '2025-01-10T00:00:00Z',
  },
  {
    id: 'command-1',
    name: 'Git Helper',
    description: 'Git command shortcuts',
    type: 'command',
    authorName: 'charlie',
    tags: ['git', 'automation'],
    difficulty: 'hard',
    teamTag: 'dev',
    status: 'draft',
    likes: 3,
    mcpEnabled: false,
    createdAt: '2025-01-10T00:00:00Z',
    updatedAt: '2025-01-20T00:00:00Z',
  },
  {
    id: 'skill-2',
    name: 'Test Runner',
    description: 'Run tests automatically',
    type: 'skill',
    authorName: 'alice',
    tags: ['testing', 'automation'],
    difficulty: 'easy',
    teamTag: 'dev',
    status: 'published',
    likes: 20,
    mcpEnabled: true,
    createdAt: '2025-01-02T00:00:00Z',
    updatedAt: '2025-01-18T00:00:00Z',
  },
] as CatalogItem[]

// ============================================================================
// Search Query Parsing Tests
// ============================================================================

describe('parseSearchQuery', () => {
  it('should parse simple terms', () => {
    const tokens = parseSearchQuery('hello world')
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toEqual({ type: 'include', value: 'hello' })
    expect(tokens[1]).toEqual({ type: 'include', value: 'world' })
  })

  it('should parse quoted phrases', () => {
    const tokens = parseSearchQuery('"hello world"')
    expect(tokens).toHaveLength(1)
    expect(tokens[0]).toEqual({ type: 'include', value: 'hello world' })
  })

  it('should parse exclude terms with -', () => {
    const tokens = parseSearchQuery('-exclude include')
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toEqual({ type: 'exclude', value: 'exclude' })
    expect(tokens[1]).toEqual({ type: 'include', value: 'include' })
  })

  it('should parse field:value syntax', () => {
    const tokens = parseSearchQuery('author:alice tag:testing')
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toEqual({ type: 'field', field: 'author', value: 'alice' })
    expect(tokens[1]).toEqual({ type: 'field', field: 'tag', value: 'testing' })
  })

  it('should parse mixed query', () => {
    const tokens = parseSearchQuery('code author:bob -draft')
    expect(tokens).toHaveLength(3)
    expect(tokens[0]).toEqual({ type: 'include', value: 'code' })
    expect(tokens[1]).toEqual({ type: 'field', field: 'author', value: 'bob' })
    expect(tokens[2]).toEqual({ type: 'exclude', value: 'draft' })
  })

  it('should handle empty query', () => {
    expect(parseSearchQuery('')).toEqual([])
    expect(parseSearchQuery('   ')).toEqual([])
  })
})

describe('matchSearchTokens', () => {
  it('should match include tokens', () => {
    const tokens: SearchToken[] = [{ type: 'include', value: 'code' }]
    expect(matchSearchTokens(mockItems[0], tokens)).toBe(true)
    expect(matchSearchTokens(mockItems[1], tokens)).toBe(false)
  })

  it('should match exclude tokens', () => {
    const tokens: SearchToken[] = [{ type: 'exclude', value: 'data' }]
    expect(matchSearchTokens(mockItems[0], tokens)).toBe(true)
    expect(matchSearchTokens(mockItems[1], tokens)).toBe(false)
  })

  it('should match field tokens', () => {
    const tokens: SearchToken[] = [{ type: 'field', field: 'author', value: 'alice' }]
    expect(matchSearchTokens(mockItems[0], tokens)).toBe(true)
    expect(matchSearchTokens(mockItems[1], tokens)).toBe(false)
  })

  it('should match tag field', () => {
    const tokens: SearchToken[] = [{ type: 'field', field: 'tag', value: 'automation' }]
    expect(matchSearchTokens(mockItems[0], tokens)).toBe(true)
    expect(matchSearchTokens(mockItems[1], tokens)).toBe(false)
  })

  it('should return true for empty tokens', () => {
    expect(matchSearchTokens(mockItems[0], [])).toBe(true)
  })
})

// ============================================================================
// Fuzzy Matching Tests
// ============================================================================

describe('levenshteinDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0)
  })

  it('should return length for empty string comparison', () => {
    expect(levenshteinDistance('', 'hello')).toBe(5)
    expect(levenshteinDistance('hello', '')).toBe(5)
  })

  it('should calculate correct distance', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
    expect(levenshteinDistance('cat', 'car')).toBe(1)
  })

  it('should handle single character difference', () => {
    expect(levenshteinDistance('abc', 'abd')).toBe(1)
  })
})

describe('fuzzyMatchScore', () => {
  it('should return 1 for exact match', () => {
    expect(fuzzyMatchScore('hello', 'hello world')).toBe(1)
  })

  it('should return 1 for substring match', () => {
    expect(fuzzyMatchScore('code', 'Code Reviewer')).toBe(1)
  })

  it('should return score between 0 and 1 for partial match', () => {
    const score = fuzzyMatchScore('codr', 'code')
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })

  it('should return 1 for empty strings', () => {
    expect(fuzzyMatchScore('', '')).toBe(1)
  })
})

describe('findFuzzyMatches', () => {
  it('should find exact matches first', () => {
    const results = findFuzzyMatches('Code', mockItems)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].item.id).toBe('skill-1')
    expect(results[0].score).toBe(1)
  })

  it('should respect minScore option', () => {
    const results = findFuzzyMatches('xyz', mockItems, { minScore: 0.9 })
    expect(results).toHaveLength(0)
  })

  it('should respect maxResults option', () => {
    const results = findFuzzyMatches('a', mockItems, { maxResults: 2 })
    expect(results.length).toBeLessThanOrEqual(2)
  })
})

// ============================================================================
// Core Filtering Tests
// ============================================================================

describe('applyFilters', () => {
  it('should filter by type', () => {
    const filters: FilterState = { ...DEFAULT_FILTER_STATE, type: 'skill' }
    const result = applyFilters(mockItems, filters)
    expect(result).toHaveLength(2)
    expect(result.every(item => item.type === 'skill')).toBe(true)
  })

  it('should filter by tags with AND operator', () => {
    const filters: FilterState = {
      ...DEFAULT_FILTER_STATE,
      tags: ['automation', 'code-quality'],
      tagsOperator: 'AND'
    }
    const result = applyFilters(mockItems, filters)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('skill-1')
  })

  it('should filter by tags with OR operator', () => {
    const filters: FilterState = {
      ...DEFAULT_FILTER_STATE,
      tags: ['data', 'testing'],
      tagsOperator: 'OR'
    }
    const result = applyFilters(mockItems, filters)
    expect(result).toHaveLength(2)
  })

  it('should filter by difficulty', () => {
    const filters: FilterState = { ...DEFAULT_FILTER_STATE, difficulty: 'easy' }
    const result = applyFilters(mockItems, filters)
    expect(result).toHaveLength(2)
    expect(result.every(item => item.difficulty === 'easy')).toBe(true)
  })

  it('should filter by team tag', () => {
    const filters: FilterState = { ...DEFAULT_FILTER_STATE, teamTag: 'dev' }
    const result = applyFilters(mockItems, filters)
    expect(result).toHaveLength(3)
  })

  it('should filter by status', () => {
    const filters: FilterState = { ...DEFAULT_FILTER_STATE, status: 'draft' }
    const result = applyFilters(mockItems, filters)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('draft')
  })

  it('should filter by marketplace enabled', () => {
    const filters: FilterState = { ...DEFAULT_FILTER_STATE, mcpEnabled: true }
    const result = applyFilters(mockItems, filters)
    expect(result).toHaveLength(3)
    expect(result.every(item => item.mcpEnabled)).toBe(true)
  })

  it('should filter by likes range min', () => {
    const filters: FilterState = { ...DEFAULT_FILTER_STATE, likesRange: { min: 10 } }
    const result = applyFilters(mockItems, filters)
    expect(result).toHaveLength(2)
    expect(result.every(item => item.likes >= 10)).toBe(true)
  })

  it('should filter by likes range max', () => {
    const filters: FilterState = { ...DEFAULT_FILTER_STATE, likesRange: { max: 10 } }
    const result = applyFilters(mockItems, filters)
    expect(result).toHaveLength(2)
    expect(result.every(item => item.likes <= 10)).toBe(true)
  })

  it('should filter by date range after', () => {
    const filters: FilterState = {
      ...DEFAULT_FILTER_STATE,
      updatedDateRange: { after: new Date('2025-01-15') }
    }
    const result = applyFilters(mockItems, filters)
    // Items updated on or after 2025-01-15: skill-1 (15th), command-1 (20th), skill-2 (18th)
    expect(result).toHaveLength(3)
  })

  it('should filter by search query', () => {
    const filters: FilterState = { ...DEFAULT_FILTER_STATE, query: 'alice' }
    const result = applyFilters(mockItems, filters)
    expect(result).toHaveLength(2)
  })

  it('should combine multiple filters', () => {
    const filters: FilterState = {
      ...DEFAULT_FILTER_STATE,
      type: 'skill',
      difficulty: 'easy',
      mcpEnabled: true
    }
    const result = applyFilters(mockItems, filters)
    expect(result).toHaveLength(2)
  })
})

describe('sortItems', () => {
  it('should sort by name ascending', () => {
    const config: SortConfig = { field: 'name', direction: 'asc' }
    const result = sortItems(mockItems, config)
    expect(result[0].name).toBe('Code Reviewer')
    expect(result[result.length - 1].name).toBe('Test Runner')
  })

  it('should sort by name descending', () => {
    const config: SortConfig = { field: 'name', direction: 'desc' }
    const result = sortItems(mockItems, config)
    expect(result[0].name).toBe('Test Runner')
    expect(result[result.length - 1].name).toBe('Code Reviewer')
  })

  it('should sort by likes descending', () => {
    const config: SortConfig = { field: 'likes', direction: 'desc' }
    const result = sortItems(mockItems, config)
    expect(result[0].likes).toBe(20)
    expect(result[result.length - 1].likes).toBe(3)
  })

  it('should sort by updatedAt', () => {
    const config: SortConfig = { field: 'updatedAt', direction: 'desc' }
    const result = sortItems(mockItems, config)
    expect(result[0].id).toBe('command-1') // Most recently updated
  })

  it('should sort by author', () => {
    const config: SortConfig = { field: 'author', direction: 'asc' }
    const result = sortItems(mockItems, config)
    expect(result[0].authorName).toBe('alice')
  })
})

// ============================================================================
// Filter Counts Tests
// ============================================================================

describe('calculateFilterCounts', () => {
  it('should count types correctly', () => {
    const counts = calculateFilterCounts(mockItems, DEFAULT_FILTER_STATE)
    expect(counts.types.all).toBe(4)
    expect(counts.types.skill).toBe(2)
    expect(counts.types.agent).toBe(1)
    expect(counts.types.command).toBe(1)
  })

  it('should count tags correctly', () => {
    const counts = calculateFilterCounts(mockItems, DEFAULT_FILTER_STATE)
    expect(counts.tags['automation']).toBe(3)
    expect(counts.tags['code-quality']).toBe(1)
  })

  it('should count difficulties correctly', () => {
    const counts = calculateFilterCounts(mockItems, DEFAULT_FILTER_STATE)
    expect(counts.difficulties['easy']).toBe(2)
    expect(counts.difficulties['medium']).toBe(1)
    expect(counts.difficulties['hard']).toBe(1)
  })

  it('should count statuses correctly', () => {
    const counts = calculateFilterCounts(mockItems, DEFAULT_FILTER_STATE)
    expect(counts.statuses.published).toBe(3)
    expect(counts.statuses.draft).toBe(1)
  })
})

// ============================================================================
// Filter Catalog Tests
// ============================================================================

describe('filterCatalog', () => {
  it('should return complete filter result', () => {
    const result = filterCatalog(mockItems, DEFAULT_FILTER_STATE)
    expect(result.items).toHaveLength(4)
    expect(result.totalCount).toBe(4)
    expect(result.filteredCount).toBe(4)
    expect(result.counts).toBeDefined()
  })

  it('should include applied filters list', () => {
    const filters: FilterState = {
      ...DEFAULT_FILTER_STATE,
      type: 'skill',
      difficulty: 'easy'
    }
    const result = filterCatalog(mockItems, filters)
    expect(result.appliedFilters.length).toBeGreaterThan(0)
  })

  it('should sort results', () => {
    const filters: FilterState = {
      ...DEFAULT_FILTER_STATE,
      sort: { field: 'likes', direction: 'desc' }
    }
    const result = filterCatalog(mockItems, filters)
    expect(result.items[0].likes).toBe(20)
    expect(result.sortedBy).toEqual({ field: 'likes', direction: 'desc' })
  })
})

// ============================================================================
// Presets Tests
// ============================================================================

describe('FILTER_PRESETS', () => {
  it('should have all required fields', () => {
    FILTER_PRESETS.forEach(preset => {
      expect(preset.id).toBeDefined()
      expect(preset.name).toBeDefined()
      expect(preset.nameKo).toBeDefined()
      expect(preset.icon).toBeDefined()
      expect(preset.filters).toBeDefined()
    })
  })
})

describe('applyPreset', () => {
  it('should apply preset filters', () => {
    const preset = FILTER_PRESETS.find(p => p.id === 'beginner-friendly')!
    const result = applyPreset(DEFAULT_FILTER_STATE, preset)
    expect(result.difficulty).toBe('easy')
  })
})

describe('getPresetById', () => {
  it('should find preset by id', () => {
    const preset = getPresetById('popular')
    expect(preset).toBeDefined()
    expect(preset?.id).toBe('popular')
  })

  it('should return undefined for unknown id', () => {
    expect(getPresetById('unknown')).toBeUndefined()
  })
})

// ============================================================================
// Utility Functions Tests
// ============================================================================

describe('hasActiveFilters', () => {
  it('should return false for default state', () => {
    expect(hasActiveFilters(DEFAULT_FILTER_STATE)).toBe(false)
  })

  it('should return true when filters are active', () => {
    const filters: FilterState = { ...DEFAULT_FILTER_STATE, type: 'skill' }
    expect(hasActiveFilters(filters)).toBe(true)
  })

  it('should detect query filter', () => {
    const filters: FilterState = { ...DEFAULT_FILTER_STATE, query: 'test' }
    expect(hasActiveFilters(filters)).toBe(true)
  })

  it('should detect tags filter', () => {
    const filters: FilterState = { ...DEFAULT_FILTER_STATE, tags: ['testing'] }
    expect(hasActiveFilters(filters)).toBe(true)
  })
})

describe('countActiveFilters', () => {
  it('should return 0 for default state', () => {
    expect(countActiveFilters(DEFAULT_FILTER_STATE)).toBe(0)
  })

  it('should count multiple filters', () => {
    const filters: FilterState = {
      ...DEFAULT_FILTER_STATE,
      type: 'skill',
      difficulty: 'easy',
      tags: ['a', 'b']
    }
    expect(countActiveFilters(filters)).toBe(4) // type + difficulty + 2 tags
  })
})

describe('filterStateFromParams', () => {
  it('should parse query param', () => {
    const params = new URLSearchParams('q=test')
    const state = filterStateFromParams(params)
    expect(state.query).toBe('test')
  })

  it('should parse type param', () => {
    const params = new URLSearchParams('type=skill')
    const state = filterStateFromParams(params)
    expect(state.type).toBe('skill')
  })

  it('should parse tags param', () => {
    const params = new URLSearchParams('tags=a,b,c')
    const state = filterStateFromParams(params)
    expect(state.tags).toEqual(['a', 'b', 'c'])
  })

  it('should parse sort params', () => {
    const params = new URLSearchParams('sortField=likes&sortDir=desc')
    const state = filterStateFromParams(params)
    expect(state.sort).toEqual({ field: 'likes', direction: 'desc' })
  })
})

describe('filterStateToParams', () => {
  it('should serialize query', () => {
    const filters: FilterState = { ...DEFAULT_FILTER_STATE, query: 'test' }
    const params = filterStateToParams(filters)
    expect(params.get('q')).toBe('test')
  })

  it('should serialize type', () => {
    const filters: FilterState = { ...DEFAULT_FILTER_STATE, type: 'skill' }
    const params = filterStateToParams(filters)
    expect(params.get('type')).toBe('skill')
  })

  it('should serialize tags', () => {
    const filters: FilterState = { ...DEFAULT_FILTER_STATE, tags: ['a', 'b'] }
    const params = filterStateToParams(filters)
    expect(params.get('tags')).toBe('a,b')
  })

  it('should not include default sort', () => {
    const params = filterStateToParams(DEFAULT_FILTER_STATE)
    expect(params.has('sortField')).toBe(false)
    expect(params.has('sortDir')).toBe(false)
  })

  it('should include non-default sort', () => {
    const filters: FilterState = {
      ...DEFAULT_FILTER_STATE,
      sort: { field: 'likes', direction: 'desc' }
    }
    const params = filterStateToParams(filters)
    expect(params.get('sortField')).toBe('likes')
    expect(params.get('sortDir')).toBe('desc')
  })
})

describe('getSortDescription', () => {
  it('should return Korean description', () => {
    const desc = getSortDescription({ field: 'likes', direction: 'desc' })
    expect(desc).toBe('인기순')
  })

  it('should return default for unknown config', () => {
    const desc = getSortDescription({ field: 'name', direction: 'asc' })
    expect(desc).toBe('이름순 (A-Z)')
  })
})

// ============================================================================
// SORT_OPTIONS Tests
// ============================================================================

describe('SORT_OPTIONS', () => {
  it('should have all required fields', () => {
    SORT_OPTIONS.forEach(option => {
      expect(option.value).toBeDefined()
      expect(option.value.field).toBeDefined()
      expect(option.value.direction).toBeDefined()
      expect(option.label).toBeDefined()
      expect(option.labelKo).toBeDefined()
    })
  })

  it('should have unique field-direction combinations', () => {
    const keys = SORT_OPTIONS.map(o => `${o.value.field}-${o.value.direction}`)
    const uniqueKeys = new Set(keys)
    expect(uniqueKeys.size).toBe(keys.length)
  })
})

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty catalog', () => {
    const result = filterCatalog([], DEFAULT_FILTER_STATE)
    expect(result.items).toHaveLength(0)
    expect(result.totalCount).toBe(0)
    expect(result.filteredCount).toBe(0)
  })

  it('should handle null/undefined values in items', () => {
    const itemWithNulls = {
      ...mockItems[0],
      difficulty: undefined,
      teamTag: undefined,
      updatedAt: undefined,
    } as unknown as CatalogItem

    const result = applyFilters([itemWithNulls], DEFAULT_FILTER_STATE)
    expect(result).toHaveLength(1)
  })

  it('should handle special characters in search', () => {
    const tokens = parseSearchQuery('c++ python#')
    expect(tokens.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// DEFAULT_FILTER_STATE Tests
// ============================================================================

describe('DEFAULT_FILTER_STATE', () => {
  it('should have all required fields', () => {
    expect(DEFAULT_FILTER_STATE.query).toBe('')
    expect(DEFAULT_FILTER_STATE.type).toBe('all')
    expect(DEFAULT_FILTER_STATE.tags).toEqual([])
    expect(DEFAULT_FILTER_STATE.tagsOperator).toBe('AND')
    expect(DEFAULT_FILTER_STATE.difficulty).toBe('')
    expect(DEFAULT_FILTER_STATE.teamTag).toBe('')
    expect(DEFAULT_FILTER_STATE.status).toBe('all')
    expect(DEFAULT_FILTER_STATE.mcpEnabled).toBeNull()
    expect(DEFAULT_FILTER_STATE.likesRange).toEqual({})
    expect(DEFAULT_FILTER_STATE.updatedDateRange).toEqual({})
    expect(DEFAULT_FILTER_STATE.sort).toEqual({ field: 'updatedAt', direction: 'desc' })
  })
})
