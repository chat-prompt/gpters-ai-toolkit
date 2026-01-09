import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the database module
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  catalogItems: {
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
  },
  users: {
    id: 'id',
    name: 'name',
    email: 'email',
  },
}))

// Mock the marketplace sync
vi.mock('@/lib/marketplace', () => ({
  syncItemToGitHub: vi.fn().mockResolvedValue({
    success: true,
    filesCreated: ['README.md'],
    filesUpdated: [],
    errors: [],
  }),
}))

// Mock the version utilities
vi.mock('@/lib/versioning/version', () => ({
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
}))

import { db } from '@/lib/db'
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
        { id: 'existing-skill', content: 'old content', version: '1.0.0' },
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
      })

      expect(result.success).toBe(true)
      expect(result.previousVersion).toBe('1.0.0')
      expect(db.update).toHaveBeenCalled()
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
      const { hasUpdate } = await import('@/lib/versioning/version')
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

  describe('executeTool', () => {
    beforeEach(() => {
      const mockChain = createMockChain([])
      vi.mocked(db.select).mockReturnValue(mockChain as never)
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

    it('should return error for create_plugin with missing fields', async () => {
      const result = await executeTool('create_plugin', { name: 'Test' })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Missing required fields')
    })

    it('should return error for update_plugin without id', async () => {
      const result = await executeTool('update_plugin', { name: 'Test' })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Missing required field: id')
    })

    it('should return error for delete_plugin without id', async () => {
      const result = await executeTool('delete_plugin', {})

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Missing required field: id')
    })

    it('should return error for deploy_skill with missing fields', async () => {
      const result = await executeTool('deploy_skill', { name: 'Test' })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Missing required fields')
    })

    it('should return error for check_updates without installations', async () => {
      const result = await executeTool('check_updates', {})

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Missing required field: installations')
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
    it('should return only gpters-setup prompt', async () => {
      const result = await listPrompts()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('gpters-setup')
      expect(result[0].description).toContain('Hook')
    })
  })

  describe('getPrompt', () => {
    it('should return gpters-setup content', async () => {
      const result = await getPrompt({ name: 'gpters-setup' })

      expect(result).not.toBeNull()
      expect(result?.messages).toHaveLength(1)
      expect(result?.messages[0].role).toBe('user')
      expect(result?.messages[0].content.text).toContain('GPTers AI Toolkit')
      expect(result?.messages[0].content.text).toContain('CLAUDE.md')
      expect(result?.messages[0].content.text).toContain('hooks')
    })

    it('should return null for other prompts', async () => {
      const result = await getPrompt({ name: 'nonexistent' })

      expect(result).toBeNull()
    })
  })
})
