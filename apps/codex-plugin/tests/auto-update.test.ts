/**
 * installAutoUpdate 함수 테스트
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { installAutoUpdate } from '../src/setup.js'

describe('installAutoUpdate', () => {
  let tmpDir: string
  let packageRoot: string
  let skillsDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'auto-update-test-'))

    // 패키지 루트 구조 생성
    packageRoot = join(tmpDir, 'package')
    mkdirSync(join(packageRoot, 'scripts'), { recursive: true })
    writeFileSync(
      join(packageRoot, 'package.json'),
      JSON.stringify({ version: '0.1.5' })
    )
    writeFileSync(
      join(packageRoot, 'scripts', 'auto-update.sh'),
      '#!/bin/bash\necho "update"'
    )

    // 스킬 디렉토리 구조: ~/.agents/skills/gpters/
    skillsDir = join(tmpDir, '.agents', 'skills', 'gpters')
    mkdirSync(skillsDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('.version 파일을 생성한다', () => {
    const result = installAutoUpdate(packageRoot, skillsDir)

    expect(result).toBe('installed')
    expect(readFileSync(join(skillsDir, '.version'), 'utf-8')).toBe('0.1.5')
  })

  it('auto-update.sh를 ~/.agents/에 복사한다', () => {
    const result = installAutoUpdate(packageRoot, skillsDir)

    expect(result).toBe('installed')
    const agentsDir = join(tmpDir, '.agents')
    const scriptPath = join(agentsDir, 'auto-update.sh')
    expect(existsSync(scriptPath)).toBe(true)
    expect(readFileSync(scriptPath, 'utf-8')).toContain('echo "update"')
  })

  it('auto-update.sh에 실행 권한을 부여한다', () => {
    installAutoUpdate(packageRoot, skillsDir)

    const agentsDir = join(tmpDir, '.agents')
    const stat = statSync(join(agentsDir, 'auto-update.sh'))
    // 실행 권한 확인 (owner execute bit)
    expect(stat.mode & 0o100).toBeTruthy()
  })

  it('package.json이 없으면 skipped를 반환한다', () => {
    const emptyRoot = join(tmpDir, 'empty')
    mkdirSync(emptyRoot, { recursive: true })

    const result = installAutoUpdate(emptyRoot, skillsDir)
    expect(result).toBe('skipped')
  })

  it('auto-update.sh가 없으면 .version만 생성하고 skipped를 반환한다', () => {
    rmSync(join(packageRoot, 'scripts'), { recursive: true, force: true })

    const result = installAutoUpdate(packageRoot, skillsDir)

    expect(result).toBe('skipped')
    // .version은 생성됨
    expect(readFileSync(join(skillsDir, '.version'), 'utf-8')).toBe('0.1.5')
  })
})
