import type { Plugin } from "@opencode-ai/plugin"
import { COMMAND_PRD_REVIEW } from "./commands/prd-review"

const COMMAND_PREFIX = 'gpters'
const PREFIX = "*Working with GPTers AI Toolkit*\n\n"

export const GPTersPlugin: Plugin = async ({ directory, client }) => {
  console.log("[GPTers Plugin] Loaded:", directory)

  const processedMessages = new Set<string>()

  return {
    event: async () => { },

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
