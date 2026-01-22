import type { Plugin } from "@opencode-ai/plugin"
import { COMMAND_PRD_REVIEW } from "./commands/prd-review"
import { COMMAND_COMMIT, COMMIT_AGENT_NAME, COMMIT_AGENT_CONFIG } from "./commands/commit"
import { COMMAND_GIT_PUSH_PR, GIT_PUSH_PR_AGENT_NAME, GIT_PUSH_PR_AGENT_CONFIG } from "./commands/git-push-pr"
import { GptersConfigManager } from "./config"
import { createAutoUpdateCheckerHook } from "./hooks/auto-update-checker"
import { createAutoCommitHook } from "./hooks/auto-commit"
import { createBranchGuardHook } from "./hooks/branch-guard"
import { showYesNo } from "./utils/dialog"
import { createLogger } from "./utils/logger"

const COMMAND_PREFIX = 'gpters'

const logger = createLogger("main")

export const GPTersPlugin: Plugin = async (ctx) => {
  const { directory, client } = ctx

  const promptedSessions = new Set<string>()
  const autoUpdateChecker = createAutoUpdateCheckerHook(ctx)
  const autoCommitHook = createAutoCommitHook(ctx)
  const branchGuardHook = createBranchGuardHook(ctx)
  const configManager = GptersConfigManager.getInstance(directory)

  logger.info("Plugin started")

  return {
    event: async (eventData) => {
      autoUpdateChecker.event(eventData)
      branchGuardHook.event(eventData)

      if (configManager.getAutoCommit()) {
        await autoCommitHook.event(eventData)
      }
    },

    "chat.message": async (input, output) => {
      const { sessionID, agent } = input

      const preferPlanMeodeCheck = async () => {
        if (!configManager.getPreferPlanMode()) return

        if (!input.messageID) return
        if (agent !== "Sisyphus") return
        if (promptedSessions.has(sessionID)) return
        promptedSessions.add(sessionID)

        const messagesRes = await client.session.messages({ path: { id: sessionID } })
        const hasAIMessage = messagesRes?.data?.some((m) => m.info.role === 'assistant')
        if (hasAIMessage) return

        const result = await showYesNo({
          message: "Plan 모드 사용을 권장해요. 무시하고 일반 모드로 계속하시겠어요?\n\n*<tab>으로 agent를 변경할 수 있어요.",
          title: "Agent 선택",
          yesText: "Plan없이 계속",
          noText: "중단"
        })

        if (result.ok && result.value) {
          return
        }

        setTimeout(async () => {
          await client.session.abort({ path: { id: input.sessionID } })
        }, 100)
      }
      await preferPlanMeodeCheck()


      if (configManager.getBranchGuard()) {
        await branchGuardHook["chat.message"]?.(input, output)
      }
    },

    "experimental.text.complete": async (input, output) => {
      if (configManager.getBranchGuard()) {
        await branchGuardHook["experimental.text.complete"]?.(input, output)
      }
    },

    config: async (config) => {
      config.permission ??= {}
      // @ts-expect-error - opencode does not support type
      config.permission['question'] = 'allow'

      config.command ??= {}
      config.command[`${COMMAND_PREFIX}:prd-review`] = COMMAND_PRD_REVIEW
      config.command[`${COMMAND_PREFIX}:commit`] = COMMAND_COMMIT
      config.command[`${COMMAND_PREFIX}:git-push-pr`] = COMMAND_GIT_PUSH_PR

      config.agent ??= {}
      config.agent[COMMIT_AGENT_NAME] = COMMIT_AGENT_CONFIG
      config.agent[GIT_PUSH_PR_AGENT_NAME] = GIT_PUSH_PR_AGENT_CONFIG
    }
  }
}

export default GPTersPlugin
