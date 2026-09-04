import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = fileURLToPath(new URL('../../../../infra/agent-telemetry/install-from-repo.sh', import.meta.url))
let root = ''
let repo = ''
let prefix = ''

function writeFakeCli(label = 'first'): void {
  const cli = join(repo, 'apps/aitk-cli/dist/bin/aitk.js')
  mkdirSync(join(repo, 'apps/aitk-cli/dist/bin'), { recursive: true })
  writeFileSync(cli, `#!/usr/bin/env node\nif (process.argv[2] === '--version') console.log('aitk v9.8.7')\n// ${label}\n`)
  chmodSync(cli, 0o755)
}

function install(...args: string[]) {
  return spawnSync('sh', [SCRIPT, '--repo-root', repo, '--prefix', prefix, '--skip-build', ...args], {
    encoding: 'utf8',
  })
}

function writeExecutable(path: string, contents: string): void {
  writeFileSync(path, contents)
  chmodSync(path, 0o755)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aitk-repo-installer-'))
  repo = join(root, 'repo')
  prefix = join(root, 'prefix')
  mkdirSync(join(repo, 'apps/aitk-cli'), { recursive: true })
  writeFileSync(join(repo, 'apps/aitk-cli/package.json'), JSON.stringify({ version: '9.8.7' }))
  writeFakeCli()
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('repo-built AITK installer', () => {
  it('버전 고정 경로와 관리형 실행 래퍼를 만들고 repo 없이도 실행한다', () => {
    const result = install()
    expect(result.status, result.stderr).toBe(0)

    const target = join(prefix, 'share/gpters-aitk/9.8.7/aitk.js')
    const wrapper = join(prefix, 'bin/aitk')
    expect(statSync(target).mode & 0o777).toBe(0o755)
    expect(readFileSync(wrapper, 'utf8')).toContain('managed-by: gpters-ai-toolkit install-from-repo')
    expect(JSON.parse(readFileSync(join(prefix, 'share/gpters-aitk/9.8.7/manifest.json'), 'utf8')))
      .toMatchObject({ version: '9.8.7', sourceCommit: 'unknown', sourceDirty: false })

    rmSync(repo, { recursive: true, force: true })
    const version = spawnSync(wrapper, ['--version'], { encoding: 'utf8' })
    expect(version.status, version.stderr).toBe(0)
    expect(version.stdout.trim()).toBe('aitk v9.8.7')
  })

  it('래퍼는 node를 절대 경로로 박는다 — PATH에서 찾으면 실행 셸이 예약 수집의 node를 정해버린다', () => {
    expect(install().status).toBe(0)

    const wrapper = readFileSync(join(prefix, 'bin/aitk'), 'utf8')
    // 설치 시점에 고른 node가 절대 경로로 박혀야 한다. `exec node`면 실행 시점 PATH가 결정한다.
    expect(wrapper).not.toMatch(/^exec node\s/m)
    expect(wrapper).toMatch(/^exec "\/.*" "\$prefix_dir\/share\/gpters-aitk\//m)
  })

  it('--node로 지정한 경로를 symlink 그대로 박는다 — Homebrew opt 심링크가 Cellar 실경로보다 오래간다', () => {
    const nodeSymlink = join(root, 'node-symlink')
    symlinkSync(process.execPath, nodeSymlink)

    expect(install('--node', nodeSymlink).status).toBe(0)

    // realpath로 풀어 저장하면 버전 고정 경로가 박혀 패치 업그레이드에 깨진다
    expect(readFileSync(join(prefix, 'bin/aitk'), 'utf8')).toContain(`exec "${nodeSymlink}"`)
    const version = spawnSync(join(prefix, 'bin/aitk'), ['--version'], { encoding: 'utf8' })
    expect(version.stdout.trim()).toBe('aitk v9.8.7')
  })

  it('--node가 상대 경로거나 실행 파일이 아니면 거부한다', () => {
    expect(install('--node', 'node').status).not.toBe(0)
    expect(install('--node', join(root, 'missing-node')).status).not.toBe(0)
  })

  it('관리 대상이 아닌 기존 aitk 명령은 명시적 force 없이 덮어쓰지 않는다', () => {
    mkdirSync(join(prefix, 'bin'), { recursive: true })
    const wrapper = join(prefix, 'bin/aitk')
    writeFileSync(wrapper, '#!/bin/sh\necho existing\n')

    const blocked = install()
    expect(blocked.status).not.toBe(0)
    expect(blocked.stderr).toContain('is not managed by this installer')
    expect(readFileSync(wrapper, 'utf8')).toContain('echo existing')

    const forced = install('--force')
    expect(forced.status, forced.stderr).toBe(0)
    expect(readFileSync(wrapper, 'utf8')).toContain('managed-by: gpters-ai-toolkit install-from-repo')
  })

  it('같은 버전의 다른 바이너리는 버전 오염으로 보고 차단한다', () => {
    expect(install().status).toBe(0)
    writeFakeCli('changed')

    const blocked = install()
    expect(blocked.status).not.toBe(0)
    expect(blocked.stderr).toContain('already installed with a different binary')
    expect(install('--force').status).toBe(0)
  })

  it('호출 위치와 무관하게 저장소 루트에서 고정 pnpm을 선택한다', () => {
    const fakeBin = join(root, 'bin')
    const corepackLog = join(root, 'corepack.log')
    mkdirSync(fakeBin)
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ packageManager: 'pnpm@10.12.2' }))
    writeExecutable(join(fakeBin, 'git'), `#!/bin/sh\ncase "$*" in\n  *"rev-parse HEAD"*) echo test-commit ;;\n  *) exit 0 ;;\nesac\n`)
    writeExecutable(join(fakeBin, 'bun'), '#!/bin/sh\nexit 0\n')
    writeExecutable(join(fakeBin, 'corepack'), `#!/bin/sh\nprintf '%s|%s\\n' "$PWD" "$*" >> "$COREPACK_LOG"\nif [ "$1" = pnpm ] && [ "$2" = --version ]; then echo 10.12.2; fi\nexit 0\n`)

    const caller = join(root, 'outside-repo')
    mkdirSync(caller)
    const result = spawnSync('sh', [SCRIPT, '--repo-root', repo, '--prefix', prefix], {
      cwd: caller,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        COREPACK_LOG: corepackLog,
      },
    })

    expect(result.status, result.stderr).toBe(0)
    const calls = readFileSync(corepackLog, 'utf8').trim().split('\n')
    expect(calls.length).toBeGreaterThanOrEqual(2)
    expect(calls.every((call) => call.startsWith(`${repo}|pnpm `))).toBe(true)
    expect(calls[0]).toBe(`${repo}|pnpm --version`)
  })
})
