import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
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
})
