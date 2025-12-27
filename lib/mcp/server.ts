/**
 * MCP Server for GPTers Marketplace
 *
 * This module provides both:
 * 1. Standalone MCP server (for stdio transport)
 * 2. HTTP handler (for REST API endpoint)
 */

import { MARKETPLACE_TOOLS } from './tools'
import { executeTool, listPrompts, getPrompt } from './handlers'
import type { McpToolResponse, McpPromptResult, GetPromptInput } from './types'

// MCP Protocol types
interface McpRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

interface McpResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

// Server info
const SERVER_INFO = {
  name: 'gpters-marketplace',
  version: '1.0.0',
  description: 'GPTers AI Toolkit Marketplace MCP Server',
}

// Protocol version
const PROTOCOL_VERSION = '2024-11-05'

/**
 * Handle MCP initialize request
 */
function handleInitialize(): McpResponse['result'] {
  return {
    protocolVersion: PROTOCOL_VERSION,
    serverInfo: SERVER_INFO,
    capabilities: {
      tools: {},
      prompts: {},
    },
  }
}

/**
 * Handle tools/list request
 */
function handleToolsList(): McpResponse['result'] {
  return {
    tools: MARKETPLACE_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }
}

/**
 * Handle tools/call request
 */
async function handleToolsCall(params: {
  name: string
  arguments?: Record<string, unknown>
}): Promise<McpToolResponse> {
  const { name, arguments: args = {} } = params
  return executeTool(name, args)
}

/**
 * Handle prompts/list request
 */
async function handlePromptsList(): Promise<McpResponse['result']> {
  const prompts = await listPrompts()
  return { prompts }
}

/**
 * Handle prompts/get request
 */
async function handlePromptsGet(params: GetPromptInput): Promise<McpPromptResult | null> {
  return getPrompt(params)
}

/**
 * Process a single MCP request
 */
export async function processRequest(request: McpRequest): Promise<McpResponse> {
  const { id, method, params } = request

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: handleInitialize(),
        }

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: handleToolsList(),
        }

      case 'tools/call': {
        const toolParams = params as { name: string; arguments?: Record<string, unknown> }
        const result = await handleToolsCall(toolParams)
        return {
          jsonrpc: '2.0',
          id,
          result,
        }
      }

      case 'prompts/list': {
        const result = await handlePromptsList()
        return {
          jsonrpc: '2.0',
          id,
          result,
        }
      }

      case 'prompts/get': {
        const promptParams = params as unknown as GetPromptInput
        if (!promptParams?.name) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: 'Missing required parameter: name',
            },
          }
        }
        const result = await handlePromptsGet(promptParams)
        if (!result) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: `Prompt not found: ${promptParams.name}`,
            },
          }
        }
        return {
          jsonrpc: '2.0',
          id,
          result,
        }
      }

      case 'ping':
        return {
          jsonrpc: '2.0',
          id,
          result: {},
        }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: errorMessage,
      },
    }
  }
}

/**
 * HTTP Handler for MCP requests
 * Used by Next.js API route
 */
export async function handleHttpRequest(body: unknown): Promise<McpResponse | McpResponse[]> {
  // Handle batch requests
  if (Array.isArray(body)) {
    const responses = await Promise.all(
      body.map((req) => processRequest(req as McpRequest))
    )
    return responses
  }

  // Handle single request
  return processRequest(body as McpRequest)
}

/**
 * Simple REST API handler (non-JSON-RPC)
 * For easier integration without full MCP client
 */
export async function handleSimpleRequest(
  action: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    switch (action) {
      case 'search': {
        const result = await executeTool('search_plugins', params)
        return {
          success: !result.isError,
          data: JSON.parse(result.content[0].text),
        }
      }

      case 'get': {
        const result = await executeTool('get_plugin_content', params)
        return {
          success: !result.isError,
          data: JSON.parse(result.content[0].text),
        }
      }

      case 'list': {
        const result = await executeTool('list_plugins', params)
        return {
          success: !result.isError,
          data: JSON.parse(result.content[0].text),
        }
      }

      case 'tools': {
        return {
          success: true,
          data: {
            tools: MARKETPLACE_TOOLS.map((t) => ({
              name: t.name,
              description: t.description.split('\n')[0], // First line only
            })),
          },
        }
      }

      case 'create': {
        const result = await executeTool('create_plugin', params)
        return {
          success: !result.isError,
          data: JSON.parse(result.content[0].text),
        }
      }

      case 'update': {
        const result = await executeTool('update_plugin', params)
        return {
          success: !result.isError,
          data: JSON.parse(result.content[0].text),
        }
      }

      case 'delete': {
        const result = await executeTool('delete_plugin', params)
        return {
          success: !result.isError,
          data: JSON.parse(result.content[0].text),
        }
      }

      default:
        return {
          success: false,
          error: `Unknown action: ${action}`,
        }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export { SERVER_INFO, PROTOCOL_VERSION }
