/**
 * MCP Server Types for GPTers Marketplace
 */

import type { ItemType, TeamTag, Difficulty } from '../types'

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
