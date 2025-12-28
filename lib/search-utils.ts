/**
 * Natural Language Search Utilities
 *
 * Enhances search functionality with:
 * - Korean to English keyword mappings
 * - Common developer phrase synonyms
 * - Fuzzy matching with description content
 * - Tag inference from natural language queries
 */

import type { CatalogItemSummary, ItemType } from './types'

// Korean developer terms mapped to English keywords and tags
export const KOREAN_KEYWORD_MAPPINGS: Record<string, string[]> = {
  // Code Review / Quality
  '코드 리뷰': ['code', 'review', 'code-review'],
  '코드리뷰': ['code', 'review', 'code-review'],
  '리뷰': ['review'],
  '검토': ['review', 'analysis'],
  '품질': ['quality', 'code'],

  // Database / SQL
  '데이터베이스': ['database', 'sql', 'db'],
  '디비': ['database', 'sql', 'db'],
  'DB': ['database', 'sql', 'db'],
  '스키마': ['schema', 'database', 'sql'],
  '쿼리': ['query', 'sql', 'database'],
  '테이블': ['table', 'database', 'sql'],

  // Git / Version Control
  '커밋': ['commit', 'git'],
  '깃': ['git'],
  '브랜치': ['branch', 'git'],
  'PR': ['pull-request', 'git', 'pr'],
  '풀리퀘': ['pull-request', 'git', 'pr'],
  '풀리퀘스트': ['pull-request', 'git', 'pr'],
  '머지': ['merge', 'git'],

  // Documentation
  '문서': ['documentation', 'docs', 'writing'],
  '문서화': ['documentation', 'docs'],
  '작성': ['writing', 'documentation'],
  'README': ['readme', 'documentation'],
  '리드미': ['readme', 'documentation'],

  // Testing
  '테스트': ['test', 'testing'],
  '유닛테스트': ['unit-test', 'testing'],
  '단위테스트': ['unit-test', 'testing'],
  'E2E': ['e2e', 'testing'],

  // Debugging / Troubleshooting
  '디버깅': ['debug', 'debugging'],
  '디버그': ['debug', 'debugging'],
  '버그': ['bug', 'debugging', 'fix'],
  '오류': ['error', 'debugging', 'fix'],
  '에러': ['error', 'debugging', 'fix'],
  '문제': ['issue', 'debugging', 'troubleshoot'],

  // Refactoring / Improvement
  '리팩토링': ['refactoring', 'refactor'],
  '리팩터링': ['refactoring', 'refactor'],
  '개선': ['improve', 'refactoring', 'optimization'],
  '최적화': ['optimization', 'performance'],

  // API
  'API': ['api'],
  '엔드포인트': ['endpoint', 'api'],
  'REST': ['rest', 'api'],

  // Analysis
  '분석': ['analysis', 'analyze'],
  '코드분석': ['code-analysis', 'analysis'],

  // Learning / Setup
  '학습': ['learning', 'tutorial'],
  '튜토리얼': ['tutorial', 'learning', 'guide'],
  '설정': ['setup', 'configuration', 'config'],
  '설치': ['install', 'setup'],

  // Productivity
  '생산성': ['productivity'],
  '자동화': ['automation', 'productivity'],
  '효율': ['efficiency', 'productivity'],

  // Collaboration
  '협업': ['collaboration', 'team'],
  '팀': ['team', 'collaboration'],
  '회의': ['meeting'],

  // Infrastructure
  '인프라': ['infrastructure', 'infra'],
  '배포': ['deployment', 'deploy'],
  '도커': ['docker', 'container'],
  'CI/CD': ['ci-cd', 'deployment'],

  // Security
  '보안': ['security'],
  '인증': ['auth', 'authentication'],
}

// Common natural language phrases mapped to search intents
export const NATURAL_LANGUAGE_PATTERNS: Array<{
  pattern: RegExp
  keywords: string[]
  itemTypes?: ItemType[]
}> = [
  // Help/Assistance patterns (Korean)
  { pattern: /(.+)(도와줘|도움|해줘|할래|하고\s*싶)/, keywords: [], itemTypes: undefined },
  { pattern: /(.+)(알려줘|알고\s*싶|찾아줘|보여줘)/, keywords: [], itemTypes: undefined },
  { pattern: /(.+)(방법|하는\s*법|어떻게)/, keywords: ['guide', 'how-to'], itemTypes: ['guide', 'skill'] },

  // Specific task patterns
  { pattern: /코드\s*(리뷰|검토)/, keywords: ['code', 'review'], itemTypes: ['agent', 'skill'] },
  { pattern: /(데이터베이스|DB|디비)\s*(스키마|구조|설계)/, keywords: ['database', 'schema'], itemTypes: ['skill'] },
  { pattern: /(커밋|commit)\s*(메시지|message|작성)/, keywords: ['commit', 'git', 'message'], itemTypes: ['command', 'skill'] },
  { pattern: /(PR|풀리퀘|pull\s*request)\s*(작성|만들|생성)/, keywords: ['pr', 'pull-request'], itemTypes: ['command', 'skill'] },
  { pattern: /(문서|docs?|documentation)\s*(작성|생성|만들)/, keywords: ['documentation', 'writing'], itemTypes: ['skill', 'agent'] },
  { pattern: /(테스트|test)\s*(작성|생성|만들)/, keywords: ['test', 'testing'], itemTypes: ['skill', 'command'] },
  { pattern: /(버그|bug|오류|에러)\s*(찾|수정|해결|fix)/, keywords: ['debug', 'fix', 'debugging'], itemTypes: ['agent', 'skill'] },
  { pattern: /(리팩토링|refactor)/, keywords: ['refactoring', 'refactor'], itemTypes: ['skill', 'agent'] },
]

// Action verb mappings (Korean verbs to English action keywords)
export const ACTION_VERBS: Record<string, string[]> = {
  '작성': ['write', 'create', 'generate'],
  '생성': ['create', 'generate'],
  '만들': ['create', 'make', 'generate'],
  '찾': ['find', 'search', 'locate'],
  '검색': ['search', 'find'],
  '분석': ['analyze', 'analysis'],
  '수정': ['fix', 'edit', 'modify'],
  '개선': ['improve', 'enhance'],
  '확인': ['check', 'verify', 'validate'],
  '검토': ['review', 'check'],
  '도와': ['help', 'assist'],
  '알려': ['tell', 'show', 'explain'],
  '보여': ['show', 'display'],
}

export interface SearchResult {
  item: CatalogItemSummary
  score: number
  matchedKeywords: string[]
  matchType: 'exact' | 'keyword' | 'fuzzy' | 'natural'
}

export interface NaturalLanguageSearchOptions {
  includeDescriptions?: boolean
  maxResults?: number
  minScore?: number
}

/**
 * Extract keywords from a natural language Korean query
 */
export function extractKeywords(query: string): string[] {
  const keywords: Set<string> = new Set()
  const lowerQuery = query.toLowerCase()

  // Check Korean keyword mappings
  for (const [korean, english] of Object.entries(KOREAN_KEYWORD_MAPPINGS)) {
    if (query.includes(korean) || lowerQuery.includes(korean.toLowerCase())) {
      english.forEach(kw => keywords.add(kw))
    }
  }

  // Check natural language patterns
  for (const { pattern, keywords: patternKeywords } of NATURAL_LANGUAGE_PATTERNS) {
    if (pattern.test(query)) {
      patternKeywords.forEach(kw => keywords.add(kw))
    }
  }

  // Check action verbs
  for (const [verb, actions] of Object.entries(ACTION_VERBS)) {
    if (query.includes(verb)) {
      actions.forEach(kw => keywords.add(kw))
    }
  }

  // Add original query words (for English queries or mixed)
  const words = lowerQuery.split(/\s+/).filter(w => w.length >= 2)
  words.forEach(word => keywords.add(word))

  return Array.from(keywords)
}

/**
 * Infer item types from natural language query
 */
export function inferItemTypes(query: string): ItemType[] | undefined {
  for (const { pattern, itemTypes } of NATURAL_LANGUAGE_PATTERNS) {
    if (pattern.test(query) && itemTypes) {
      return itemTypes
    }
  }

  // Check for explicit type mentions
  const typePatterns: Array<{ pattern: RegExp; type: ItemType }> = [
    { pattern: /(에이전트|agent)/i, type: 'agent' },
    { pattern: /(스킬|skill)/i, type: 'skill' },
    { pattern: /(커맨드|command|명령)/i, type: 'command' },
    { pattern: /(가이드|guide|튜토리얼)/i, type: 'guide' },
    { pattern: /(훅|hook)/i, type: 'hook' },
  ]

  const types: ItemType[] = []
  for (const { pattern, type } of typePatterns) {
    if (pattern.test(query)) {
      types.push(type)
    }
  }

  return types.length > 0 ? types : undefined
}

/**
 * Calculate similarity score between query and item
 */
export function calculateScore(
  item: CatalogItemSummary,
  keywords: string[],
  originalQuery: string,
  options: NaturalLanguageSearchOptions = {}
): { score: number; matchedKeywords: string[]; matchType: SearchResult['matchType'] } {
  const { includeDescriptions = true } = options
  const lowerQuery = originalQuery.toLowerCase()

  let score = 0
  const matchedKeywords: string[] = []
  let matchType: SearchResult['matchType'] = 'fuzzy'

  const lowerName = item.name.toLowerCase()
  const lowerDescription = item.description.toLowerCase()
  const lowerTags = item.tags.map(t => t.toLowerCase())
  const lowerId = item.id.toLowerCase()

  // Exact name match (highest priority)
  if (lowerName === lowerQuery || lowerId === lowerQuery) {
    score += 100
    matchType = 'exact'
    matchedKeywords.push(item.name)
  } else if (lowerName.includes(lowerQuery) || lowerId.includes(lowerQuery)) {
    score += 80
    matchType = 'exact'
    matchedKeywords.push(item.name)
  }

  // Keyword matching
  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase()

    // Name contains keyword
    if (lowerName.includes(lowerKeyword)) {
      score += 30
      matchedKeywords.push(keyword)
      if (matchType !== 'exact') matchType = 'keyword'
    }

    // ID contains keyword
    if (lowerId.includes(lowerKeyword)) {
      score += 25
      matchedKeywords.push(keyword)
      if (matchType !== 'exact') matchType = 'keyword'
    }

    // Tag matches keyword
    if (lowerTags.some(tag => tag.includes(lowerKeyword) || lowerKeyword.includes(tag))) {
      score += 20
      matchedKeywords.push(keyword)
      if (matchType !== 'exact' && matchType !== 'keyword') matchType = 'keyword'
    }

    // Description contains keyword
    if (includeDescriptions && lowerDescription.includes(lowerKeyword)) {
      score += 10
      matchedKeywords.push(keyword)
      if (matchType !== 'exact' && matchType !== 'keyword') matchType = 'natural'
    }
  }

  // Bonus for Korean description matching original Korean query
  const koreanChars = originalQuery.match(/[\u3131-\uD79D]/g)
  if (koreanChars && koreanChars.length > 0) {
    // Check if Korean parts of query appear in description
    const koreanWords = originalQuery.match(/[\u3131-\uD79D]+/g) || []
    for (const word of koreanWords) {
      if (word.length >= 2 && lowerDescription.includes(word)) {
        score += 15
        matchedKeywords.push(word)
      }
    }
  }

  return { score, matchedKeywords: [...new Set(matchedKeywords)], matchType }
}

/**
 * Enhanced natural language search
 */
export function naturalLanguageSearch(
  catalog: CatalogItemSummary[],
  query: string,
  options: NaturalLanguageSearchOptions = {}
): SearchResult[] {
  const { maxResults = 20, minScore = 10 } = options

  if (!query.trim()) return []

  const keywords = extractKeywords(query)
  const inferredTypes = inferItemTypes(query)

  // Score all items
  const results: SearchResult[] = []

  for (const item of catalog) {
    // Filter by inferred type if applicable
    if (inferredTypes && inferredTypes.length > 0 && !inferredTypes.includes(item.type)) {
      continue
    }

    const { score, matchedKeywords, matchType } = calculateScore(item, keywords, query, options)

    if (score >= minScore) {
      results.push({
        item,
        score,
        matchedKeywords,
        matchType,
      })
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score)

  return results.slice(0, maxResults)
}

/**
 * Generate search suggestions based on common queries
 */
export const COMMON_SEARCH_SUGGESTIONS: Array<{
  query: string
  description: string
  category: 'code' | 'docs' | 'git' | 'db' | 'test' | 'general'
}> = [
  { query: '코드 리뷰 도와줘', description: 'Code review assistance', category: 'code' },
  { query: '데이터베이스 스키마 알려줘', description: 'Database schema reference', category: 'db' },
  { query: 'git 커밋 메시지 작성', description: 'Git commit message helper', category: 'git' },
  { query: 'PR 리뷰 해줘', description: 'Pull request review', category: 'git' },
  { query: '테스트 작성 도와줘', description: 'Test writing assistance', category: 'test' },
  { query: '문서 작성 해줘', description: 'Documentation writing', category: 'docs' },
  { query: 'API 분석 해줘', description: 'API analysis', category: 'code' },
  { query: '버그 찾아줘', description: 'Bug detection', category: 'code' },
  { query: '리팩토링 도와줘', description: 'Refactoring assistance', category: 'code' },
  { query: '코드 분석 해줘', description: 'Code analysis', category: 'code' },
]

/**
 * Get relevant search suggestions based on partial query
 */
export function getSearchSuggestions(
  partialQuery: string,
  limit: number = 5
): typeof COMMON_SEARCH_SUGGESTIONS {
  if (!partialQuery.trim()) {
    return COMMON_SEARCH_SUGGESTIONS.slice(0, limit)
  }

  const lowerQuery = partialQuery.toLowerCase()
  const keywords = extractKeywords(partialQuery)

  // Score suggestions based on relevance
  const scored = COMMON_SEARCH_SUGGESTIONS.map(suggestion => {
    let score = 0
    const lowerSuggestion = suggestion.query.toLowerCase()

    // Direct match
    if (lowerSuggestion.includes(lowerQuery)) {
      score += 50
    }

    // Keyword overlap
    const suggestionKeywords = extractKeywords(suggestion.query)
    for (const kw of keywords) {
      if (suggestionKeywords.includes(kw)) {
        score += 10
      }
    }

    return { ...suggestion, score }
  })

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/**
 * Generate "Did you mean..." suggestions for queries with no results
 */
export function getDidYouMeanSuggestions(
  query: string,
  catalog: CatalogItemSummary[],
  limit: number = 3
): string[] {
  const suggestions: Array<{ text: string; score: number }> = []

  // Get all unique terms from catalog
  const catalogTerms = new Set<string>()
  for (const item of catalog) {
    // Add name words
    item.name.split(/\s+/).forEach(w => catalogTerms.add(w.toLowerCase()))
    // Add tags
    item.tags.forEach(t => catalogTerms.add(t.toLowerCase()))
  }

  // Find similar terms using simple Levenshtein-like comparison
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2)

  for (const queryWord of queryWords) {
    for (const term of catalogTerms) {
      const similarity = calculateStringSimilarity(queryWord, term)
      if (similarity > 0.5 && similarity < 1) {
        suggestions.push({ text: term, score: similarity })
      }
    }
  }

  // Also check Korean mappings for possible corrections
  for (const korean of Object.keys(KOREAN_KEYWORD_MAPPINGS)) {
    const similarity = calculateStringSimilarity(query.toLowerCase(), korean.toLowerCase())
    if (similarity > 0.4) {
      suggestions.push({ text: korean, score: similarity })
    }
  }

  // Deduplicate and sort
  const unique = new Map<string, number>()
  for (const { text, score } of suggestions) {
    if (!unique.has(text) || unique.get(text)! < score) {
      unique.set(text, score)
    }
  }

  return Array.from(unique.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([text]) => text)
}

/**
 * Simple string similarity calculation (normalized)
 */
function calculateStringSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length === 0 || b.length === 0) return 0

  // Simple character overlap ratio
  const longer = a.length > b.length ? a : b
  const shorter = a.length > b.length ? b : a

  let matches = 0
  const shorterChars = shorter.split('')

  for (const char of shorterChars) {
    if (longer.includes(char)) {
      matches++
    }
  }

  return matches / longer.length
}
