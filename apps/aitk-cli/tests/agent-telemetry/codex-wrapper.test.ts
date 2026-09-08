import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it } from 'vitest'

const SCRIPT = fileURLToPath(new URL('../../../../infra/agent-telemetry/codex-agent-bin/codex', import.meta.url))
let root: string
let fake: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aitk-codex-wrapper-'))
  fake = join(root, 'real-codex')
  writeFileSync(fake, '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o700 })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))
function run(args: string[], agent = 'test-agent') {
  return spawnSync('sh', [SCRIPT, ...args], { encoding: 'utf8', env: {
    ...process.env, AITK_CODEX_AGENT_ID: agent, AITK_CODEX_REAL_BIN: fake,
  } })
}
it('tags exec and preserves arguments including spaces and shell syntax as data', () => {
  const result = run(['exec', '-s', 'read-only', '--', 'literal $(echo private) with spaces'])
  expect(result.status).toBe(0)
  expect(result.stdout.split('\n')).toEqual(['exec', '--thread-source', 'aitk-agent:test-agent',
    '-s', 'read-only', '--', 'literal $(echo private) with spaces', ''])
})
it('does not add exec options to version checks', () => {
  expect(run(['--version']).stdout).toBe('--version\n')
})
it('rejects a conflicting tag and invalid identity before executing Codex', () => {
  expect(run(['exec', '--thread-source=aitk-agent:other']).status).toBe(2)
  expect(run(['exec'], 'person@example.com').status).toBe(2)
})
