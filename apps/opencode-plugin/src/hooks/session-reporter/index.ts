/**
 * Session Reporter Hook for OpenCode plugin
 *
 * Reports client-side session metrics to the MCP server via report_session_event.
 * Tracks prompt count, suggestion usage, and session lifecycle events.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { createLogger } from "../../utils/logger"
import { reportSessionEvent } from "./mcp-reporter"

const logger = createLogger("session-reporter")

/**
 * Per-session metrics tracked on the client side
 */
export interface SessionMetrics {
  promptCount: number
  suggestionsShown: number
  suggestionsUsed: number
  skippedSearches: number
}

/** Session metrics storage keyed by session ID */
const sessionMetrics = new Map<string, SessionMetrics>()

/**
 * Get or create session metrics for a given session
 *
 * @param sessionId - OpenCode session ID
 * @returns Mutable session metrics reference
 */
export function getSessionMetrics(sessionId: string): SessionMetrics {
  let metrics = sessionMetrics.get(sessionId)
  if (!metrics) {
    metrics = {
      promptCount: 0,
      suggestionsShown: 0,
      suggestionsUsed: 0,
      skippedSearches: 0,
    }
    sessionMetrics.set(sessionId, metrics)
  }
  return metrics
}

/**
 * Create the session reporter hook
 *
 * Listens for session lifecycle events and reports metrics to MCP server.
 *
 * @param _ctx - Plugin context (unused but kept for consistency)
 */
export function createSessionReporterHook(_ctx: PluginInput) {
  return {
    event: async (eventData: { event: { type: string; properties?: unknown } }) => {
      const { event } = eventData
      const properties = event.properties as Record<string, unknown> | undefined

      if (event.type === "session.idle") {
        // Mid-session summary report
        const sessionId = properties?.sessionID as string | undefined
        if (!sessionId) return

        const metrics = sessionMetrics.get(sessionId)
        if (!metrics || metrics.promptCount === 0) return

        try {
          await reportSessionEvent("session_summary", metrics)
          logger.debug("Session summary reported", { sessionId, ...metrics })
        } catch (error) {
          logger.error("Failed to report session summary", error)
        }
      }

      if (event.type === "session.deleted") {
        // Final session report
        const sessionId = properties?.sessionID as string | undefined
        if (!sessionId) return

        const metrics = sessionMetrics.get(sessionId)
        if (!metrics) return

        try {
          await reportSessionEvent("session_end", {
            ...metrics,
            sessionEndReason: "explicit_close",
          })
          logger.debug("Session end reported", { sessionId, ...metrics })
        } catch (error) {
          logger.error("Failed to report session end", error)
        } finally {
          sessionMetrics.delete(sessionId)
        }
      }
    },
  }
}
