import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the handlers
vi.mock('@/lib/mcp/handlers', () => ({
  executeTool: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"result": "success"}' }],
  }),
  listPrompts: vi.fn().mockResolvedValue([
    { name: 'test-skill', description: '[skill] A test skill' },
  ]),
  getPrompt: vi.fn().mockResolvedValue({
    description: 'Test prompt',
    messages: [{ role: 'user', content: { type: 'text', text: 'Test content' } }],
  }),
}))

// Mock the tools
vi.mock('@/lib/mcp/tools', () => ({
  MCP_TOOLS: [
    {
      name: 'search_plugins',
      description: 'Search plugins',
      inputSchema: { type: 'object', properties: {}, required: ['query'] },
    },
    {
      name: 'list_plugins',
      description: 'List plugins',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}))

import {
  processRequest,
  handleHttpRequest,
  handleSimpleRequest,
  SERVER_INFO,
  PROTOCOL_VERSION,
} from '@/lib/mcp/server'
import { executeTool, listPrompts, getPrompt } from '@/lib/mcp/handlers'

describe('MCP Server', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('SERVER_INFO', () => {
    it('should have correct name', () => {
      expect(SERVER_INFO.name).toBe('gpters-ai-toolkit')
    })

    it('should have version', () => {
      expect(SERVER_INFO.version).toBeDefined()
    })

    it('should have description', () => {
      expect(SERVER_INFO.description).toBeDefined()
    })
  })

  describe('PROTOCOL_VERSION', () => {
    it('should be defined', () => {
      expect(PROTOCOL_VERSION).toBeDefined()
      expect(PROTOCOL_VERSION).toMatch(/\d{4}-\d{2}-\d{2}/)
    })
  })

  describe('processRequest', () => {
    describe('initialize', () => {
      it('should return server info and capabilities', async () => {
        const response = await processRequest({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
        })

        expect(response.jsonrpc).toBe('2.0')
        expect(response.id).toBe(1)
        expect(response.result).toBeDefined()
        expect(response.result.protocolVersion).toBe(PROTOCOL_VERSION)
        expect(response.result.serverInfo).toBeDefined()
        expect(response.result.serverInfo.name).toBe('gpters-ai-toolkit')
        expect(response.result.capabilities.tools).toBeDefined()
        expect(response.result.capabilities.prompts).toBeDefined()
      })
    })

    describe('tools/list', () => {
      it('should return list of tools', async () => {
        const response = await processRequest({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
        })

        expect(response.jsonrpc).toBe('2.0')
        expect(response.id).toBe(2)
        expect(response.result.tools).toBeDefined()
        expect(Array.isArray(response.result.tools)).toBe(true)
        expect(response.result.tools.length).toBeGreaterThan(0)
      })

      it('should include tool names and descriptions', async () => {
        const response = await processRequest({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/list',
        })

        const tool = response.result.tools[0]
        expect(tool.name).toBeDefined()
        expect(tool.description).toBeDefined()
        expect(tool.inputSchema).toBeDefined()
      })
    })

    describe('tools/call', () => {
      it('should call executeTool with correct parameters', async () => {
        const response = await processRequest({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'search_plugins',
            arguments: { query: 'test' },
          },
        })

        expect(executeTool).toHaveBeenCalledWith('search_plugins', { query: 'test' })
        expect(response.jsonrpc).toBe('2.0')
        expect(response.id).toBe(4)
        expect(response.result).toBeDefined()
      })

      it('should handle missing arguments', async () => {
        await processRequest({
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: { name: 'search_plugins' },
        })

        expect(executeTool).toHaveBeenCalledWith('search_plugins', {})
      })
    })

    describe('prompts/list', () => {
      it('should return list of prompts', async () => {
        const response = await processRequest({
          jsonrpc: '2.0',
          id: 6,
          method: 'prompts/list',
        })

        expect(listPrompts).toHaveBeenCalled()
        expect(response.jsonrpc).toBe('2.0')
        expect(response.id).toBe(6)
        expect(response.result.prompts).toBeDefined()
      })
    })

    describe('prompts/get', () => {
      it('should return prompt content', async () => {
        const response = await processRequest({
          jsonrpc: '2.0',
          id: 7,
          method: 'prompts/get',
          params: { name: 'test-skill' },
        })

        expect(getPrompt).toHaveBeenCalledWith({ name: 'test-skill' })
        expect(response.jsonrpc).toBe('2.0')
        expect(response.id).toBe(7)
        expect(response.result).toBeDefined()
      })

      it('should return error for missing name', async () => {
        const response = await processRequest({
          jsonrpc: '2.0',
          id: 8,
          method: 'prompts/get',
          params: {},
        })

        expect(response.error).toBeDefined()
        expect(response.error?.code).toBe(-32602)
        expect(response.error?.message).toContain('Missing required parameter')
      })

      it('should return error for not found prompt', async () => {
        vi.mocked(getPrompt).mockResolvedValueOnce(null)

        const response = await processRequest({
          jsonrpc: '2.0',
          id: 9,
          method: 'prompts/get',
          params: { name: 'nonexistent' },
        })

        expect(response.error).toBeDefined()
        expect(response.error?.code).toBe(-32602)
        expect(response.error?.message).toContain('Prompt not found')
      })
    })

    describe('ping', () => {
      it('should return empty result', async () => {
        const response = await processRequest({
          jsonrpc: '2.0',
          id: 10,
          method: 'ping',
        })

        expect(response.jsonrpc).toBe('2.0')
        expect(response.id).toBe(10)
        expect(response.result).toEqual({})
      })
    })

    describe('unknown method', () => {
      it('should return method not found error', async () => {
        const response = await processRequest({
          jsonrpc: '2.0',
          id: 11,
          method: 'unknown/method',
        })

        expect(response.error).toBeDefined()
        expect(response.error?.code).toBe(-32601)
        expect(response.error?.message).toContain('Method not found')
      })
    })

    describe('error handling', () => {
      it('should handle exceptions gracefully', async () => {
        vi.mocked(executeTool).mockRejectedValueOnce(new Error('Database error'))

        const response = await processRequest({
          jsonrpc: '2.0',
          id: 12,
          method: 'tools/call',
          params: { name: 'search_plugins' },
        })

        expect(response.error).toBeDefined()
        expect(response.error?.code).toBe(-32603)
        expect(response.error?.message).toBe('Database error')
      })
    })
  })

  describe('handleHttpRequest', () => {
    it('should handle single request', async () => {
      const response = await handleHttpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
      })

      expect(response).not.toBeInstanceOf(Array)
      expect((response as { id: number }).id).toBe(1)
    })

    it('should handle batch requests', async () => {
      const responses = await handleHttpRequest([
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { jsonrpc: '2.0', id: 2, method: 'ping' },
      ])

      expect(Array.isArray(responses)).toBe(true)
      expect((responses as Array<{ id: number }>)).toHaveLength(2)
    })

    it('should process batch requests in parallel', async () => {
      const responses = await handleHttpRequest([
        { jsonrpc: '2.0', id: 1, method: 'initialize' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        { jsonrpc: '2.0', id: 3, method: 'prompts/list' },
      ])

      expect(Array.isArray(responses)).toBe(true)
      expect((responses as Array<{ id: number }>)).toHaveLength(3)
    })
  })

  describe('handleSimpleRequest', () => {
    beforeEach(() => {
      vi.mocked(executeTool).mockResolvedValue({
        content: [{ type: 'text', text: '{"plugins": []}' }],
      })
    })

    describe('search action', () => {
      it('should call search_plugins tool', async () => {
        const result = await handleSimpleRequest('search', { query: 'test' })

        expect(executeTool).toHaveBeenCalledWith('search_plugins', { query: 'test' })
        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()
      })
    })

    describe('get action', () => {
      it('should call get_plugin_content tool', async () => {
        const result = await handleSimpleRequest('get', { pluginId: 'test-skill' })

        expect(executeTool).toHaveBeenCalledWith('get_plugin_content', { pluginId: 'test-skill' })
        expect(result.success).toBe(true)
      })
    })

    describe('list action', () => {
      it('should call list_plugins tool', async () => {
        const result = await handleSimpleRequest('list', {})

        expect(executeTool).toHaveBeenCalledWith('list_plugins', {})
        expect(result.success).toBe(true)
      })
    })

    describe('tools action', () => {
      it('should return tool list without calling executeTool', async () => {
        const result = await handleSimpleRequest('tools', {})

        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()
        expect((result.data as { tools: unknown[] }).tools).toBeDefined()
      })
    })

    describe('create action', () => {
      it('should call create_plugin tool', async () => {
        const result = await handleSimpleRequest('create', {
          id: 'new-skill',
          type: 'skill',
          name: 'New Skill',
          content: '# Content',
        })

        expect(executeTool).toHaveBeenCalledWith('create_plugin', {
          id: 'new-skill',
          type: 'skill',
          name: 'New Skill',
          content: '# Content',
        })
        expect(result.success).toBe(true)
      })
    })

    describe('update action', () => {
      it('should call update_plugin tool', async () => {
        const result = await handleSimpleRequest('update', {
          id: 'test-skill',
          name: 'Updated Name',
        })

        expect(executeTool).toHaveBeenCalledWith('update_plugin', {
          id: 'test-skill',
          name: 'Updated Name',
        })
        expect(result.success).toBe(true)
      })
    })

    describe('delete action', () => {
      it('should call delete_plugin tool', async () => {
        const result = await handleSimpleRequest('delete', { id: 'test-skill' })

        expect(executeTool).toHaveBeenCalledWith('delete_plugin', { id: 'test-skill' })
        expect(result.success).toBe(true)
      })
    })

    describe('unknown action', () => {
      it('should return error', async () => {
        const result = await handleSimpleRequest('unknown', {})

        expect(result.success).toBe(false)
        expect(result.error).toContain('Unknown action')
      })
    })

    describe('error handling', () => {
      it('should handle tool errors', async () => {
        vi.mocked(executeTool).mockResolvedValueOnce({
          content: [{ type: 'text', text: '{"error": "Plugin not found"}' }],
          isError: true,
        })

        const result = await handleSimpleRequest('get', { pluginId: 'nonexistent' })

        expect(result.success).toBe(false)
      })

      it('should handle exceptions', async () => {
        vi.mocked(executeTool).mockRejectedValueOnce(new Error('Database error'))

        const result = await handleSimpleRequest('search', { query: 'test' })

        expect(result.success).toBe(false)
        expect(result.error).toBe('Database error')
      })
    })
  })
})
