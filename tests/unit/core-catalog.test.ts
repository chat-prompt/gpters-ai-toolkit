import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the database module
const mockSelect = vi.fn()
const mockFrom = vi.fn()
const mockWhere = vi.fn()
const mockLimit = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        mockFrom(table)
        return {
          where: (condition: unknown) => {
            mockWhere(condition)
            return mockSelect()
          },
        }
      },
    }),
  },
  catalogItems: {
    id: { name: 'id' },
    type: { name: 'type' },
    name: { name: 'name' },
    description: { name: 'description' },
    author: { name: 'author' },
    tags: { name: 'tags' },
    teamTag: { name: 'teamTag' },
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
    marketplaceEnabled: { name: 'marketplaceEnabled' },
    marketplaceSyncedAt: { name: 'marketplaceSyncedAt' },
    marketplaceVersion: { name: 'marketplaceVersion' },
    status: { name: 'status' },
    changelog: { name: 'changelog' },
    createdAt: { name: 'createdAt' },
    updatedAt: { name: 'updatedAt' },
  },
}))

// Import after mocking
import {
  getCatalog,
  getItemById,
  getItemsByType,
  getGuides,
  getGuideById,
  getBeginnerItems,
  getItemsByAuthor,
  getRelatedItems,
} from '@/lib/core/catalog'

// Helper to create mock database records
function createMockRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-id',
    type: 'skill' as const,
    name: 'Test Item',
    description: 'Test description',
    author: 'Test Author',
    tags: ['tag1', 'tag2'],
    teamTag: 'platform' as const,
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
    marketplaceEnabled: true,
    marketplaceSyncedAt: null,
    marketplaceVersion: '1.0.0',
    status: 'published' as const,
    changelog: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ...overrides,
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

    it('should set default marketplaceEnabled to false when null', async () => {
      const mockRecords = [createMockRecord({ marketplaceEnabled: null })]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getCatalog()

      expect(result[0].marketplaceEnabled).toBe(false)
    })
  })

  describe('getItemById', () => {
    it('should return item when found', async () => {
      const mockRecord = createMockRecord({ id: 'test-skill' })
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
      const mockRecord = createMockRecord({
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
      const mockRecord = createMockRecord({ id: 'guide-1', type: 'guide' })
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
      const mockRecord = createMockRecord({ id: 'skill-1', type: 'skill' })
      mockSelect.mockResolvedValue([mockRecord])

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

  describe('getItemsByAuthor', () => {
    it('should return all items by author', async () => {
      const mockRecords = [
        createMockRecord({ id: 'item-1', author: 'John' }),
        createMockRecord({ id: 'item-2', author: 'John' }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getItemsByAuthor('John')

      expect(result).toHaveLength(2)
    })

    it('should return full CatalogItem objects', async () => {
      const mockRecords = [
        createMockRecord({
          author: 'John',
          content: '# Full content',
          readme: '# README',
        }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getItemsByAuthor('John')

      expect(result[0].content).toBe('# Full content')
      expect(result[0].readme).toBe('# README')
    })

    it('should return empty array for unknown author', async () => {
      mockSelect.mockResolvedValue([])

      const result = await getItemsByAuthor('Unknown')

      expect(result).toEqual([])
    })
  })

  describe('getRelatedItems', () => {
    it('should return items with matching tags', async () => {
      const mockRecords = [
        createMockRecord({ id: 'related-1', tags: ['tag1', 'tag2'], author: 'Other' }),
        createMockRecord({ id: 'unrelated', tags: ['other'], author: 'Other' }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getRelatedItems('current-id', ['tag1'], null)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('related-1')
    })

    it('should prioritize items by same author', async () => {
      const mockRecords = [
        createMockRecord({ id: 'same-author', tags: ['tag1'], author: 'John' }),
        createMockRecord({ id: 'diff-author', tags: ['tag1', 'tag2'], author: 'Other' }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getRelatedItems('current-id', ['tag1'], 'John')

      // Same author should be first (2 bonus + 1 tag = 3 points vs 2 tags = 2 points)
      expect(result[0].id).toBe('same-author')
    })

    it('should limit results to specified count', async () => {
      const mockRecords = Array.from({ length: 10 }, (_, i) =>
        createMockRecord({ id: `item-${i}`, tags: ['common'], author: 'Other' })
      )
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getRelatedItems('current-id', ['common'], null, 3)

      expect(result).toHaveLength(3)
    })

    it('should return empty array when no matching tags', async () => {
      const mockRecords = [
        createMockRecord({ id: 'item-1', tags: ['unrelated'], author: 'Other' }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getRelatedItems('current-id', ['tag1'], null)

      expect(result).toEqual([])
    })

    it('should exclude current item', async () => {
      // The current item should be filtered by the WHERE clause
      const mockRecords = [
        createMockRecord({ id: 'other-item', tags: ['tag1'], author: 'Other' }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getRelatedItems('current-id', ['tag1'], null)

      expect(result.find((item) => item.id === 'current-id')).toBeUndefined()
    })

    it('should use default limit of 6', async () => {
      const mockRecords = Array.from({ length: 10 }, (_, i) =>
        createMockRecord({ id: `item-${i}`, tags: ['common'], author: 'Other' })
      )
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getRelatedItems('current-id', ['common'], null)

      expect(result).toHaveLength(6)
    })

    it('should sort by score then by updatedAt', async () => {
      const mockRecords = [
        createMockRecord({
          id: 'older',
          tags: ['tag1', 'tag2'],
          author: 'Other',
          updatedAt: new Date('2024-01-01'),
        }),
        createMockRecord({
          id: 'newer',
          tags: ['tag1', 'tag2'],
          author: 'Other',
          updatedAt: new Date('2024-01-02'),
        }),
      ]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getRelatedItems('current-id', ['tag1', 'tag2'], null)

      // Both have same score, newer should come first
      expect(result[0].id).toBe('newer')
    })
  })

  describe('Type Conversion', () => {
    it('should handle null teamTag', async () => {
      const mockRecords = [createMockRecord({ teamTag: null })]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getCatalog()

      expect(result[0].teamTag).toBeUndefined()
    })

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

    it('should convert marketplaceSyncedAt to ISO string', async () => {
      const syncDate = new Date('2024-06-15T10:30:00Z')
      const mockRecords = [createMockRecord({ marketplaceSyncedAt: syncDate })]
      mockSelect.mockResolvedValue(mockRecords)

      const result = await getCatalog()

      expect(result[0].marketplaceSyncedAt).toContain('2024-06-15')
    })
  })
})
