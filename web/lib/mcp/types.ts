/**
 * MCP Server Types for GPTers Marketplace
 */

import type { ItemType, TeamTag, Difficulty, PluginFile } from '../types'

// Tool input schemas
export interface SearchPluginsInput {
  query: string
  category?: ItemType | 'all'
  teamTag?: TeamTag
  limit?: number
}

export interface GetPluginContentInput {
  pluginId: string
}

export interface ListPluginsInput {
  category?: ItemType | 'all'
  teamTag?: TeamTag
}

export interface GetPluginsByCategoryInput {
  category: ItemType
  limit?: number
}

export interface CreatePluginInput {
  id: string
  type: ItemType
  name: string
  description?: string
  content: string
  author?: string
  tags?: string[]
  teamTag?: 'platform' | 'ai' | 'data' | 'product' | 'infra' | 'general'
  readme?: string
  files?: PluginFile[]
  marketplaceEnabled?: boolean
}

export interface UpdatePluginInput {
  id: string
  name?: string
  description?: string
  content?: string
  author?: string
  tags?: string[]
  teamTag?: 'platform' | 'ai' | 'data' | 'product' | 'infra' | 'general'
  readme?: string
  files?: PluginFile[]
  marketplaceEnabled?: boolean
}

export interface DeletePluginInput {
  id: string
}

// Tool output types
export interface PluginSummary {
  id: string
  name: string
  type: ItemType
  description: string
  author: string
  tags: string[]
  teamTag?: TeamTag
  difficulty?: Difficulty
  relevanceScore?: number
}

export interface PluginContent {
  id: string
  name: string
  type: ItemType
  description: string
  author: string
  tags: string[]
  teamTag?: TeamTag
  difficulty?: Difficulty
  content: string       // Main content (SKILL.md, agent definition, etc.)
  readme?: string       // Additional documentation
  files?: PluginFile[]  // Additional files (scripts, references, etc.)
  dependencies?: string[]
  allowedTools?: string
  // Agent-specific
  agentModel?: string
  agentPermissionMode?: string
  agentSkills?: string
  // Command-specific
  commandArgumentHint?: string
  commandDisableModelInvocation?: boolean
}

export interface SearchResult {
  plugins: PluginSummary[]
  total: number
  query: string
}

export interface ListResult {
  plugins: PluginSummary[]
  total: number
}

// MCP Tool definitions
export interface McpTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

// MCP Response types
export interface McpToolResponse {
  content: Array<{
    type: 'text'
    text: string
  }>
  isError?: boolean
}

// MCP Prompt types
export interface McpPrompt {
  name: string
  description?: string
  arguments?: McpPromptArgument[]
}

export interface McpPromptArgument {
  name: string
  description?: string
  required?: boolean
}

export interface McpPromptMessage {
  role: 'user' | 'assistant'
  content: {
    type: 'text' | 'image' | 'resource'
    text?: string
  }
}

export interface McpPromptResult {
  description?: string
  messages: McpPromptMessage[]
}

export interface GetPromptInput {
  name: string
  arguments?: Record<string, string>
}
