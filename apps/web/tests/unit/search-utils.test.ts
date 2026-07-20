import { describe, it, expect } from 'vitest'
import {
  extractKeywords,
  inferItemTypes,
  calculateScore,
  naturalLanguageSearch,
  getSearchSuggestions,
  getDidYouMeanSuggestions,
  KOREAN_KEYWORD_MAPPINGS,
  NATURAL_LANGUAGE_PATTERNS,
  COMMON_SEARCH_SUGGESTIONS,
} from '@/lib/search/search-utils'
import type { CatalogItem } from '@/lib/core/types'

// Mock catalog items for testing
const mockCatalog: CatalogItem[] = [
  {
    id: 'code-reviewer',
    type: 'agent',
    name: 'Code Reviewer',
    description: '코드 리뷰를 도와주는 AI 에이전트입니다. Pull Request의 코드를 분석하고 피드백을 제공합니다.',
    author: 'gpters',
    tags: ['code', 'review', 'quality'],
    likes: 10,
    content: '',
  },
  {
    id: 'data-source-reference',
    type: 'skill',
    name: 'Data Source Reference',
    description: '데이터베이스 스키마와 테이블 구조를 참조할 수 있는 스킬입니다. SQL 쿼리 작성에 도움이 됩니다.',
    author: 'gpters',
    tags: ['database', 'sql', 'reference'],
    likes: 5,
    content: '',
  },
  {
    id: 'git-commit-helper',
    type: 'command',
    name: 'Git Commit Helper',
    description: 'Git 커밋 메시지를 작성해주는 커맨드입니다. 변경 사항을 분석하여 적절한 커밋 메시지를 제안합니다.',
    author: 'developer',
    tags: ['git', 'commit', 'productivity'],
    likes: 8,
    content: '',
  },
  {
    id: 'api-analyzer',
    type: 'skill',
    name: 'API Analyzer',
    description: 'API 엔드포인트를 분석하고 문서화하는 스킬입니다.',
    author: 'gpters',
    tags: ['api', 'analysis', 'documentation'],
    likes: 3,
    content: '',
  },
  {
    id: 'test-generator',
    type: 'agent',
    name: 'Test Generator',
    description: '테스트 코드를 자동으로 생성해주는 에이전트입니다. 유닛 테스트와 통합 테스트를 작성합니다.',
    author: 'gpters',
    tags: ['testing', 'automation', 'code'],
    likes: 7,
    content: '',
  },
  {
    id: 'getting-started',
    type: 'guide',
    name: 'Getting Started Guide',
    description: 'Claude Code 시작하기 가이드입니다. 설치부터 기본 사용법까지 안내합니다.',
    author: 'gpters',
    tags: ['beginner', 'setup', 'learning'],
    likes: 15,
    content: '',
  },
]

describe('Search Utils', () => {
  describe('extractKeywords', () => {
    it('extracts English keywords from Korean phrase "코드 리뷰"', () => {
      const keywords = extractKeywords('코드 리뷰')
      expect(keywords).toContain('code')
      expect(keywords).toContain('review')
    })

    it('extracts keywords from "데이터베이스 스키마"', () => {
      const keywords = extractKeywords('데이터베이스 스키마')
      expect(keywords).toContain('database')
      expect(keywords).toContain('sql')
      expect(keywords).toContain('schema')
    })

    it('extracts keywords from "git 커밋 메시지"', () => {
      const keywords = extractKeywords('git 커밋 메시지')
      expect(keywords).toContain('git')
      expect(keywords).toContain('commit')
    })

    it('extracts keywords from action verbs like "도와줘"', () => {
      const keywords = extractKeywords('코드 리뷰 도와줘')
      expect(keywords).toContain('help')
      expect(keywords).toContain('code')
      expect(keywords).toContain('review')
    })

    it('handles English-only queries', () => {
      const keywords = extractKeywords('code review')
      expect(keywords).toContain('code')
      expect(keywords).toContain('review')
    })

    it('handles mixed Korean and English', () => {
      const keywords = extractKeywords('API 분석')
      expect(keywords).toContain('api')
      expect(keywords).toContain('analysis')
      expect(keywords).toContain('analyze')
    })

    it('extracts keywords from PR-related queries', () => {
      const keywords = extractKeywords('PR 리뷰 해줘')
      expect(keywords).toContain('pull-request')
      expect(keywords).toContain('pr')
      expect(keywords).toContain('review')
    })

    it('extracts keywords from debugging queries', () => {
      const keywords = extractKeywords('버그 찾아줘')
      expect(keywords).toContain('bug')
      expect(keywords).toContain('debugging')
      expect(keywords).toContain('find')
    })
  })

  describe('inferItemTypes', () => {
    it('infers agent type for code review queries', () => {
      const types = inferItemTypes('코드 리뷰')
      expect(types).toContain('agent')
    })

    it('infers skill type for database schema queries', () => {
      const types = inferItemTypes('데이터베이스 스키마 구조')
      expect(types).toContain('skill')
    })

    it('infers command type for commit message queries', () => {
      const types = inferItemTypes('커밋 메시지 작성')
      expect(types).toContain('command')
    })

    it('infers guide type for tutorial/how-to queries', () => {
      const types = inferItemTypes('사용 방법 알려줘')
      expect(types).toContain('guide')
    })

    it('returns undefined for ambiguous queries', () => {
      const types = inferItemTypes('something random')
      expect(types).toBeUndefined()
    })

    it('detects explicit type mentions in Korean', () => {
      const agentTypes = inferItemTypes('에이전트 찾아줘')
      expect(agentTypes).toContain('agent')

      const skillTypes = inferItemTypes('스킬 목록')
      expect(skillTypes).toContain('skill')

      const commandTypes = inferItemTypes('커맨드 실행')
      expect(commandTypes).toContain('command')
    })
  })

  describe('calculateScore', () => {
    const codeReviewerItem = mockCatalog.find(i => i.id === 'code-reviewer')!

    it('gives high score for exact name match', () => {
      const { score, matchType } = calculateScore(codeReviewerItem, [], 'code reviewer')
      expect(score).toBeGreaterThanOrEqual(80)
      expect(matchType).toBe('exact')
    })

    it('gives score for keyword matches in name', () => {
      const { score, matchedKeywords } = calculateScore(codeReviewerItem, ['code', 'review'], 'code')
      expect(score).toBeGreaterThan(0)
      expect(matchedKeywords).toContain('code')
    })

    it('gives score for tag matches', () => {
      const { score, matchedKeywords } = calculateScore(codeReviewerItem, ['review'], 'review query')
      expect(score).toBeGreaterThan(0)
      expect(matchedKeywords).toContain('review')
    })

    it('gives score for description matches', () => {
      const { score } = calculateScore(codeReviewerItem, ['코드'], '코드', { includeDescriptions: true })
      expect(score).toBeGreaterThan(0)
    })

    it('gives bonus for Korean word matches in description', () => {
      const { score: withKorean } = calculateScore(codeReviewerItem, [], '코드 리뷰')
      const { score: withoutKorean } = calculateScore(codeReviewerItem, [], 'random english')
      expect(withKorean).toBeGreaterThan(withoutKorean)
    })

    it('gives score for author name matches', () => {
      const item: CatalogItem = { ...codeReviewerItem, authorName: '진우' }
      const { score, matchedKeywords } = calculateScore(item, ['진우'], '진우')
      expect(score).toBeGreaterThan(0)
      expect(matchedKeywords).toContain('진우')
    })
  })

  describe('naturalLanguageSearch', () => {
    it('finds code-reviewer for "코드 리뷰 도와줘"', () => {
      const results = naturalLanguageSearch(mockCatalog, '코드 리뷰 도와줘')
      expect(results.length).toBeGreaterThan(0)

      const topResult = results[0]
      expect(topResult.item.id).toBe('code-reviewer')
    })

    it('finds data-source-reference for "데이터베이스 스키마 알려줘"', () => {
      const results = naturalLanguageSearch(mockCatalog, '데이터베이스 스키마 알려줘')
      expect(results.length).toBeGreaterThan(0)

      const ids = results.map(r => r.item.id)
      expect(ids).toContain('data-source-reference')
    })

    it('finds git-commit-helper for "git 커밋 메시지 작성"', () => {
      const results = naturalLanguageSearch(mockCatalog, 'git 커밋 메시지 작성')
      expect(results.length).toBeGreaterThan(0)

      const ids = results.map(r => r.item.id)
      expect(ids).toContain('git-commit-helper')
    })

    it('finds test-generator for "테스트 코드 생성"', () => {
      const results = naturalLanguageSearch(mockCatalog, '테스트 코드 생성')
      expect(results.length).toBeGreaterThan(0)

      // test-generator should be in the results (may not be first due to "코드" matching other items)
      const ids = results.map(r => r.item.id)
      expect(ids).toContain('test-generator')
    })

    it('finds API-related items for "API 분석"', () => {
      const results = naturalLanguageSearch(mockCatalog, 'API 분석')
      expect(results.length).toBeGreaterThan(0)

      const ids = results.map(r => r.item.id)
      expect(ids).toContain('api-analyzer')
    })

    it('respects maxResults option', () => {
      const results = naturalLanguageSearch(mockCatalog, '코드', { maxResults: 2 })
      expect(results.length).toBeLessThanOrEqual(2)
    })

    it('respects minScore option', () => {
      const results = naturalLanguageSearch(mockCatalog, '코드', { minScore: 50 })
      results.forEach(result => {
        expect(result.score).toBeGreaterThanOrEqual(50)
      })
    })

    it('returns empty array for non-matching queries', () => {
      const results = naturalLanguageSearch(mockCatalog, 'xyzabc123', { minScore: 50 })
      expect(results.length).toBe(0)
    })

    it('works with English queries', () => {
      const results = naturalLanguageSearch(mockCatalog, 'code review')
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].item.id).toBe('code-reviewer')
    })

    it('finds items by Korean author name', () => {
      const catalogWithAuthor: CatalogItem[] = [
        { ...mockCatalog[0], authorName: '진우' },
        ...mockCatalog.slice(1),
      ]
      const results = naturalLanguageSearch(catalogWithAuthor, '진우')
      expect(results.length).toBeGreaterThan(0)
      expect(results.map(r => r.item.id)).toContain('code-reviewer')
    })
  })

  describe('getSearchSuggestions', () => {
    it('returns common suggestions for empty query', () => {
      const suggestions = getSearchSuggestions('')
      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions.length).toBeLessThanOrEqual(5)
    })

    it('returns relevant suggestions for partial query', () => {
      const suggestions = getSearchSuggestions('코드')
      expect(suggestions.length).toBeGreaterThan(0)

      // Should include code-related suggestions
      const hasCodeRelated = suggestions.some(s =>
        s.query.includes('코드') || s.category === 'code'
      )
      expect(hasCodeRelated).toBe(true)
    })

    it('respects limit parameter', () => {
      const suggestions = getSearchSuggestions('', 3)
      expect(suggestions.length).toBeLessThanOrEqual(3)
    })

    it('filters suggestions based on query relevance', () => {
      const suggestions = getSearchSuggestions('git')
      expect(suggestions.length).toBeGreaterThan(0)

      const hasGitRelated = suggestions.some(s =>
        s.query.toLowerCase().includes('git') || s.category === 'git'
      )
      expect(hasGitRelated).toBe(true)
    })
  })

  describe('getDidYouMeanSuggestions', () => {
    it('suggests similar terms for typos', () => {
      const suggestions = getDidYouMeanSuggestions('reveiw', mockCatalog)
      expect(suggestions.length).toBeGreaterThan(0)
    })

    it('returns limited number of suggestions', () => {
      const suggestions = getDidYouMeanSuggestions('cde', mockCatalog, 2)
      expect(suggestions.length).toBeLessThanOrEqual(2)
    })

    it('returns empty array for exact matches', () => {
      // If the query matches exactly, no suggestions needed
      const suggestions = getDidYouMeanSuggestions('code', mockCatalog)
      // Should not include 'code' itself as a suggestion
      expect(suggestions).not.toContain('code')
    })
  })

  describe('Korean Keyword Mappings', () => {
    it('has mappings for common developer terms', () => {
      expect(KOREAN_KEYWORD_MAPPINGS['코드 리뷰']).toBeDefined()
      expect(KOREAN_KEYWORD_MAPPINGS['데이터베이스']).toBeDefined()
      expect(KOREAN_KEYWORD_MAPPINGS['커밋']).toBeDefined()
      expect(KOREAN_KEYWORD_MAPPINGS['테스트']).toBeDefined()
      expect(KOREAN_KEYWORD_MAPPINGS['디버깅']).toBeDefined()
      expect(KOREAN_KEYWORD_MAPPINGS['리팩토링']).toBeDefined()
    })

    it('maps Korean terms to relevant English keywords', () => {
      expect(KOREAN_KEYWORD_MAPPINGS['코드 리뷰']).toContain('code')
      expect(KOREAN_KEYWORD_MAPPINGS['코드 리뷰']).toContain('review')

      expect(KOREAN_KEYWORD_MAPPINGS['데이터베이스']).toContain('database')
      expect(KOREAN_KEYWORD_MAPPINGS['데이터베이스']).toContain('sql')

      expect(KOREAN_KEYWORD_MAPPINGS['커밋']).toContain('commit')
      expect(KOREAN_KEYWORD_MAPPINGS['커밋']).toContain('git')
    })

    it('includes PR-related mappings', () => {
      expect(KOREAN_KEYWORD_MAPPINGS['PR']).toBeDefined()
      expect(KOREAN_KEYWORD_MAPPINGS['풀리퀘']).toBeDefined()
      expect(KOREAN_KEYWORD_MAPPINGS['풀리퀘스트']).toBeDefined()

      expect(KOREAN_KEYWORD_MAPPINGS['PR']).toContain('pull-request')
    })
  })

  describe('Natural Language Patterns', () => {
    it('has patterns for Korean help phrases', () => {
      const helpPattern = NATURAL_LANGUAGE_PATTERNS.find(p =>
        p.pattern.test('뭔가 도와줘')
      )
      expect(helpPattern).toBeDefined()
    })

    it('has patterns for specific task queries', () => {
      const codeReviewPattern = NATURAL_LANGUAGE_PATTERNS.find(p =>
        p.pattern.test('코드 리뷰')
      )
      expect(codeReviewPattern).toBeDefined()
      expect(codeReviewPattern?.keywords).toContain('code')
      expect(codeReviewPattern?.keywords).toContain('review')
    })
  })

  describe('Common Search Suggestions', () => {
    it('has suggestions for various categories', () => {
      const categories = new Set(COMMON_SEARCH_SUGGESTIONS.map(s => s.category))
      expect(categories.has('code')).toBe(true)
      expect(categories.has('git')).toBe(true)
      expect(categories.has('db')).toBe(true)
      expect(categories.has('docs')).toBe(true)
    })

    it('suggestions are in Korean', () => {
      const koreanSuggestions = COMMON_SEARCH_SUGGESTIONS.filter(s =>
        /[\u3131-\uD79D]/.test(s.query)
      )
      expect(koreanSuggestions.length).toBeGreaterThan(0)
    })

    it('each suggestion has description', () => {
      COMMON_SEARCH_SUGGESTIONS.forEach(suggestion => {
        expect(suggestion.description).toBeDefined()
        expect(suggestion.description.length).toBeGreaterThan(0)
      })
    })
  })
})
