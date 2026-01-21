import type { Plugin } from "@opencode-ai/plugin"
import { COMMAND_PRD_REVIEW } from "./commands/prd-review"
import { createAutoUpdateCheckerHook } from "./hooks/auto-update-checker"
import { showYesNo } from "./utils/dialog"

const COMMAND_PREFIX = 'gpters'
const PREFIX = "*Working with GPTers AI Toolkit*\n\n"

export const GPTersPlugin: Plugin = async (ctx) => {
  const { directory, client } = ctx

  const processedMessages = new Set<string>()
  const promptedSessions = new Set<string>()
  const autoUpdateChecker = createAutoUpdateCheckerHook(ctx)


  return {
    event: async (eventData) => {
      autoUpdateChecker.event(eventData)
    },

    "chat.message": async (input) => {
      // 메세지 시작, 플랜모드인지 아닌지 여부 확인
      {
        const { sessionID, agent } = input

        if (!input.messageID) return
        if (agent !== "Sisyphus") return
        if (promptedSessions.has(sessionID)) return
        promptedSessions.add(sessionID)

        const result = await showYesNo(directory, {
          message: "Plan 모드 사용을 권장해요. 무시하고 일반 모드로 계속하시겠어요?",
          title: "GPTers"
        })

        if (result.ok && result.value) {
        } else {
          setTimeout(async () => {
            await client.session.abort({ path: { id: input.sessionID } })
          }, 100)
        }
      }
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
    }
  }
}

export default GPTersPlugin
