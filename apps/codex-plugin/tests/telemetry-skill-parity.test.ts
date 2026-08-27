import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')

describe('agent telemetry setup skill parity', () => {
  it('Claude Code와 Codex에 같은 안전 설치 지침을 배포한다', () => {
    const claude = readFileSync(join(
      REPO_ROOT,
      'apps/claude-code-plugin/skills/agent-telemetry-setup/SKILL.md'
    ), 'utf8')
    const codex = readFileSync(join(
      REPO_ROOT,
      'apps/codex-plugin/skills/agent-telemetry-setup/SKILL.md'
    ), 'utf8')

    expect(codex).toBe(claude)
  })
})
