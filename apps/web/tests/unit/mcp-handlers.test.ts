import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDb, mockCatalogItems, mockUsers, mockSuggestions } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }

  const mockCatalogItems = {
    id: 'id',
    name: 'name',
    type: 'type',
    description: 'description',
    authorId: 'authorId',
    tags: 'tags',
    teamTag: 'teamTag',
    difficulty: 'difficulty',
    content: 'content',
    readme: 'readme',
    files: 'files',
    dependencies: 'dependencies',
    allowedTools: 'allowedTools',
    agentModel: 'agentModel',
    agentPermissionMode: 'agentPermissionMode',
    agentSkills: 'agentSkills',
    commandArgumentHint: 'commandArgumentHint',
    commandDisableModelInvocation: 'commandDisableModelInvocation',
    version: 'version',
    status: 'status',
    changelog: 'changelog',
    mcpEnabled: 'mcpEnabled',
    likes: 'likes',
    orgId: 'orgId',
    visibility: 'visibility',
    sharedWithOrgs: 'sharedWithOrgs',
    forkCount: 'forkCount',
    embedding: 'embedding',
  }

  const mockUsers = {
    id: 'id',
    name: 'name',
    email: 'email',
  }

  const mockSuggestions = {
    id: 'id',
    pluginId: 'pluginId',
    title: 'title',
    description: 'description',
    diff: 'diff',
    status: 'status',
    suggestedBy: 'suggestedBy',
    suggestedByName: 'suggestedByName',
    resolvedBy: 'resolvedBy',
    resolvedAt: 'resolvedAt',
    resolveComment: 'resolveComment',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }

  return { mockDb, mockCatalogItems, mockUsers, mockSuggestions }
})

// Mock the database module (must match the actual import path used by handlers)
vi.mock('@gpters/db', () => ({
  db: mockDb,
  catalogItems: mockCatalogItems,
  users: mockUsers,
  suggestions: mockSuggestions,
}))

// Mock drizzle-orm operators used by handlers
vi.mock('drizzle-orm', () => ({
  ilike: vi.fn(),
  or: vi.fn(),
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
  inArray: vi.fn(),
  desc: vi.fn(),
}))

// Mock sub-modules using resolved file paths matching handlers.ts relative imports
// handlers.ts is at packages/lib/src/mcp/handlers.ts and uses relative imports like ../core/logger
// From apps/web/tests/unit/ to packages/lib/src/ is ../../../../packages/lib/src/

vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('../../../../packages/lib/src/plugin/dependency-resolver', () => ({
  resolveAgentsAsConfig: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../../../packages/lib/src/security/rbac', () => ({
  isSuperAdmin: vi.fn().mockReturnValue(false),
}))

vi.mock('../../../../packages/lib/src/notifications/slack', () => ({
  notifySlackDeploy: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../../packages/lib/src/versioning/version', () => ({
  determineVersion: vi.fn().mockReturnValue({
    version: '1.0.0',
    changelog: 'Initial release',
  }),
  generateIdFromName: vi.fn().mockImplementation((name: string) =>
    name.toLowerCase().replace(/\s+/g, '-')
  ),
  hasUpdate: vi.fn().mockImplementation((installed: string, latest: string) =>
    installed !== latest
  ),
  incrementVersion: vi.fn().mockImplementation((version: string) => {
    const [major, minor, patch] = version.split('.').map(Number)
    return `${major}.${minor}.${patch + 1}`
  }),
}))

vi.mock('../../../../packages/lib/src/versioning/skill-version', () => ({
  createVersionSnapshot: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../../packages/lib/src/search/embedding', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([]),
  prepareTextForEmbedding: vi.fn().mockReturnValue(''),
}))

vi.mock('../../../../packages/lib/src/search/vector-search', () => ({
  semanticSearch: vi.fn().mockResolvedValue({ items: [], total: 0, searchTime: 0 }),
}))

vi.mock('../../../../packages/lib/src/utils', () => ({
  getBaseUrl: vi.fn().mockReturnValue('https://ai-toolkit.gpters.org'),
}))

const db = mockDb
import {
  searchPlugins,
  getPluginContent,
  listPlugins,
  getPluginsByCategory,
  createPlugin,
  updatePlugin,
  deletePlugin,
  deploySkill,
  checkUpdates,
  suggestImprovement,
  listSuggestions,
  resolveSuggestion,
  addFiles,
  removeFiles,
  executeTool,
  listPrompts,
  getPrompt,
} from '@/lib/mcp/handlers'

// Helper to create mock chain
function createMockChain(result: unknown[] = []) {
  return {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  }
}

describe('MCP Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('searchPlugins', () => {
    it('should search plugins by query', async () => {
      const mockPlugins = [
        {
          id: 'test-skill',
          name: 'Test Skill',
          type: 'skill',
          description: 'A test skill',
          authorName: 'test-author',
          tags: ['test'],
          teamTag: 'general',
          difficulty: 'easy',
        },
      ]

      const mockChain = createMockChain(mockPlugins)
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      const result = await searchPlugins({ query: 'test' })

      expect(result.plugins).toHaveLength(1)
      expect(result.plugins[0].id).toBe('test-skill')
      expect(result.query).toBe('test')
      expect(db.select).toHaveBeenCalled()
    })

    it('should respect limit parameter', async () => {
      const mockChain = createMockChain([])
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      await searchPlugins({ query: 'test', limit: 10 })

      expect(mockChain.limit).toHaveBeenCalledWith(10)
    })

    it('should cap limit at 20', async () => {
      const mockChain = createMockChain([])
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      await searchPlugins({ query: 'test', limit: 100 })

      expect(mockChain.limit).toHaveBeenCalledWith(20)
    })

    it('should use minimum limit of 1', async () => {
      const mockChain = createMockChain([])
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      await searchPlugins({ query: 'test', limit: 0 })

      expect(mockChain.limit).toHaveBeenCalledWith(1)
    })

    it('should filter by category', async () => {
      const mockChain = createMockChain([])
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      await searchPlugins({ query: 'test', category: 'skill' })

      expect(mockChain.where).toHaveBeenCalled()
    })

    it('should filter by teamTag', async () => {
      const mockChain = createMockChain([])
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      await searchPlugins({ query: 'test', teamTag: 'backend' })

      expect(mockChain.where).toHaveBeenCalled()
    })

    it('should handle empty results', async () => {
      const mockChain = createMockChain([])
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      const result = await searchPlugins({ query: 'nonexistent' })

      expect(result.plugins).toHaveLength(0)
      expect(result.total).toBe(0)
    })
  })

  describe('getPluginContent', () => {
    it('should return plugin content when found', async () => {
      const mockPlugin = {
        id: 'test-skill',
        name: 'Test Skill',
        type: 'skill',
        description: 'A test skill',
        authorName: 'test-author',
        tags: ['test'],
        teamTag: 'general',
        difficulty: 'easy',
        content: '# Test Content',
        readme: '# README',
        files: { 'index.ts': 'code' },
        dependencies: ['dep1'],
        allowedTools: ['read', 'write'],
        agentModel: 'claude-sonnet-4-20250514',
        agentPermissionMode: 'default',
        agentSkills: [],
        commandArgumentHint: 'hint',
        commandDisableModelInvocation: false,
        version: '1.0.0',
        status: 'published',
        changelog: 'Initial release',
      }

      const mockChain = createMockChain([mockPlugin])
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      const result = await getPluginContent({ pluginId: 'test-skill' })

      expect(result).not.toBeNull()
      expect(result?.id).toBe('test-skill')
      expect(result?.content).toBe('# Test Content')
      expect(result?.version).toBe('1.0.0')
    })

    it('should return null when plugin not found', async () => {
      const mockChain = createMockChain([])
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      const result = await getPluginContent({ pluginId: 'nonexistent' })

      expect(result).toBeNull()
    })

    it('should handle undefined optional fields', async () => {
      const mockPlugin = {
        id: 'minimal-skill',
        name: 'Minimal Skill',
        type: 'skill',
        description: '',
        authorName: 'test',
        tags: null,
        teamTag: null,
        difficulty: null,
        content: 'content',
        readme: null,
        files: null,
        dependencies: null,
        allowedTools: null,
        agentModel: null,
        agentPermissionMode: null,
        agentSkills: null,
        commandArgumentHint: null,
        commandDisableModelInvocation: null,
        version: null,
        status: null,
        changelog: null,
      }

      const mockChain = createMockChain([mockPlugin])
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      const result = await getPluginContent({ pluginId: 'minimal-skill' })

      expect(result?.tags).toEqual([])
      expect(result?.teamTag).toBeUndefined()
      expect(result?.version).toBe('1.0.0')
    })
  })

  describe('listPlugins', () => {
    it('should list all marketplace-enabled plugins', async () => {
      const mockPlugins = [
        { id: 'skill-1', name: 'Skill 1', type: 'skill', description: '', authorName: 'test', tags: [], teamTag: null, difficulty: null },
        { id: 'skill-2', name: 'Skill 2', type: 'skill', description: '', authorName: 'test', tags: [], teamTag: null, difficulty: null },
      ]

      const mockChain = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(mockPlugins),
      }
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      const result = await listPlugins()

      expect(result.plugins).toHaveLength(2)
      expect(result.total).toBe(2)
    })

    it('should filter by category', async () => {
      const mockPlugins = [
        { id: 'agent-1', name: 'Agent 1', type: 'agent', description: '', authorName: 'test', tags: [], teamTag: null, difficulty: null },
      ]

      const mockChain = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(mockPlugins),
      }
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      const result = await listPlugins({ category: 'agent' })

      expect(result.plugins).toHaveLength(1)
      expect(result.plugins[0].type).toBe('agent')
    })

    it('should filter by teamTag', async () => {
      const mockChain = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      await listPlugins({ teamTag: 'backend' })

      expect(mockChain.where).toHaveBeenCalled()
    })
  })

  describe('getPluginsByCategory', () => {
    it('should get plugins by category with limit', async () => {
      const mockPlugins = [
        { id: 'cmd-1', name: 'Command 1', type: 'command', description: '', authorName: 'test', tags: [], teamTag: null, difficulty: null },
      ]

      const mockChain = createMockChain(mockPlugins)
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      const result = await getPluginsByCategory({ category: 'command', limit: 5 })

      expect(result.plugins).toHaveLength(1)
      expect(mockChain.limit).toHaveBeenCalledWith(5)
    })

    it('should cap limit at 50', async () => {
      const mockChain = createMockChain([])
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      await getPluginsByCategory({ category: 'skill', limit: 100 })

      expect(mockChain.limit).toHaveBeenCalledWith(50)
    })
  })

  describe('createPlugin', () => {
    it('should create a new plugin', async () => {
      const mockSelectChain = createMockChain([]) // Plugin doesn't exist
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      }

      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.insert).mockReturnValue(mockInsertChain as never)

      const result = await createPlugin({
        id: 'new-skill',
        type: 'skill',
        name: 'New Skill',
        content: '# Content',
      })

      expect(result.success).toBe(true)
      expect(result.id).toBe('new-skill')
      expect(db.insert).toHaveBeenCalled()
    })

    it('should fail if plugin already exists', async () => {
      const mockSelectChain = createMockChain([{ id: 'existing-skill' }])
      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

      const result = await createPlugin({
        id: 'existing-skill',
        type: 'skill',
        name: 'Existing Skill',
        content: '# Content',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('already exists')
    })
  })

  describe('updatePlugin', () => {
    it('should update an existing plugin', async () => {
      const mockSelectChain = createMockChain([{ id: 'test-skill' }])
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }

      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.update).mockReturnValue(mockUpdateChain as never)

      const result = await updatePlugin({
        id: 'test-skill',
        name: 'Updated Name',
        description: 'Updated description',
      })

      expect(result.success).toBe(true)
      expect(db.update).toHaveBeenCalled()
    })

    it('should fail if plugin not found', async () => {
      const mockSelectChain = createMockChain([])
      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

      const result = await updatePlugin({
        id: 'nonexistent',
        name: 'Updated Name',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })
  })

  describe('deletePlugin', () => {
    it('should delete an existing plugin', async () => {
      const mockSelectChain = createMockChain([{ id: 'test-skill' }])
      const mockDeleteChain = {
        where: vi.fn().mockResolvedValue(undefined),
      }

      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.delete).mockReturnValue(mockDeleteChain as never)

      const result = await deletePlugin({ id: 'test-skill' })

      expect(result.success).toBe(true)
      expect(db.delete).toHaveBeenCalled()
    })

    it('should fail if plugin not found', async () => {
      const mockSelectChain = createMockChain([])
      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

      const result = await deletePlugin({ id: 'nonexistent' })

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })
  })

  describe('deploySkill', () => {
    it('should create new skill deployment', async () => {
      const mockSelectChain = createMockChain([]) // Skill doesn't exist
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      }

      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.insert).mockReturnValue(mockInsertChain as never)

      const result = await deploySkill({
        type: 'skill',
        name: 'New Skill',
        content: '# Skill Content',
      })

      expect(result.success).toBe(true)
      expect(result.id).toBe('new-skill')
      expect(result.version).toBe('1.0.0')
      expect(result.webUrl).toContain('/skill/new-skill')
    })

    it('should update existing skill', async () => {
      const mockSelectChain = createMockChain([
        { id: 'existing-skill', content: 'old content', version: '1.0.0', authorId: 'user-1' },
      ])
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }

      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.update).mockReturnValue(mockUpdateChain as never)

      const result = await deploySkill({
        type: 'skill',
        name: 'Existing Skill',
        id: 'existing-skill',
        content: '# Updated Content',
      }, 'user-1')

      expect(result.success).toBe(true)
      expect(result.previousVersion).toBe('1.0.0')
      expect(db.update).toHaveBeenCalled()
    })

    it('should preserve existing content when content is omitted during update', async () => {
      const existingContent = '# Existing Skill Content'
      const existingFiles = [{ name: 'ref.md', content: 'old ref', type: 'reference' as const }]
      const mockSelectChain = createMockChain([
        { id: 'my-skill', content: existingContent, version: '1.0.0', authorId: 'user-1', files: existingFiles },
      ])
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }

      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.update).mockReturnValue(mockUpdateChain as never)

      const newFiles = [{ name: 'new-ref.md', content: 'new ref doc', type: 'reference' as const }]
      const result = await deploySkill({
        type: 'skill',
        name: 'My Skill',
        id: 'my-skill',
        files: newFiles,
        changelog: '참조문서 추가',
      }, 'user-1')

      expect(result.success).toBe(true)
      expect(db.update).toHaveBeenCalled()
      // Verify that content was preserved (resolved from existing) and files were replaced
      const setCall = mockUpdateChain.set.mock.calls[0][0]
      expect(setCall.content).toBe(existingContent)
      expect(setCall.files).toEqual(newFiles)
    })

    it('should preserve existing files when files is omitted during update', async () => {
      const existingFiles = [{ name: 'ref.md', content: 'old ref', type: 'reference' as const }]
      const mockSelectChain = createMockChain([
        { id: 'my-skill', content: '# Old', version: '1.0.0', authorId: 'user-1', files: existingFiles },
      ])
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }

      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.update).mockReturnValue(mockUpdateChain as never)

      const result = await deploySkill({
        type: 'skill',
        name: 'My Skill',
        id: 'my-skill',
        content: '# Updated content',
      }, 'user-1')

      expect(result.success).toBe(true)
      const setCall = mockUpdateChain.set.mock.calls[0][0]
      expect(setCall.content).toBe('# Updated content')
      expect(setCall.files).toEqual(existingFiles)
    })

    it('should require content for new deployments', async () => {
      const mockSelectChain = createMockChain([]) // Skill doesn't exist
      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

      const result = await deploySkill({
        type: 'skill',
        name: 'New Skill',
        files: [{ name: 'ref.md', content: 'doc', type: 'reference' as const }],
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('content는 필수')
    })

    it('should include qualityWarnings when metadata is insufficient', async () => {
      const mockSelectChain = createMockChain([]) // New deployment
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      }

      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.insert).mockReturnValue(mockInsertChain as never)

      const result = await deploySkill({
        type: 'skill',
        name: 'Test',
        content: '# Short',
        description: 'Short',
        tags: [],
      })

      expect(result.success).toBe(true)
      expect(result.qualityWarnings).toBeDefined()
      expect(result.qualityWarnings!.length).toBeGreaterThan(0)

      const fields = result.qualityWarnings!.map((w) => w.field)
      expect(fields).toContain('description')
      expect(fields).toContain('tags')
      expect(fields).toContain('content')
    })

    it('should not include qualityWarnings when metadata quality is good', async () => {
      const mockSelectChain = createMockChain([]) // New deployment
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      }

      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.insert).mockReturnValue(mockInsertChain as never)

      const result = await deploySkill({
        type: 'skill',
        name: 'Quality Skill',
        content: 'a'.repeat(200),
        description: 'A sufficiently long description that exceeds the fifty character minimum threshold.',
        tags: ['quality', 'test'],
      })

      expect(result.success).toBe(true)
      expect(result.qualityWarnings).toBeUndefined()
    })

  })

  describe('checkUpdates', () => {
    it('should detect updates available', async () => {
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { id: 'skill-1', name: 'Skill 1', version: '2.0.0', changelog: 'Bug fixes' },
        ]),
      }
      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

      const result = await checkUpdates({
        installations: [{ id: 'skill-1', version: '1.0.0' }],
      })

      expect(result.updates).toHaveLength(1)
      expect(result.updates[0].installedVersion).toBe('1.0.0')
      expect(result.updates[0].latestVersion).toBe('2.0.0')
      expect(result.upToDate).toBe(0)
    })

    it('should report up-to-date installations', async () => {
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { id: 'skill-1', name: 'Skill 1', version: '1.0.0', changelog: null },
        ]),
      }
      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

      // Mock hasUpdate to return false for same version
      const { hasUpdate } = await import('../../../../packages/lib/src/versioning/version')
      vi.mocked(hasUpdate).mockReturnValue(false)

      const result = await checkUpdates({
        installations: [{ id: 'skill-1', version: '1.0.0' }],
      })

      expect(result.updates).toHaveLength(0)
      expect(result.upToDate).toBe(1)
    })

    it('should handle empty installations', async () => {
      const result = await checkUpdates({ installations: [] })

      expect(result.updates).toHaveLength(0)
      expect(result.upToDate).toBe(0)
    })

    it('should skip unknown plugins', async () => {
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]), // No plugins found
      }
      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

      const result = await checkUpdates({
        installations: [{ id: 'unknown-skill', version: '1.0.0' }],
      })

      expect(result.updates).toHaveLength(0)
      expect(result.upToDate).toBe(0)
    })
  })

  describe('suggestImprovement', () => {
    it('should create a new suggestion for existing plugin', async () => {
      const mockSelectChain = createMockChain([{ id: 'test-plugin', name: 'Test Plugin' }])
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      }

      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.insert).mockReturnValue(mockInsertChain as never)

      const result = await suggestImprovement({
        pluginId: 'test-plugin',
        title: 'Fix bug',
        description: 'This fixes a critical bug',
      })

      expect(result.success).toBe(true)
      expect(result.pluginId).toBe('test-plugin')
      expect(result.pluginName).toBe('Test Plugin')
      expect(result.suggestionId).toBeDefined()
      expect(db.insert).toHaveBeenCalled()
    })

    it('should fail if plugin not found', async () => {
      const mockSelectChain = createMockChain([])
      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

      const result = await suggestImprovement({
        pluginId: 'nonexistent',
        title: 'Fix bug',
        description: 'This fixes a bug',
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('찾을 수 없습니다')
    })

    it('should include optional diff and suggestedByName', async () => {
      const mockSelectChain = createMockChain([{ id: 'test-plugin', name: 'Test Plugin' }])
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      }

      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.insert).mockReturnValue(mockInsertChain as never)

      const result = await suggestImprovement({
        pluginId: 'test-plugin',
        title: 'Add feature',
        description: 'Add new feature',
        diff: '+ new code',
        suggestedByName: 'John Doe',
      })

      expect(result.success).toBe(true)
      expect(mockInsertChain.values).toHaveBeenCalled()
    })
  })

  describe('listSuggestions', () => {
    it('should list all suggestions', async () => {
      const mockSuggestions = [
        {
          id: 'suggestion-1',
          pluginId: 'plugin-1',
          pluginName: 'Plugin 1',
          title: 'Fix bug',
          description: 'Bug fix',
          status: 'pending',
          suggestedByName: 'John',
          createdAt: new Date(),
          resolvedAt: null,
          resolveComment: null,
        },
      ]

      const mockChain = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(mockSuggestions),
      }
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      const result = await listSuggestions()

      expect(result.suggestions).toHaveLength(1)
      expect(result.total).toBe(1)
    })

    it('should filter by pluginId', async () => {
      const mockChain = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      await listSuggestions({ pluginId: 'specific-plugin' })

      expect(mockChain.where).toHaveBeenCalled()
    })

    it('should filter by status', async () => {
      const mockChain = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      await listSuggestions({ status: 'pending' })

      expect(mockChain.where).toHaveBeenCalled()
    })

    it('should cap limit at 50', async () => {
      const mockChain = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      await listSuggestions({ limit: 100 })

      expect(mockChain.limit).toHaveBeenCalledWith(50)
    })
  })

  describe('resolveSuggestion', () => {
    const ownerUserId = 'owner-user-123'

    it('should accept a suggestion and bump version', async () => {
      // First call: find suggestion
      const suggestionResult = [{ id: 'suggestion-1', pluginId: 'plugin-1', status: 'pending', diff: null }]
      // Second call: find plugin (includes authorId for ownership check)
      const pluginResult = [{ id: 'plugin-1', name: 'Plugin 1', version: '1.0.0', authorId: ownerUserId }]

      let callCount = 0
      vi.mocked(db.select).mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createMockChain(suggestionResult) as never
        }
        return createMockChain(pluginResult) as never
      })

      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }
      vi.mocked(db.update).mockReturnValue(mockUpdateChain as never)

      const result = await resolveSuggestion(
        {
          suggestionId: 'suggestion-1',
          action: 'accept',
          comment: 'Good suggestion!',
        },
        ownerUserId
      )

      expect(result.success).toBe(true)
      expect(result.action).toBe('accept')
      expect(result.newVersion).toBe('1.0.1')
      expect(result.contentApplied).toBe(false)
      expect(result.message).toContain('수락')
    })

    it('should accept a suggestion with diff and apply content', async () => {
      const newContent = '# Updated Content\nThis is the new content.'
      const suggestionResult = [{ id: 'suggestion-2', pluginId: 'plugin-1', status: 'pending', diff: newContent }]
      const pluginResult = [{ id: 'plugin-1', name: 'Plugin 1', version: '1.0.0', authorId: ownerUserId }]

      let callCount = 0
      vi.mocked(db.select).mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createMockChain(suggestionResult) as never
        }
        return createMockChain(pluginResult) as never
      })

      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }
      vi.mocked(db.update).mockReturnValue(mockUpdateChain as never)

      const result = await resolveSuggestion(
        {
          suggestionId: 'suggestion-2',
          action: 'accept',
        },
        ownerUserId
      )

      expect(result.success).toBe(true)
      expect(result.action).toBe('accept')
      expect(result.newVersion).toBe('1.0.1')
      expect(result.contentApplied).toBe(true)
      expect(result.message).toContain('수락')
      expect(result.message).toContain('자동으로 적용')

      // Verify content was included in update
      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ content: newContent })
      )
    })

    it('should reject a suggestion without version bump', async () => {
      const suggestionResult = [{ id: 'suggestion-1', pluginId: 'plugin-1', status: 'pending', diff: null }]
      const pluginResult = [{ id: 'plugin-1', name: 'Plugin 1', version: '1.0.0', authorId: ownerUserId }]

      let callCount = 0
      vi.mocked(db.select).mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createMockChain(suggestionResult) as never
        }
        return createMockChain(pluginResult) as never
      })

      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }
      vi.mocked(db.update).mockReturnValue(mockUpdateChain as never)

      const result = await resolveSuggestion(
        {
          suggestionId: 'suggestion-1',
          action: 'reject',
          comment: 'Not applicable',
        },
        ownerUserId
      )

      expect(result.success).toBe(true)
      expect(result.action).toBe('reject')
      expect(result.newVersion).toBeUndefined()
      expect(result.message).toContain('거부')
    })

    it('should fail if suggestion not found', async () => {
      const mockSelectChain = createMockChain([])
      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

      const result = await resolveSuggestion({
        suggestionId: 'nonexistent',
        action: 'accept',
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('찾을 수 없습니다')
    })

    it('should fail if suggestion already resolved', async () => {
      const mockSelectChain = createMockChain([
        { id: 'suggestion-1', pluginId: 'plugin-1', status: 'accepted', diff: null },
      ])
      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

      const result = await resolveSuggestion({
        suggestionId: 'suggestion-1',
        action: 'accept',
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain('이미 처리된')
    })
  })

  describe('addFiles', () => {
    const ownerUserId = 'owner-user-123'

    it('should add new files to a plugin', async () => {
      const mockSelectChain = createMockChain([
        { id: 'my-skill', version: '1.0.0', authorId: ownerUserId, files: [] },
      ])
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }

      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.update).mockReturnValue(mockUpdateChain as never)

      const result = await addFiles(
        {
          id: 'my-skill',
          files: [{ name: 'scripts/run.mjs', content: 'console.log("hi")' }],
        },
        ownerUserId
      )

      expect(result.success).toBe(true)
      expect(result.version).toBe('1.0.1')
      expect(result.previousVersion).toBe('1.0.0')
      expect(result.addedOrUpdated).toContain('scripts/run.mjs')
      expect(result.totalFiles).toBe(1)
      expect(db.update).toHaveBeenCalled()
    })

    it('should merge with existing files and overwrite same name', async () => {
      const existingFiles = [
        { name: 'ref.md', content: 'old content', type: 'reference' },
        { name: 'keep.md', content: 'keep this', type: 'reference' },
      ]
      const mockSelectChain = createMockChain([
        { id: 'my-skill', version: '1.0.0', authorId: ownerUserId, files: existingFiles },
      ])
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }

      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.update).mockReturnValue(mockUpdateChain as never)

      const result = await addFiles(
        {
          id: 'my-skill',
          files: [
            { name: 'ref.md', content: 'new content' },
            { name: 'new-file.ts', content: 'code' },
          ],
        },
        ownerUserId
      )

      expect(result.success).toBe(true)
      expect(result.totalFiles).toBe(3) // keep.md + ref.md (updated) + new-file.ts
      expect(result.addedOrUpdated).toEqual(['ref.md', 'new-file.ts'])
    })

    it('should fail if plugin not found', async () => {
      const mockSelectChain = createMockChain([])
      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

      const result = await addFiles(
        { id: 'nonexistent', files: [{ name: 'f.md', content: 'c' }] },
        ownerUserId
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('찾을 수 없습니다')
    })

    it('should fail without authentication', async () => {
      const mockSelectChain = createMockChain([
        { id: 'my-skill', version: '1.0.0', authorId: ownerUserId, files: [] },
      ])
      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

      const result = await addFiles(
        { id: 'my-skill', files: [{ name: 'f.md', content: 'c' }] },
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('인증이 필요합니다')
    })

    it('should fail if not owner', async () => {
      const mockSelectChain = createMockChain([
        { id: 'my-skill', version: '1.0.0', authorId: 'other-user', files: [] },
      ])
      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

      const result = await addFiles(
        { id: 'my-skill', files: [{ name: 'f.md', content: 'c' }] },
        ownerUserId
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('소유자가 아닙니다')
    })
  })

  describe('removeFiles', () => {
    const ownerUserId = 'owner-user-123'

    it('should remove existing files', async () => {
      const existingFiles = [
        { name: 'a.md', content: 'aaa', type: 'reference' },
        { name: 'b.md', content: 'bbb', type: 'reference' },
        { name: 'c.md', content: 'ccc', type: 'reference' },
      ]
      const mockSelectChain = createMockChain([
        { id: 'my-skill', version: '1.0.0', authorId: ownerUserId, files: existingFiles },
      ])
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }

      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.update).mockReturnValue(mockUpdateChain as never)

      const result = await removeFiles(
        { id: 'my-skill', fileNames: ['a.md', 'c.md'] },
        ownerUserId
      )

      expect(result.success).toBe(true)
      expect(result.version).toBe('1.0.1')
      expect(result.removed).toEqual(['a.md', 'c.md'])
      expect(result.notFound).toEqual([])
      expect(result.totalFiles).toBe(1) // only b.md remains
    })

    it('should report not-found files without error', async () => {
      const existingFiles = [
        { name: 'a.md', content: 'aaa', type: 'reference' },
      ]
      const mockSelectChain = createMockChain([
        { id: 'my-skill', version: '1.0.0', authorId: ownerUserId, files: existingFiles },
      ])
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }

      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.update).mockReturnValue(mockUpdateChain as never)

      const result = await removeFiles(
        { id: 'my-skill', fileNames: ['a.md', 'nonexistent.md'] },
        ownerUserId
      )

      expect(result.success).toBe(true)
      expect(result.removed).toEqual(['a.md'])
      expect(result.notFound).toEqual(['nonexistent.md'])
    })

    it('should skip version bump when no files actually removed', async () => {
      const existingFiles = [
        { name: 'a.md', content: 'aaa', type: 'reference' },
      ]
      const mockSelectChain = createMockChain([
        { id: 'my-skill', version: '1.0.0', authorId: ownerUserId, files: existingFiles },
      ])

      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

      const result = await removeFiles(
        { id: 'my-skill', fileNames: ['nonexistent.md'] },
        ownerUserId
      )

      expect(result.success).toBe(true)
      expect(result.version).toBe('1.0.0') // No bump
      expect(result.removed).toEqual([])
      expect(result.notFound).toEqual(['nonexistent.md'])
      expect(db.update).not.toHaveBeenCalled()
    })

    it('should set files to null when all files removed', async () => {
      const existingFiles = [
        { name: 'only.md', content: 'content', type: 'reference' },
      ]
      const mockSelectChain = createMockChain([
        { id: 'my-skill', version: '1.0.0', authorId: ownerUserId, files: existingFiles },
      ])
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }

      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.update).mockReturnValue(mockUpdateChain as never)

      const result = await removeFiles(
        { id: 'my-skill', fileNames: ['only.md'] },
        ownerUserId
      )

      expect(result.success).toBe(true)
      expect(result.totalFiles).toBe(0)
      expect(result.files).toBeNull()
      // Verify DB was updated with null files
      const setCall = mockUpdateChain.set.mock.calls[0][0]
      expect(setCall.files).toBeNull()
    })

    it('should fail if plugin not found', async () => {
      const mockSelectChain = createMockChain([])
      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

      const result = await removeFiles(
        { id: 'nonexistent', fileNames: ['a.md'] },
        ownerUserId
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('찾을 수 없습니다')
    })

    it('should fail without authentication', async () => {
      const mockSelectChain = createMockChain([
        { id: 'my-skill', version: '1.0.0', authorId: ownerUserId, files: [] },
      ])
      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)

      const result = await removeFiles(
        { id: 'my-skill', fileNames: ['a.md'] },
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('인증이 필요합니다')
    })
  })

  describe('executeTool', () => {
    beforeEach(() => {
      const mockChain = createMockChain([])
      vi.mocked(db.select).mockReturnValue(mockChain as never)
    })

    it('should execute semantic_search tool', async () => {
      const { semanticSearch: mockSemanticSearch } = await import('../../../../packages/lib/src/search/vector-search')
      vi.mocked(mockSemanticSearch).mockResolvedValue({
        items: [],
        total: 0,
        searchTime: 10,
      })

      const result = await executeTool('semantic_search', { query: 'code review' })

      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe('text')
      expect(result.isError).toBeUndefined()
      expect(mockSemanticSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'code review',
          userContext: undefined,
        })
      )
    })

    it('should pass userContext to semantic_search', async () => {
      const { semanticSearch: mockSemanticSearch } = await import('../../../../packages/lib/src/search/vector-search')
      vi.mocked(mockSemanticSearch).mockResolvedValue({
        items: [],
        total: 0,
        searchTime: 10,
      })

      const result = await executeTool('semantic_search', {
        query: 'slack bot',
        userContext: 'airtable 연동, 슬랙 API',
      })

      expect(result.content).toHaveLength(1)
      expect(result.isError).toBeUndefined()
      expect(mockSemanticSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'slack bot',
          userContext: 'airtable 연동, 슬랙 API',
        })
      )
    })

    it('should handle semantic_search without userContext (backward compatible)', async () => {
      const { semanticSearch: mockSemanticSearch } = await import('../../../../packages/lib/src/search/vector-search')
      vi.mocked(mockSemanticSearch).mockResolvedValue({
        items: [],
        total: 0,
        searchTime: 5,
      })

      const result = await executeTool('semantic_search', { query: 'database' })

      expect(result.isError).toBeUndefined()
      expect(mockSemanticSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'database',
          userContext: undefined,
        })
      )
    })

    it('should return error for semantic_search without query', async () => {
      const result = await executeTool('semantic_search', {})

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Missing required field: query')
    })

    it('should execute search_plugins tool', async () => {
      const result = await executeTool('search_plugins', { query: 'test' })

      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe('text')
      expect(result.isError).toBeUndefined()
    })

    it('should execute get_plugin_content tool', async () => {
      const result = await executeTool('get_plugin_content', { pluginId: 'test' })

      expect(result.content).toHaveLength(1)
      expect(result.isError).toBe(true) // Not found
    })

    it('should execute list_plugins tool', async () => {
      const mockChain = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      const result = await executeTool('list_plugins', {})

      expect(result.content).toHaveLength(1)
      expect(result.isError).toBeUndefined()
    })

    it('should execute get_plugins_by_category tool', async () => {
      const result = await executeTool('get_plugins_by_category', { category: 'skill' })

      expect(result.content).toHaveLength(1)
      expect(result.isError).toBeUndefined()
    })

    it('should block create_plugin as admin-only tool', async () => {
      const result = await executeTool('create_plugin', { name: 'Test' })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('관리자 전용 도구')
    })

    it('should block update_plugin as admin-only tool', async () => {
      const result = await executeTool('update_plugin', { name: 'Test' })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('관리자 전용 도구')
    })

    it('should block delete_plugin as admin-only tool', async () => {
      const result = await executeTool('delete_plugin', {})

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('관리자 전용 도구')
    })

    it('should return error for deploy_skill with missing fields', async () => {
      const result = await executeTool('deploy_skill', { name: 'Test' })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Missing required fields')
    })

    it('should include quality hints in deploy_skill response text', async () => {
      const mockSelectChain = createMockChain([])
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      }

      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.insert).mockReturnValue(mockInsertChain as never)

      const result = await executeTool('deploy_skill', {
        type: 'skill',
        name: 'Test Skill',
        content: '# Short',
        description: 'Short',
        tags: [],
      })

      expect(result.isError).toBe(false)
      expect(result.content[0].text).toContain('품질 개선 힌트')
      expect(result.content[0].text).toContain('description')
      expect(result.content[0].text).toContain('tags')
      expect(result.content[0].text).toContain('content')
    })

    it('should return error for check_updates without installations', async () => {
      const result = await executeTool('check_updates', {})

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Missing required field: installations')
    })

    it('should execute suggest_improvement tool', async () => {
      const mockSelectChain = createMockChain([{ id: 'test-plugin', name: 'Test Plugin' }])
      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      }
      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.insert).mockReturnValue(mockInsertChain as never)

      const result = await executeTool(
        'suggest_improvement',
        {
          pluginId: 'test-plugin',
          title: 'Fix bug',
          description: 'Bug fix description',
        },
        'user-123'
      )

      expect(result.content).toHaveLength(1)
      expect(result.isError).toBeFalsy()
    })

    it('should return error for suggest_improvement without required fields', async () => {
      const result = await executeTool('suggest_improvement', { pluginId: 'test' })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Missing required fields')
    })

    it('should execute list_suggestions tool', async () => {
      const mockChain = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValue(mockChain as never)

      const result = await executeTool('list_suggestions', {})

      expect(result.content).toHaveLength(1)
      expect(result.isError).toBeUndefined()
    })

    it('should execute resolve_suggestion tool', async () => {
      const testUserId = 'owner-user-123'
      const suggestionResult = [{ id: 'sug-1', pluginId: 'plugin-1', status: 'pending', diff: null }]
      const pluginResult = [
        { id: 'plugin-1', name: 'Plugin 1', version: '1.0.0', authorId: testUserId },
      ]

      let callCount = 0
      vi.mocked(db.select).mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createMockChain(suggestionResult) as never
        }
        return createMockChain(pluginResult) as never
      })

      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }
      vi.mocked(db.update).mockReturnValue(mockUpdateChain as never)

      const result = await executeTool(
        'resolve_suggestion',
        {
          suggestionId: 'sug-1',
          action: 'accept',
        },
        testUserId
      )

      expect(result.content).toHaveLength(1)
      expect(result.isError).toBeFalsy()
    })

    it('should reject resolve_suggestion if not plugin owner', async () => {
      const ownerUserId = 'owner-user-123'
      const otherUserId = 'other-user-456'
      const suggestionResult = [{ id: 'sug-1', pluginId: 'plugin-1', status: 'pending', diff: null }]
      const pluginResult = [
        { id: 'plugin-1', name: 'Plugin 1', version: '1.0.0', authorId: ownerUserId },
      ]

      let callCount = 0
      vi.mocked(db.select).mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createMockChain(suggestionResult) as never
        }
        return createMockChain(pluginResult) as never
      })

      const result = await executeTool(
        'resolve_suggestion',
        {
          suggestionId: 'sug-1',
          action: 'accept',
        },
        otherUserId
      )

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('소유자가 아닙니다')
    })

    it('should reject resolve_suggestion without authentication', async () => {
      const suggestionResult = [{ id: 'sug-1', pluginId: 'plugin-1', status: 'pending', diff: null }]
      const pluginResult = [
        { id: 'plugin-1', name: 'Plugin 1', version: '1.0.0', authorId: 'owner-123' },
      ]

      let callCount = 0
      vi.mocked(db.select).mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createMockChain(suggestionResult) as never
        }
        return createMockChain(pluginResult) as never
      })

      const result = await executeTool('resolve_suggestion', {
        suggestionId: 'sug-1',
        action: 'accept',
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('인증이 필요합니다')
    })

    it('should return error for resolve_suggestion without required fields', async () => {
      const result = await executeTool('resolve_suggestion', { suggestionId: 'sug-1' })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Missing required fields')
    })

    it('should return error for resolve_suggestion with invalid action', async () => {
      const result = await executeTool('resolve_suggestion', {
        suggestionId: 'sug-1',
        action: 'invalid',
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('action must be')
    })

    it('should execute add_files tool', async () => {
      const mockSelectChain = createMockChain([
        { id: 'my-skill', version: '1.0.0', authorId: 'user-123', files: [] },
      ])
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }
      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.update).mockReturnValue(mockUpdateChain as never)

      const result = await executeTool(
        'add_files',
        {
          id: 'my-skill',
          files: [{ name: 'test.md', content: 'hello' }],
        },
        'user-123'
      )

      expect(result.content).toHaveLength(1)
      expect(result.isError).toBeFalsy()
    })

    it('should return error for add_files without required fields', async () => {
      const result = await executeTool('add_files', { id: 'test' })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Missing required fields')
    })

    it('should execute remove_files tool', async () => {
      const existingFiles = [{ name: 'a.md', content: 'aaa', type: 'reference' }]
      const mockSelectChain = createMockChain([
        { id: 'my-skill', version: '1.0.0', authorId: 'user-123', files: existingFiles },
      ])
      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }
      vi.mocked(db.select).mockReturnValue(mockSelectChain as never)
      vi.mocked(db.update).mockReturnValue(mockUpdateChain as never)

      const result = await executeTool(
        'remove_files',
        {
          id: 'my-skill',
          fileNames: ['a.md'],
        },
        'user-123'
      )

      expect(result.content).toHaveLength(1)
      expect(result.isError).toBeFalsy()
    })

    it('should return error for remove_files without required fields', async () => {
      const result = await executeTool('remove_files', { id: 'test' })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Missing required fields')
    })

    it('should return error for unknown tool', async () => {
      const result = await executeTool('unknown_tool', {})

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown tool')
    })

    it('should handle exceptions gracefully', async () => {
      vi.mocked(db.select).mockImplementation(() => {
        throw new Error('Database error')
      })

      const result = await executeTool('search_plugins', { query: 'test' })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Database error')
    })
  })

  describe('listPrompts', () => {
    it('should return empty array', async () => {
      const result = await listPrompts()

      expect(result).toHaveLength(0)
    })
  })

  describe('getPrompt', () => {
    it('should return null for any prompt', async () => {
      const result = await getPrompt({ name: 'nonexistent' })

      expect(result).toBeNull()
    })
  })
})
