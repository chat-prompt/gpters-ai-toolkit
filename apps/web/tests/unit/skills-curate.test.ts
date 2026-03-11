/**
 * Skills Curate Handler Tests
 *
 * Unit tests for curated skill categories endpoint (DEV-3063)
 * and skill_events exercise action types (DEV-3064)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── DB mock ──────────────────────────────────────────────
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue([]),
}

vi.mock('@gpters/db', () => ({
  db: mockDb,
  catalogItems: {
    id: 'id',
    name: 'name',
    description: 'description',
    type: 'type',
  },
  skillEvents: {},
  skillEventActionEnum: {
    enumValues: [
      'search', 'load', 'apply', 'skip',
      'deploy', 'suggest', 'exercise_search', 'exercise_apply',
    ],
  },
}))

vi.mock('drizzle-orm', () => ({
  inArray: vi.fn((_col: unknown, vals: unknown[]) => ({ _tag: 'inArray', vals })),
}))

vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

const { getCuratedSkills, listCuratedCategories } = await import(
  '../../../../packages/lib/src/mcp/skills-curate'
)

// ─── getCuratedSkills ─────────────────────────────────────
describe('getCuratedSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.select.mockReturnThis()
    mockDb.from.mockReturnThis()
    mockDb.where.mockResolvedValue([])
  })

  it('should return skills for a valid category', async () => {
    mockDb.where.mockResolvedValue([
      { id: 'brainstorming', name: '브레인스토밍', description: '아이디어 발산', type: 'skill' },
      { id: 'writing-plans', name: '구현 계획', description: '설계 후 코딩', type: 'skill' },
      { id: 'test-driven-development', name: 'TDD', description: '테스트 먼저', type: 'skill' },
    ])

    const result = await getCuratedSkills('project-start')

    expect(result).not.toBeNull()
    expect(result!.category).toBe('project-start')
    expect(result!.description).toBe('프로젝트 시작 시 추천 워크플로우')
    expect(result!.skills).toHaveLength(3)
    expect(result!.skills[0].id).toBe('brainstorming')
    expect(result!.skills[0].command).toBe('/brainstorming')
    expect(result!.skills[1].id).toBe('writing-plans')
    expect(result!.skills[2].id).toBe('test-driven-development')
  })

  it('should return null for non-existent category', async () => {
    const result = await getCuratedSkills('nonexistent-category')
    expect(result).toBeNull()
  })

  it('should include meta with totalInCategory and catalogVersion', async () => {
    mockDb.where.mockResolvedValue([
      { id: 'code-review', name: '코드 리뷰', description: '리뷰 자동화', type: 'skill' },
      { id: 'simplify', name: '간소화', description: '코드 간소화', type: 'skill' },
    ])

    const result = await getCuratedSkills('code-quality')

    expect(result).not.toBeNull()
    expect(result!.meta.totalInCategory).toBe(2)
    expect(result!.meta.catalogVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('should preserve curated order even when DB returns in different order', async () => {
    // Return in reverse order from DB
    mockDb.where.mockResolvedValue([
      { id: 'systematic-debugging', name: '디버깅', description: '체계적 디버깅', type: 'skill' },
      { id: 'test-driven-development', name: 'TDD', description: '테스트 먼저', type: 'skill' },
      { id: 'webapp-testing', name: '웹앱 테스트', description: '웹앱 테스팅', type: 'skill' },
    ])

    const result = await getCuratedSkills('testing')

    expect(result).not.toBeNull()
    // testing category order: test-driven-development, webapp-testing, systematic-debugging
    expect(result!.skills[0].id).toBe('test-driven-development')
    expect(result!.skills[1].id).toBe('webapp-testing')
    expect(result!.skills[2].id).toBe('systematic-debugging')
  })

  it('should skip skills not found in DB', async () => {
    // Only return 1 of 3 skills
    mockDb.where.mockResolvedValue([
      { id: 'brainstorming', name: '브레인스토밍', description: '아이디어 발산', type: 'skill' },
    ])

    const result = await getCuratedSkills('project-start')

    expect(result).not.toBeNull()
    expect(result!.skills).toHaveLength(1)
    expect(result!.meta.totalInCategory).toBe(1)
  })

  it('should return empty skills array when no DB matches', async () => {
    mockDb.where.mockResolvedValue([])

    const result = await getCuratedSkills('deployment')

    expect(result).not.toBeNull()
    expect(result!.skills).toEqual([])
    expect(result!.meta.totalInCategory).toBe(0)
  })
})

// ─── listCuratedCategories ────────────────────────────────
describe('listCuratedCategories', () => {
  it('should return all category keys', () => {
    const categories = listCuratedCategories()

    expect(categories).toContain('project-start')
    expect(categories).toContain('testing')
    expect(categories).toContain('code-quality')
    expect(categories).toContain('deployment')
    expect(categories.length).toBeGreaterThanOrEqual(4)
  })
})

// ─── skill_events exercise action types (DEV-3064) ────────
describe('skill_events exercise action types', () => {
  it('should include exercise_search in skillEventActionEnum', async () => {
    const { skillEventActionEnum } = await import('@gpters/db')
    expect(skillEventActionEnum.enumValues).toContain('exercise_search')
  })

  it('should include exercise_apply in skillEventActionEnum', async () => {
    const { skillEventActionEnum } = await import('@gpters/db')
    expect(skillEventActionEnum.enumValues).toContain('exercise_apply')
  })

  it('should retain original action types alongside new exercise types', async () => {
    const { skillEventActionEnum } = await import('@gpters/db')
    const values = skillEventActionEnum.enumValues

    expect(values).toContain('search')
    expect(values).toContain('load')
    expect(values).toContain('apply')
    expect(values).toContain('skip')
    expect(values).toContain('deploy')
    expect(values).toContain('suggest')
    expect(values).toContain('exercise_search')
    expect(values).toContain('exercise_apply')
    expect(values).toHaveLength(8)
  })
})
