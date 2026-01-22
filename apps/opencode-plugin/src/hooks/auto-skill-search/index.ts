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

  return {
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
      const { sessionID, messageID, agent } = input

      if (!messageID) return
      if (agent && agent !== "Sisyphus" && agent !== "build" && agent !== "plan") return

      try {
        const messageText = extractMessageContent(output as { parts: Array<{ type: string; text?: string }> })
        if (!messageText) return

        const lowerText = messageText.toLowerCase()
        if (!lowerText.includes(USS_KEYWORD)) return

        processedSessions.add(sessionID)
        logger.info(`USS keyword detected in session ${sessionID}, triggering skill search`)

        const searchQuery = messageText.replace(/\buss\b/gi, '').trim()

        const subtaskPart = {
          id: crypto.randomUUID(),
          sessionID,
          messageID,
          type: 'subtask' as const,
          prompt: `사용자가 다음 작업을 요청했습니다: "${searchQuery}"

이 작업에 맞는 스킬을 찾아 main context에 로드해주세요.`,
          description: 'Skill Search',
          agent: SKILL_SEARCH_AGENT_NAME,
        }

        output.parts.push(subtaskPart as Part)
        logger.info(`Subtask created for skill search: ${searchQuery}`)
      } catch (error) {
        logger.error("Error in auto-skill-search hook", error)
      }
    }
  }
}
