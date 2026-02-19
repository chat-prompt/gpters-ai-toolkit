/**
 * config-toml 유틸리티 테스트
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { hasMcpSection, appendMcpSection, ensureMcpConfig } from '../src/config-toml.js'

describe('hasMcpSection', () => {
  it('빈 문자열이면 false를 반환한다', () => {
    expect(hasMcpSection('')).toBe(false)
  })

  it('MCP 섹션이 없으면 false를 반환한다', () => {
    const content = '[some_other_section]\nkey = "value"'
    expect(hasMcpSection(content)).toBe(false)
  })

  it('MCP 섹션이 있으면 true를 반환한다', () => {
    const content = '[mcp_servers.gpters-ai-toolkit]\ntype = "http"'
    expect(hasMcpSection(content)).toBe(true)
  })
})

describe('appendMcpSection', () => {
  it('빈 파일에 MCP 섹션을 추가한다', () => {
    const result = appendMcpSection('')
    expect(result).toContain('[mcp_servers.gpters-ai-toolkit]')
    expect(result).toContain('type = "http"')
    expect(result).toContain('url = "https://ai-toolkit.gpters.org/api/mcp"')
  })

  it('기존 설정에 MCP 섹션을 추가한다', () => {
    const existing = '[model]\nname = "gpt-4"'
    const result = appendMcpSection(existing)
    expect(result).toContain('[model]')
    expect(result).toContain('[mcp_servers.gpters-ai-toolkit]')
  })

  it('이미 존재하면 원본 그대로 반환한다', () => {
    const existing = '[mcp_servers.gpters-ai-toolkit]\ntype = "http"'
    const result = appendMcpSection(existing)
    expect(result).toBe(existing)
  })
})

describe('ensureMcpConfig', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'codex-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('파일이 없으면 새로 생성하고 added를 반환한다', () => {
    const configPath = join(tmpDir, '.codex', 'config.toml')
    const result = ensureMcpConfig(configPath)
    expect(result).toBe('added')

    const content = readFileSync(configPath, 'utf-8')
    expect(content).toContain('[mcp_servers.gpters-ai-toolkit]')
  })

  it('파일이 있지만 MCP 섹션이 없으면 추가하고 added를 반환한다', () => {
    const configPath = join(tmpDir, 'config.toml')
    writeFileSync(configPath, '[model]\nname = "gpt-4"\n', 'utf-8')

    const result = ensureMcpConfig(configPath)
    expect(result).toBe('added')

    const content = readFileSync(configPath, 'utf-8')
    expect(content).toContain('[model]')
    expect(content).toContain('[mcp_servers.gpters-ai-toolkit]')
  })

  it('이미 MCP 섹션이 있으면 skipped를 반환한다', () => {
    const configPath = join(tmpDir, 'config.toml')
    writeFileSync(
      configPath,
      '[mcp_servers.gpters-ai-toolkit]\ntype = "http"\n',
      'utf-8'
    )

    const result = ensureMcpConfig(configPath)
    expect(result).toBe('skipped')
  })
})
