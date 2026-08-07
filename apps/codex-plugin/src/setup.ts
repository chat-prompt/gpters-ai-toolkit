/**
 * Codex 플러그인 설치 오케스트레이션
 *
 * 스킬 복사, MCP 설정, AGENTS.md 생성을 순서대로 수행한다.
 */

import { join, dirname } from 'node:path'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync, existsSync } from 'node:fs'
import type { Scope } from './paths.js'
import { getConfigTomlPath, getSkillsDir, getAgentsMdPath, getHooksJsonPath } from './paths.js'
import { ensureMcpConfig, ensureHooksFeature } from './config-toml.js'
import { ensureUsageHook } from './hooks-json.js'
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
  /** 패키지 루트 디렉토리 경로 (package.json 위치) */
  packageRoot?: string
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
  /** 사용량 자동 보고 훅 설치 결과 */
  usageHook: 'installed' | 'skipped' | 'failed'
  /** 자동 업데이트 스크립트 설치 결과 */
  autoUpdate: 'installed' | 'skipped'
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

  // 4. 버전 마커 + 자동 업데이트 스크립트 (user scope만)
  let autoUpdateResult: SetupResult['autoUpdate'] = 'skipped'
  if (scope === 'user' && options.packageRoot) {
    autoUpdateResult = installAutoUpdate(options.packageRoot, targetDir)
  }

  // 5. 사용량 자동 보고 훅 (user scope만)
  //    project scope는 이 레포에만 적용되는데, 사용량은 사람 단위라 의미가 없다.
  let usageHookResult: SetupResult['usageHook'] = 'skipped'
  if (scope === 'user' && options.packageRoot) {
    usageHookResult = installUsageHook(options.packageRoot, targetDir)
  }

  return {
    scope,
    skillsCopied: skillResult.copied,
    skillsSkipped: skillResult.skipped,
    mcpConfig: mcpResult,
    agentsMd: agentsMdResult,
    autoUpdate: autoUpdateResult,
    usageHook: usageHookResult,
  }
}

/**
 * 사용량 보고 스크립트를 설치하고 훅으로 등록한다.
 *
 * 스크립트를 `~/.agents/gpters-usage-report.sh`에 복사한 뒤 `~/.codex/hooks.json`의
 * SessionStart에 얹고, `[features] hooks = true`를 보장한다. 셋 중 하나라도 안 되면
 * 훅이 돌지 않으므로 실패를 그대로 돌려준다.
 *
 * @param packageRoot - 패키지 루트 디렉토리 경로
 * @param skillsDir - 스킬 설치 디렉토리 경로
 * @returns 설치 결과
 */
export function installUsageHook(
  packageRoot: string,
  skillsDir: string
): 'installed' | 'skipped' | 'failed' {
  try {
    const scriptSrc = join(packageRoot, 'scripts', 'gpters-usage-report.sh')
    if (!existsSync(scriptSrc)) return 'skipped'

    const agentsBaseDir = dirname(dirname(skillsDir)) // ~/.agents/skills/gpters → ~/.agents
    const destPath = join(agentsBaseDir, 'gpters-usage-report.sh')
    mkdirSync(agentsBaseDir, { recursive: true })
    copyFileSync(scriptSrc, destPath)
    chmodSync(destPath, 0o755)

    // 이 스위치가 꺼져 있으면 훅을 등록해도 실행되지 않는다
    if (ensureHooksFeature(getConfigTomlPath()) === 'failed') return 'failed'

    const hookResult = ensureUsageHook(getHooksJsonPath(), destPath)
    if (hookResult === 'failed') return 'failed'
    return hookResult === 'added' ? 'installed' : 'skipped'
  } catch {
    return 'failed'
  }
}

/**
 * 버전 마커 파일과 자동 업데이트 스크립트를 설치한다.
 *
 * - package.json에서 버전을 읽어 `{skillsDir}/.version`에 기록
 * - `scripts/auto-update.sh`를 `{skillsDir}/../auto-update.sh`에 복사
 *
 * @param packageRoot - 패키지 루트 디렉토리 경로
 * @param skillsDir - 스킬 설치 디렉토리 경로
 * @returns 'installed' 또는 'skipped'
 */
export function installAutoUpdate(
  packageRoot: string,
  skillsDir: string
): 'installed' | 'skipped' {
  try {
    // package.json에서 버전 읽기
    const pkgPath = join(packageRoot, 'package.json')
    if (!existsSync(pkgPath)) return 'skipped'
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const version: string = pkg.version

    // .version 파일 기록
    mkdirSync(skillsDir, { recursive: true })
    writeFileSync(join(skillsDir, '.version'), version, 'utf-8')

    // auto-update.sh 복사 (~/.agents/auto-update.sh)
    const scriptSrc = join(packageRoot, 'scripts', 'auto-update.sh')
    if (!existsSync(scriptSrc)) return 'skipped'

    const agentsBaseDir = dirname(dirname(skillsDir)) // ~/.agents/skills/gpters → ~/.agents
    const destPath = join(agentsBaseDir, 'auto-update.sh')
    copyFileSync(scriptSrc, destPath)
    chmodSync(destPath, 0o755)

    return 'installed'
  } catch {
    return 'skipped'
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

  if (result.autoUpdate === 'installed') {
    console.log('자동 업데이트: 설치됨 (~/.agents/auto-update.sh)')
  }

  if (result.usageHook === 'installed') {
    console.log('사용량 자동 보고: 설치됨 (하루 1회, 끄기: AITK_USAGE_REPORT=0)')
  } else if (result.usageHook === 'failed') {
    // 조용히 넘기면 대시보드에 데이터가 안 쌓이는 이유를 알 길이 없다
    console.log('사용량 자동 보고: 설치 실패 (~/.codex/hooks.json 확인 필요)')
  }

  console.log('\n다음 단계:')
  console.log('  1. Codex CLI를 재시작하면 MCP 서버가 자동 연결됩니다')
  console.log('  2. 브라우저에서 Google 로그인이 필요합니다')
  console.log('')
}
