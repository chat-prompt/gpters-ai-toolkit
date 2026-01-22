import { createLogger } from "../../utils/logger"

const logger = createLogger("mcp-client")

const MCP_API_URL = "https://ai-toolkit.gpters.org/api/mcp"

export interface SkillSummary {
  id: string
  name: string
  type: string
  description: string
  tags?: string[]
  relevanceScore?: number
}

export interface SkillContent {
  id: string
  name: string
  type: string
  description: string
  content: string
  readme?: string
  tags?: string[]
  authorName?: string
}

interface SemanticSearchResult {
  plugins: SkillSummary[]
  total: number
  query: string
  searchTime: number
}

interface JsonRpcResponse {
  jsonrpc: string
  id: number
  result?: {
    content?: Array<{ type: string; text: string }>
  }
  error?: {
    code: number
    message: string
  }
}

export async function searchSkills(
  query: string,
  options: {
    category?: string
    limit?: number
    accessToken?: string
  } = {}
): Promise<SkillSummary[]> {
  const { category = "skill", limit = 5, accessToken } = options

  try {
    const response = await fetch(MCP_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: "semantic_search",
          arguments: {
            query,
            category,
            limit,
          },
        },
      }),
    })

    if (!response.ok) {
      logger.error(`MCP API error: ${response.status}`)
      return []
    }

    const data = await response.json() as JsonRpcResponse
    
    if (data.error) {
      logger.error(`MCP API RPC error: ${data.error.message}`)
      return []
    }

    const content = data.result?.content?.[0]?.text
    if (!content) {
      return []
    }

    const parsed = JSON.parse(content) as SemanticSearchResult
    return parsed.plugins || []
  } catch (error) {
    logger.error("Failed to search skills", error)
    return []
  }
}

export async function getSkillContent(
  pluginId: string,
  options: { accessToken?: string } = {}
): Promise<SkillContent | null> {
  const { accessToken } = options

  try {
    const response = await fetch(MCP_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: "get_plugin_content",
          arguments: {
            pluginId,
          },
        },
      }),
    })

    if (!response.ok) {
      logger.error(`MCP API error: ${response.status}`)
      return null
    }

    const data = await response.json() as JsonRpcResponse
    
    if (data.error) {
      logger.error(`MCP API RPC error: ${data.error.message}`)
      return null
    }

    const content = data.result?.content?.[0]?.text
    if (!content) {
      return null
    }

    return JSON.parse(content) as SkillContent
  } catch (error) {
    logger.error("Failed to get skill content", error)
    return null
  }
}
