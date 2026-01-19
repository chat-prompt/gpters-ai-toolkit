import type { Plugin } from "@opencode-ai/plugin"

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
  }
}

export default GPTersPlugin
