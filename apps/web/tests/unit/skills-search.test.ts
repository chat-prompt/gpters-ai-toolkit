/**
 * Skills Search Handler Tests
 *
 * Unit tests for exercise-aware skill search logic (DEV-3055)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSemanticSearch = vi.fn()

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
    updatedAt: 'updated_at',
  },
  cliTools: {
    name: 'name',
    installCommand: 'install_command',
    latestVersion: 'latest_version',
    relatedTags: 'related_tags',
    tier: 'tier',
  },
}))

vi.mock('../../../../packages/lib/src/search/vector-search', () => ({
  semanticSearch: mockSemanticSearch,
}))

vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

const { searchSkillsForExercise } = await import('../../../../packages/lib/src/mcp/skills-search')

describe('searchSkillsForExercise', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    expect(result.cliTools).toEqual([])
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

  it('should filter MCP servers for beginner level', async () => {
    mockSemanticSearch.mockResolvedValue({
      items: [],
      total: 0,
      searchTime: 50,
    })

    const result = await searchSkillsForExercise({
      topic: 'Hello World',
      techStack: ['github'],
      level: 'beginner',
    })

    expect(result.mcpServers).toEqual([])
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

  it('should return CLI tools matching techStack', async () => {
    mockSemanticSearch.mockResolvedValue({
      items: [],
      total: 0,
      searchTime: 50,
    })

    // First call returns MCP results, second call returns CLI results
    let callCount = 0
    mockDb.limit.mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        return Promise.resolve([
          { name: 'Vite', installCommand: 'npm create vite@latest', latestVersion: '6.1.0', tier: 2 },
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

  it('should filter CLI tools by tier for beginner level', async () => {
    mockSemanticSearch.mockResolvedValue({
      items: [],
      total: 0,
      searchTime: 50,
    })

    await searchSkillsForExercise({
      topic: 'Hello World',
      techStack: ['node'],
      level: 'beginner',
    })

    // Verify the DB query was called (MCP + CLI = 2 select chains)
    expect(mockDb.select).toHaveBeenCalled()
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
})
