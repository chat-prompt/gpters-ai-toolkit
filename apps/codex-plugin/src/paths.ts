/**
 * 플랫폼별 Codex CLI 경로 해석
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * 설치 범위
 */
export type Scope = 'project' | 'user'

/**
 * Codex config.toml 경로를 반환한다.
 *
 * - macOS/Linux: `~/.codex/config.toml`
 * - Windows: `%APPDATA%/.codex/config.toml`
 *
 * @returns config.toml 절대 경로
 */
export function getConfigTomlPath(): string {
  const base =
    process.platform === 'win32'
      ? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'))
      : homedir()
  return join(base, '.codex', 'config.toml')
}

/**
 * 스킬 설치 대상 디렉토리를 반환한다.
 *
 * - user: `~/.agents/skills/gpters/` (macOS/Linux) 또는 `%APPDATA%/.agents/skills/gpters/` (Windows)
 * - project: `<cwd>/.agents/skills/gpters/`
 *
 * @param scope - 설치 범위 (project 또는 user)
 * @param cwd - 프로젝트 디렉토리 (project scope 시 사용, 기본값: process.cwd())
 * @returns 스킬 디렉토리 절대 경로
 */
export function getSkillsDir(scope: Scope, cwd?: string): string {
  if (scope === 'project') {
    return join(cwd ?? process.cwd(), '.agents', 'skills', 'gpters')
  }
  const base =
    process.platform === 'win32'
      ? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'))
      : homedir()
  return join(base, '.agents', 'skills', 'gpters')
}

/**
 * AGENTS.md 파일 경로를 반환한다.
 *
 * @param cwd - 프로젝트 디렉토리 (기본값: process.cwd())
 * @returns AGENTS.md 절대 경로
 */
export function getAgentsMdPath(cwd?: string): string {
  return join(cwd ?? process.cwd(), 'AGENTS.md')
}
