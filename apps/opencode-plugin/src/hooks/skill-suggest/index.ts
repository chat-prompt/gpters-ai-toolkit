import type { PluginInput } from "@opencode-ai/plugin"
import type { UserMessage, Part } from "@opencode-ai/sdk"
import { searchSkills, type SkillSummary } from "./mcp-client"
import { createLogger } from "../../utils/logger"
import { getSessionMetrics } from "../session-reporter"

const logger = createLogger("skill-suggest")

/** 검색을 건너뛸 후속/명령형 패턴 */
const SKIP_PATTERNS = [
  /^(계속|푸시|커밋|다시|확인|네|응|ㅇㅇ|ㅇ|ok|yes|y|no|n)/i,
  /^(해줘|해봐|알려줘|보여줘|실행|해)$/,
  /^(git\s|npm\s|pnpm\s|yarn\s)/i,
  /(계속해|다시 해|푸시해|커밋해|머지해|배포해|실행해|빌드해)/,
  /^(좋아|감사|고마워|ㄱㄱ|ㄱ|ㅊㅊ|잘됐)/,
]

/** 검색할 필요 없는 짧은 메시지 최소 길이 */
const MIN_MESSAGE_LENGTH = 10

/** relevanceScore 최소 임계값 */
const SCORE_THRESHOLD = 0.65

/** 검색 쿼리 최대 길이 (키워드 추출 효과) */
const MAX_QUERY_LENGTH = 80

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

/**
 * 후속 질문, 명령형 메시지 등 검색이 불필요한 메시지인지 판단
 */
function shouldSkipSearch(text: string): boolean {
  if (text.length < MIN_MESSAGE_LENGTH) return true
  return SKIP_PATTERNS.some((pattern) => pattern.test(text.trim()))
}

/**
 * 메시지에서 검색용 쿼리를 추출 (첫 줄, MAX_QUERY_LENGTH 이내)
 */
function extractSearchQuery(text: string): string {
  const firstLine = text.split("\n")[0].trim()
  if (firstLine.length <= MAX_QUERY_LENGTH) return firstLine
  return firstLine.slice(0, MAX_QUERY_LENGTH)
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
        const metrics = getSessionMetrics(sessionID)
        metrics.promptCount++

        const messageText = extractMessageContent(output as { parts: Array<{ type: string; text?: string }> })
        if (!messageText) return

        if (shouldSkipSearch(messageText)) {
          logger.debug(`Skipping search for follow-up/command message: "${messageText.slice(0, 30)}..."`)
          metrics.skippedSearches++
          return
        }

        const query = extractSearchQuery(messageText)
        logger.debug(`Searching skills for session ${sessionID}, query: "${query}"`)

        const skills = await searchSkills(query, { category: "skill", limit: 3 })

        const relevantSkills = skills.filter(
          (s) => s.relevanceScore != null && s.relevanceScore >= SCORE_THRESHOLD
        )

        if (relevantSkills.length > 0) {
          sessionSkillCache.set(sessionID, {
            lastQuery: query,
            skills: relevantSkills,
            timestamp: Date.now(),
          })
          metrics.suggestionsShown += relevantSkills.length
          logger.debug(`Found ${relevantSkills.length} relevant skills (of ${skills.length} total) for session ${sessionID}`)
        } else {
          logger.debug(`No skills above threshold ${SCORE_THRESHOLD} for session ${sessionID}`)
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
