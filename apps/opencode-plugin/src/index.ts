import type { Plugin } from "@opencode-ai/plugin"
import { COMMAND_PRD_REVIEW } from "./commands/prd-review"
import { COMMAND_COMMIT, COMMIT_AGENT_NAME, COMMIT_AGENT_CONFIG } from "./commands/commit"
import { GptersConfigManager } from "./config"
import { createAutoUpdateCheckerHook } from "./hooks/auto-update-checker"
import { createAutoCommitHook } from "./hooks/auto-commit"
import { showYesNo } from "./utils/dialog"
import { createLogger } from "./utils/logger"

const COMMAND_PREFIX = 'gpters'
const PREFIX = "*Working with GPTers AI Toolkit*\n\n"

const logger = createLogger("main")

export const GPTersPlugin: Plugin = async (ctx) => {
  const { directory, client } = ctx

  const processedMessages = new Set<string>()
  const promptedSessions = new Set<string>()
  const autoUpdateChecker = createAutoUpdateCheckerHook(ctx)
  const autoCommitHook = createAutoCommitHook(ctx)
  const configManager = GptersConfigManager.getInstance(directory)

  logger.info("Plugin started")

  return {
    event: async (eventData) => {
      autoUpdateChecker.event(eventData)

      if (configManager.getAutoCommit()) {
        await autoCommitHook.event(eventData)
      }
    },

    "chat.message": async (input) => {
      const { sessionID, agent } = input

      const preferPlanMeodeCheck = async () => {
        if (!input.messageID) return
        if (agent !== "Sisyphus") return
        if (promptedSessions.has(sessionID)) return
        promptedSessions.add(sessionID)

        const preferPlanMode = configManager.getPreferPlanMode()

        if (!preferPlanMode) return

        const result = await showYesNo({
          message: "Plan 모드 사용을 권장해요. 무시하고 일반 모드로 계속하시겠어요?\n<tab>으로 agent를 변경할 수 있어요.",
          title: "GPTers"
        })

        if (result.ok && result.value) {
          return
        }

        setTimeout(async () => {
          await client.session.abort({ path: { id: input.sessionID } })
        }, 100)
      }
      await preferPlanMeodeCheck()
    },

    "experimental.text.complete": async (input, output) => {
      const key = `${input.sessionID}-${input.messageID}`
      if (processedMessages.has(key)) return

      processedMessages.add(key)
      output.text = PREFIX + output.text
    },

    config: async (config) => {
      config.permission ??= {}
      // @ts-expect-error - opencode does not support type
      config.permission['question'] = 'allow'

      config.command ??= {}
      config.command[`${COMMAND_PREFIX}:prd-review`] = COMMAND_PRD_REVIEW
      config.command[`${COMMAND_PREFIX}:commit`] = COMMAND_COMMIT

      config.agent ??= {}
      config.agent[COMMIT_AGENT_NAME] = COMMIT_AGENT_CONFIG
    }
  }
}

export default GPTersPlugin
