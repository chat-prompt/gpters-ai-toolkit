/**
 * MCP Reporter for session events
 *
 * Sends session metrics to the MCP server via report_session_event tool.
 * Reuses the auth pattern from skill-suggest/mcp-client.ts.
 */

import { createLogger } from "../../utils/logger"
import { readFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const logger = createLogger("mcp-reporter")

/** 빌드 시 --define으로 주입되는 플러그인 버전. 런타임 package.json 탐색 불필요. */
const PLUGIN_VERSION: string = process.env.PLUGIN_VERSION || 'unknown'

const MCP_API_URL = "https://ai-toolkit.gpters.org/api/mcp"
const MCP_SERVER_NAME = "gpters-ai-toolkit"

/**
 * Load access token from OpenCode's MCP auth storage
 */
function loadAccessToken(): string | undefined {
  try {
    const home = homedir()
    const authPath = process.platform === "win32"
      ? join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "opencode", "mcp-auth.json")
      : join(home, ".local", "share", "opencode", "mcp-auth.json")

    const authData = JSON.parse(readFileSync(authPath, "utf-8"))
    const entry = authData[MCP_SERVER_NAME]

    if (!entry?.tokens?.accessToken) return undefined

    const nowInSeconds = Date.now() / 1000
    if (entry.tokens.expiresAt <= nowInSeconds) return undefined

    return entry.tokens.accessToken
  } catch {
    return undefined
  }
}

/**
 * Report a session event to the MCP server
 *
 * @param eventType - "session_summary" or "session_end"
 * @param data - Session metrics and optional end reason
 */
export async function reportSessionEvent(
  eventType: "session_summary" | "session_end",
  data: {
    promptCount?: number
    suggestionsShown?: number
    suggestionsUsed?: number
    skippedSearches?: number
    sessionEndReason?: string
  }
): Promise<void> {
  const accessToken = loadAccessToken()
  if (!accessToken) {
    logger.debug("No access token, skipping session report")
    return
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
          name: "report_session_event",
          arguments: {
            eventType,
            ...data,
            pluginVersion: PLUGIN_VERSION,
          },
        },
      }),
    })

    if (!response.ok) {
      logger.error(`Session report failed: ${response.status}`)
    }
  } catch (error) {
    logger.error("Failed to send session report", error)
  }
}
