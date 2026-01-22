import type { Plugin } from "@opencode-ai/plugin"
import { COMMAND_PRD_REVIEW } from "./commands/prd-review"
import { COMMAND_COMMIT, COMMIT_AGENT_NAME, COMMIT_AGENT_CONFIG } from "./commands/commit"
import { COMMAND_GIT_PUSH_PR, GIT_PUSH_PR_AGENT_NAME, GIT_PUSH_PR_AGENT_CONFIG } from "./commands/git-push-pr"
import { COMMAND_SKILL_SEARCH, SKILL_SEARCH_AGENT_NAME, SKILL_SEARCH_AGENT_CONFIG } from "./commands/skill-search"
import { COMMAND_PLUGIN_SETUP } from "./commands/plugin-setup"
import { GptersConfigManager } from "./config"
import { createAutoUpdateCheckerHook } from "./hooks/auto-update-checker"
import { createAutoCommitHook } from "./hooks/auto-commit"
import { createBranchGuardHook } from "./hooks/branch-guard"
import { createPluginSetupHook } from "./hooks/plugin-setup"
import { createPreferPlanModeHook } from "./hooks/prefer-plan-mode"
import { createAutoSkillSearchHook } from "./hooks/auto-skill-search"

import { createLogger } from "./utils/logger"

const COMMAND_PREFIX = 'gpters'

const logger = createLogger("main")

export const GPTersPlugin: Plugin = async (ctx) => {
  const { directory } = ctx

  const autoUpdateChecker = createAutoUpdateCheckerHook(ctx)
  const autoCommitHook = createAutoCommitHook(ctx)
  const branchGuardHook = createBranchGuardHook(ctx)
  const pluginSetupHook = createPluginSetupHook(ctx)
  const preferPlanModeHook = createPreferPlanModeHook(ctx)
  const autoSkillSearchHook = createAutoSkillSearchHook(ctx)
  const configManager = GptersConfigManager.getInstance(directory)

  logger.info("Plugin started")

  return {
    event: async (eventData) => {
      autoUpdateChecker.event(eventData)
      branchGuardHook.event(eventData)
      await pluginSetupHook.event(eventData)

      if (configManager.getAutoCommit()) {
        await autoCommitHook.event(eventData)
      }
    },

    "chat.message": async (input, output) => {
      await preferPlanModeHook["chat.message"]?.(input)

      if (configManager.getBranchGuard()) {
        await branchGuardHook["chat.message"]?.(input, output)
      }

      await autoSkillSearchHook["chat.message"]?.(input, output)
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

      config.mcp ??= {}
      config.mcp = {
        "gpters-ai-toolkit": {
          enabled: true,
          type: "remote",
          url: "https://ai-toolkit.gpters.org/api/mcp",
          oauth: {}
        }
      }

      config.command ??= {}
      config.command[`${COMMAND_PREFIX}:prd-review`] = COMMAND_PRD_REVIEW
      config.command[`${COMMAND_PREFIX}:commit`] = COMMAND_COMMIT
      config.command[`${COMMAND_PREFIX}:git-push-pr`] = COMMAND_GIT_PUSH_PR
      config.command[`${COMMAND_PREFIX}:plugin-setup`] = COMMAND_PLUGIN_SETUP
      config.command[`${COMMAND_PREFIX}:uss`] = COMMAND_SKILL_SEARCH

      config.agent ??= {}
      config.agent[COMMIT_AGENT_NAME] = COMMIT_AGENT_CONFIG
      config.agent[GIT_PUSH_PR_AGENT_NAME] = GIT_PUSH_PR_AGENT_CONFIG
      config.agent[SKILL_SEARCH_AGENT_NAME] = SKILL_SEARCH_AGENT_CONFIG
    }
  }
}

export default GPTersPlugin
