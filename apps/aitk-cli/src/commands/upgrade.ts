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

/** Claude Code 플러그인 업데이트 */
function upgradeClaude(): void {
  info('\n📦 Claude Code Plugin')

  if (!run('which claude')) {
    info('  ⏭️  claude CLI not found — skipping')
    return
  }

  // installed_plugins.json에서 현재 버전 확인
  const installedPath = join(homedir(), '.claude', 'plugins', 'installed_plugins.json')
  let currentVer: string | null = null
  try {
    const installed = JSON.parse(readFileSync(installedPath, 'utf-8'))
    const entry = installed.plugins?.['gpters-ai-toolkit@gpters-marketplace']?.[0]
    currentVer = entry?.version ?? null
  } catch {
    // 파일 없음
  }

  if (!currentVer) {
    info('  ⚠️  Not installed. Run:')
    info('     claude plugin marketplace add chat-prompt/gpters-ai-toolkit')
    info('     claude plugin install gpters-ai-toolkit@gpters-marketplace')
    return
  }

  info(`  Current: ${currentVer}`)
  const result = run('claude plugin update gpters-ai-toolkit@gpters-marketplace')
  if (result !== null) {
    info('  ✅ Updated (applies on next session)')
  } else {
    info('  ⚠️  Update failed — try: claude plugin update gpters-ai-toolkit@gpters-marketplace')
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
    info('  ⏭️  opencode.json not found — skipping')
    return
  }

  // OpenCode 플러그인 캐시 전체 초기화 (package.json, bun.lock, node_modules)
  const cacheBase = join(homedir(), '.cache', 'opencode')
  const cachePkg = join(cacheBase, 'package.json')
  const cacheLock = join(cacheBase, 'bun.lock')
  const cacheNodeModules = join(cacheBase, 'node_modules', '@gpters')
  const cacheInternalModules = join(cacheBase, 'node_modules', '@gpters-internal')

  // package.json에서 @gpters/opencode 버전을 latest로 갱신
  if (existsSync(cachePkg)) {
    try {
      const pkg = JSON.parse(readFileSync(cachePkg, 'utf-8'))
      const deps = pkg.dependencies ?? {}
      // @gpters-internal 제거 + @gpters/opencode를 latest로
      for (const key of Object.keys(deps)) {
        if (/gpters-internal/.test(key)) delete deps[key]
      }
      if (latest) {
        deps['@gpters/opencode'] = latest
      } else {
        delete deps['@gpters/opencode']
      }
      pkg.dependencies = deps
      writeFileSync(cachePkg, JSON.stringify(pkg, null, 2) + '\n')
      info(`  📝 ${cachePkg} → @gpters/opencode@${latest}`)
    } catch {
      info(`  ⚠️  Failed to update ${cachePkg}`)
    }
  }

  // bun.lock 삭제 (다음 실행 시 재생성)
  if (existsSync(cacheLock)) {
    run(`rm -f "${cacheLock}"`)
    info(`  🗑️  Removed bun.lock`)
  }

  // node_modules 캐시 삭제
  for (const dir of [cacheNodeModules, cacheInternalModules]) {
    if (existsSync(dir)) {
      run(`rm -rf "${dir}"`)
    }
  }
  info(`  🗑️  Cache cleared`)
  info('  ℹ️  Restart OpenCode to apply update')
}

/** Codex 플러그인 마이그레이션 + 업데이트 */
function upgradeCodex(): void {
  info('\n📦 Codex Plugin')

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

  upgradeClaude()
  upgradeOpencode()
  upgradeCodex()

  info('\n✅ Done!')
}
