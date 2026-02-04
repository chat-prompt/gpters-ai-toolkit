import type { PluginInput } from "@opencode-ai/plugin"
import type { UserMessage, Part } from "@opencode-ai/sdk"
import { searchSkills, type SkillSummary } from "./mcp-client"
import { createLogger } from "../../utils/logger"

const logger = createLogger("skill-suggest")

interface SessionState {
  lastQuery: string
  skills: SkillSummary[]
  timestamp: number
}

const sessionSkillCache = new Map<string, SessionState>()

const CACHE_TTL = 5 * 60 * 1000

function extractMessageContent(output: { parts: Array<{ type: string; text?: string }> }): string {
  const textPart = output.parts?.find((p) => p.type === "text")
  return textPart?.text ?? ""
}

function formatAvailableSkillsPrompt(skills: SkillSummary[]): string {
  if (skills.length === 0) return ""

  const skillLines = skills.map(s => `- **${s.name}** (id: ${s.id}): ${s.description}`).join("\n")

  return `
<available-skills>
## Available Skills

Based on your request, these skills may be helpful:

${skillLines}

**How to use**: If any skill seems relevant, load it using \`mcp_gpters-ai-toolkit_get_plugin_content(pluginId="<skill-id>")\` to get detailed instructions.
</available-skills>
`.trim()
}

export function createSkillSuggestHook(ctx: PluginInput) {
  const processedMessages = new Set<string>()

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
      logger.debug(`skill-suggest hook ${input.agent} ${input.messageID}`)
      if (input.agent?.toLowerCase() !== "sisyphus") return

      const { sessionID, messageID } = input

      if (!messageID || processedMessages.has(messageID)) return
      processedMessages.add(messageID)

      try {
        const messageText = extractMessageContent(output as { parts: Array<{ type: string; text?: string }> })
        logger.debug(`Searching skills for session ${sessionID}, message: "${messageText.slice(0, 50)}..."`)
        if (!messageText || messageText.length < 3) return

        logger.debug(`Searching skills for session ${sessionID}`)
        const skills = await searchSkills(messageText, { category: "skill", limit: 5 })

        if (skills.length > 0) {
          sessionSkillCache.set(sessionID, {
            lastQuery: messageText,
            skills,
            timestamp: Date.now(),
          })
          logger.debug(`Found ${skills.length} skills for session ${sessionID}`)
        }
      } catch (error) {
        logger.error("Error in skill-suggest hook", error)
      }
    },

    "experimental.chat.system.transform": async (
      input: { sessionID: string },
      output: { system: string[] }
    ) => {
      const cached = sessionSkillCache.get(input.sessionID)

      if (!cached) return

      if (Date.now() - cached.timestamp > CACHE_TTL) {
        sessionSkillCache.delete(input.sessionID)
        return
      }

      const skillsPrompt = formatAvailableSkillsPrompt(cached.skills)
      if (skillsPrompt) {
        output.system.push(skillsPrompt)
        logger.debug(`Injected ${cached.skills.length} skills into system prompt`)
      }
    },
  }
}
