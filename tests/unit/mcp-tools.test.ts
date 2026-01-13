import { describe, it, expect } from 'vitest'
import {
  MCP_TOOLS,
  getToolByName,
  getAllToolNames,
  ADMIN_TOOL_NAMES,
  isAdminTool,
} from '@/lib/mcp/tools'

describe('MCP Tools', () => {
  describe('Admin tools', () => {
    it('should define admin tool names', () => {
      expect(ADMIN_TOOL_NAMES).toContain('create_plugin')
      expect(ADMIN_TOOL_NAMES).toContain('update_plugin')
      expect(ADMIN_TOOL_NAMES).toContain('delete_plugin')
      expect(ADMIN_TOOL_NAMES).toHaveLength(3)
    })

    it('should correctly identify admin tools', () => {
      expect(isAdminTool('create_plugin')).toBe(true)
      expect(isAdminTool('update_plugin')).toBe(true)
      expect(isAdminTool('delete_plugin')).toBe(true)
      expect(isAdminTool('search_plugins')).toBe(false)
      expect(isAdminTool('deploy_skill')).toBe(false)
    })

    it('should not expose admin tools in MCP_TOOLS', () => {
      const toolNames = MCP_TOOLS.map((t) => t.name)
      expect(toolNames).not.toContain('create_plugin')
      expect(toolNames).not.toContain('update_plugin')
      expect(toolNames).not.toContain('delete_plugin')
    })

    it('should still allow finding admin tools via getToolByName (internal use)', () => {
      expect(getToolByName('create_plugin')).toBeDefined()
      expect(getToolByName('update_plugin')).toBeDefined()
      expect(getToolByName('delete_plugin')).toBeDefined()
    })
  })

  describe('MCP_TOOLS (public tools)', () => {
    it('should contain expected public tools', () => {
      const toolNames = MCP_TOOLS.map((t) => t.name)

      expect(toolNames).toContain('search_plugins')
      expect(toolNames).toContain('get_plugin_content')
      expect(toolNames).toContain('list_plugins')
      expect(toolNames).toContain('get_plugins_by_category')
      expect(toolNames).toContain('deploy_skill')
      expect(toolNames).toContain('undeploy_skill')
      expect(toolNames).toContain('check_updates')
      expect(toolNames).toContain('suggest_improvement')
      expect(toolNames).toContain('list_suggestions')
      expect(toolNames).toContain('resolve_suggestion')
    })

    it('should have 10 public tools total (13 - 3 admin)', () => {
      expect(MCP_TOOLS).toHaveLength(10)
    })

    describe('search_plugins tool', () => {
      const tool = MCP_TOOLS.find((t) => t.name === 'search_plugins')!

      it('should have correct schema', () => {
        expect(tool.inputSchema.type).toBe('object')
        expect(tool.inputSchema.required).toContain('query')
      })

      it('should have query property', () => {
        expect(tool.inputSchema.properties.query).toBeDefined()
        expect(tool.inputSchema.properties.query.type).toBe('string')
      })

      it('should have category enum', () => {
        expect(tool.inputSchema.properties.category.enum).toContain('skill')
        expect(tool.inputSchema.properties.category.enum).toContain('agent')
        expect(tool.inputSchema.properties.category.enum).toContain('command')
        expect(tool.inputSchema.properties.category.enum).toContain('guide')
        expect(tool.inputSchema.properties.category.enum).toContain('all')
      })

      it('should have teamTag enum', () => {
        expect(tool.inputSchema.properties.teamTag.enum).toContain('platform')
        expect(tool.inputSchema.properties.teamTag.enum).toContain('ai')
        expect(tool.inputSchema.properties.teamTag.enum).toContain('data')
        expect(tool.inputSchema.properties.teamTag.enum).toContain('general')
      })

      it('should have limit property', () => {
        expect(tool.inputSchema.properties.limit).toBeDefined()
        expect(tool.inputSchema.properties.limit.type).toBe('number')
      })
    })

    describe('get_plugin_content tool', () => {
      const tool = MCP_TOOLS.find((t) => t.name === 'get_plugin_content')!

      it('should have correct schema', () => {
        expect(tool.inputSchema.type).toBe('object')
        expect(tool.inputSchema.required).toContain('pluginId')
      })

      it('should have pluginId property', () => {
        expect(tool.inputSchema.properties.pluginId).toBeDefined()
        expect(tool.inputSchema.properties.pluginId.type).toBe('string')
      })
    })

    describe('list_plugins tool', () => {
      const tool = MCP_TOOLS.find((t) => t.name === 'list_plugins')!

      it('should have no required fields', () => {
        expect(tool.inputSchema.required).toBeUndefined()
      })

      it('should have optional category and teamTag', () => {
        expect(tool.inputSchema.properties.category).toBeDefined()
        expect(tool.inputSchema.properties.teamTag).toBeDefined()
      })
    })

    describe('get_plugins_by_category tool', () => {
      const tool = MCP_TOOLS.find((t) => t.name === 'get_plugins_by_category')!

      it('should require category', () => {
        expect(tool.inputSchema.required).toContain('category')
      })

      it('should have category enum without "all"', () => {
        expect(tool.inputSchema.properties.category.enum).toContain('skill')
        expect(tool.inputSchema.properties.category.enum).not.toContain('all')
      })
    })

    describe('deploy_skill tool', () => {
      const tool = MCP_TOOLS.find((t) => t.name === 'deploy_skill')!

      it('should require type, name, content', () => {
        expect(tool.inputSchema.required).toContain('type')
        expect(tool.inputSchema.required).toContain('name')
        expect(tool.inputSchema.required).toContain('content')
      })

      it('should have status enum', () => {
        expect(tool.inputSchema.properties.status.enum).toContain('draft')
        expect(tool.inputSchema.properties.status.enum).toContain('published')
      })

      it('should have changelog property', () => {
        expect(tool.inputSchema.properties.changelog).toBeDefined()
        expect(tool.inputSchema.properties.changelog.type).toBe('string')
      })
    })

    describe('undeploy_skill tool', () => {
      const tool = MCP_TOOLS.find((t) => t.name === 'undeploy_skill')!

      it('should require id', () => {
        expect(tool.inputSchema.required).toContain('id')
      })

      it('should have id property', () => {
        expect(tool.inputSchema.properties.id).toBeDefined()
        expect(tool.inputSchema.properties.id.type).toBe('string')
      })

      it('should have description mentioning ownership', () => {
        expect(tool.description).toContain('본인')
      })
    })

    describe('check_updates tool', () => {
      const tool = MCP_TOOLS.find((t) => t.name === 'check_updates')!

      it('should require installations', () => {
        expect(tool.inputSchema.required).toContain('installations')
      })

      it('should have installations as array', () => {
        expect(tool.inputSchema.properties.installations.type).toBe('array')
      })

      it('should have installation item with id and version', () => {
        const itemSchema = tool.inputSchema.properties.installations.items
        expect(itemSchema.properties.id).toBeDefined()
        expect(itemSchema.properties.version).toBeDefined()
        expect(itemSchema.required).toContain('id')
        expect(itemSchema.required).toContain('version')
      })
    })

    describe('all tools have descriptions', () => {
      MCP_TOOLS.forEach((tool) => {
        it(`${tool.name} should have description`, () => {
          expect(tool.description).toBeDefined()
          expect(tool.description.length).toBeGreaterThan(10)
        })
      })
    })

    describe('all tools have valid input schemas', () => {
      MCP_TOOLS.forEach((tool) => {
        it(`${tool.name} should have valid input schema`, () => {
          expect(tool.inputSchema).toBeDefined()
          expect(tool.inputSchema.type).toBe('object')
          expect(tool.inputSchema.properties).toBeDefined()
        })
      })
    })
  })

  describe('getToolByName', () => {
    it('should return tool by name', () => {
      const tool = getToolByName('search_plugins')
      expect(tool).toBeDefined()
      expect(tool?.name).toBe('search_plugins')
    })

    it('should return undefined for unknown tool', () => {
      const tool = getToolByName('unknown_tool')
      expect(tool).toBeUndefined()
    })

    it('should return all tools correctly', () => {
      MCP_TOOLS.forEach((expectedTool) => {
        const tool = getToolByName(expectedTool.name)
        expect(tool).toBe(expectedTool)
      })
    })
  })

  describe('getAllToolNames', () => {
    it('should return all public tool names', () => {
      const names = getAllToolNames()
      expect(names).toHaveLength(MCP_TOOLS.length)
    })

    it('should contain all expected public names', () => {
      const names = getAllToolNames()
      expect(names).toContain('search_plugins')
      expect(names).toContain('get_plugin_content')
      expect(names).toContain('list_plugins')
      expect(names).toContain('get_plugins_by_category')
      expect(names).toContain('deploy_skill')
      expect(names).toContain('undeploy_skill')
      expect(names).toContain('check_updates')
    })

    it('should not contain admin tool names', () => {
      const names = getAllToolNames()
      expect(names).not.toContain('create_plugin')
      expect(names).not.toContain('update_plugin')
      expect(names).not.toContain('delete_plugin')
    })

    it('should return names in order', () => {
      const names = getAllToolNames()
      const expectedOrder = MCP_TOOLS.map((t) => t.name)
      expect(names).toEqual(expectedOrder)
    })
  })
})
