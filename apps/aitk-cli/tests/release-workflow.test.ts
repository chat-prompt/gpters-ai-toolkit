import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  new URL('../../../.github/workflows/release-public-packages.yml', import.meta.url),
  'utf8'
)

describe('public npm release workflow', () => {
  it('main의 AITK 또는 Codex 플러그인 버전 변경으로 두 npm 패키지를 확인한다', () => {
    expect(workflow).toMatch(
      /push:\s+branches:\s+- main\s+paths:\s+- apps\/aitk-cli\/package\.json\s+- apps\/codex-plugin\/package\.json/
    )
    expect(workflow).toContain(
      `github.event_name == 'push' || inputs.package == 'all'`
    )
    expect(workflow).toContain(
      `'[{"package":"@gpters/aitk","directory":"apps/aitk-cli"},{"package":"@gpters/codex-plugin","directory":"apps/codex-plugin"}]'`
    )
  })

  it('수동 배포의 기존 선택지를 유지한다', () => {
    expect(workflow).toContain('- aitk')
    expect(workflow).toContain('- codex-plugin')
    expect(workflow).toContain('- all')
  })

  it('검증과 레지스트리 중복 확인 후에만 발행한다', () => {
    expect(workflow).toContain('pnpm --filter "${{ matrix.package }}" test')
    expect(workflow).toContain('pnpm --filter "${{ matrix.package }}" typecheck')
    expect(workflow).toContain('pnpm --filter "${{ matrix.package }}" build')
    expect(workflow).toContain('npm view "$PACKAGE_NAME@$PACKAGE_VERSION" version')
    expect(workflow).toContain('Package name mismatch: expected $EXPECTED_PACKAGE_NAME')
    expect(workflow).toContain("grep -qE 'E404|404 Not Found'")
    expect(workflow).toContain("if: steps.registry.outputs.publish == 'true'")
  })
})
