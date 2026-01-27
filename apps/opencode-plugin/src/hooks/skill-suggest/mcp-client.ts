import { createLogger } from "../../utils/logger"
import { readFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const logger = createLogger("mcp-client")

const MCP_API_URL = "https://ai-toolkit.gpters.org/api/mcp"
const MCP_SERVER_NAME = "gpters-ai-toolkit"

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

interface AuthEntry {
  type: string
  access: string
  refresh: string
  expires: number
}

function getAuthFilePath(): string {
  const home = homedir()
  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "opencode", "auth.json")
  }
  return join(home, ".local", "share", "opencode", "auth.json")
}

function loadAccessToken(): string | undefined {
  try {
    const authPath = getAuthFilePath()
    const authData = JSON.parse(readFileSync(authPath, "utf-8")) as Record<string, AuthEntry>
    const entry = authData[MCP_SERVER_NAME]
    if (entry?.access && entry.expires > Date.now()) {
      return entry.access
    }
    logger.warn("MCP token expired or missing")
    return undefined
  } catch (error) {
    logger.error("Failed to load auth token", error)
    return undefined
  }
}

export async function searchSkills(
  query: string,
  options: {
    category?: string
    limit?: number
  } = {}
): Promise<SkillSummary[]> {
  const { category = "skill", limit = 5 } = options
  const accessToken = loadAccessToken()

  if (!accessToken) {
    logger.warn("No access token available, skipping skill search")
    return []
  }

  try {
    const response = await fetch(MCP_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
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

