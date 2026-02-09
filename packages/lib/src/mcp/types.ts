/**
 * MCP Server Types for GPTers Marketplace
 */

import type { ItemType, TeamTag, Difficulty, PluginFile } from '../core/types'

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
  mcpEnabled?: boolean
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
  mcpEnabled?: boolean
}

export interface DeletePluginInput {
  id: string
}

// V2: Deploy and version management inputs
export interface DeploySkillInput {
  type: ItemType
  name: string
  content: string
  id?: string                    // Auto-generated from name if not provided
  description?: string
  tags?: string[]
  teamTag?: 'platform' | 'ai' | 'data' | 'product' | 'infra' | 'general'
  allowedTools?: string
  agentModel?: string
  agentPermissionMode?: string
  agentSkills?: string
  status?: 'draft' | 'published'
  changelog?: string             // What changed in this version
  files?: PluginFile[]
  dependencies?: string[]        // Agent dependencies with agent: prefix
}

export interface DeploySkillResponse {
  success: boolean
  id: string
  version: string
  previousVersion?: string
  changelog: string
  status: string
  webUrl: string
  installHint: string
  error?: string
  // GitHub sync result
  githubSync?: {
    success: boolean
    filesCreated: string[]
    filesUpdated: string[]
    errors: string[]
  }
}

export interface CheckUpdatesInput {
  installations: Array<{
    id: string
    version: string
  }>
}

export interface CheckUpdatesResponse {
  updates: Array<{
    id: string
    name: string
    installedVersion: string
    latestVersion: string
    changelog: string
  }>
  upToDate: number
}

// Tool output types
export interface PluginSummary {
  id: string
  name: string
  type: ItemType
  description: string
  authorName: string
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
  authorName: string
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
  // V2: Version info
  version?: string
  status?: string
  changelog?: string
  // Resolved agent dependencies (when applicable)
  resolvedAgents?: ResolvedAgent[]
  // Usage hint for Claude when resolvedAgents are present
  agentUsageHint?: string
  // Usage hint for Claude when files are present
  filesUsageHint?: string
}

/**
 * Resolved agent configuration suitable for use as a subagent.
 *
 * Represents an agent with all necessary configuration resolved and ready
 * to be invoked as a subagent in Claude Code.
 */
export interface ResolvedAgent {
  /** Agent identifier */
  id: string
  /** System prompt/instructions for the agent */
  prompt: string
  /** Description of what this agent does */
  description: string
  /** AI model identifier (mapped from agentModel field) */
  model: string
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

// Collaboration: Suggestion types
export interface SuggestImprovementInput {
  pluginId: string
  title: string
  description: string
  diff?: string
  suggestedByName?: string
}

export interface SuggestImprovementResponse {
  success: boolean
  suggestionId: string
  pluginId: string
  pluginName: string
  message: string
}

export interface ListSuggestionsInput {
  pluginId?: string
  status?: 'pending' | 'accepted' | 'rejected' | 'all'
  limit?: number
}

export interface SuggestionSummary {
  id: string
  pluginId: string
  pluginName: string
  title: string
  description: string
  status: 'pending' | 'accepted' | 'rejected'
  suggestedByName: string | null
  createdAt: string
  resolvedAt: string | null
  resolveComment: string | null
}

export interface ListSuggestionsResponse {
  suggestions: SuggestionSummary[]
  total: number
}

export interface ResolveSuggestionInput {
  suggestionId: string
  action: 'accept' | 'reject'
  comment?: string
}

export interface ResolveSuggestionResponse {
  success: boolean
  suggestionId: string
  action: 'accept' | 'reject'
  pluginId: string
  pluginName: string
  newVersion?: string
  /** diff가 있었고 content에 자동 적용되었는지 여부 */
  contentApplied?: boolean
  message: string
}

// Undeploy (delete own plugin) inputs
export interface UndeploySkillInput {
  id: string
}

export interface UndeploySkillResponse {
  success: boolean
  id: string
  name?: string
  message: string
}

export interface SemanticSearchInput {
  query: string
  category?: ItemType | 'all'
  limit?: number
}

export interface SemanticSearchResult {
  plugins: PluginSummary[]
  total: number
  query: string
  searchTime: number
}
