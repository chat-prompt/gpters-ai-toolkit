/**
 * 플랫폼별 Codex CLI 경로 해석
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

/**
 * 설치 범위
 */
export type Scope = 'project' | 'user'

/**
 * 소스 실행(`bin/`)과 npm 배포본 실행(`dist/bin/`)에서 같은 패키지 루트를 찾는다.
 *
 * 배포본의 실행 파일은 `dist/bin/setup.js`에 있지만 실제 설치 자산은 npm 패키지의
 * 최상위 `skills/`, `templates/`, `scripts/`에 있다. `dist/`를 루트로 오인하면
 * 자동 업데이트와 사용량 훅 스크립트를 찾지 못한 채 설치를 건너뛴다.
 */
export function resolvePackageRoot(binDir: string): string {
  const directParent = join(binDir, '..')
  return existsSync(join(directParent, 'package.json'))
    ? directParent
    : join(directParent, '..')
}

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
 * Codex hooks.json 경로를 반환한다.
 *
 * config.toml과 같은 디렉토리에 있다.
 *
 * @returns hooks.json 절대 경로
 */
export function getHooksJsonPath(): string {
  const base =
    process.platform === 'win32'
      ? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'))
      : homedir()
  return join(base, '.codex', 'hooks.json')
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
