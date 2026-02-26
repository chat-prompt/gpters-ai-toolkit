/**
 * Skill Suggest 훅 — 사용자 메시지를 분석하여 관련 팀 스킬을 자동 검색하고 시스템 프롬프트에 주입
 *
 * 검색 결과가 임계값 미만이면 report_search_skip을 호출하고,
 * 스킬 로드 시 outcome 보고 힌트를 포함하여 사용 행태를 추적한다.
 */
import type { PluginInput } from "@opencode-ai/plugin"
import type { UserMessage, Part } from "@opencode-ai/sdk"
import { searchSkills, reportSearchSkip, type SkillSummary } from "./mcp-client"
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

/** relevanceScore 최소 임계값 (DEV-3004 분석 결과: 0.65→0.60 하향 시 통과율 71%→91%) */
const SCORE_THRESHOLD = 0.60

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
 * 메시지에서 검색용 query와 context를 분리 추출
 *
 * 첫 줄은 query, 나머지는 userContext로 사용
 */
function extractSearchParams(text: string): { query: string; context: string } {
  const lines = text.split("\n")
  const firstLine = lines[0].trim()
  const query = firstLine.length <= MAX_QUERY_LENGTH
    ? firstLine
    : firstLine.slice(0, MAX_QUERY_LENGTH)
  const context = lines.slice(1).join("\n").trim().slice(0, 200)
  return { query, context }
}

/**
 * 관련 스킬 목록을 시스템 프롬프트에 주입할 형식으로 포맷
 *
 * 스킬 로드 후 적용 결과를 report_skill_outcome으로 보고하는 힌트를 포함한다.
 *
 * @param skills - 임계값을 통과한 관련 스킬 목록
 * @returns 시스템 프롬프트에 주입할 마크다운 문자열 (스킬 없으면 빈 문자열)
 */
function formatAvailableSkillsPrompt(skills: SkillSummary[]): string {
  if (skills.length === 0) return ""

  const skillLines = skills.map(s => `- **${s.name}** (id: ${s.id}): ${s.description}`).join("\n")

  return `
<available-skills>
## Available Skills

Based on your request, these skills may be helpful:

${skillLines}

**How to use**: If any skill seems relevant, load it using \`mcp_gpters-ai-toolkit_get_plugin_content(pluginId="<skill-id>")\` to get detailed instructions.

**After applying a skill**, report the outcome:
\`\`\`
mcp_gpters-ai-toolkit_report_skill_outcome(skillId="<skill-id>", applied=true/false, summary="결과 한 줄 요약")
\`\`\`
- \`applied=true\`: 스킬 내용을 실제 작업에 적용한 경우
- \`applied=false\`: 로드했지만 맥락에 맞지 않아 적용하지 않은 경우
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

        const { query, context } = extractSearchParams(messageText)
        logger.debug(`Searching skills for session ${sessionID}, query: "${query}"`)

        const skills = await searchSkills(query, { category: "skill", limit: 3, userContext: context || undefined })

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

          if (skills.length > 0) {
            const resultIds = skills.map((s) => s.id)
            const topScore = Math.max(...skills.map((s) => s.relevanceScore ?? 0))
            reportSearchSkip(
              query,
              resultIds,
              `All ${skills.length} results below ${SCORE_THRESHOLD} threshold (top: ${topScore.toFixed(2)})`
            ).catch((err) => logger.error("Failed to report search skip", err))
          }
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
