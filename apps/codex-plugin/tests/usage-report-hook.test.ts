/**
 * SessionStart 훅(사용량 보고 + aitk 자동 업그레이드) 동작 검사
 *
 * 격리된 HOME·캐시에 가짜 npm 전역 경로를 만들고, 가짜 aitk·npm 이 받은 인자를 로그로 남겨
 * 훅이 무엇을 어떤 순서로 부르는지 본다. 백그라운드 작업이라 로그가 찰 때까지 기다린다.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const SCRIPT = join(import.meta.dirname, '..', 'scripts', 'gpters-usage-report.sh')

let dir: string
let globalRoot: string
let binDir: string
let aitkLog: string
let npmLog: string

/** 가짜 aitk — 받은 인자를 기록한다. FAKE_SELF=1 이면 `upgrade --self` 를 아는 새 aitk */
const FAKE_AITK = `#!/bin/bash
echo "$*" >> "$AITK_LOG"
case "$*" in
  "--help") echo "  aitk usage report [--days <N>]" ;;
  "upgrade --help") [ "$FAKE_SELF" = "1" ] && echo "Usage: aitk upgrade [--self]" ;;
esac
exit 0
`

/** 가짜 npm — 전역 경로를 답하고, 받은 인자를 기록한다 */
const fakeNpm = (root: string) => `#!/bin/bash
echo "$*" >> "$NPM_LOG"
[ "$*" = "root -g" ] && echo "${root}"
exit 0
`

/** npm 전역 설치본 한 벌을 만든다 (bin/aitk → lib/node_modules/@gpters/aitk/bin/aitk) */
function installGlobalAitk(options: { linked?: boolean; outside?: boolean } = {}) {
  const pkgDir = join(globalRoot, '@gpters', 'aitk')
  let target: string
  if (options.outside) {
    target = join(dir, 'repo-build', 'bin', 'aitk')
    mkdirSync(pkgDir, { recursive: true })
  } else if (options.linked) {
    const devDir = join(dir, 'dev-checkout')
    mkdirSync(join(devDir, 'bin'), { recursive: true })
    mkdirSync(dirname(pkgDir), { recursive: true })
    symlinkSync(devDir, pkgDir)
    target = join(devDir, 'bin', 'aitk')
  } else {
    target = join(pkgDir, 'bin', 'aitk')
  }
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, FAKE_AITK)
  chmodSync(target, 0o755)
  symlinkSync(target, join(binDir, 'aitk'))
}

/** 훅을 한 번 실행하고, 백그라운드 작업 결과(until)가 나타날 때까지 기다린다 */
async function runHook(env: Record<string, string>, until?: () => boolean) {
  const result = spawnSync('/bin/bash', [SCRIPT], {
    env: {
      HOME: join(dir, 'home'),
      XDG_CACHE_HOME: join(dir, 'cache'),
      PATH: `${binDir}:${dirname(process.execPath)}:/usr/bin:/bin`,
      AITK_LOG: aitkLog,
      NPM_LOG: npmLog,
      ...env,
    },
    encoding: 'utf-8',
  })
  expect(result.status).toBe(0)

  const deadline = Date.now() + (until ? 5000 : 500)
  while (Date.now() < deadline && !(until?.() ?? false)) await new Promise(r => setTimeout(r, 50))
  // 마지막 줄이 기록된 뒤 남은 쓰기가 끝나도록 조금 더 둔다
  await new Promise(r => setTimeout(r, 150))
}

const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf-8') : '')
const aitkCalls = () => read(aitkLog).split('\n').filter(line => line && line !== '--help' && line !== 'upgrade --help')
const cacheFile = (name: string) => read(join(dir, 'cache', 'gpters-aitk', name))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aitk-hook-'))
  globalRoot = join(dir, 'npm-global', 'lib', 'node_modules')
  binDir = join(dir, 'npm-global', 'bin')
  mkdirSync(globalRoot, { recursive: true })
  mkdirSync(binDir, { recursive: true })
  mkdirSync(join(dir, 'home'), { recursive: true })
  aitkLog = join(dir, 'aitk.log')
  npmLog = join(dir, 'npm.log')
  writeFileSync(join(binDir, 'npm'), fakeNpm(globalRoot))
  chmodSync(join(binDir, 'npm'), 0o755)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('SessionStart 훅 — aitk 자동 업그레이드', () => {
  it('새 aitk 면 업그레이드를 먼저 하고 사용량 보고를 잇는다', async () => {
    installGlobalAitk()
    await runHook({ FAKE_SELF: '1' }, () => aitkCalls().includes('usage report --days 7'))

    expect(aitkCalls()).toEqual(['upgrade --self', 'usage report --days 7'])
    const today = new Date().toISOString().slice(0, 10)
    expect(cacheFile('self-update-last').trim()).toBe(today)
    expect(cacheFile('usage-report-last').trim()).toBe(today)
  })

  it('같은 날 두 번째 세션에서는 아무것도 하지 않는다', async () => {
    installGlobalAitk()
    await runHook({ FAKE_SELF: '1' }, () => aitkCalls().includes('usage report --days 7'))
    const first = aitkCalls().length

    await runHook({ FAKE_SELF: '1' })
    expect(aitkCalls()).toHaveLength(first)
  })

  it('AITK_AUTO_UPDATE=0 이면 업그레이드 없이 보고만 한다', async () => {
    installGlobalAitk()
    await runHook({ FAKE_SELF: '1', AITK_AUTO_UPDATE: '0' }, () => aitkCalls().length > 0)

    expect(aitkCalls()).toEqual(['usage report --days 7'])
    expect(cacheFile('self-update-last')).toBe('')
  })

  it('AITK_USAGE_REPORT=0 이어도 업그레이드는 한다', async () => {
    installGlobalAitk()
    await runHook({ FAKE_SELF: '1', AITK_USAGE_REPORT: '0' }, () => aitkCalls().length > 0)

    expect(aitkCalls()).toEqual(['upgrade --self'])
    expect(cacheFile('usage-report-last')).toBe('')
  })

  it('--self 를 모르는 옛 aitk 는 npm 전역 설치본일 때 훅이 직접 올린다', async () => {
    installGlobalAitk()
    await runHook({ FAKE_SELF: '0' }, () => aitkCalls().includes('usage report --days 7'))

    expect(read(npmLog)).toContain('install -g @gpters/aitk@latest --no-fund --no-audit')
    expect(aitkCalls()).toEqual(['usage report --days 7'])
  })

  it('옛 aitk 라도 npm link 개발본이면 건드리지 않는다', async () => {
    installGlobalAitk({ linked: true })
    await runHook({ FAKE_SELF: '0' }, () => aitkCalls().includes('usage report --days 7'))

    expect(read(npmLog)).not.toContain('install')
    expect(cacheFile('self-update.log')).toContain('npm link')
  })

  it('옛 aitk 라도 전역 경로 밖(저장소 빌드 등)이면 건드리지 않는다', async () => {
    installGlobalAitk({ outside: true })
    await runHook({ FAKE_SELF: '0' }, () => aitkCalls().includes('usage report --days 7'))

    expect(read(npmLog)).not.toContain('install')
    expect(cacheFile('self-update.log')).toContain('전역 설치본이 아니라')
  })
})
