/**
 * 사용량 보고 스크립트 사본 드리프트 가드
 *
 * 같은 스크립트가 두 플러그인에 각각 들어 있다. 두 플러그인은 배포 경로가 달라
 * (claude-code-plugin은 마켓플레이스 git, codex-plugin은 npm) 공유 파일로 만들 수 없다.
 * 한쪽만 고치면 다른 클라이언트 쓰는 사람에게만 버그가 남으므로 여기서 붙잡는다.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const CODEX_SCRIPT = join(REPO_ROOT, 'apps/codex-plugin/scripts/gpters-usage-report.sh')
const CLAUDE_SCRIPT = join(REPO_ROOT, 'apps/claude-code-plugin/scripts/usage-report.sh')

describe('사용량 보고 스크립트', () => {
  it('두 플러그인의 사본이 동일하다', () => {
    const codex = readFileSync(CODEX_SCRIPT, 'utf-8')
    const claude = readFileSync(CLAUDE_SCRIPT, 'utf-8')

    expect(codex).toBe(claude)
  })

  it('하루 한 번 제한과 옵트아웃을 유지한다', () => {
    const script = readFileSync(CODEX_SCRIPT, 'utf-8')

    // 이 둘이 빠지면 세션마다 수 GB를 훑거나, 끄고 싶은 사람이 끌 수 없다
    expect(script).toContain('AITK_USAGE_REPORT')
    expect(script).toMatch(/date -u \+%Y-%m-%d/)
  })

  it('setsid를 쓰지 않는다', () => {
    // macOS에 없는데 `( setsid … & )`는 실패해도 exit 0을 돌려줘,
    // 자식이 조용히 죽고 훅은 성공한 것처럼 보인다. 실제로 겪은 함정이다.
    const script = readFileSync(CODEX_SCRIPT, 'utf-8')

    expect(script).not.toMatch(/^\s*\(\s*setsid/m)
    expect(script).toContain('nohup')
  })
})

describe('npm 배포본', () => {
  it('package.json files에 scripts가 들어 있다', () => {
    // 빠지면 스크립트가 tarball에 안 실리고, installUsageHook/installAutoUpdate가
    // 조용히 'skipped'를 돌려준다. 실제로 0.3.3까지 auto-update.sh가 이 상태였다.
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'apps/codex-plugin/package.json'), 'utf-8'))

    expect(pkg.files).toContain('scripts')
  })
})

describe('훅 환경 내성', () => {
  const script = readFileSync(CODEX_SCRIPT, 'utf-8')

  it('PATH에만 기대지 않고 aitk를 탐색한다', () => {
    // 훅은 최소 환경에서 돈다. mise/nvm 사용자는 PATH에 aitk가 없다.
    expect(script).toContain('find_aitk')
    expect(script).toMatch(/mise\/installs\/node/)
  })

  it('버전 문자열이 아니라 실제 명령 지원 여부로 고른다', () => {
    // 한 머신에 node 버전별로 aitk가 10개 깔려 있었고 v0.3.22~v0.5.1이 섞여 있었다.
    // 게다가 --version은 소스에 하드코딩돼 있어 믿을 수 없었다.
    expect(script).toContain('usage report')
    expect(script).toContain('--help')
  })

  it('aitk의 bin 디렉터리를 PATH에 얹는다', () => {
    // aitk는 `#!/usr/bin/env node` — node가 없으면 찾아도 못 띄운다
    expect(script).toMatch(/PATH="\$\(dirname "\$AITK"\)/)
  })

  it('스로틀 검사가 aitk 탐색보다 먼저 온다', () => {
    // 탐색은 후보마다 프로세스를 띄운다. 세션마다 그 비용을 치르면 안 된다.
    expect(script.indexOf('usage-report-last')).toBeLessThan(script.indexOf('find_aitk()'))
  })
})
