import type { Plugin } from "@opencode-ai/plugin"

import { COMMAND_PLUGIN_SETUP } from "./commands/plugin-setup"
import { createAutoUpdateCheckerHook } from "./hooks/auto-update-checker"
import { createPluginSetupHook } from "./hooks/plugin-setup"
import { createPreferPlanModeHook } from "./hooks/prefer-plan-mode"
import { createSkillSuggestHook } from "./hooks/skill-suggest"
import { createSessionReporterHook } from "./hooks/session-reporter"

import { createLogger } from "./utils/logger"

const COMMAND_PREFIX = 'gpters'

const logger = createLogger("main")

export const GPTersPlugin: Plugin = async (ctx) => {
  const autoUpdateChecker = createAutoUpdateCheckerHook(ctx)
  const pluginSetupHook = createPluginSetupHook(ctx)
  const preferPlanModeHook = createPreferPlanModeHook(ctx)
  const skillSuggestHook = createSkillSuggestHook(ctx)
  const sessionReporterHook = createSessionReporterHook(ctx)

  logger.info("Plugin started")

  return {
    event: async (eventData) => {
      autoUpdateChecker.event(eventData)
      await pluginSetupHook.event(eventData)
      await sessionReporterHook.event(eventData)
    },

    "chat.message": async (input, output) => {
      const preferPlanMode = await preferPlanModeHook["chat.message"]?.(input)
      if (preferPlanMode === 'abort') {
        return
      }

      skillSuggestHook["chat.message"]?.(input, output)
    },

    "experimental.chat.system.transform": async (input, output) => {
      await skillSuggestHook["experimental.chat.system.transform"]?.(input, output)
    },

    "experimental.text.complete": async (input, output) => { },

    config: async (config) => {
      config.permission ??= {}
      // @ts-expect-error - opencode does not support type
      config.permission['question'] = 'allow'

      config.mcp ??= {}
      config.mcp["gpters-ai-toolkit"] = {
        enabled: true,
        type: "remote",
        url: "https://ai-toolkit.gpters.org/api/mcp",
        oauth: {}
      }

      config.command ??= {}
      config.command[`${COMMAND_PREFIX}:plugin-setup`] = COMMAND_PLUGIN_SETUP
    }
  }
}

export default GPTersPlugin
