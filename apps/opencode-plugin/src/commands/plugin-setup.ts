import type { Config } from "@opencode-ai/sdk"
import pkg from '../../package.json' with { type: "json" }

const packageVersion = pkg.version

export const PLUGIN_SETUP_COMMAND_NAME = "gpters:plugin-setup"

export const COMMAND_PLUGIN_SETUP: NonNullable<Config['command']>[string] = {
  model: "anthropic/claude-haiku-4-5-20251001",
  template: '다음과 같이 말해: MCP 인증 페이지가 열렸습니다. 로그인을 진행해주세요.\n이후 /mcp 를 통해 연결을 확인하세요.',
  description: `[${packageVersion}] GPTers AI Toolkit 초기 설정 및 OAuth 로그인`,
}
