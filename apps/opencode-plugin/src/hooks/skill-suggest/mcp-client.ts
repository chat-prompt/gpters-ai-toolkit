/**
 * MCP 클라이언트 — GPTers AI Toolkit MCP 서버와 통신하여 스킬 검색/보고를 수행
 */
import { createLogger } from "../../utils/logger"
import { readFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const logger = createLogger("mcp-client")

const MCP_API_URL = "https://ai-toolkit.gpters.org/api/mcp"
const MCP_SERVER_NAME = "gpters-ai-toolkit"

/** 스킬 검색 결과 요약 정보 */
export interface SkillSummary {
  /** 스킬 고유 ID (영문 slug) */
  id: string
  /** 스킬 표시 이름 */
  name: string
  /** 아이템 유형 (skill, agent, command, guide) */
  type: string
  /** 스킬 설명 */
  description: string
  /** 연관 태그 목록 */
  tags?: string[]
  /** 검색 관련도 점수 (0~1) */
  relevanceScore?: number
}

/** 스킬 전체 콘텐츠 */
export interface SkillContent {
  /** 스킬 고유 ID */
  id: string
  /** 스킬 표시 이름 */
  name: string
  /** 아이템 유형 */
  type: string
  /** 스킬 설명 */
  description: string
  /** 스킬 본문 콘텐츠 */
  content: string
  /** README 내용 */
  readme?: string
  /** 연관 태그 목록 */
  tags?: string[]
  /** 작성자 이름 */
  authorName?: string
}

/** semantic_search 응답 구조 */
interface SemanticSearchResult {
  plugins: SkillSummary[]
  total: number
  query: string
  searchTime: number
}

/** JSON-RPC 2.0 응답 구조 */
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

/**
 * MCP Auth Entry structure stored in mcp-auth.json
 */
interface McpAuthEntry {
  clientInfo?: {
    clientId: string
    clientSecret?: string
    clientIdIssuedAt?: number
  }
  serverUrl?: string
  tokens?: {
    accessToken: string
    refreshToken?: string
    expiresAt: number  // Unix timestamp in seconds
    scope?: string
  }
  oauthState?: string
}

function getMcpAuthFilePath(): string {
  const home = homedir()
  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "opencode", "mcp-auth.json")
  }
  return join(home, ".local", "share", "opencode", "mcp-auth.json")
}

function loadAccessToken(): string | undefined {
  try {
    const authPath = getMcpAuthFilePath()
    const authData = JSON.parse(readFileSync(authPath, "utf-8")) as Record<string, McpAuthEntry>
    const entry = authData[MCP_SERVER_NAME]
    
    if (!entry?.tokens?.accessToken) {
      logger.warn("MCP token not found")
      return undefined
    }
    
    // expiresAt is in seconds (Unix timestamp), Date.now() is in milliseconds
    const nowInSeconds = Date.now() / 1000
    if (entry.tokens.expiresAt <= nowInSeconds) {
      logger.warn("MCP token expired", { 
        expiresAt: entry.tokens.expiresAt, 
        now: nowInSeconds 
      })
      return undefined
    }
    
    return entry.tokens.accessToken
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
    userContext?: string
  } = {}
): Promise<SkillSummary[]> {
  const { category = "skill", limit = 5, userContext } = options
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
            _source: "skill-suggest",
            ...(userContext && { userContext }),
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

/**
 * 검색 결과가 임계값 미만이어서 스킵한 사실을 MCP 서버에 보고
 *
 * @param query - 검색에 사용한 쿼리 문자열
 * @param resultIds - 반환된 결과들의 ID 목록
 * @param reason - 스킵 사유 (한 줄 설명)
 */
export async function reportSearchSkip(
  query: string,
  resultIds: string[],
  reason: string
): Promise<void> {
  const accessToken = loadAccessToken()
  if (!accessToken) return

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
          name: "report_search_skip",
          arguments: { query, resultIds, reason },
        },
      }),
    })

    if (!response.ok) {
      logger.error(`report_search_skip API error: ${response.status}`)
      return
    }

    const data = await response.json() as JsonRpcResponse
    if (data.error) {
      logger.error(`report_search_skip RPC error: ${data.error.message}`)
    } else {
      logger.debug(`Reported search skip for query "${query}"`)
    }
  } catch (error) {
    logger.error("Failed to report search skip", error)
  }
}

/**
 * 스킬 적용 결과를 MCP 서버에 보고
 *
 * @param skillId - 적용한 스킬 ID
 * @param applied - 실제로 적용되었는지 여부
 * @param summary - 결과 요약 (한 줄)
 */
export async function reportSkillOutcome(
  skillId: string,
  applied: boolean,
  summary: string
): Promise<void> {
  const accessToken = loadAccessToken()
  if (!accessToken) return

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
          name: "report_skill_outcome",
          arguments: { skillId, applied, summary },
        },
      }),
    })

    if (!response.ok) {
      logger.error(`report_skill_outcome API error: ${response.status}`)
      return
    }

    const data = await response.json() as JsonRpcResponse
    if (data.error) {
      logger.error(`report_skill_outcome RPC error: ${data.error.message}`)
    } else {
      logger.debug(`Reported skill outcome for "${skillId}"`)
    }
  } catch (error) {
    logger.error("Failed to report skill outcome", error)
  }
}

