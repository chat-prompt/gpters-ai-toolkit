import { describe, it, expect } from 'vitest'
import {
  generateMarketplaceJson,
  generatePluginJson,
  transformToSkillMd,
  transformToAgentMd,
  transformToCommandMd,
  transformToHookJson,
  generateHookSettingsSnippet,
  generatePluginStructure,
  generatePluginFiles,
} from '@/lib/marketplace/transform'
import type { CatalogItem } from '@/lib/core/types'

// Helper to create a base catalog item
function createBaseCatalogItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'test-item',
    name: 'Test Item',
    type: 'skill',
    description: 'A test item for unit testing',
    content: '# Test Content\n\nThis is test content.',
    author: 'Test Author',
    tags: ['test', 'example'],
    createdAt: new Date(),
    updatedAt: new Date(),
    marketplaceEnabled: true,
    marketplaceVersion: '1.0.0',
    ...overrides,
  } as CatalogItem
}

describe('Marketplace Transform', () => {
  describe('generateMarketplaceJson', () => {
    it('should generate valid marketplace json', () => {
      const items = [
        createBaseCatalogItem({ id: 'skill-1', type: 'skill' }),
        createBaseCatalogItem({ id: 'agent-1', type: 'agent' }),
      ]

      const result = generateMarketplaceJson(items)

      expect(result.name).toBe('gpters-ai-toolkit')
      expect(result.owner.name).toBe('GPTers')
      expect(result.plugins).toHaveLength(2)
    })

    it('should filter out guides', () => {
      const items = [
        createBaseCatalogItem({ id: 'skill-1', type: 'skill' }),
        createBaseCatalogItem({ id: 'guide-1', type: 'guide' }),
      ]

      const result = generateMarketplaceJson(items)

      expect(result.plugins).toHaveLength(1)
      expect(result.plugins[0].name).toBe('skill-1')
    })

    it('should filter out marketplace-disabled items', () => {
      const items = [
        createBaseCatalogItem({ id: 'enabled', marketplaceEnabled: true }),
        createBaseCatalogItem({ id: 'disabled', marketplaceEnabled: false }),
      ]

      const result = generateMarketplaceJson(items)

      expect(result.plugins).toHaveLength(1)
      expect(result.plugins[0].name).toBe('enabled')
    })

    it('should include correct plugin entry fields', () => {
      const items = [
        createBaseCatalogItem({
          id: 'test-skill',
          description: 'Test description',
          author: 'Author Name',
          tags: ['tag1', 'tag2'],
          marketplaceVersion: '2.0.0',
        }),
      ]

      const result = generateMarketplaceJson(items)
      const plugin = result.plugins[0]

      expect(plugin.name).toBe('test-skill')
      expect(plugin.source).toBe('./plugins/test-skill')
      expect(plugin.description).toBe('Test description')
      expect(plugin.version).toBe('2.0.0')
      expect(plugin.author?.name).toBe('Author Name')
      expect(plugin.keywords).toEqual(['tag1', 'tag2'])
      expect(plugin.category).toBe('skill')
    })

    it('should use default version when not specified', () => {
      const items = [
        createBaseCatalogItem({ marketplaceVersion: undefined }),
      ]

      const result = generateMarketplaceJson(items)

      expect(result.plugins[0].version).toBe('1.0.0')
    })

    it('should handle empty items array', () => {
      const result = generateMarketplaceJson([])

      expect(result.plugins).toEqual([])
    })
  })

  describe('generatePluginJson', () => {
    it('should generate valid plugin json', () => {
      const item = createBaseCatalogItem({
        id: 'my-plugin',
        description: 'My plugin description',
        author: 'Plugin Author',
        tags: ['tag1', 'tag2'],
        marketplaceVersion: '1.2.3',
      })

      const result = generatePluginJson(item)

      expect(result.name).toBe('my-plugin')
      expect(result.version).toBe('1.2.3')
      expect(result.description).toBe('My plugin description')
      expect(result.author?.name).toBe('Plugin Author')
      expect(result.keywords).toEqual(['tag1', 'tag2'])
    })

    it('should handle missing optional fields', () => {
      const item = createBaseCatalogItem({
        tags: undefined,
        marketplaceVersion: undefined,
      })

      const result = generatePluginJson(item)

      expect(result.version).toBe('1.0.0')
      expect(result.keywords).toEqual([])
    })
  })

  describe('transformToSkillMd', () => {
    it('should transform item to skill markdown with frontmatter', () => {
      const item = createBaseCatalogItem({
        name: 'Code Reviewer',
        description: 'Reviews code for issues',
        content: '# Review Process\n\n1. Check style\n2. Check logic',
      })

      const result = transformToSkillMd(item)

      expect(result).toContain('---')
      expect(result).toContain('name: Code Reviewer')
      expect(result).toContain('description:')
      expect(result).toContain('Reviews code for issues')
      expect(result).toContain('# Review Process')
    })

    it('should include allowed-tools when specified', () => {
      const item = createBaseCatalogItem({
        allowedTools: 'Read, Write, Bash',
      })

      const result = transformToSkillMd(item)

      expect(result).toContain('allowed-tools: Read, Write, Bash')
    })

    it('should add trigger keywords based on tags', () => {
      const item = createBaseCatalogItem({
        tags: ['code', 'git'],
      })

      const result = transformToSkillMd(item)

      expect(result).toContain('Triggers:')
      expect(result).toContain('code review')
      expect(result).toContain('git commit')
    })

    it('should add documentation triggers for documentation tag', () => {
      const item = createBaseCatalogItem({
        tags: ['documentation'],
      })

      const result = transformToSkillMd(item)

      expect(result).toContain('write documentation')
      expect(result).toContain('create docs')
    })
  })

  describe('transformToAgentMd', () => {
    it('should transform item to agent markdown', () => {
      const item = createBaseCatalogItem({
        id: 'test-agent',
        type: 'agent',
        description: 'A test agent',
        content: '# Agent Instructions',
      })

      const result = transformToAgentMd(item)

      expect(result).toContain('---')
      expect(result).toContain('name: test-agent')
      expect(result).toContain('description: A test agent')
      expect(result).toContain('# Agent Instructions')
    })

    it('should include agent-specific fields', () => {
      const item = createBaseCatalogItem({
        type: 'agent',
        allowedTools: 'Read, Grep',
        agentModel: 'claude-3-opus',
        agentPermissionMode: 'default',
        agentSkills: 'skill1, skill2',
      })

      const result = transformToAgentMd(item)

      expect(result).toContain('tools: Read, Grep')
      expect(result).toContain('model: claude-3-opus')
      expect(result).toContain('permissionMode: default')
      expect(result).toContain('skills: skill1, skill2')
    })

    it('should omit undefined agent fields', () => {
      const item = createBaseCatalogItem({
        type: 'agent',
        agentModel: undefined,
        agentPermissionMode: undefined,
      })

      const result = transformToAgentMd(item)

      expect(result).not.toContain('model:')
      expect(result).not.toContain('permissionMode:')
    })
  })

  describe('transformToCommandMd', () => {
    it('should transform item to command markdown', () => {
      const item = createBaseCatalogItem({
        type: 'command',
        description: 'Run tests',
        content: '# Command Logic',
      })

      const result = transformToCommandMd(item)

      expect(result).toContain('---')
      expect(result).toContain('description: Run tests')
      expect(result).toContain('# Command Logic')
    })

    it('should include command-specific fields', () => {
      const item = createBaseCatalogItem({
        type: 'command',
        allowedTools: 'Bash',
        commandArgumentHint: '<file>',
        commandDisableModelInvocation: true,
      })

      const result = transformToCommandMd(item)

      expect(result).toContain('allowed-tools: Bash')
      expect(result).toContain('argument-hint: <file>')
      expect(result).toContain('disable-model-invocation: true')
    })

    it('should not include disable-model-invocation when false', () => {
      const item = createBaseCatalogItem({
        type: 'command',
        commandDisableModelInvocation: false,
      })

      const result = transformToCommandMd(item)

      expect(result).not.toContain('disable-model-invocation')
    })
  })

  describe('transformToHookJson', () => {
    it('should transform hook item to JSON config', () => {
      const item = createBaseCatalogItem({
        type: 'hook',
        hookEvent: 'PreToolUse',
        hookCommand: 'echo "pre-hook"',
      })

      const result = transformToHookJson(item)
      const parsed = JSON.parse(result)

      expect(parsed.PreToolUse).toBeDefined()
      expect(parsed.PreToolUse[0].hooks[0].type).toBe('command')
      expect(parsed.PreToolUse[0].hooks[0].command).toBe('echo "pre-hook"')
    })

    it('should include optional hook fields', () => {
      const item = createBaseCatalogItem({
        type: 'hook',
        hookEvent: 'PostToolUse',
        hookCommand: 'test-hook',
        hookTimeout: 10000,
        hookBlocking: true,
        hookMatcher: 'Bash',
      })

      const result = transformToHookJson(item)
      const parsed = JSON.parse(result)

      expect(parsed.PostToolUse[0].hooks[0].timeout).toBe(10000)
      expect(parsed.PostToolUse[0].hooks[0].blocking).toBe(true)
      expect(parsed.PostToolUse[0].matcher).toBe('Bash')
    })

    it('should throw error when hook event is missing', () => {
      const item = createBaseCatalogItem({
        type: 'hook',
        hookEvent: undefined,
        hookCommand: 'test',
      })

      expect(() => transformToHookJson(item)).toThrow('Hook must have event and command defined')
    })

    it('should throw error when hook command is missing', () => {
      const item = createBaseCatalogItem({
        type: 'hook',
        hookEvent: 'PreToolUse',
        hookCommand: undefined,
      })

      expect(() => transformToHookJson(item)).toThrow('Hook must have event and command defined')
    })
  })

  describe('generateHookSettingsSnippet', () => {
    it('should generate valid settings.json snippet', () => {
      const item = createBaseCatalogItem({
        type: 'hook',
        hookEvent: 'PreToolUse',
        hookCommand: 'my-hook',
      })

      const result = generateHookSettingsSnippet(item)

      expect(result).toContain('"hooks"')
      expect(result).toContain('"PreToolUse"')
      expect(result).toContain('"command": "my-hook"')
    })

    it('should include all hook options', () => {
      const item = createBaseCatalogItem({
        type: 'hook',
        hookEvent: 'PostToolUse',
        hookCommand: 'post-hook',
        hookTimeout: 5000,
        hookBlocking: false,
        hookMatcher: '*.ts',
      })

      const result = generateHookSettingsSnippet(item)

      expect(result).toContain('"timeout": 5000')
      expect(result).toContain('"blocking": false')
      expect(result).toContain('"matcher": "*.ts"')
    })

    it('should throw for missing hook event', () => {
      const item = createBaseCatalogItem({
        type: 'hook',
        hookEvent: undefined,
        hookCommand: 'cmd',
      })

      expect(() => generateHookSettingsSnippet(item)).toThrow()
    })
  })

  describe('generatePluginStructure', () => {
    it('should generate structure for skill type', () => {
      const item = createBaseCatalogItem({ type: 'skill', id: 'my-skill' })

      const result = generatePluginStructure(item)

      expect(result.contentType).toBe('skill')
      expect(result.contentPath).toBe('skills/my-skill/SKILL.md')
      expect(result.content).toContain('---')
    })

    it('should generate structure for agent type', () => {
      const item = createBaseCatalogItem({ type: 'agent', id: 'my-agent' })

      const result = generatePluginStructure(item)

      expect(result.contentType).toBe('agent')
      expect(result.contentPath).toBe('agents/my-agent.md')
    })

    it('should generate structure for command type', () => {
      const item = createBaseCatalogItem({ type: 'command', id: 'my-command' })

      const result = generatePluginStructure(item)

      expect(result.contentType).toBe('command')
      expect(result.contentPath).toBe('commands/my-command.md')
    })

    it('should generate structure for hook type', () => {
      const item = createBaseCatalogItem({
        type: 'hook',
        id: 'my-hook',
        hookEvent: 'PreToolUse',
        hookCommand: 'test',
      })

      const result = generatePluginStructure(item)

      expect(result.contentType).toBe('hook')
      expect(result.contentPath).toBe('hooks/my-hook.json')
    })

    it('should throw for guide type', () => {
      const item = createBaseCatalogItem({ type: 'guide' })

      expect(() => generatePluginStructure(item)).toThrow('Unsupported item type for marketplace: guide')
    })

    it('should include readme when available', () => {
      const item = createBaseCatalogItem({
        readme: '# Custom README\n\nCustom content',
      })

      const result = generatePluginStructure(item)

      expect(result.readme).toBe('# Custom README\n\nCustom content')
    })

    it('should include plugin json', () => {
      const item = createBaseCatalogItem({
        id: 'test',
        description: 'Test desc',
        marketplaceVersion: '2.0.0',
      })

      const result = generatePluginStructure(item)

      expect(result.pluginJson.name).toBe('test')
      expect(result.pluginJson.version).toBe('2.0.0')
      expect(result.pluginJson.description).toBe('Test desc')
    })
  })

  describe('generatePluginFiles', () => {
    it('should generate correct files for skill', () => {
      const item = createBaseCatalogItem({
        type: 'skill',
        id: 'test-skill',
      })

      const files = generatePluginFiles(item)

      expect(files.length).toBeGreaterThanOrEqual(2)

      const paths = files.map(f => f.path)
      expect(paths).toContain('plugins/test-skill/.claude-plugin/plugin.json')
      expect(paths).toContain('plugins/test-skill/skills/test-skill/SKILL.md')
      expect(paths.some(p => p.includes('README.md'))).toBe(true)
    })

    it('should use custom readme when provided', () => {
      const item = createBaseCatalogItem({
        id: 'my-plugin',
        readme: '# My Custom README',
      })

      const files = generatePluginFiles(item)
      const readme = files.find(f => f.path.includes('README.md'))

      expect(readme?.content).toBe('# My Custom README')
    })

    it('should generate default readme when not provided', () => {
      const item = createBaseCatalogItem({
        id: 'my-plugin',
        name: 'My Plugin',
        readme: undefined,
      })

      const files = generatePluginFiles(item)
      const readme = files.find(f => f.path.includes('README.md'))

      expect(readme?.content).toContain('# My Plugin')
      expect(readme?.content).toContain('Installation')
      expect(readme?.content).toContain('GPTers AI Toolkit')
    })

    it('should generate plugin.json with correct content', () => {
      const item = createBaseCatalogItem({
        id: 'test',
        marketplaceVersion: '1.2.3',
      })

      const files = generatePluginFiles(item)
      const pluginJson = files.find(f => f.path.includes('plugin.json'))

      expect(pluginJson).toBeDefined()
      const parsed = JSON.parse(pluginJson!.content)
      expect(parsed.name).toBe('test')
      expect(parsed.version).toBe('1.2.3')
    })

    it('should generate files for agent type', () => {
      const item = createBaseCatalogItem({
        type: 'agent',
        id: 'my-agent',
      })

      const files = generatePluginFiles(item)
      const paths = files.map(f => f.path)

      expect(paths).toContain('plugins/my-agent/agents/my-agent.md')
    })

    it('should generate files for command type', () => {
      const item = createBaseCatalogItem({
        type: 'command',
        id: 'my-command',
      })

      const files = generatePluginFiles(item)
      const paths = files.map(f => f.path)

      expect(paths).toContain('plugins/my-command/commands/my-command.md')
    })

    it('should generate hook readme with settings snippet', () => {
      const item = createBaseCatalogItem({
        type: 'hook',
        id: 'my-hook',
        name: 'My Hook',
        hookEvent: 'PreToolUse',
        hookCommand: 'test-cmd',
        readme: undefined,
      })

      const files = generatePluginFiles(item)
      const readme = files.find(f => f.path.includes('README.md'))

      expect(readme?.content).toContain('Event')
      expect(readme?.content).toContain('PreToolUse')
      expect(readme?.content).toContain('settings.json')
      expect(readme?.content).toContain('"hooks"')
    })
  })
})
