/**
 * paths 유틸리티 테스트
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getConfigTomlPath, getSkillsDir, getAgentsMdPath, resolvePackageRoot } from '../src/paths.js'

describe('resolvePackageRoot', () => {
  const packageRoot = process.cwd()

  it('소스 bin에서 최상위 설치 자산 경로를 찾는다', () => {
    expect(resolvePackageRoot(join(packageRoot, 'bin'))).toBe(packageRoot)
  })

  it('npm 배포본 dist/bin에서도 최상위 설치 자산 경로를 찾는다', () => {
    expect(resolvePackageRoot(join(packageRoot, 'dist', 'bin'))).toBe(packageRoot)
  })
})

describe('getConfigTomlPath', () => {
  const originalPlatform = process.platform

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('macOS/Linux에서 ~/.codex/config.toml을 반환한다', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    expect(getConfigTomlPath()).toBe(join(homedir(), '.codex', 'config.toml'))
  })

  it('Linux에서 ~/.codex/config.toml을 반환한다', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    expect(getConfigTomlPath()).toBe(join(homedir(), '.codex', 'config.toml'))
  })

  it('Windows에서 APPDATA 기반 경로를 반환한다', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    const appdata = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
    expect(getConfigTomlPath()).toBe(join(appdata, '.codex', 'config.toml'))
  })
})

describe('getSkillsDir', () => {
  it('project scope에서 cwd 기반 경로를 반환한다', () => {
    const cwd = '/tmp/my-project'
    expect(getSkillsDir('project', cwd)).toBe(
      join('/tmp/my-project', '.agents', 'skills', 'gpters')
    )
  })

  it('user scope에서 홈 디렉토리 기반 경로를 반환한다', () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    expect(getSkillsDir('user')).toBe(
      join(homedir(), '.agents', 'skills', 'gpters')
    )
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })
})

describe('getAgentsMdPath', () => {
  it('cwd 기반 AGENTS.md 경로를 반환한다', () => {
    expect(getAgentsMdPath('/tmp/my-project')).toBe('/tmp/my-project/AGENTS.md')
  })

  it('cwd 미지정 시 process.cwd() 기반 경로를 반환한다', () => {
    expect(getAgentsMdPath()).toBe(join(process.cwd(), 'AGENTS.md'))
  })
})
