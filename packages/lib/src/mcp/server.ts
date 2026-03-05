/**
 * MCP Server for GPTers AI Toolkit
 *
 * This module provides both:
 * 1. Standalone MCP server (for stdio transport)
 * 2. HTTP handler (for REST API endpoint)
 */

import { MCP_TOOLS } from './tools'
import { executeTool, listPrompts, getPrompt } from './handlers'
import type { McpToolResponse, McpPromptResult, GetPromptInput } from './types'

// MCP Protocol types
interface McpRequest {
  jsonrpc: '2.0'
  id?: string | number | null  // Optional for notifications
  method: string
  params?: Record<string, unknown>
}

// Check if request is a notification (no id field)
function isNotification(request: McpRequest): boolean {
  return request.id === undefined
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
  name: 'gpters-ai-toolkit',
  version: '1.0.0',
  description: 'GPTers AI Toolkit MCP Server',
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
      resources: {},
    },
  }
}

/**
 * Handle tools/list request
 */
function handleToolsList(): McpResponse['result'] {
  return {
    tools: MCP_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }
}

/**
 * Handle tools/call request
 */
async function handleToolsCall(
  params: {
    name: string
    arguments?: Record<string, unknown>
  },
  userId?: string,
  userRole?: string,
  orgId?: string
): Promise<McpToolResponse> {
  const { name, arguments: args = {} } = params
  return executeTool(name, args, userId, userRole, orgId)
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
 * Returns null for notifications (per JSON-RPC 2.0 spec, notifications don't get responses)
 *
 * @param request - MCP JSON-RPC request
 * @param userId - Authenticated user ID (for ownership-based operations)
 * @param userRole - Authenticated user's role (for admin override)
 * @param orgId - User's current organization ID (for org-based filtering)
 */
export async function processRequest(
  request: McpRequest,
  userId?: string,
  userRole?: string,
  orgId?: string
): Promise<McpResponse | null> {
  const { id, method, params } = request

  // Handle notifications (no response expected)
  // Per JSON-RPC 2.0: "The Server MUST NOT reply to a Notification"
  if (isNotification(request)) {
    // Just acknowledge known notifications silently
    if (method === 'notifications/initialized' ||
        method === 'notifications/cancelled' ||
        method.startsWith('notifications/')) {
      return null  // No response for notifications
    }
  }

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: id!,
          result: handleInitialize(),
        }

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id: id!,
          result: handleToolsList(),
        }

      case 'tools/call': {
        const toolParams = params as { name: string; arguments?: Record<string, unknown> }
        const result = await handleToolsCall(toolParams, userId, userRole, orgId)
        return {
          jsonrpc: '2.0',
          id: id!,
          result,
        }
      }

      case 'prompts/list': {
        const result = await handlePromptsList()
        return {
          jsonrpc: '2.0',
          id: id!,
          result,
        }
      }

      case 'prompts/get': {
        const promptParams = params as unknown as GetPromptInput
        if (!promptParams?.name) {
          return {
            jsonrpc: '2.0',
            id: id!,
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
            id: id!,
            error: {
              code: -32602,
              message: `Prompt not found: ${promptParams.name}`,
            },
          }
        }
        return {
          jsonrpc: '2.0',
          id: id!,
          result,
        }
      }

      case 'resources/list':
        return {
          jsonrpc: '2.0',
          id: id!,
          result: { resources: [] },
        }

      case 'resources/templates/list':
        return {
          jsonrpc: '2.0',
          id: id!,
          result: { resourceTemplates: [] },
        }

      case 'ping':
        return {
          jsonrpc: '2.0',
          id: id!,
          result: {},
        }

      default:
        return {
          jsonrpc: '2.0',
          id: id!,
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
      id: id!,
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
 * Returns null for notifications (no response should be sent)
 *
 * @param body - JSON-RPC request body
 * @param userId - Authenticated user ID (for ownership-based operations)
 * @param userRole - Authenticated user's role (for admin override)
 * @param orgId - User's current organization ID (for org-based filtering)
 */
export async function handleHttpRequest(
  body: unknown,
  userId?: string,
  userRole?: string,
  orgId?: string
): Promise<McpResponse | McpResponse[] | null> {
  // Handle batch requests
  if (Array.isArray(body)) {
    const responses = await Promise.all(
      body.map((req) => processRequest(req as McpRequest, userId, userRole, orgId))
    )
    // Filter out null responses (notifications)
    const validResponses = responses.filter((r): r is McpResponse => r !== null)
    return validResponses.length > 0 ? validResponses : null
  }

  // Handle single request
  return processRequest(body as McpRequest, userId, userRole, orgId)
}

/**
 * Simple REST API handler (non-JSON-RPC)
 * For easier integration without full MCP client
 *
 * @param action - API action (search, get, list, etc.)
 * @param params - Action parameters
 * @param userId - Authenticated user ID (for ownership-based operations)
 * @param userRole - Authenticated user's role (for admin override)
 * @param orgId - User's current organization ID (for org-based filtering)
 */
export async function handleSimpleRequest(
  action: string,
  params: Record<string, unknown>,
  userId?: string,
  userRole?: string,
  orgId?: string
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    switch (action) {
      case 'search': {
        const result = await executeTool('search_plugins', params, userId, userRole, orgId)
        return {
          success: !result.isError,
          data: JSON.parse(result.content[0].text),
        }
      }

      case 'get': {
        const result = await executeTool('get_plugin_content', params, userId, userRole, orgId)
        return {
          success: !result.isError,
          data: JSON.parse(result.content[0].text),
        }
      }

      case 'list': {
        const result = await executeTool('list_plugins', params, userId, userRole, orgId)
        return {
          success: !result.isError,
          data: JSON.parse(result.content[0].text),
        }
      }

      case 'tools': {
        return {
          success: true,
          data: {
            tools: MCP_TOOLS.map((t) => ({
              name: t.name,
              description: t.description.split('\n')[0], // First line only
            })),
          },
        }
      }

      case 'create': {
        const result = await executeTool('create_plugin', params, userId, userRole, orgId)
        return {
          success: !result.isError,
          data: JSON.parse(result.content[0].text),
        }
      }

      case 'deploy': {
        const result = await executeTool('deploy_skill', params, userId, userRole, orgId)
        let data: unknown
        try {
          data = JSON.parse(result.content[0].text)
        } catch {
          // deploy_skill may append non-JSON quality hints after the JSON object
          const jsonMatch = result.content[0].text.match(/^[\s\S]*?\}/)
          data = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: result.content[0].text }
        }
        return {
          success: !result.isError,
          data,
        }
      }

      case 'update': {
        const result = await executeTool('update_plugin', params, userId, userRole, orgId)
        return {
          success: !result.isError,
          data: JSON.parse(result.content[0].text),
        }
      }

      case 'delete': {
        const result = await executeTool('delete_plugin', params, userId, userRole, orgId)
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
