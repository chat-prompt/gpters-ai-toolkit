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
  AddFilesInput,
  AddFilesResponse,
  RemoveFilesInput,
  RemoveFilesResponse,
  ToolExecutionMeta,
} from './types'

// Export tools
export { MCP_TOOLS, getToolByName, getAllToolNames, ADMIN_TOOL_NAMES, isAdminTool } from './tools'

// Export handlers
export {
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
} from './handlers'

// Export server
export {
  processRequest,
  handleHttpRequest,
  handleSimpleRequest,
  SERVER_INFO,
  PROTOCOL_VERSION,
} from './server'

// Export exercise-aware skill search (DEV-3055)
export {
  searchSkillsForExercise,
  type SkillSearchRequest,
  type SkillSearchResponse,
  type SkillSearchResultItem,
  type McpServerResultItem,
  type CliToolResultItem,
} from './skills-search'

// Export curated skill categories (DEV-3063)
export {
  getCuratedSkills,
  listCuratedCategories,
  type SkillCurateResponse,
  type CuratedSkillItem,
} from './skills-curate'

// Export version sync (DEV-3067)
export {
  fetchLatestVersion,
  isNewerVersion,
  detectStaleLibraryVersions,
  syncCliToolVersions,
  type VersionCheckResult,
  type VersionSyncSummary,
} from './version-sync'

// Export model docs sync (EDU-6875)
export {
  syncModelDocs,
  getLatestModels,
  type ProviderModelInfo,
  type ModelDocsSyncSummary,
  type ModelsApiResponse,
} from './model-docs-sync'
