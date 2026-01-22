import type { PluginInput } from "@opencode-ai/plugin"
import { GptersConfigManager } from "../../config"
import { showYesNo } from "../../utils/dialog"

export function createPreferPlanModeHook(ctx: PluginInput) {
  const { directory, client } = ctx
  const promptedSessions = new Set<string>()
  const configManager = GptersConfigManager.getInstance(directory)

  return {
    "chat.message": async (input: { sessionID: string; messageID?: string; agent?: string }) => {
      const { sessionID, agent, messageID } = input

      if (!configManager.getPreferPlanMode()) return
      if (!messageID) return
      if (!agent || agent !== "Sisyphus") return
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
  }
}
