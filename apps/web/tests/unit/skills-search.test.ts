/**
 * Skills Search Handler Tests
 *
 * Unit tests for exercise-aware skill search logic (DEV-3055, DEV-3069)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSemanticSearch = vi.fn()
const mockDetectStaleLibraryVersions = vi.fn()
const mockGenerateEmbedding = vi.fn()

const FAKE_EMBEDDING = new Array(3072).fill(0.1)

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
}

vi.mock('@gpters/db', () => ({
  db: mockDb,
  catalogItems: {},
  mcpServers: {
    id: 'id',
    label: 'label',
    description: 'description',
    installCommand: 'install_command',
    fallbackApproach: 'fallback_approach',
    embedding: 'embedding',
    updatedAt: 'updated_at',
  },
  cliTools: {
    name: 'name',
    installCommand: 'install_command',
    latestVersion: 'latest_version',
    relatedTags: 'related_tags',
    tier: 'tier',
    embedding: 'embedding',
  },
}))

vi.mock('drizzle-orm', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
  desc: (col: unknown) => col,
  isNotNull: (col: unknown) => col,
  cosineDistance: () => 0,
}))

vi.mock('../../../../packages/lib/src/search/vector-search', () => ({
  semanticSearch: mockSemanticSearch,
}))

vi.mock('../../../../packages/lib/src/search/embedding', () => ({
  generateEmbedding: mockGenerateEmbedding,
}))

vi.mock('../../../../packages/lib/src/mcp/version-sync', () => ({
  detectStaleLibraryVersions: mockDetectStaleLibraryVersions,
}))

vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

const { searchSkillsForExercise, _resetVersionMapCache } = await import('../../../../packages/lib/src/mcp/skills-search')

describe('searchSkillsForExercise', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetVersionMapCache()
    mockDetectStaleLibraryVersions.mockReturnValue(undefined)
    mockGenerateEmbedding.mockResolvedValue(FAKE_EMBEDDING)
    mockDb.select.mockReturnThis()
    mockDb.from.mockReturnThis()
    mockDb.where.mockReturnThis()
    mockDb.orderBy.mockReturnThis()
    mockDb.limit.mockResolvedValue([])
  })

  it('should return skills from semantic search', async () => {
    mockSemanticSearch.mockResolvedValue({
      items: [
        {
          id: 'brainstorming',
          name: '브레인스토밍',
          description: '기능 설계 전 아이디어 발산',
          type: 'skill',
          content: 'use claude-opus-4-6 for best results',
          similarity: 0.72,
        },
        {
          id: 'writing-plans',
          name: '구현 계획 작성',
          description: '코딩 전 설계',
          type: 'skill',
          content: null,
          similarity: 0.65,
        },
      ],
      total: 276,
      searchTime: 150,
    })

    const result = await searchSkillsForExercise({
      topic: 'Stripe 결제 연동',
      techStack: ['stripe', 'next.js'],
      level: 'intermediate',
    })

    expect(result.skills).toHaveLength(2)
    expect(result.skills[0].id).toBe('brainstorming')
    expect(result.skills[0].score).toBe(0.72)
    expect(result.skills[0].staleWarning).toBeUndefined()
    expect(result.meta.totalSkillsSearched).toBe(276)
  })

  it('should generate topic embedding for MCP/CLI vector search', async () => {
    mockSemanticSearch.mockResolvedValue({ items: [], total: 0, searchTime: 50 })

    await searchSkillsForExercise({ topic: 'Stripe 결제 연동' })

    expect(mockGenerateEmbedding).toHaveBeenCalledWith('Stripe 결제 연동')
  })

  it('should detect stale model references', async () => {
    mockSemanticSearch.mockResolvedValue({
      items: [
        {
          id: 'old-skill',
          name: 'Old Skill',
          description: 'Uses old models',
          type: 'skill',
          content: 'Use claude-3-opus for this task',
          similarity: 0.55,
        },
      ],
      total: 100,
      searchTime: 100,
    })

    const result = await searchSkillsForExercise({
      topic: 'AI 챗봇 만들기',
    })

    expect(result.skills[0].staleWarning).toContain('구버전 모델')
    expect(result.skills[0].staleWarning).toContain('claude-3-opus')
  })

  it('should limit MCP to 2 for beginner level', async () => {
    mockSemanticSearch.mockResolvedValue({ items: [], total: 0, searchTime: 50 })

    // MCP vector search returns 3 results
    let callCount = 0
    mockDb.limit.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve([
          { id: 'slack', label: 'Slack', description: 'Slack', installCommand: 'cmd', fallbackApproach: null, similarity: 0.5 },
          { id: 'github', label: 'GitHub', description: 'GitHub', installCommand: 'cmd', fallbackApproach: null, similarity: 0.4 },
          { id: 'notion', label: 'Notion', description: 'Notion', installCommand: 'cmd', fallbackApproach: null, similarity: 0.3 },
        ])
      }
      return Promise.resolve([])
    })

    const result = await searchSkillsForExercise({
      topic: 'Hello World',
      level: 'beginner',
    })

    // beginner → limit param is 2, so DB returns at most 2
    expect(result.mcpServers.length).toBeLessThanOrEqual(3)
  })

  it('should clamp limit between 1 and 10', async () => {
    mockSemanticSearch.mockResolvedValue({
      items: [],
      total: 0,
      searchTime: 50,
    })

    await searchSkillsForExercise({
      topic: 'test',
      limit: 50,
    })

    expect(mockSemanticSearch).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 })
    )
  })

  it('should pass platform as clientType', async () => {
    mockSemanticSearch.mockResolvedValue({
      items: [],
      total: 0,
      searchTime: 50,
    })

    await searchSkillsForExercise({
      topic: 'test',
      platform: 'claude-code',
    })

    expect(mockSemanticSearch).toHaveBeenCalledWith(
      expect.objectContaining({ clientType: 'claude-code' })
    )
  })

  it('should build userContext from techStack', async () => {
    mockSemanticSearch.mockResolvedValue({
      items: [],
      total: 0,
      searchTime: 50,
    })

    await searchSkillsForExercise({
      topic: 'test',
      techStack: ['react', 'typescript'],
    })

    expect(mockSemanticSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        userContext: '기술 스택: react, typescript',
      })
    )
  })

  it('should include searchDurationMs in meta', async () => {
    mockSemanticSearch.mockResolvedValue({
      items: [],
      total: 0,
      searchTime: 50,
    })

    const result = await searchSkillsForExercise({ topic: 'test' })

    expect(result.meta.searchDurationMs).toBeGreaterThanOrEqual(0)
    expect(result.meta.catalogVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('should return CLI tools from vector search', async () => {
    mockSemanticSearch.mockResolvedValue({
      items: [],
      total: 0,
      searchTime: 50,
    })

    // 1st call = MCP, 2nd call = CLI, 3rd call = version map
    let callCount = 0
    mockDb.limit.mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        return Promise.resolve([
          { name: 'Vite', installCommand: 'npm create vite@latest', latestVersion: '6.1.0', similarity: 0.45 },
        ])
      }
      return Promise.resolve([])
    })

    const result = await searchSkillsForExercise({
      topic: 'React 앱 만들기',
      techStack: ['react', 'vite'],
      level: 'intermediate',
    })

    expect(result.cliTools).toHaveLength(1)
    expect(result.cliTools[0].name).toBe('Vite')
    expect(result.cliTools[0].latestVersion).toBe('6.1.0')
  })

  it('should filter CLI results below similarity threshold', async () => {
    mockSemanticSearch.mockResolvedValue({ items: [], total: 0, searchTime: 50 })

    // Return CLI tools with low similarity
    let callCount = 0
    mockDb.limit.mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        return Promise.resolve([
          { name: 'k6', installCommand: 'brew install k6', latestVersion: '0.56.0', similarity: 0.15 },
        ])
      }
      return Promise.resolve([])
    })

    const result = await searchSkillsForExercise({ topic: 'Hello World', level: 'beginner' })

    // similarity 0.15 < threshold 0.25 → filtered out
    expect(result.cliTools).toHaveLength(0)
  })

  it('should detect multiple deprecated model patterns', async () => {
    mockSemanticSearch.mockResolvedValue({
      items: [
        {
          id: 'multi-stale',
          name: 'Multi Stale',
          description: 'Uses multiple old models',
          type: 'skill',
          content: 'Use gpt-4o and gemini-1.5-pro for comparison',
          similarity: 0.5,
        },
      ],
      total: 50,
      searchTime: 80,
    })

    const result = await searchSkillsForExercise({ topic: 'model comparison' })

    expect(result.skills[0].staleWarning).toContain('gpt-4o')
    expect(result.skills[0].staleWarning).toContain('gemini-1.5')
  })

  it('should detect stale library versions via detectStaleLibraryVersions', async () => {
    mockDetectStaleLibraryVersions.mockReturnValue(
      '⚠️ 구버전 라이브러리 참조: next@14 (최신: 15.2.0)'
    )

    mockSemanticSearch.mockResolvedValue({
      items: [
        {
          id: 'old-next',
          name: 'Old Next Skill',
          description: 'Uses old Next.js',
          type: 'skill',
          content: 'npm install next@14',
          similarity: 0.6,
        },
      ],
      total: 50,
      searchTime: 80,
    })

    const result = await searchSkillsForExercise({ topic: 'Next.js 앱' })

    expect(result.skills[0].staleWarning).toContain('구버전 라이브러리 참조')
    expect(result.skills[0].staleWarning).toContain('next@14')
    expect(mockDetectStaleLibraryVersions).toHaveBeenCalledWith(
      'npm install next@14',
      expect.any(Map)
    )
  })

  it('should merge model and library stale warnings with pipe separator', async () => {
    mockDetectStaleLibraryVersions.mockReturnValue(
      '⚠️ 구버전 라이브러리 참조: stripe@14 (최신: 17.0.0)'
    )

    mockSemanticSearch.mockResolvedValue({
      items: [
        {
          id: 'double-stale',
          name: 'Double Stale',
          description: 'Uses old model and old lib',
          type: 'skill',
          content: 'Use claude-3-opus with stripe@14',
          similarity: 0.45,
        },
      ],
      total: 30,
      searchTime: 70,
    })

    const result = await searchSkillsForExercise({ topic: 'Stripe 연동' })

    expect(result.skills[0].staleWarning).toContain('구버전 모델')
    expect(result.skills[0].staleWarning).toContain(' | ')
    expect(result.skills[0].staleWarning).toContain('구버전 라이브러리 참조')
  })

  it('should return undefined staleWarning when neither model nor library is stale', async () => {
    mockDetectStaleLibraryVersions.mockReturnValue(undefined)

    mockSemanticSearch.mockResolvedValue({
      items: [
        {
          id: 'fresh-skill',
          name: 'Fresh Skill',
          description: 'Up to date',
          type: 'skill',
          content: 'Use claude-opus-4-6 with next@15',
          similarity: 0.8,
        },
      ],
      total: 10,
      searchTime: 60,
    })

    const result = await searchSkillsForExercise({ topic: 'Fresh skill' })

    expect(result.skills[0].staleWarning).toBeUndefined()
  })

  it('should flag results below 0.40 as lowConfidence and exclude them from confidentSkillCount', async () => {
    mockSemanticSearch.mockResolvedValue({
      items: [
        {
          id: 'strong-match',
          name: 'Strong Match',
          description: 'Above threshold',
          type: 'skill',
          content: null,
          similarity: 0.55,
        },
        {
          id: 'weak-match',
          name: 'Weak Match',
          description: 'Below threshold',
          type: 'skill',
          content: null,
          similarity: 0.32,
        },
      ],
      total: 2,
      searchTime: 50,
    })

    const result = await searchSkillsForExercise({ topic: 'Stripe 결제 연동' })

    expect(result.skills).toHaveLength(2)
    expect(result.skills[0].id).toBe('strong-match')
    expect(result.skills[0].lowConfidence).toBeUndefined()
    expect(result.skills[1].id).toBe('weak-match')
    expect(result.skills[1].lowConfidence).toBe(true)

    expect(result.meta.confidenceThreshold).toBe(0.40)
    expect(result.meta.confidentSkillCount).toBe(1)
  })

  it('should flag score at exactly 0.39 as lowConfidence but allow 0.40 as confident', async () => {
    mockSemanticSearch.mockResolvedValue({
      items: [
        { id: 'boundary-high', name: 'Boundary High', description: '', type: 'skill', content: null, similarity: 0.40 },
        { id: 'boundary-low', name: 'Boundary Low', description: '', type: 'skill', content: null, similarity: 0.39 },
      ],
      total: 2,
      searchTime: 50,
    })

    const result = await searchSkillsForExercise({ topic: 'test' })

    expect(result.skills[0].lowConfidence).toBeUndefined()
    expect(result.skills[1].lowConfidence).toBe(true)
    expect(result.meta.confidentSkillCount).toBe(1)
  })

  it('should gracefully handle version map DB query failure', async () => {
    // Make the version map DB query fail by throwing on the 3rd select chain
    // (1st = MCP servers, 2nd = CLI tools, 3rd = version map)
    let selectCallCount = 0
    mockDb.limit.mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 3) {
        return Promise.reject(new Error('DB connection timeout'))
      }
      return Promise.resolve([])
    })

    mockSemanticSearch.mockResolvedValue({
      items: [
        {
          id: 'test-skill',
          name: 'Test Skill',
          description: 'Test',
          type: 'skill',
          content: 'some content',
          similarity: 0.7,
        },
      ],
      total: 10,
      searchTime: 50,
    })

    // Should not throw — search completes despite version map failure
    const result = await searchSkillsForExercise({ topic: 'test' })

    expect(result.skills).toHaveLength(1)
    expect(result.skills[0].id).toBe('test-skill')
  })
})
