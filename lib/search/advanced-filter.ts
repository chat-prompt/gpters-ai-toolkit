/**
 * Advanced Client-side Filtering System
 * 고급 클라이언트 측 필터링 시스템
 *
 * Features:
 * - Advanced search operators (AND, OR, NOT)
 * - Filter presets for quick access
 * - Multiple sort options
 * - Range filters
 * - Fuzzy matching with Levenshtein distance
 * - Filter count per option
 * - Filter history and saved filters
 */

import { CatalogItemSummary, ItemType, Difficulty, TeamTag, TAGS } from '../core/types'

// ============================================================================
// Types
// ============================================================================

/**
 * Search operators for advanced queries
 */
export type SearchOperator = 'AND' | 'OR' | 'NOT'

/**
 * Sort field options
 */
export type SortField = 'name' | 'updatedAt' | 'createdAt' | 'likes' | 'author'

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc'

/**
 * Sort configuration
 */
export interface SortConfig {
  field: SortField
  direction: SortDirection
}

/**
 * Preset filter configuration
 */
export interface FilterPreset {
  id: string
  name: string
  nameKo: string
  icon: string
  description: string
  filters: Partial<FilterState>
}

/**
 * Range filter configuration
 */
export interface RangeFilter {
  min?: number
  max?: number
}

/**
 * Date range filter
 */
export interface DateRangeFilter {
  after?: Date
  before?: Date
}

/**
 * Complete filter state
 */
export interface FilterState {
  query: string
  type: ItemType | 'all'
  tags: string[]
  tagsOperator: 'AND' | 'OR'  // AND = must have all, OR = any match
  difficulty: Difficulty | ''
  teamTag: TeamTag | ''
  status: 'published' | 'draft' | 'all'
  marketplaceEnabled: boolean | null  // null = all
  likesRange: RangeFilter
  updatedDateRange: DateRangeFilter
  sort: SortConfig
}

/**
 * Search token parsed from query
 */
export interface SearchToken {
  type: 'include' | 'exclude' | 'field'
  field?: string
  value: string
}

/**
 * Filter count for UI display
 */
export interface FilterCounts {
  types: Record<ItemType | 'all', number>
  tags: Record<string, number>
  difficulties: Record<Difficulty | '', number>
  teamTags: Record<TeamTag | '', number>
  statuses: Record<'published' | 'draft' | 'all', number>
  marketplaceEnabled: { true: number; false: number; all: number }
}

/**
 * Filter result with metadata
 */
export interface FilterResult {
  items: CatalogItemSummary[]
  counts: FilterCounts
  totalCount: number
  filteredCount: number
  appliedFilters: string[]
  sortedBy: SortConfig
}

/**
 * Saved filter for persistence
 */
export interface SavedFilter {
  id: string
  name: string
  createdAt: Date
  filters: FilterState
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default filter state
 */
export const DEFAULT_FILTER_STATE: FilterState = {
  query: '',
  type: 'all',
  tags: [],
  tagsOperator: 'AND',
  difficulty: '',
  teamTag: '',
  status: 'all',
  marketplaceEnabled: null,
  likesRange: {},
  updatedDateRange: {},
  sort: { field: 'updatedAt', direction: 'desc' },
}

/**
 * Sort options with labels
 */
export const SORT_OPTIONS: Array<{ value: SortConfig; label: string; labelKo: string }> = [
  { value: { field: 'updatedAt', direction: 'desc' }, label: 'Recently Updated', labelKo: '최근 업데이트순' },
  { value: { field: 'updatedAt', direction: 'asc' }, label: 'Oldest Updated', labelKo: '오래된 업데이트순' },
  { value: { field: 'createdAt', direction: 'desc' }, label: 'Newest First', labelKo: '최신순' },
  { value: { field: 'createdAt', direction: 'asc' }, label: 'Oldest First', labelKo: '오래된순' },
  { value: { field: 'name', direction: 'asc' }, label: 'Name (A-Z)', labelKo: '이름순 (A-Z)' },
  { value: { field: 'name', direction: 'desc' }, label: 'Name (Z-A)', labelKo: '이름순 (Z-A)' },
  { value: { field: 'likes', direction: 'desc' }, label: 'Most Popular', labelKo: '인기순' },
  { value: { field: 'likes', direction: 'asc' }, label: 'Least Popular', labelKo: '인기 낮은순' },
  { value: { field: 'author', direction: 'asc' }, label: 'Author (A-Z)', labelKo: '작성자순 (A-Z)' },
]

/**
 * Predefined filter presets
 */
export const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'new-this-week',
    name: 'New This Week',
    nameKo: '이번 주 신규',
    icon: '🆕',
    description: 'Items added in the last 7 days',
    filters: {
      updatedDateRange: {
        after: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
      sort: { field: 'createdAt', direction: 'desc' },
    },
  },
  {
    id: 'popular',
    name: 'Most Popular',
    nameKo: '인기 항목',
    icon: '🔥',
    description: 'Items with 5+ likes',
    filters: {
      likesRange: { min: 5 },
      sort: { field: 'likes', direction: 'desc' },
    },
  },
  {
    id: 'cli-ready',
    name: 'CLI Ready',
    nameKo: 'CLI 지원',
    icon: '⚡',
    description: 'Items that can be installed via CLI',
    filters: {
      marketplaceEnabled: true,
    },
  },
  {
    id: 'beginner-friendly',
    name: 'Beginner Friendly',
    nameKo: '초보자용',
    icon: '🌱',
    description: 'Easy difficulty items',
    filters: {
      difficulty: 'easy',
    },
  },
  {
    id: 'advanced',
    name: 'Advanced',
    nameKo: '고급',
    icon: '🎯',
    description: 'Hard difficulty items',
    filters: {
      difficulty: 'hard',
    },
  },
  {
    id: 'recently-updated',
    name: 'Recently Updated',
    nameKo: '최근 업데이트',
    icon: '🔄',
    description: 'Updated in the last 30 days',
    filters: {
      updatedDateRange: {
        after: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
      sort: { field: 'updatedAt', direction: 'desc' },
    },
  },
  {
    id: 'skills-only',
    name: 'Skills Only',
    nameKo: '스킬만',
    icon: '⚡',
    description: 'Filter to show only skills',
    filters: {
      type: 'skill',
    },
  },
  {
    id: 'agents-only',
    name: 'Agents Only',
    nameKo: '에이전트만',
    icon: '◈',
    description: 'Filter to show only agents',
    filters: {
      type: 'agent',
    },
  },
]

// ============================================================================
// Search Query Parsing
// ============================================================================

/**
 * Parse search query into tokens with operators
 * Supports: -term (exclude), field:value, "exact phrase", regular terms
 */
export function parseSearchQuery(query: string): SearchToken[] {
  const tokens: SearchToken[] = []
  const trimmed = query.trim()

  if (!trimmed) return tokens

  // Match patterns: "phrase", -exclude, field:value, word
  const pattern = /(?:"([^"]+)"|(-)?(\w+):(\S+)|(-)?(\S+))/g
  let match = pattern.exec(trimmed)

  while (match !== null) {
    if (match[1]) {
      // Quoted phrase
      tokens.push({ type: 'include', value: match[1] })
    } else if (match[3] && match[4]) {
      // Field:value
      tokens.push({
        type: match[2] ? 'exclude' : 'field',
        field: match[3].toLowerCase(),
        value: match[4],
      })
    } else if (match[6]) {
      // Regular term
      tokens.push({
        type: match[5] ? 'exclude' : 'include',
        value: match[6],
      })
    }
    match = pattern.exec(trimmed)
  }

  return tokens
}

/**
 * Check if item matches search tokens
 */
export function matchSearchTokens(item: CatalogItemSummary, tokens: SearchToken[]): boolean {
  if (tokens.length === 0) return true

  const searchableText = [
    item.name,
    item.description,
    item.author,
    item.id,
    ...item.tags.map(t => TAGS[t]?.label || t),
  ].join(' ').toLowerCase()

  for (const token of tokens) {
    const value = token.value.toLowerCase()

    if (token.type === 'exclude') {
      // Must NOT contain
      if (searchableText.includes(value)) return false
    } else if (token.type === 'field') {
      // Field-specific search
      const fieldValue = getFieldValue(item, token.field || '')
      if (!fieldValue.toLowerCase().includes(value)) return false
    } else {
      // Must contain
      if (!searchableText.includes(value)) return false
    }
  }

  return true
}

/**
 * Get field value from item for field:value search
 */
function getFieldValue(item: CatalogItemSummary, field: string): string {
  switch (field) {
    case 'tag':
    case 'tags':
      return item.tags.map(t => `${t} ${TAGS[t]?.label || ''}`).join(' ')
    case 'author':
      return item.author
    case 'type':
      return item.type
    case 'difficulty':
      return item.difficulty || ''
    case 'team':
      return item.teamTag || ''
    case 'name':
    case 'title':
      return item.name
    case 'id':
      return item.id
    default:
      return ''
  }
}

// ============================================================================
// Fuzzy Matching
// ============================================================================

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  const lenA = a.length
  const lenB = b.length

  if (lenA === 0) return lenB
  if (lenB === 0) return lenA

  // Initialize matrix
  for (let i = 0; i <= lenA; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= lenB; j++) {
    matrix[0][j] = j
  }

  // Fill matrix
  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      )
    }
  }

  return matrix[lenA][lenB]
}

/**
 * Calculate fuzzy match score (0-1, higher is better match)
 */
export function fuzzyMatchScore(query: string, target: string): number {
  const q = query.toLowerCase()
  const t = target.toLowerCase()

  // Exact match
  if (t.includes(q)) return 1

  // Calculate based on Levenshtein distance
  const distance = levenshteinDistance(q, t)
  const maxLen = Math.max(q.length, t.length)

  if (maxLen === 0) return 1

  return Math.max(0, 1 - distance / maxLen)
}

/**
 * Find best fuzzy matches for a query
 */
export function findFuzzyMatches(
  query: string,
  items: CatalogItemSummary[],
  options: { minScore?: number; maxResults?: number } = {}
): Array<{ item: CatalogItemSummary; score: number; matchedField: string }> {
  const { minScore = 0.5, maxResults = 10 } = options

  const results: Array<{ item: CatalogItemSummary; score: number; matchedField: string }> = []

  for (const item of items) {
    const fields = [
      { name: 'name', value: item.name },
      { name: 'description', value: item.description },
      { name: 'author', value: item.author },
      { name: 'id', value: item.id },
    ]

    let bestScore = 0
    let bestField = ''

    for (const field of fields) {
      const score = fuzzyMatchScore(query, field.value)
      if (score > bestScore) {
        bestScore = score
        bestField = field.name
      }
    }

    if (bestScore >= minScore) {
      results.push({ item, score: bestScore, matchedField: bestField })
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
}

// ============================================================================
// Core Filtering
// ============================================================================

/**
 * Apply filter state to catalog items
 */
export function applyFilters(items: CatalogItemSummary[], filters: FilterState): CatalogItemSummary[] {
  return items.filter(item => {
    // Type filter
    if (filters.type !== 'all' && item.type !== filters.type) {
      return false
    }

    // Tags filter
    if (filters.tags.length > 0) {
      if (filters.tagsOperator === 'AND') {
        // Must have ALL selected tags
        if (!filters.tags.every(tag => item.tags.includes(tag))) {
          return false
        }
      } else {
        // Must have ANY of selected tags
        if (!filters.tags.some(tag => item.tags.includes(tag))) {
          return false
        }
      }
    }

    // Difficulty filter
    if (filters.difficulty && item.difficulty !== filters.difficulty) {
      return false
    }

    // Team tag filter
    if (filters.teamTag && item.teamTag !== filters.teamTag) {
      return false
    }

    // Status filter
    if (filters.status !== 'all') {
      const isDraft = item.status === 'draft'
      if (filters.status === 'published' && isDraft) return false
      if (filters.status === 'draft' && !isDraft) return false
    }

    // Marketplace enabled filter
    if (filters.marketplaceEnabled !== null) {
      if (item.marketplaceEnabled !== filters.marketplaceEnabled) {
        return false
      }
    }

    // Likes range filter
    if (filters.likesRange.min !== undefined && item.likes < filters.likesRange.min) {
      return false
    }
    if (filters.likesRange.max !== undefined && item.likes > filters.likesRange.max) {
      return false
    }

    // Updated date range filter
    if (filters.updatedDateRange.after) {
      const updatedAt = item.updatedAt ? new Date(item.updatedAt) : null
      if (!updatedAt || updatedAt < filters.updatedDateRange.after) {
        return false
      }
    }
    if (filters.updatedDateRange.before) {
      const updatedAt = item.updatedAt ? new Date(item.updatedAt) : null
      if (!updatedAt || updatedAt > filters.updatedDateRange.before) {
        return false
      }
    }

    // Search query
    if (filters.query.trim()) {
      const tokens = parseSearchQuery(filters.query)
      if (!matchSearchTokens(item, tokens)) {
        return false
      }
    }

    return true
  })
}

/**
 * Sort items by configuration
 */
export function sortItems(items: CatalogItemSummary[], config: SortConfig): CatalogItemSummary[] {
  const sorted = [...items]

  sorted.sort((a, b) => {
    let aVal: string | number | null
    let bVal: string | number | null

    switch (config.field) {
      case 'name':
        aVal = a.name.toLowerCase()
        bVal = b.name.toLowerCase()
        break
      case 'updatedAt':
        aVal = a.updatedAt || ''
        bVal = b.updatedAt || ''
        break
      case 'createdAt':
        aVal = a.createdAt || ''
        bVal = b.createdAt || ''
        break
      case 'likes':
        aVal = a.likes
        bVal = b.likes
        break
      case 'author':
        aVal = a.author.toLowerCase()
        bVal = b.author.toLowerCase()
        break
      default:
        return 0
    }

    if (aVal === bVal) return 0
    if (aVal === null || aVal === '') return 1
    if (bVal === null || bVal === '') return -1

    const comparison = aVal < bVal ? -1 : 1
    return config.direction === 'asc' ? comparison : -comparison
  })

  return sorted
}

// ============================================================================
// Filter Counts
// ============================================================================

/**
 * Calculate filter counts for UI display
 */
export function calculateFilterCounts(
  items: CatalogItemSummary[],
  currentFilters: FilterState
): FilterCounts {
  // For counts, we apply all filters EXCEPT the one we're counting
  const counts: FilterCounts = {
    types: { all: 0, skill: 0, agent: 0, command: 0, guide: 0, hook: 0 },
    tags: {},
    difficulties: { '': 0, easy: 0, medium: 0, hard: 0 },
    teamTags: { '': 0, general: 0, platform: 0, ai: 0, data: 0, product: 0, infra: 0 },
    statuses: { all: 0, published: 0, draft: 0 },
    marketplaceEnabled: { true: 0, false: 0, all: 0 },
  }

  // Get items filtered by everything except what we're counting
  const baseFiltersExceptType = { ...currentFilters, type: 'all' as const }
  const baseFiltersExceptTags = { ...currentFilters, tags: [] }
  const baseFiltersExceptDifficulty = { ...currentFilters, difficulty: '' as const }
  const baseFiltersExceptTeamTag = { ...currentFilters, teamTag: '' as const }
  const baseFiltersExceptStatus = { ...currentFilters, status: 'all' as const }
  const baseFiltersExceptMarketplace = { ...currentFilters, marketplaceEnabled: null }

  const itemsForTypeCount = applyFilters(items, baseFiltersExceptType)
  const itemsForTagCount = applyFilters(items, baseFiltersExceptTags)
  const itemsForDifficultyCount = applyFilters(items, baseFiltersExceptDifficulty)
  const itemsForTeamTagCount = applyFilters(items, baseFiltersExceptTeamTag)
  const itemsForStatusCount = applyFilters(items, baseFiltersExceptStatus)
  const itemsForMarketplaceCount = applyFilters(items, baseFiltersExceptMarketplace)

  // Count types
  counts.types.all = itemsForTypeCount.length
  for (const item of itemsForTypeCount) {
    counts.types[item.type]++
  }

  // Count tags
  for (const item of itemsForTagCount) {
    for (const tag of item.tags) {
      counts.tags[tag] = (counts.tags[tag] || 0) + 1
    }
  }

  // Count difficulties
  for (const item of itemsForDifficultyCount) {
    const diff = item.difficulty || ''
    counts.difficulties[diff]++
  }
  counts.difficulties[''] = itemsForDifficultyCount.length

  // Count team tags
  for (const item of itemsForTeamTagCount) {
    const team = item.teamTag || ''
    if (team in counts.teamTags) {
      counts.teamTags[team as TeamTag]++
    }
  }
  counts.teamTags[''] = itemsForTeamTagCount.length

  // Count statuses
  counts.statuses.all = itemsForStatusCount.length
  for (const item of itemsForStatusCount) {
    if (item.status === 'draft') {
      counts.statuses.draft++
    } else {
      counts.statuses.published++
    }
  }

  // Count marketplace enabled
  counts.marketplaceEnabled.all = itemsForMarketplaceCount.length
  for (const item of itemsForMarketplaceCount) {
    if (item.marketplaceEnabled) {
      counts.marketplaceEnabled.true++
    } else {
      counts.marketplaceEnabled.false++
    }
  }

  return counts
}

// ============================================================================
// Complete Filtering Function
// ============================================================================

/**
 * Apply complete filtering pipeline
 */
export function filterCatalog(
  items: CatalogItemSummary[],
  filters: FilterState
): FilterResult {
  // Apply filters
  const filtered = applyFilters(items, filters)

  // Sort results
  const sorted = sortItems(filtered, filters.sort)

  // Calculate counts
  const counts = calculateFilterCounts(items, filters)

  // Build applied filters list for UI
  const appliedFilters: string[] = []
  if (filters.query) appliedFilters.push(`검색: "${filters.query}"`)
  if (filters.type !== 'all') appliedFilters.push(`타입: ${filters.type}`)
  if (filters.tags.length > 0) appliedFilters.push(`태그: ${filters.tags.join(', ')}`)
  if (filters.difficulty) appliedFilters.push(`난이도: ${filters.difficulty}`)
  if (filters.teamTag) appliedFilters.push(`팀: ${filters.teamTag}`)
  if (filters.status !== 'all') appliedFilters.push(`상태: ${filters.status}`)
  if (filters.marketplaceEnabled !== null) {
    appliedFilters.push(`CLI: ${filters.marketplaceEnabled ? '지원' : '미지원'}`)
  }
  if (filters.likesRange.min !== undefined) {
    appliedFilters.push(`좋아요 ≥ ${filters.likesRange.min}`)
  }
  if (filters.likesRange.max !== undefined) {
    appliedFilters.push(`좋아요 ≤ ${filters.likesRange.max}`)
  }
  if (filters.updatedDateRange.after) {
    appliedFilters.push(`업데이트 시작: ${filters.updatedDateRange.after.toLocaleDateString()}`)
  }
  if (filters.updatedDateRange.before) {
    appliedFilters.push(`업데이트 종료: ${filters.updatedDateRange.before.toLocaleDateString()}`)
  }

  return {
    items: sorted,
    counts,
    totalCount: items.length,
    filteredCount: sorted.length,
    appliedFilters,
    sortedBy: filters.sort,
  }
}

// ============================================================================
// Filter Presets
// ============================================================================

/**
 * Apply a preset to current filter state
 */
export function applyPreset(currentState: FilterState, preset: FilterPreset): FilterState {
  return {
    ...DEFAULT_FILTER_STATE,
    ...preset.filters,
  }
}

/**
 * Get preset by ID
 */
export function getPresetById(id: string): FilterPreset | undefined {
  return FILTER_PRESETS.find(p => p.id === id)
}

// ============================================================================
// Filter Persistence
// ============================================================================

const SAVED_FILTERS_KEY = 'gpters-toolkit-saved-filters'
const FILTER_HISTORY_KEY = 'gpters-toolkit-filter-history'
const MAX_HISTORY_ITEMS = 10

/**
 * Save filter to local storage
 */
export function saveFilter(name: string, filters: FilterState): SavedFilter {
  const saved: SavedFilter = {
    id: `saved-${Date.now()}`,
    name,
    createdAt: new Date(),
    filters,
  }

  if (typeof window === 'undefined') return saved

  const existing = getSavedFilters()
  existing.push(saved)
  localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(existing))

  return saved
}

/**
 * Get all saved filters
 */
export function getSavedFilters(): SavedFilter[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = localStorage.getItem(SAVED_FILTERS_KEY)
    if (!stored) return []
    return JSON.parse(stored)
  } catch {
    return []
  }
}

/**
 * Delete a saved filter
 */
export function deleteSavedFilter(id: string): void {
  if (typeof window === 'undefined') return

  const filters = getSavedFilters().filter(f => f.id !== id)
  localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(filters))
}

/**
 * Add filter state to history
 */
export function addToFilterHistory(filters: FilterState): void {
  if (typeof window === 'undefined') return

  try {
    const history = getFilterHistory()

    // Don't add if same as most recent
    if (history.length > 0 && JSON.stringify(history[0]) === JSON.stringify(filters)) {
      return
    }

    history.unshift(filters)
    const trimmed = history.slice(0, MAX_HISTORY_ITEMS)
    localStorage.setItem(FILTER_HISTORY_KEY, JSON.stringify(trimmed))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get filter history
 */
export function getFilterHistory(): FilterState[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = localStorage.getItem(FILTER_HISTORY_KEY)
    if (!stored) return []
    return JSON.parse(stored)
  } catch {
    return []
  }
}

/**
 * Clear filter history
 */
export function clearFilterHistory(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(FILTER_HISTORY_KEY)
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if filter state has any active filters (non-default)
 */
export function hasActiveFilters(filters: FilterState): boolean {
  return (
    filters.query !== '' ||
    filters.type !== 'all' ||
    filters.tags.length > 0 ||
    filters.difficulty !== '' ||
    filters.teamTag !== '' ||
    filters.status !== 'all' ||
    filters.marketplaceEnabled !== null ||
    filters.likesRange.min !== undefined ||
    filters.likesRange.max !== undefined ||
    filters.updatedDateRange.after !== undefined ||
    filters.updatedDateRange.before !== undefined
  )
}

/**
 * Count number of active filters
 */
export function countActiveFilters(filters: FilterState): number {
  let count = 0
  if (filters.query !== '') count++
  if (filters.type !== 'all') count++
  if (filters.tags.length > 0) count += filters.tags.length
  if (filters.difficulty !== '') count++
  if (filters.teamTag !== '') count++
  if (filters.status !== 'all') count++
  if (filters.marketplaceEnabled !== null) count++
  if (filters.likesRange.min !== undefined) count++
  if (filters.likesRange.max !== undefined) count++
  if (filters.updatedDateRange.after !== undefined) count++
  if (filters.updatedDateRange.before !== undefined) count++
  return count
}

/**
 * Create filter state from URL search params
 */
export function filterStateFromParams(params: URLSearchParams): Partial<FilterState> {
  const state: Partial<FilterState> = {}

  if (params.has('q')) state.query = params.get('q') || ''
  if (params.has('type')) state.type = params.get('type') as ItemType | 'all'
  if (params.has('tags')) state.tags = params.get('tags')?.split(',').filter(Boolean) || []
  if (params.has('tagsOp')) state.tagsOperator = params.get('tagsOp') as 'AND' | 'OR'
  if (params.has('difficulty')) state.difficulty = params.get('difficulty') as Difficulty
  if (params.has('team')) state.teamTag = params.get('team') as TeamTag
  if (params.has('status')) state.status = params.get('status') as 'published' | 'draft' | 'all'
  if (params.has('cli')) state.marketplaceEnabled = params.get('cli') === 'true'
  if (params.has('likesMin')) state.likesRange = { ...state.likesRange, min: parseInt(params.get('likesMin') || '0') }
  if (params.has('likesMax')) state.likesRange = { ...state.likesRange, max: parseInt(params.get('likesMax') || '0') }
  if (params.has('updatedAfter')) state.updatedDateRange = { ...state.updatedDateRange, after: new Date(params.get('updatedAfter') || '') }
  if (params.has('updatedBefore')) state.updatedDateRange = { ...state.updatedDateRange, before: new Date(params.get('updatedBefore') || '') }
  if (params.has('sortField') && params.has('sortDir')) {
    state.sort = {
      field: params.get('sortField') as SortField,
      direction: params.get('sortDir') as SortDirection,
    }
  }

  return state
}

/**
 * Convert filter state to URL search params
 */
export function filterStateToParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams()

  if (filters.query) params.set('q', filters.query)
  if (filters.type !== 'all') params.set('type', filters.type)
  if (filters.tags.length > 0) params.set('tags', filters.tags.join(','))
  if (filters.tagsOperator !== 'AND') params.set('tagsOp', filters.tagsOperator)
  if (filters.difficulty) params.set('difficulty', filters.difficulty)
  if (filters.teamTag) params.set('team', filters.teamTag)
  if (filters.status !== 'all') params.set('status', filters.status)
  if (filters.marketplaceEnabled !== null) params.set('cli', String(filters.marketplaceEnabled))
  if (filters.likesRange.min !== undefined) params.set('likesMin', String(filters.likesRange.min))
  if (filters.likesRange.max !== undefined) params.set('likesMax', String(filters.likesRange.max))
  if (filters.updatedDateRange.after) params.set('updatedAfter', filters.updatedDateRange.after.toISOString())
  if (filters.updatedDateRange.before) params.set('updatedBefore', filters.updatedDateRange.before.toISOString())
  if (filters.sort.field !== 'updatedAt' || filters.sort.direction !== 'desc') {
    params.set('sortField', filters.sort.field)
    params.set('sortDir', filters.sort.direction)
  }

  return params
}

/**
 * Get human-readable description of sort config
 */
export function getSortDescription(config: SortConfig): string {
  const option = SORT_OPTIONS.find(
    o => o.value.field === config.field && o.value.direction === config.direction
  )
  return option?.labelKo || '정렬'
}
