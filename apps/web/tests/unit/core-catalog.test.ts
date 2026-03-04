import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist mock functions so they can be used in vi.mock factories
const { mockSelect, mockFrom, mockWhere } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
}))

/**
 * Build a chainable query mock that supports all query patterns:
 * - select().from().leftJoin().leftJoin().where()
 * - select().from().leftJoin().leftJoin().where().orderBy().limit()
 * - select().from().leftJoin().where()
 * - select().from().where()
 */
function buildChainFactory() {
  const terminalWhere = (condition: unknown) => {
    mockWhere(condition)
    return mockSelect()
  }
  const orderByChain = {
    limit: () => mockSelect(),
  }
  return {
    where: terminalWhere,
    orderBy: () => orderByChain,
    leftJoin: () => ({
      leftJoin: () => ({
        where: terminalWhere,
        orderBy: () => orderByChain,
      }),
      where: terminalWhere,
    }),
  }
}

vi.mock('@gpters/db', () => {
  /**
   * Create a thenable result that also supports .orderBy().limit() chaining.
   * This allows both `await query.where(...)` and `query.where(...).orderBy(...).limit(n)`.
   */
  function createWhereResult() {
    const promise = mockSelect()
    return {
      then: (resolve: unknown, reject: unknown) => Promise.resolve(promise).then(resolve as never, reject as never),
      orderBy: () => ({
        limit: () => mockSelect(),
      }),
    }
  }

  const terminalWhere = (condition: unknown) => {
    mockWhere(condition)
    return createWhereResult()
  }

  return {
  db: {
    select: () => ({
      from: (table: unknown) => {
        mockFrom(table)
        return {
          where: terminalWhere,
          orderBy: () => ({ limit: () => mockSelect() }),
          leftJoin: () => ({
            leftJoin: () => ({
              where: terminalWhere,
              orderBy: () => ({ limit: () => mockSelect() }),
            }),
            where: terminalWhere,
          }),
        }
      },
    }),
  },
  isDatabaseAvailable: () => true,
  catalogItems: {
    id: { name: 'id' },
    type: { name: 'type' },
    name: { name: 'name' },
    description: { name: 'description' },
    authorId: { name: 'authorId' },
    tags: { name: 'tags' },
    difficulty: { name: 'difficulty' },
    pluginId: { name: 'pluginId' },
    estimatedTime: { name: 'estimatedTime' },
    dependencies: { name: 'dependencies' },
    likes: { name: 'likes' },
    content: { name: 'content' },
    readme: { name: 'readme' },
    files: { name: 'files' },
    allowedTools: { name: 'allowedTools' },
    agentModel: { name: 'agentModel' },
    agentPermissionMode: { name: 'agentPermissionMode' },
    agentSkills: { name: 'agentSkills' },
    commandArgumentHint: { name: 'commandArgumentHint' },
    commandDisableModelInvocation: { name: 'commandDisableModelInvocation' },
    hookEvent: { name: 'hookEvent' },
    hookMatcher: { name: 'hookMatcher' },
    hookCommand: { name: 'hookCommand' },
    hookTimeout: { name: 'hookTimeout' },
    hookBlocking: { name: 'hookBlocking' },
    mcpEnabled: { name: 'mcpEnabled' },
    version: { name: 'version' },
    status: { name: 'status' },
    orgId: { name: 'orgId' },
    visibility: { name: 'visibility' },
    forkedFrom: { name: 'forkedFrom' },
    forkCount: { name: 'forkCount' },
    createdAt: { name: 'createdAt' },
    updatedAt: { name: 'updatedAt' },
  },
  users: {
    id: { name: 'id' },
    name: { name: 'name' },
    email: { name: 'email' },
  },
  organizations: {
    id: { name: 'id' },
    name: { name: 'name' },
  },
  packageItems: {
    packageId: { name: 'packageId' },
    itemId: { name: 'itemId' },
    displayOrder: { name: 'displayOrder' },
  },
}})

// Mock auth and rbac (used for visibility filtering in catalog.ts)
// catalog.ts imports from './auth' which resolves to packages/lib/src/core/auth.ts
vi.mock('../../../../packages/lib/src/core/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { role: 'super_admin', currentOrgId: 'org-123' },
  }),
}))
vi.mock('../../../../packages/lib/src/security/rbac', () => ({
  isSuperAdmin: (role: string) => role === 'super_admin',
}))

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: (...args: unknown[]) => ({ op: 'eq', args }),
  ne: (...args: unknown[]) => ({ op: 'ne', args }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  isNull: (...args: unknown[]) => ({ op: 'isNull', args }),
  asc: (...args: unknown[]) => ({ op: 'asc', args }),
  desc: (...args: unknown[]) => ({ op: 'desc', args }),
  like: (...args: unknown[]) => ({ op: 'like', args }),
  sql: Object.assign(
    (_strings: TemplateStringsArray, ..._values: unknown[]) => ({
      op: 'sql',
    }),
    {
      raw: (_s: string) => ({ op: 'sql.raw' }),
    }
  ),
}))

// Import after mocking
import {
  getCatalog,
  getItemById,
  getItemsByType,
  getGuides,
  getGuideById,
  getBeginnerItems,
  getItemsByAuthorId,
  getRelatedItems,
} from '@/lib/core/catalog'

/**
 * Helper to create mock summary records (for list queries with leftJoin to users & organizations).
 * These match the SummaryRecord shape with authorName and orgName fields.
 */
function createMockRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-id',
    type: 'skill' as const,
    name: 'Test Item',
    description: 'Test description',
    authorId: 'author-123',
    authorName: 'Test Author',
    orgName: null,
    tags: ['tag1', 'tag2'],
    difficulty: 'medium' as const,
    pluginId: null,
    estimatedTime: '10 min',
    dependencies: [],
    likes: 5,
    content: '# Content',
    readme: null,
    files: null,
    allowedTools: null,
    agentModel: null,
    agentPermissionMode: null,
    agentSkills: null,
    commandArgumentHint: null,
    commandDisableModelInvocation: null,
    hookEvent: null,
    hookMatcher: null,
    hookCommand: null,
    hookTimeout: null,
    hookBlocking: null,
    mcpEnabled: true,
    version: '1.0.0',
    status: 'published' as const,
    changelog: null,
    orgId: null,
    visibility: 'public' as const,
    forkedFrom: null,
    forkCount: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ...overrides,
  }
}

/**
 * Helper to create mock detail records (for getItemById/getGuideById).
 * These return { item: catalogItemRecord, orgName: string | null } shape.
 */
function createMockDetailRecord(overrides: Record<string, unknown> = {}) {
  const record = createMockRecord(overrides)
  return {
    item: record,
    orgName: (overrides.orgName as string) ?? null,
  }
}

describe('Catalog Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getCatalog', () => {
    it('should return catalog items as summary objects', async () => {
      const mockRecords = [
        createMockRecord({ id: 'skill-1', type: 'skill' }),
        createMockRecord({ id: 'agent-1', type: 'agent' }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getCatalog()

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('skill-1')
      expect(result[1].id).toBe('agent-1')
    })

    it('should convert null tags to empty array', async () => {
      const mockRecords = [createMockRecord({ tags: null })]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getCatalog()

      expect(result[0].tags).toEqual([])
    })

    it('should convert null dependencies to empty array', async () => {
      const mockRecords = [createMockRecord({ dependencies: null })]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getCatalog()

      expect(result[0].dependencies).toEqual([])
    })

    it('should handle empty catalog', async () => {
      mockSelect.mockResolvedValue([])

      const result = await getCatalog()

      expect(result).toEqual([])
    })

    it('should convert dates to ISO strings', async () => {
      const mockRecords = [
        createMockRecord({
          createdAt: new Date('2024-01-01T12:00:00Z'),
          updatedAt: new Date('2024-01-02T12:00:00Z'),
        }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getCatalog()

      expect(result[0].createdAt).toContain('2024-01-01')
      expect(result[0].updatedAt).toContain('2024-01-02')
    })

    it('should set default status to published when null', async () => {
      const mockRecords = [createMockRecord({ status: null })]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getCatalog()

      expect(result[0].status).toBe('published')
    })

    it('should set default mcpEnabled to false when null', async () => {
      const mockRecords = [createMockRecord({ mcpEnabled: null })]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getCatalog()

      expect(result[0].mcpEnabled).toBe(false)
    })
  })

  describe('getItemById', () => {
    it('should return item when found', async () => {
      const mockRecord = createMockDetailRecord({ id: 'test-skill' })
      mockSelect.mockResolvedValue([mockRecord])

      const result = await getItemById('test-skill')

      expect(result).toBeDefined()
      expect(result?.id).toBe('test-skill')
    })

    it('should return undefined when not found', async () => {
      mockSelect.mockResolvedValue([])

      const result = await getItemById('nonexistent')

      expect(result).toBeUndefined()
    })

    it('should include full content fields', async () => {
      const mockRecord = createMockDetailRecord({
        content: '# Full Content',
        readme: '# README',
        files: [{ name: 'file.ts', content: 'code' }],
        changelog: 'v1.0.0 - Initial release',
      })
      mockSelect.mockResolvedValue([mockRecord])

      const result = await getItemById('test')

      expect(result?.content).toBe('# Full Content')
      expect(result?.readme).toBe('# README')
      expect(result?.files).toEqual([{ name: 'file.ts', content: 'code' }])
      expect(result?.changelog).toBe('v1.0.0 - Initial release')
    })
  })

  describe('getItemsByType', () => {
    it('should return items of specified type', async () => {
      const mockRecords = [
        createMockRecord({ id: 'skill-1', type: 'skill' }),
        createMockRecord({ id: 'skill-2', type: 'skill' }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getItemsByType('skill')

      expect(result).toHaveLength(2)
      expect(result.every((item) => item.type === 'skill')).toBe(true)
    })

    it('should return empty array when no items of type', async () => {
      mockSelect.mockResolvedValue([])

      const result = await getItemsByType('command')

      expect(result).toEqual([])
    })

    it('should handle agent type', async () => {
      const mockRecords = [
        createMockRecord({
          type: 'agent',
          agentModel: 'claude-3-opus',
          agentPermissionMode: 'default',
        }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getItemsByType('agent')

      expect(result[0].agentModel).toBe('claude-3-opus')
      expect(result[0].agentPermissionMode).toBe('default')
    })

    it('should handle command type', async () => {
      const mockRecords = [
        createMockRecord({
          type: 'command',
          commandArgumentHint: '<file>',
          commandDisableModelInvocation: true,
        }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getItemsByType('command')

      expect(result[0].commandArgumentHint).toBe('<file>')
      expect(result[0].commandDisableModelInvocation).toBe(true)
    })

    it('should handle hook type', async () => {
      const mockRecords = [
        createMockRecord({
          type: 'hook',
          hookEvent: 'PreToolUse',
          hookCommand: 'echo test',
          hookTimeout: 5000,
          hookBlocking: true,
        }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getItemsByType('hook')

      expect(result[0].hookEvent).toBe('PreToolUse')
      expect(result[0].hookCommand).toBe('echo test')
      expect(result[0].hookTimeout).toBe(5000)
      expect(result[0].hookBlocking).toBe(true)
    })
  })

  describe('getGuides', () => {
    it('should return guide items', async () => {
      const mockRecords = [
        createMockRecord({ id: 'guide-1', type: 'guide' }),
        createMockRecord({ id: 'guide-2', type: 'guide' }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getGuides()

      expect(result).toHaveLength(2)
    })

    it('should return empty array when no guides', async () => {
      mockSelect.mockResolvedValue([])

      const result = await getGuides()

      expect(result).toEqual([])
    })
  })

  describe('getGuideById', () => {
    it('should return guide when found', async () => {
      const mockRecord = createMockDetailRecord({ id: 'guide-1', type: 'guide' })
      mockSelect.mockResolvedValue([mockRecord])

      const result = await getGuideById('guide-1')

      expect(result).toBeDefined()
      expect(result?.type).toBe('guide')
    })

    it('should return undefined when not found', async () => {
      mockSelect.mockResolvedValue([])

      const result = await getGuideById('nonexistent')

      expect(result).toBeUndefined()
    })

    it('should return undefined for non-guide type', async () => {
      // getGuideById filters by type='guide' in the WHERE clause,
      // so DB returns empty when item is not a guide
      mockSelect.mockResolvedValue([])

      const result = await getGuideById('skill-1')

      expect(result).toBeUndefined()
    })
  })

  describe('getBeginnerItems', () => {
    it('should return items with easy difficulty', async () => {
      const mockRecords = [
        createMockRecord({ id: 'easy-1', difficulty: 'easy', tags: [] }),
        createMockRecord({ id: 'hard-1', difficulty: 'hard', tags: [] }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getBeginnerItems()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('easy-1')
    })

    it('should return items with beginner tag', async () => {
      const mockRecords = [
        createMockRecord({ id: 'tagged-1', difficulty: 'hard', tags: ['beginner'] }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getBeginnerItems()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('tagged-1')
    })

    it('should return items with Korean beginner tag', async () => {
      const mockRecords = [
        createMockRecord({ id: 'korean-1', difficulty: 'hard', tags: ['입문'] }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getBeginnerItems()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('korean-1')
    })

    it('should return empty array when no beginner items', async () => {
      const mockRecords = [
        createMockRecord({ difficulty: 'hard', tags: ['advanced'] }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getBeginnerItems()

      expect(result).toEqual([])
    })
  })

  describe('getItemsByAuthorId', () => {
    it('should return all items by author ID', async () => {
      const mockRecords = [
        createMockRecord({ id: 'item-1', authorId: 'user-123' }),
        createMockRecord({ id: 'item-2', authorId: 'user-123' }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getItemsByAuthorId('user-123')

      expect(result).toHaveLength(2)
    })

    it('should return full CatalogItem objects', async () => {
      const mockRecords = [
        createMockRecord({
          authorId: 'user-123',
          content: '# Full content',
          readme: '# README',
        }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getItemsByAuthorId('user-123')

      expect(result[0].content).toBe('# Full content')
      expect(result[0].readme).toBe('# README')
    })

    it('should return empty array for unknown author ID', async () => {
      mockSelect.mockResolvedValue([])

      const result = await getItemsByAuthorId('unknown-id')

      expect(result).toEqual([])
    })
  })

  describe('getRelatedItems', () => {
    it('should return items with matching tags', async () => {
      const mockRecords = [
        createMockRecord({ id: 'related-1', tags: ['tag1', 'tag2'], authorId: 'other-user' }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getRelatedItems('current-id', ['tag1'], null)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('related-1')
    })

    it('should return results from DB query', async () => {
      const mockRecords = [
        createMockRecord({ id: 'same-author', tags: ['tag1'], authorId: 'john-user' }),
        createMockRecord({ id: 'diff-author', tags: ['tag1', 'tag2'], authorId: 'other-user' }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getRelatedItems('current-id', ['tag1'], 'john-user')

      // DB handles scoring and ordering now
      expect(result).toHaveLength(2)
    })

    it('should return results as provided by DB', async () => {
      const mockRecords = Array.from({ length: 3 }, (_, i) =>
        createMockRecord({ id: `item-${i}`, tags: ['common'], authorId: 'other-user' })
      )
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getRelatedItems('current-id', ['common'], null, 3)

      expect(result).toHaveLength(3)
    })

    it('should return empty array when no matching items', async () => {
      mockSelect.mockResolvedValue([])

      const result = await getRelatedItems('current-id', ['tag1'], null)

      expect(result).toEqual([])
    })

    it('should exclude current item via DB query', async () => {
      const mockRecords = [
        createMockRecord({ id: 'other-item', tags: ['tag1'], authorId: 'other-user' }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getRelatedItems('current-id', ['tag1'], null)

      expect(result.find((item) => item.id === 'current-id')).toBeUndefined()
    })

    it('should return items as summary objects', async () => {
      const mockRecords = Array.from({ length: 6 }, (_, i) =>
        createMockRecord({ id: `item-${i}`, tags: ['common'], authorId: 'other-user' })
      )
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getRelatedItems('current-id', ['common'], null)

      expect(result).toHaveLength(6)
      expect(result[0]).toHaveProperty('id')
      expect(result[0]).toHaveProperty('type')
      expect(result[0]).toHaveProperty('name')
    })

    it('should return items ordered by DB', async () => {
      const mockRecords = [
        createMockRecord({
          id: 'newer',
          tags: ['tag1', 'tag2'],
          authorId: 'other-user',
          updatedAt: new Date('2024-01-02'),
        }),
        createMockRecord({
          id: 'older',
          tags: ['tag1', 'tag2'],
          authorId: 'other-user',
          updatedAt: new Date('2024-01-01'),
        }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getRelatedItems('current-id', ['tag1', 'tag2'], null)

      // DB handles ordering, mock returns in given order
      expect(result[0].id).toBe('newer')
    })
  })

  describe('Type Conversion', () => {
    it('should handle null difficulty', async () => {
      const mockRecords = [createMockRecord({ difficulty: null })]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getCatalog()

      expect(result[0].difficulty).toBeUndefined()
    })

    it('should handle null pluginId', async () => {
      const mockRecords = [createMockRecord({ pluginId: null })]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getCatalog()

      expect(result[0].pluginId).toBeUndefined()
    })

    it('should handle null estimatedTime', async () => {
      const mockRecords = [createMockRecord({ estimatedTime: null })]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getCatalog()

      expect(result[0].estimatedTime).toBeUndefined()
    })

  })
})
