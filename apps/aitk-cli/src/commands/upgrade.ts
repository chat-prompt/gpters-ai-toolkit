/**
 * upgrade 명령어 - 모든 GPTers 플러그인 버전 확인 + 업데이트 + 마이그레이션
 *
 * Claude Code, OpenCode, Codex 플러그인을 한 번에 처리한다.
 * @gpters-internal/* 패키지가 있으면 @gpters/* 퍼블릭 패키지로 마이그레이션한다.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { info } from '../output.js'
import { ensureConfig } from '../config.js'

/** 명령어 실행 결과 (null이면 실패) */
function run(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}

/** npm 레지스트리에서 최신 버전 조회 */
function npmLatest(pkg: string): string | null {
  return run(`npm view ${pkg} version 2>/dev/null`)
}

/** 마켓플레이스 이름 후보 (환경에 따라 다를 수 있음) */
const MARKETPLACE_NAMES = ['gpters-marketplace', 'chat-prompt-gpters-ai-toolkit']

/** installed_plugins.json에서 플러그인의 마켓플레이스 이름 감지 */
function detectMarketplace(): { version: string | null; marketplace: string } {
  const installedPath = join(homedir(), '.claude', 'plugins', 'installed_plugins.json')
  try {
    const installed = JSON.parse(readFileSync(installedPath, 'utf-8'))
    for (const mp of MARKETPLACE_NAMES) {
      const entry = installed.plugins?.[`gpters-ai-toolkit@${mp}`]?.[0]
      if (entry?.version) return { version: entry.version, marketplace: mp }
    }
  } catch { /* 파일 없음 */ }
  return { version: null, marketplace: MARKETPLACE_NAMES[0] }
}

/** Claude Code 플러그인 업데이트 */
function upgradeClaude(): void {
  info('\n📦 Claude Code Plugin')

  if (!run('which claude')) {
    info('  ⏭️  claude CLI not found — skipping')
    return
  }

  const { version: currentVer, marketplace } = detectMarketplace()
  const pluginRef = `gpters-ai-toolkit@${marketplace}`

  if (!currentVer) {
    info('  Installing...')
    try {
      execSync('claude plugin marketplace add chat-prompt/gpters-ai-toolkit', { stdio: 'inherit' })
    } catch { /* 이미 등록된 경우 무시 */ }
    // 두 마켓플레이스 이름 모두 시도
    let installed = false
    for (const mp of MARKETPLACE_NAMES) {
      try {
        execSync(`claude plugin install gpters-ai-toolkit@${mp}`, { stdio: 'inherit' })
        info('  ✅ Installed (restart Claude Code to activate)')
        installed = true
        break
      } catch { /* 다음 이름 시도 */ }
    }
    if (!installed) {
      info('  ⚠️  Auto-install failed. Run manually:')
      info('     claude plugin marketplace add chat-prompt/gpters-ai-toolkit')
      info('     claude plugin install gpters-ai-toolkit@gpters-marketplace')
    }
    return
  }

  info(`  Current: ${currentVer}`)
  try {
    execSync(`claude plugin update ${pluginRef}`, { stdio: 'inherit' })
    info('  ✅ Updated (applies on next session)')
  } catch {
    info(`  ⚠️  Update failed — try: claude plugin update ${pluginRef}`)
  }
}

/** OpenCode 플러그인 마이그레이션 + 업데이트 */
function upgradeOpencode(): void {
  info('\n📦 OpenCode Plugin')

  const latest = npmLatest('@gpters/opencode')
  info(`  Latest: ${latest ?? 'unknown'}`)

  const candidates = [
    join(process.cwd(), 'opencode.json'),
    join(homedir(), '.config', 'opencode', 'opencode.json'),
  ]

  let found = false
  for (const f of candidates) {
    if (!existsSync(f)) continue
    found = true

    try {
      const config = JSON.parse(readFileSync(f, 'utf-8'))
      const plugins: string[] = config.plugin ?? []

      const oldPkg = plugins.find((p) => /gpters-internal\/(openco|opencode)/.test(p))

      // 기존 gpters 관련 항목 모두 제거 (internal + public 모두)
      config.plugin = plugins.filter(
        (p) => !/gpters-internal\/(openco|opencode)/.test(p) && !/^@gpters\/opencode/.test(p)
      )

      // @gpters/opencode@latest로 교체 (항상 최신 버전 fetch 강제)
      config.plugin.push('@gpters/opencode@latest')

      writeFileSync(f, JSON.stringify(config, null, 2) + '\n')

      if (oldPkg) {
        info(`  🔄 ${f}`)
        info(`     ${oldPkg} → @gpters/opencode@latest`)
      } else {
        info(`  ✅ ${f} — @gpters/opencode@latest`)
      }
    } catch (err) {
      info(`  ⚠️  Failed to process ${f}: ${err}`)
    }
  }

  if (!found) {
    // opencode CLI가 설치되어 있으면 설정 파일 자동 생성
    if (run('which opencode')) {
      const configDir = join(homedir(), '.config', 'opencode')
      const configPath = join(configDir, 'opencode.json')
      try {
        run(`mkdir -p "${configDir}"`)
        writeFileSync(configPath, JSON.stringify({ plugin: ['@gpters/opencode@latest'] }, null, 2) + '\n')
        info(`  ✅ Created ${configPath} with @gpters/opencode@latest`)
        info('  ℹ️  Restart OpenCode to activate')
      } catch (err) {
        info(`  ⚠️  Auto-setup failed: ${err}`)
        info('     Add "@gpters/opencode@latest" to opencode.json plugin array manually')
      }
    } else {
      info('  ⏭️  opencode not installed — skipping')
    }
    return
  }

  // OpenCode + bun 캐시 전체 초기화
  const cacheBase = join(homedir(), '.cache', 'opencode')

  // 1. ~/.cache/opencode/ 의 lock, node_modules, package.json 모두 삭제
  //    OpenCode가 재시작 시 opencode.json 기반으로 재생성한다
  for (const target of ['bun.lock', 'package-lock.json']) {
    const p = join(cacheBase, target)
    if (existsSync(p)) run(`rm -f "${p}"`)
  }
  for (const dir of [
    join(cacheBase, 'node_modules', '@gpters'),
    join(cacheBase, 'node_modules', '@gpters-internal'),
  ]) {
    if (existsSync(dir)) run(`rm -rf "${dir}"`)
  }
  // package.json에서 @gpters/opencode 버전을 정확한 최신 버전으로 고정
  const cachePkg = join(cacheBase, 'package.json')
  if (existsSync(cachePkg) && latest) {
    try {
      const pkg = JSON.parse(readFileSync(cachePkg, 'utf-8'))
      const deps = pkg.dependencies ?? {}
      for (const key of Object.keys(deps)) {
        if (/gpters-internal/.test(key)) delete deps[key]
      }
      deps['@gpters/opencode'] = latest
      pkg.dependencies = deps
      writeFileSync(cachePkg, JSON.stringify(pkg, null, 2) + '\n')
    } catch { /* ignore */ }
  }

  // 2. bun 글로벌 캐시에서 @gpters 패키지 삭제
  const bunCache = join(homedir(), '.bun', 'install', 'cache', '@gpters')
  if (existsSync(bunCache)) {
    run(`rm -rf "${bunCache}"`)
    info(`  🗑️  Bun cache cleared`)
  }

  info(`  🗑️  OpenCode cache cleared`)
  info('  ℹ️  Restart OpenCode to apply update')
}

/** Codex 플러그인 마이그레이션 + 업데이트 */
function upgradeCodex(): void {
  info('\n📦 Codex Plugin')

  if (!run('which codex')) {
    info('  ⏭️  codex CLI not found — skipping')
    return
  }

  // 현재 설치 버전 확인
  const versionFiles = [
    join(homedir(), '.agents', 'skills', 'gpters', '.version'),
    join(process.cwd(), '.agents', 'skills', 'gpters', '.version'),
  ]
  const currentVer = versionFiles
    .map((f) => { try { return readFileSync(f, 'utf-8').trim() } catch { return null } })
    .find(Boolean)

  const latest = npmLatest('@gpters/codex-plugin')

  info(`  Current: ${currentVer ?? 'not installed'}`)
  info(`  Latest:  ${latest ?? 'unknown'}`)

  // setup --force 실행
  info('  Installing...')
  try {
    execSync('npx @gpters/codex-plugin@latest setup --user --force', {
      stdio: 'inherit',
    })
  } catch {
    info('  ⚠️  Setup failed. Run manually: npx @gpters/codex-plugin@latest setup --force')
  }
}

/**
 * upgrade 명령어 실행
 *
 * 모든 GPTers 플러그인의 버전 확인, 마이그레이션, 업데이트를 수행한다.
 */
export function runUpgrade(): void {
  info('=== GPTers Plugin Upgrade ===')

  // 설정 파일이 없으면 기본값(searchMethod: cli)으로 생성
  if (ensureConfig()) {
    info('\n⚙️  Config created: ~/.config/aitk/config.json (searchMethod: cli)')
  }

  upgradeClaude()
  upgradeOpencode()
  upgradeCodex()

  info('\n✅ Done!')
}
