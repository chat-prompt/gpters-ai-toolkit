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

/**
 * GPTers AI Toolkit 의 OpenCode 플러그인 (npm `@gpters/opencode`).
 *
 * 상태 (2026-09-21 기록, DEV-4483): **유지보수 중단. 코드는 지우지 않고 둔다.**
 * - 사용: 운영 MCP 기록상 2026-03-10 이후 계정이 확인되는 사용이 없다
 *   (월별 요청 2월 4,962 · 3월 617 · 4~6월 0 · 7월 46(이틀·계정 미연결) · 8~9월 0)
 * - 마지막 개발: 2026-03-09
 * - 발행: 퍼블릭 npm 자동 발행 경로가 없다. `release-public-packages.yml` 은 aitk·codex-plugin 만
 *   다룬다. 0.2.2 는 수동 `npm publish` 로 올라갔다. 옛 Verdaccio 워크플로는 삭제됐다(PR #157)
 * - 계측: 사용량 수집기(`aitk usage`)는 Claude Code·Codex 만 지원해 OpenCode 사용은 AX 대시보드에 안 잡힌다
 *
 * 다시 지원하려면 위 두 가지(자동 발행·사용량 수집)부터 채워야 한다.
 */
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
