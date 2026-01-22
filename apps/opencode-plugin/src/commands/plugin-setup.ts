import type { Config } from "@opencode-ai/sdk"

export const PLUGIN_SETUP_COMMAND_NAME = "gpters:plugin-setup"

export const COMMAND_PLUGIN_SETUP: NonNullable<Config['command']>[string] = {
  template: '',
  description: 'GPTers AI Toolkit 초기 설정 및 OAuth 로그인',
}
