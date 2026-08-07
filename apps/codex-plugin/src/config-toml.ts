/**
 * config.toml에 MCP 서버 섹션을 추가하는 유틸리티
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

/** MCP 서버 섹션 마커 */
const MCP_SECTION_HEADER = '[mcp_servers.gpters-ai-toolkit]'

/** 추가할 MCP 섹션 내용 */
const MCP_SECTION = `
${MCP_SECTION_HEADER}
type = "http"
url = "https://ai-toolkit.gpters.org/api/mcp"
`.trimStart()

/**
 * config.toml 파일에 gpters-ai-toolkit MCP 섹션이 이미 존재하는지 확인한다.
 *
 * @param content - config.toml 파일 내용
 * @returns 이미 존재하면 true
 */
export function hasMcpSection(content: string): boolean {
  return content.includes('[mcp_servers.gpters-ai-toolkit]')
}

/**
 * config.toml 파일 내용에 MCP 섹션을 추가한다.
 * 이미 존재하면 원본 그대로 반환한다.
 *
 * @param content - 기존 config.toml 파일 내용
 * @returns MCP 섹션이 추가된 내용
 */
export function appendMcpSection(content: string): string {
  if (hasMcpSection(content)) {
    return content
  }

  const trimmed = content.trimEnd()
  if (trimmed.length === 0) {
    return MCP_SECTION
  }
  return trimmed + '\n\n' + MCP_SECTION
}

/**
 * `[features] hooks` 가 켜져 있는지 확인한다.
 *
 * @param content - config.toml 파일 내용
 * @returns 켜져 있으면 true
 */
export function hasHooksFeature(content: string): boolean {
  return /^\s*hooks\s*=\s*true/m.test(content)
}

/**
 * config.toml에 `[features] hooks = true` 를 보장한다.
 *
 * 이 스위치가 꺼져 있으면 hooks.json에 아무리 등록해도 Codex가 훅을 실행하지 않는다.
 * `hooks = false`로 명시해 둔 사용자는 그 뜻을 존중해 건드리지 않는다 — 우리가
 * 원하는 건 "설정한 적 없는 사람에게 기본값을 주는 것"이지 의사 뒤집기가 아니다.
 *
 * @param configPath - config.toml 절대 경로
 * @returns 'added'(켬) · 'skipped'(이미 켜짐 또는 사용자가 껐음) · 'failed'
 */
export function ensureHooksFeature(configPath: string): 'added' | 'skipped' | 'failed' {
  try {
    let existing = ''
    if (existsSync(configPath)) {
      existing = readFileSync(configPath, 'utf-8')
    }

    if (hasHooksFeature(existing)) return 'skipped'
    // 명시적으로 꺼둔 사람의 설정은 뒤집지 않는다
    if (/^\s*hooks\s*=\s*false/m.test(existing)) return 'skipped'

    const updated = /^\[features\]/m.test(existing)
      ? existing.replace(/^\[features\]/m, '[features]\nhooks = true')
      : `${existing.trimEnd()}\n\n[features]\nhooks = true\n`.trimStart()

    mkdirSync(dirname(configPath), { recursive: true })
    writeFileSync(configPath, updated, 'utf-8')
    return 'added'
  } catch {
    return 'failed'
  }
}

/**
 * config.toml 파일을 읽고 MCP 섹션을 추가한다.
 * 파일이 없으면 디렉토리와 함께 새로 생성한다.
 *
 * @param configPath - config.toml 절대 경로
 * @returns 'added' (추가됨) 또는 'skipped' (이미 존재)
 */
export function ensureMcpConfig(configPath: string): 'added' | 'skipped' {
  let existing = ''
  if (existsSync(configPath)) {
    existing = readFileSync(configPath, 'utf-8')
  }

  if (hasMcpSection(existing)) {
    return 'skipped'
  }

  const updated = appendMcpSection(existing)
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, updated, 'utf-8')
  return 'added'
}
