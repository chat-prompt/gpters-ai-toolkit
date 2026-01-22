import type { PluginInput } from "@opencode-ai/plugin"
import type { UserMessage, Part } from "@opencode-ai/sdk"
import { SKILL_SEARCH_AGENT_NAME } from "../../commands/skill-search"
import { createLogger } from "../../utils/logger"

const logger = createLogger("auto-skill-search")

const USS_KEYWORD = "uss"

function extractMessageContent(output: { parts: Array<{ type: string; text?: string }> }): string {
  const textPart = output.parts?.find((p) => p.type === "text")
  return textPart?.text ?? ""
}

export function createAutoSkillSearchHook(ctx: PluginInput) {
  const processedSessions = new Set<string>()
  const state = {
    isMainSession: false,
    sessionId: null as string | null,
  }

  return {
    event: async ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (event.type !== "session.created") return

      const props = event.properties as { info?: { id: string; parentID?: string } } | undefined
      const isMainSession = !props?.info?.parentID

      state.isMainSession = isMainSession
      state.sessionId = props?.info?.id ?? null

      if (!isMainSession) {
        logger.info(`Subtask session detected: ${state.sessionId}, skipping auto-skill-search`)
      }
    },

    "chat.message": async (
      input: {
        sessionID: string
        agent?: string
        messageID?: string
      },
      output: {
        message: UserMessage
        parts: Part[]
      }
    ) => {
      if (!state.isMainSession) return

      const { sessionID, messageID } = input

      if (!messageID) return

      try {
        const messageText = extractMessageContent(output as { parts: Array<{ type: string; text?: string }> })
        if (!messageText) return

        const lowerText = messageText.toLowerCase()
        const isFirstMessage = !processedSessions.has(sessionID)
        const hasUssKeyword = lowerText.includes(USS_KEYWORD)

        if (!isFirstMessage && !hasUssKeyword) return

        processedSessions.add(sessionID)

        let searchQuery: string
        if (isFirstMessage) {
          logger.info(`First message in session ${sessionID}, triggering skill search`)
          searchQuery = messageText.trim()
        } else {
          logger.info(`USS keyword detected in session ${sessionID}, triggering skill search`)
          searchQuery = messageText.replace(/\buss\b/gi, '').trim()
        }
        await ctx.client.session.prompt({
          path: { id: sessionID },
          body: {
            parts: [{
              type: "subtask",
              description: '스킬 검색',
              prompt: `사용자가 다음 작업을 요청했습니다: "${searchQuery}"

이 작업에 맞는 스킬을 찾아 main context에 로드해주세요.`,
              agent: SKILL_SEARCH_AGENT_NAME,
            }],
          },
        })
        logger.info(`Subtask created for skill search: ${searchQuery}`)
      } catch (error) {
        logger.error("Error in auto-skill-search hook", error)
      }
    }
  }
}
