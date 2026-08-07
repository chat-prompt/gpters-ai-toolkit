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
