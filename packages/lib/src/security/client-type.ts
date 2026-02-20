/**
 * MCP Client Type Identification Module
 *
 * Identifies which MCP client (Claude Code, OpenCode, Cursor, etc.)
 * is making requests using a waterfall strategy:
 * 1. OAuth client name (most accurate)
 * 2. MCP initialize clientInfo.name (MCP standard)
 * 3. User-Agent pattern matching (fallback)
 */

/**
 * Known MCP client types
 */
export type ClientType = 'claude_code' | 'opencode' | 'cursor' | 'codex' | 'web_browser' | 'cli' | 'unknown'

/**
 * MCP client info from initialize request params
 */
export interface McpClientInfo {
  /** Client application name */
  name: string
  /** Client application version */
  version?: string
}

/**
 * Context for resolving client type via waterfall strategy
 */
export interface ClientTypeContext {
  /** OAuth client name from oauth_clients.name */
  oauthClientName?: string
  /** MCP initialize params clientInfo */
  clientInfo?: McpClientInfo
  /** HTTP User-Agent header */
  userAgent?: string
}

/**
 * Mapping from known OAuth client names to client types (case-insensitive)
 */
const CLIENT_NAME_TYPE_MAP: Record<string, ClientType> = {
  'claude code': 'claude_code',
  'claude-code': 'claude_code',
  'claude desktop': 'claude_code',
  'opencode': 'opencode',
  'cursor': 'cursor',
  'codex': 'codex',
  'codex-mcp-client': 'codex',
}

/**
 * User-Agent patterns for fallback identification
 */
const USER_AGENT_PATTERNS: Array<{ pattern: RegExp; type: ClientType }> = [
  { pattern: /claude[- ]?code/i, type: 'claude_code' },
  { pattern: /claude[- ]?desktop/i, type: 'claude_code' },
  { pattern: /opencode/i, type: 'opencode' },
  { pattern: /cursor/i, type: 'cursor' },
  { pattern: /codex/i, type: 'codex' },
  { pattern: /mozilla|chrome|safari|firefox|edge/i, type: 'web_browser' },
  { pattern: /curl|httpie|wget|postman|insomnia/i, type: 'cli' },
]

/**
 * Resolve client type from OAuth client name
 *
 * @param name - OAuth client name from oauth_clients table
 * @returns Resolved client type or undefined if not matched
 */
export function resolveFromOAuthClientName(name: string | undefined): ClientType | undefined {
  if (!name) return undefined
  const normalized = name.toLowerCase().trim()
  return CLIENT_NAME_TYPE_MAP[normalized]
}

/**
 * Resolve client type from MCP initialize clientInfo
 *
 * @param clientInfo - MCP clientInfo from initialize request params
 * @returns Resolved client type or undefined if not matched
 */
export function resolveFromClientInfo(clientInfo: McpClientInfo | undefined): ClientType | undefined {
  if (!clientInfo?.name) return undefined
  const normalized = clientInfo.name.toLowerCase().trim()
  return CLIENT_NAME_TYPE_MAP[normalized]
}

/**
 * Resolve client type from User-Agent header via pattern matching
 *
 * @param userAgent - HTTP User-Agent header value
 * @returns Resolved client type or undefined if no pattern matched
 */
export function resolveFromUserAgent(userAgent: string | undefined): ClientType | undefined {
  if (!userAgent) return undefined
  for (const { pattern, type } of USER_AGENT_PATTERNS) {
    if (pattern.test(userAgent)) return type
  }
  return undefined
}

/**
 * Extract MCP clientInfo from initialize request body
 *
 * @param body - Parsed JSON-RPC request body
 * @returns McpClientInfo if found, undefined otherwise
 */
export function extractClientInfo(body: unknown): McpClientInfo | undefined {
  if (!body || typeof body !== 'object') return undefined

  const rpcBody = body as Record<string, unknown>
  if (rpcBody.method !== 'initialize') return undefined

  const params = rpcBody.params as Record<string, unknown> | undefined
  if (!params) return undefined

  const clientInfo = params.clientInfo as Record<string, unknown> | undefined
  if (!clientInfo || typeof clientInfo.name !== 'string') return undefined

  return {
    name: clientInfo.name,
    version: typeof clientInfo.version === 'string' ? clientInfo.version : undefined,
  }
}

/**
 * Resolve client type using waterfall strategy
 *
 * Priority order:
 * 1. OAuth client name (most accurate, from registered client)
 * 2. MCP clientInfo.name (from initialize handshake)
 * 3. User-Agent pattern matching (least accurate fallback)
 * 4. 'unknown' if nothing matched
 *
 * @param ctx - Context containing available identification signals
 * @returns Resolved client type
 */
export function resolveClientType(ctx: ClientTypeContext): ClientType {
  return (
    resolveFromOAuthClientName(ctx.oauthClientName) ??
    resolveFromClientInfo(ctx.clientInfo) ??
    resolveFromUserAgent(ctx.userAgent) ??
    'unknown'
  )
}
