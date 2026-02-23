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
      expect(isAdminTool('semantic_search')).toBe(false)
      expect(isAdminTool('deploy_skill')).toBe(false)
    })

    it('should not expose admin tools in MCP_TOOLS', () => {
      const toolNames = MCP_TOOLS.map((t) => t.name)
      expect(toolNames).not.toContain('create_plugin')
      expect(toolNames).not.toContain('update_plugin')
      expect(toolNames).not.toContain('delete_plugin')
    })
  })

  describe('MCP_TOOLS (public tools)', () => {
    it('should contain expected public tools', () => {
      const toolNames = MCP_TOOLS.map((t) => t.name)

      expect(toolNames).toContain('semantic_search')
      expect(toolNames).toContain('get_plugin_content')
      expect(toolNames).toContain('deploy_skill')
      expect(toolNames).toContain('undeploy_skill')
      expect(toolNames).toContain('check_updates')
      expect(toolNames).toContain('suggest_improvement')
      expect(toolNames).toContain('list_suggestions')
      expect(toolNames).toContain('resolve_suggestion')
      expect(toolNames).toContain('add_files')
      expect(toolNames).toContain('remove_files')
      expect(toolNames).toContain('report_session_event')
    })

    it('should have 11 public tools', () => {
      expect(MCP_TOOLS).toHaveLength(11)
    })

    describe('semantic_search tool', () => {
      const tool = MCP_TOOLS.find((t) => t.name === 'semantic_search')!

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

    describe('deploy_skill tool', () => {
      const tool = MCP_TOOLS.find((t) => t.name === 'deploy_skill')!

      it('should require type and name', () => {
        expect(tool.inputSchema.required).toContain('type')
        expect(tool.inputSchema.required).toContain('name')
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

    describe('add_files tool', () => {
      const tool = MCP_TOOLS.find((t) => t.name === 'add_files')!

      it('should require id and files', () => {
        expect(tool.inputSchema.required).toContain('id')
        expect(tool.inputSchema.required).toContain('files')
      })

      it('should have files as array with name and content required', () => {
        expect(tool.inputSchema.properties.files.type).toBe('array')
        const itemSchema = tool.inputSchema.properties.files.items
        expect(itemSchema.required).toContain('name')
        expect(itemSchema.required).toContain('content')
      })
    })

    describe('remove_files tool', () => {
      const tool = MCP_TOOLS.find((t) => t.name === 'remove_files')!

      it('should require id and fileNames', () => {
        expect(tool.inputSchema.required).toContain('id')
        expect(tool.inputSchema.required).toContain('fileNames')
      })

      it('should have fileNames as array of strings', () => {
        expect(tool.inputSchema.properties.fileNames.type).toBe('array')
        expect(tool.inputSchema.properties.fileNames.items.type).toBe('string')
      })
    })

    describe('report_session_event tool', () => {
      const tool = MCP_TOOLS.find((t) => t.name === 'report_session_event')!

      it('should require eventType', () => {
        expect(tool.inputSchema.required).toContain('eventType')
      })

      it('should have eventType enum', () => {
        expect(tool.inputSchema.properties.eventType.enum).toContain('session_summary')
        expect(tool.inputSchema.properties.eventType.enum).toContain('session_end')
      })

      it('should have optional promptCount', () => {
        expect(tool.inputSchema.properties.promptCount).toBeDefined()
        expect(tool.inputSchema.properties.promptCount.type).toBe('number')
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
      const tool = getToolByName('semantic_search')
      expect(tool).toBeDefined()
      expect(tool?.name).toBe('semantic_search')
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
      expect(names).toContain('semantic_search')
      expect(names).toContain('get_plugin_content')
      expect(names).toContain('deploy_skill')
      expect(names).toContain('undeploy_skill')
      expect(names).toContain('check_updates')
      expect(names).toContain('add_files')
      expect(names).toContain('remove_files')
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
