import type { PluginInput } from "@opencode-ai/plugin"
import { openBrowser } from "../../utils/browser"
import { showYesNo } from "../../utils/dialog"
import { createLogger } from "../../utils/logger"
import { PLUGIN_SETUP_COMMAND_NAME } from "../../commands/plugin-setup"

const logger = createLogger("plugin-setup")
const MCP_NAME = "gpters-ai-toolkit"

type McpStatus =
  | { status: "connected" }
  | { status: "disabled" }
  | { status: "failed"; error: string }
  | { status: "needs_auth" }
  | { status: "needs_client_registration"; error: string }

interface CommandExecutedProperties {
  name: string
  sessionID: string
  arguments: string
  messageID: string
}

export function createPluginSetupHook(ctx: PluginInput) {
  return {
    event: async ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (event.type !== "command.executed") return

      const props = event.properties as CommandExecutedProperties | undefined
      if (props?.name !== PLUGIN_SETUP_COMMAND_NAME) return

      await runPluginSetup(ctx)
    }
  }
}

async function runPluginSetup(ctx: PluginInput): Promise<void> {
  const { client } = ctx

  try {
    const statusRes = await client.mcp.status()
    const mcpStatus = statusRes.data?.[MCP_NAME] as McpStatus | undefined

    if (!mcpStatus) {
      await showErrorToast(ctx, "GPTers AI Toolkit MCP 서버를 찾을 수 없습니다")
      logger.error("MCP server not found", { name: MCP_NAME })
      return
    }

    logger.info("MCP status check", { status: mcpStatus.status })

    switch (mcpStatus.status) {
      case "connected":
        await handleAlreadyConnected(ctx)
        break

      case "needs_auth":
        await handleNeedsAuth(ctx)
        break

      case "needs_client_registration":
        await showErrorToast(ctx, `클라이언트 등록이 필요합니다: ${mcpStatus.error}`)
        break

      case "failed":
        await showErrorToast(ctx, `연결 실패: ${mcpStatus.error}`)
        break

      case "disabled":
        await showErrorToast(ctx, "MCP 서버가 비활성화되어 있습니다")
        break
    }
  } catch (error) {
    logger.error("Plugin setup failed", error)
    await showErrorToast(ctx, "설정 중 오류가 발생했습니다")
  }
}

async function handleAlreadyConnected(ctx: PluginInput): Promise<void> {
  const result = await showYesNo({
    message: "이미 GPTers AI Toolkit에 연결되어 있습니다.\n\n다시 로그인하시겠습니까?",
    title: "설정 완료",
    yesText: "재로그인",
    noText: "취소"
  })

  if (!result.ok || !result.value) {
    return
  }

  try {
    await ctx.client.mcp.auth.remove({ path: { name: MCP_NAME } })
    logger.info("Removed existing auth for re-login")
    await handleNeedsAuth(ctx)
  } catch (error) {
    logger.error("Failed to remove existing auth", error)
    await showErrorToast(ctx, "재로그인 준비 중 오류가 발생했습니다")
  }
}

async function handleNeedsAuth(ctx: PluginInput): Promise<void> {
  const { client } = ctx

  try {
    const authRes = await client.mcp.auth.start({
      path: { name: MCP_NAME }
    })

    const authorizationUrl = authRes.data?.authorizationUrl
    if (!authorizationUrl) {
      await showErrorToast(ctx, "인증 URL을 받지 못했습니다")
      logger.error("No authorization URL received")
      return
    }

    const browserOpened = await openBrowser(authorizationUrl)
    if (!browserOpened) {
      logger.warn("Failed to open browser automatically")
    }

    await client.tui.showToast({
      body: {
        title: "GPTers 로그인",
        message: "브라우저에서 로그인을 완료해주세요.",
        variant: "info",
        duration: 5000,
      }
    }).catch(() => {})

    logger.info("OAuth flow started", { url: authorizationUrl })
  } catch (error) {
    logger.error("OAuth start failed", error)
    await showErrorToast(ctx, "인증 시작에 실패했습니다")
  }
}

async function showErrorToast(ctx: PluginInput, message: string): Promise<void> {
  await ctx.client.tui.showToast({
    body: {
      title: "설정 오류",
      message,
      variant: "error",
      duration: 5000,
    }
  }).catch(() => {})
}
