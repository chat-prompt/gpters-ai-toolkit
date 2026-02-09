/**
 * GPTers AI Toolkit MCP Server
 *
 * This module provides MCP (Model Context Protocol) server functionality
 * for the GPTers AI Toolkit catalog.
 *
 * Usage:
 *
 * 1. As HTTP endpoint (via Next.js API):
 *    POST /api/mcp - JSON-RPC 2.0 endpoint
 *    POST /api/mcp/simple - Simple REST API
 *
 * 2. Tool functions (direct import):
 *    import { searchPlugins, getPluginContent, listPlugins } from '@/lib/mcp'
 */

// Export types
export type {
  SearchPluginsInput,
  GetPluginContentInput,
  ListPluginsInput,
  GetPluginsByCategoryInput,
  GetPromptInput,
  PluginSummary,
  PluginContent,
  SearchResult,
  ListResult,
  McpTool,
  McpToolResponse,
  McpPrompt,
  McpPromptArgument,
  McpPromptMessage,
  McpPromptResult,
} from './types'

// Export tools
export { MCP_TOOLS, getToolByName, getAllToolNames } from './tools'

// Export handlers
export {
  searchPlugins,
  getPluginContent,
  listPlugins,
  getPluginsByCategory,
  deploySkill,
  executeTool,
  listPrompts,
  getPrompt,
} from './handlers'

// Export server
export {
  processRequest,
  handleHttpRequest,
  handleSimpleRequest,
  SERVER_INFO,
  PROTOCOL_VERSION,
} from './server'
