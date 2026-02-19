/**
 * skills-installer 유틸리티 테스트
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { installSkills, installAgentsMd } from '../src/skills-installer.js'

describe('installSkills', () => {
  let tmpDir: string
  let srcDir: string
  let destDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'skills-test-'))
    srcDir = join(tmpDir, 'source-skills')
    destDir = join(tmpDir, 'target-skills')

    // 소스 스킬 생성
    mkdirSync(join(srcDir, 'commit'), { recursive: true })
    writeFileSync(join(srcDir, 'commit', 'SKILL.md'), '# Commit Skill')

    mkdirSync(join(srcDir, 'prd-review'), { recursive: true })
    writeFileSync(join(srcDir, 'prd-review', 'SKILL.md'), '# PRD Review Skill')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('새 디렉토리에 스킬을 복사한다', () => {
    const result = installSkills(srcDir, destDir)

    expect(result.copied).toContain('commit')
    expect(result.copied).toContain('prd-review')
    expect(result.skipped).toHaveLength(0)

    expect(readFileSync(join(destDir, 'commit', 'SKILL.md'), 'utf-8')).toBe(
      '# Commit Skill'
    )
    expect(
      readFileSync(join(destDir, 'prd-review', 'SKILL.md'), 'utf-8')
    ).toBe('# PRD Review Skill')
  })

  it('기존 스킬이 있으면 건너뛴다', () => {
    mkdirSync(join(destDir, 'commit'), { recursive: true })
    writeFileSync(join(destDir, 'commit', 'SKILL.md'), '# Custom Commit')

    const result = installSkills(srcDir, destDir)

    expect(result.copied).toContain('prd-review')
    expect(result.skipped).toContain('commit')

    // 기존 파일이 유지되는지 확인
    expect(readFileSync(join(destDir, 'commit', 'SKILL.md'), 'utf-8')).toBe(
      '# Custom Commit'
    )
  })

  it('--force 시 기존 스킬을 덮어쓴다', () => {
    mkdirSync(join(destDir, 'commit'), { recursive: true })
    writeFileSync(join(destDir, 'commit', 'SKILL.md'), '# Custom Commit')

    const result = installSkills(srcDir, destDir, true)

    expect(result.copied).toContain('commit')
    expect(result.copied).toContain('prd-review')
    expect(result.skipped).toHaveLength(0)

    expect(readFileSync(join(destDir, 'commit', 'SKILL.md'), 'utf-8')).toBe(
      '# Commit Skill'
    )
  })

  it('소스 디렉토리가 없으면 빈 결과를 반환한다', () => {
    const result = installSkills('/nonexistent', destDir)
    expect(result.copied).toHaveLength(0)
    expect(result.skipped).toHaveLength(0)
  })
})

describe('installAgentsMd', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agents-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('템플릿으로 AGENTS.md를 생성한다', () => {
    const templatePath = join(tmpDir, 'template.md')
    writeFileSync(templatePath, '# AGENTS.md Template')

    const destPath = join(tmpDir, 'AGENTS.md')
    const result = installAgentsMd(templatePath, destPath)

    expect(result).toBe('created')
    expect(readFileSync(destPath, 'utf-8')).toBe('# AGENTS.md Template')
  })

  it('이미 존재하면 건너뛴다', () => {
    const templatePath = join(tmpDir, 'template.md')
    writeFileSync(templatePath, '# New Template')

    const destPath = join(tmpDir, 'AGENTS.md')
    writeFileSync(destPath, '# Existing AGENTS.md')

    const result = installAgentsMd(templatePath, destPath)

    expect(result).toBe('skipped')
    expect(readFileSync(destPath, 'utf-8')).toBe('# Existing AGENTS.md')
  })

  it('--force 시 기존 파일을 덮어쓴다', () => {
    const templatePath = join(tmpDir, 'template.md')
    writeFileSync(templatePath, '# New Template')

    const destPath = join(tmpDir, 'AGENTS.md')
    writeFileSync(destPath, '# Existing AGENTS.md')

    const result = installAgentsMd(templatePath, destPath, true)

    expect(result).toBe('created')
    expect(readFileSync(destPath, 'utf-8')).toBe('# New Template')
  })

  it('템플릿이 없으면 not_found를 반환한다', () => {
    const result = installAgentsMd('/nonexistent', join(tmpDir, 'AGENTS.md'))
    expect(result).toBe('not_found')
    expect(existsSync(join(tmpDir, 'AGENTS.md'))).toBe(false)
  })
})
