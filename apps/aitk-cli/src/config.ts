/**
 * CLI 설정 파일 관리 (~/.config/aitk/config.json)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/** CLI 설정 구조 */
export interface AitkConfig {
  /** API 인증 토큰 */
  token?: string
  /** 서버 URL */
  serverUrl: string
}

/** 기본 서버 URL */
const DEFAULT_SERVER_URL = 'https://ai-toolkit.gpters.org'

/**
 * 설정 파일 디렉토리 경로 반환
 *
 * @returns 설정 디렉토리 절대 경로
 */
export function getConfigDir(): string {
  return join(homedir(), '.config', 'aitk')
}

/**
 * 설정 파일 경로 반환
 *
 * @returns 설정 파일 절대 경로
 */
export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json')
}

/**
 * 설정 파일 읽기
 *
 * @returns 파싱된 설정 객체 (파일 없으면 기본값)
 */
export function readConfig(): AitkConfig {
  try {
    const raw = readFileSync(getConfigPath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AitkConfig>
    return {
      serverUrl: parsed.serverUrl ?? DEFAULT_SERVER_URL,
      token: parsed.token,
    }
  } catch {
    return { serverUrl: DEFAULT_SERVER_URL }
  }
}

/**
 * 설정 파일 쓰기
 *
 * @param config - 저장할 설정 객체
 */
export function writeConfig(config: AitkConfig): void {
  const dir = getConfigDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2) + '\n', 'utf-8')
}
