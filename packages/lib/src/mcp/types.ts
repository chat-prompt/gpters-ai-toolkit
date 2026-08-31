/**
 * MCP Server Types for GPTers Marketplace
 */

import type { ItemType, Difficulty, PluginFile } from '../core/types'

// Tool input schemas
export interface SearchPluginsInput {
  query: string
  category?: ItemType | 'all'

  limit?: number
}

export interface GetPluginContentInput {
  pluginId: string
  /** 탐색→로드→실행 연결용 UUID. 인증정보가 아니다. */
  _journeyId?: string
}

export interface ListPluginsInput {
  category?: ItemType | 'all'

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
  content?: string               // Optional for updates - omit to keep existing
  id?: string                    // Auto-generated from name if not provided
  description?: string
  tags?: string[]

  allowedTools?: string
  agentModel?: string
  agentPermissionMode?: string
  agentSkills?: string
  status?: 'draft' | 'published'
  /** @deprecated Accepted for older clients but ignored; AITK uses one GPTers catalog. */
  visibility?: 'public' | 'private'
  changelog?: string             // What changed in this version
  files?: PluginFile[]
  dependencies?: string[]        // Agent dependencies with agent: prefix
  platforms?: string[]            // Compatible platforms (null = all platforms)
}

export interface DeploySkillResponse {
  success: boolean
  id: string
  version: string
  previousVersion?: string
  changelog: string
  status: string
  webUrl: string
  error?: string
  // GitHub sync result
  githubSync?: {
    success: boolean
    filesCreated: string[]
    filesUpdated: string[]
    errors: string[]
  }
  /** Non-blocking metadata quality warnings (present only when improvements are suggested) */
  qualityWarnings?: Array<{
    field: string
    message: string
    suggestion: string
  }>
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

  difficulty?: Difficulty
  /** 호환 플랫폼 목록 (undefined이면 전체 호환) */
  platforms?: string[]
  relevanceScore?: number
}

export interface PluginContent {
  id: string
  name: string
  type: ItemType
  description: string
  authorName: string
  tags: string[]

  difficulty?: Difficulty
  /** 호환 플랫폼 목록 (undefined이면 전체 호환) */
  platforms?: string[]
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
  /** Internal metadata for audit enrichment (stripped before client response) */
  _meta?: ToolExecutionMeta
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
  /** Source marker for referral tracking (e.g., 'skill-suggest') */
  _source?: string
  /** 탐색→로드→실행 연결용 UUID. 인증정보가 아니다. */
  _journeyId?: string
  /** Optional user context to improve search relevance (e.g., '슬랙 멘션 자동 수집 봇 구현, airtable 연동 완료') */
  userContext?: string
}

/**
 * Internal metadata attached to tool execution results for audit enrichment.
 * Stripped before sending response to client.
 */
export interface ToolExecutionMeta {
  /** 탐색·로드·실행을 transport session과 독립적으로 연결한다 */
  journeyId?: string
  /** Search result snapshot for discovery analytics */
  searchResults?: Array<{ itemId: string; rank: number; score: number }>
  /** Referral source marker (e.g., 'suggest' from skill-suggest hook) */
  referralSource?: string
  /** Client session event data from report_session_event tool */
  sessionEvent?: {
    eventType: string
    promptCount?: number
    suggestionsShown?: number
    suggestionsUsed?: number
    skippedSearches?: number
    sessionEndReason?: string
    pluginVersion?: string
  }
  /** Search skip report: why results were not loaded */
  searchSkip?: {
    query: string
    resultIds: string[]
    reason: string
  }
  /** Skill outcome report: whether a loaded skill was applied */
  skillOutcome?: {
    skillId: string
    applied: boolean
    summary: string
    journeyId?: string | null
  }
  /** 검증 가능한 스킬 실행 결과. 기존 applied 자기보고와 별도 저장한다 */
  skillExecution?: import('../features/ax/execution-report').AxSkillExecutionReport
  /** 실제 적용 시작. 완료 보고 누락과 실행 시간을 측정한다 */
  skillExecutionStart?: import('../features/ax/execution-report').AxSkillExecutionStartReport
}

export interface SemanticSearchResult {
  plugins: PluginSummary[]
  total: number
  query: string
  searchTime: number
  /** 후속 get/report 호출이 같은 흐름을 명시적으로 전달할 때 사용 */
  journeyId: string
}

// File management inputs/responses
export interface AddFilesInput {
  id: string
  files: PluginFile[]
}

export interface AddFilesResponse {
  success: boolean
  id: string
  version: string
  previousVersion: string
  addedOrUpdated: string[]
  totalFiles: number
  files: PluginFile[]
  error?: string
}

export interface RemoveFilesInput {
  id: string
  fileNames: string[]
}

export interface RemoveFilesResponse {
  success: boolean
  id: string
  version: string
  previousVersion: string
  removed: string[]
  notFound: string[]
  totalFiles: number
  files: PluginFile[] | null
  error?: string
}

/** Input for reporting why search results were skipped */
export interface ReportSearchSkipInput {
  query: string
  resultIds: string[]
  reason: string
}

/** Input for reporting skill application outcome */
export interface ReportSkillOutcomeInput {
  skillId: string
  applied: boolean
  summary: string
}

/** Input for reporting a validated skill execution attempt */
export type ReportSkillExecutionInput = import('../features/ax/execution-report').AxSkillExecutionReport
