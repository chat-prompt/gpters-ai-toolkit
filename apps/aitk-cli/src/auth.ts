/**
 * 인증 토큰 탐색 (env -> config -> Claude 자격증명 순서)
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { readConfig } from './config.js'

/**
 * Claude Code MCP OAuth 자격증명에서 gpters-ai-toolkit 토큰 탐색
 *
 * @returns 찾은 accessToken 또는 undefined
 */
export function findClaudeCredentialToken(): string | undefined {
  try {
    const credPath = join(homedir(), '.claude', '.credentials.json')
    const raw = readFileSync(credPath, 'utf-8')
    const creds = JSON.parse(raw) as Record<string, unknown>

    const mcpOAuth = creds.mcpOAuth as Record<string, { accessToken?: string }> | undefined
    if (!mcpOAuth) return undefined

    for (const [key, value] of Object.entries(mcpOAuth)) {
      if (key.includes('gpters-ai-toolkit') && value.accessToken && value.accessToken.length > 0) {
        return value.accessToken
      }
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * 인증 토큰을 우선순위에 따라 탐색
 *
 * 우선순위:
 * 1. GPTERS_TOKEN 환경변수
 * 2. ~/.config/aitk/config.json
 * 3. ~/.claude/.credentials.json mcpOAuth
 *
 * @returns 토큰 문자열 또는 undefined
 */
export function resolveToken(): string | undefined {
  // 1. 환경변수
  const envToken = process.env.GPTERS_TOKEN
  if (envToken && envToken.length > 0) return envToken

  // 2. CLI 설정 파일
  const config = readConfig()
  if (config.token && config.token.length > 0) return config.token

  // 3. Claude 자격증명
  return findClaudeCredentialToken()
}
