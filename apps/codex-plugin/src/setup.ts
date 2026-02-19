/**
 * Codex 플러그인 설치 오케스트레이션
 *
 * 스킬 복사, MCP 설정, AGENTS.md 생성을 순서대로 수행한다.
 */

import { join } from 'node:path'
import type { Scope } from './paths.js'
import { getConfigTomlPath, getSkillsDir, getAgentsMdPath } from './paths.js'
import { ensureMcpConfig } from './config-toml.js'
import { installSkills, installAgentsMd } from './skills-installer.js'
import { promptScope, promptAgentsMd } from './prompts.js'

/**
 * 설치 옵션
 */
export interface SetupOptions {
  /** 설치 범위 (지정하지 않으면 대화형으로 질문) */
  scope?: Scope
  /** 기존 파일 덮어쓰기 여부 */
  force?: boolean
  /** AGENTS.md 생성 건너뛰기 */
  skipAgentsMd?: boolean
  /** 패키지 내 skills 디렉토리 경로 */
  skillsSourceDir: string
  /** 패키지 내 templates 디렉토리 경로 */
  templatesDir: string
}

/**
 * 설치 결과
 */
export interface SetupResult {
  /** 설치 범위 */
  scope: Scope
  /** 복사된 스킬 목록 */
  skillsCopied: string[]
  /** 건너뛴 스킬 목록 */
  skillsSkipped: string[]
  /** MCP 설정 결과 */
  mcpConfig: 'added' | 'skipped'
  /** AGENTS.md 결과 */
  agentsMd: 'created' | 'skipped' | 'not_found' | 'not_requested'
}

/**
 * Codex 플러그인 설치를 수행한다.
 *
 * @param options - 설치 옵션
 * @returns 설치 결과
 */
export async function runSetup(options: SetupOptions): Promise<SetupResult> {
  const scope = options.scope ?? (await promptScope())
  const force = options.force ?? false

  // 1. 스킬 복사
  const targetDir = getSkillsDir(scope)
  const skillResult = installSkills(options.skillsSourceDir, targetDir, force)

  // 2. MCP 설정
  const configPath = getConfigTomlPath()
  const mcpResult = ensureMcpConfig(configPath)

  // 3. AGENTS.md (project scope만)
  let agentsMdResult: SetupResult['agentsMd'] = 'not_requested'
  if (scope === 'project' && !options.skipAgentsMd) {
    const wantAgentsMd = await promptAgentsMd()
    if (wantAgentsMd) {
      const templatePath = join(options.templatesDir, 'AGENTS.md')
      const destPath = getAgentsMdPath()
      agentsMdResult = installAgentsMd(templatePath, destPath, force)
    }
  }

  return {
    scope,
    skillsCopied: skillResult.copied,
    skillsSkipped: skillResult.skipped,
    mcpConfig: mcpResult,
    agentsMd: agentsMdResult,
  }
}

/**
 * 설치 결과를 콘솔에 출력한다.
 *
 * @param result - 설치 결과
 */
export function printSummary(result: SetupResult): void {
  console.log('\n✅ GPTers Codex Plugin 설치 완료!\n')
  console.log(`범위: ${result.scope}`)
  console.log('')

  if (result.skillsCopied.length > 0) {
    console.log(`스킬 설치됨: ${result.skillsCopied.join(', ')}`)
  }
  if (result.skillsSkipped.length > 0) {
    console.log(`스킬 건너뜀 (이미 존재): ${result.skillsSkipped.join(', ')}`)
  }

  console.log(`MCP 설정: ${result.mcpConfig === 'added' ? '추가됨' : '이미 존재'}`)

  if (result.agentsMd === 'created') {
    console.log('AGENTS.md: 생성됨')
  } else if (result.agentsMd === 'skipped') {
    console.log('AGENTS.md: 이미 존재하여 건너뜀')
  }

  console.log('\n다음 단계:')
  console.log('  1. Codex CLI를 재시작하면 MCP 서버가 자동 연결됩니다')
  console.log('  2. 브라우저에서 Google (@gpters.org) 로그인이 필요합니다')
  console.log('')
}
