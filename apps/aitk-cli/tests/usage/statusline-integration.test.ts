/** 실제 CLI를 가짜 홈에서 실행해 stdin 전달·설정 복구·캐시 최소화를 검증한다. 서버로 보내지 않는다. */
import { beforeAll, afterAll, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

let root: string
let entry: string
let preload: string
let env: NodeJS.ProcessEnv
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'aitk-statusline-integration-'))
  entry = join(root, 'repo build.mjs')
  preload = join(root, 'fake-home.mjs')
  // HOME 자체는 바꾸지 않는다. 이 자식 프로세스의 homedir()만 임시 경로로 고정한다.
  writeFileSync(preload, `import os from 'node:os'; import {syncBuiltinESMExports} from 'node:module'; os.homedir=()=>process.env.AITK_TEST_HOME; syncBuiltinESMExports();`)
  env = { ...process.env, AITK_TEST_HOME: root }
  delete env.AITK_USAGE_REPORT
  execFileSync('bun', ['build', 'bin/aitk.ts', '--outfile', entry, '--target', 'node', '--format', 'esm'], { cwd: resolve('.'), stdio: 'pipe' })
  mkdirSync(join(root, '.claude/aitk-usage'), { recursive: true })
  const renderer = join(root, 'renderer.mjs')
  writeFileSync(renderer, `process.stdout.write('original:'); process.stdin.pipe(process.stdout);`)
  writeFileSync(join(root, '.claude/settings.json'), JSON.stringify({ language: 'ko', statusLine: {
    type: 'command', command: `${JSON.stringify(process.execPath)} ${JSON.stringify(renderer)}`, padding: 1,
  } }))
  // 네트워크에 닿지 않게 오늘 보고 성공 상태를 임시 홈에만 둔다.
  writeFileSync(join(root, '.claude/aitk-usage/report.json'), JSON.stringify({ lastSuccessAt: new Date().toISOString(), lastAttemptAt: new Date().toISOString() }))
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** 빌드한 CLI를 실행한다. 기존 사용자 홈과 인증 파일에는 닿지 않는다. */
function cli(args: string[], input?: string) {
  return execFileSync(process.execPath, ['--import', preload, entry, 'usage', ...args], { env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
}

it('setup → 기존 stdout 보존 → 공식 필드만 저장 → uninstall을 실제 프로세스로 확인한다', () => {
  const before = JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'))
  cli(['setup'])
  const input = JSON.stringify({ transcript_path: '/private/conversation', model: { display_name: 'Claude Test' },
    rate_limits: { seven_day: { used_percentage: 31.5, resets_at: Math.floor(Date.now() / 1000) + 86400 } } })
  expect(cli(['statusline'], input)).toBe('original:' + input)
  const stored = JSON.parse(readFileSync(join(root, '.claude/aitk-usage/claude.json'), 'utf8'))
  expect(stored.usedPercent).toBe(31.5)
  expect(JSON.stringify(stored)).not.toContain('conversation')
  expect(Object.keys(stored).sort()).toEqual(['capturedAt', 'resetsAt', 'source', 'usedPercent', 'version'])
  expect(cli(['statusline'], '{broken')).toBe('original:{broken')
  expect(JSON.parse(readFileSync(join(root, '.claude/aitk-usage/claude.json'), 'utf8'))).toEqual(stored)
  cli(['uninstall'])
  expect(JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'))).toEqual(before)
})

it('표시줄이 없으면 비대화형 setup은 --display를 요구하고, 고른 모드대로 그리거나 침묵한다', () => {
  const settings = join(root, '.claude/settings.json')
  const original = readFileSync(settings, 'utf8')
  writeFileSync(settings, JSON.stringify({ language: 'ko' }))
  // info()·error()는 stderr로 쓰므로 안내 문구는 stderr에서 본다.
  const setup = (args: string[]) => spawnSync(process.execPath, ['--import', preload, entry, 'usage', 'setup', ...args], { env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  const refused = setup([])
  expect(refused.status).not.toBe(0)
  expect(refused.stderr).toContain('--display')
  expect(JSON.parse(readFileSync(settings, 'utf8'))).toEqual({ language: 'ko' })
  const input = JSON.stringify({ model: { display_name: 'Claude Test' }, context_window: { used_percentage: 40 },
    rate_limits: { five_hour: { used_percentage: 5 }, seven_day: { used_percentage: 31.5, resets_at: Math.floor(Date.now() / 1000) + 86400 } } })
  expect(setup(['--display', 'none']).stderr).toContain('아무것도 그리지 않고')
  expect(cli(['statusline'], input)).toBe('')
  expect(setup(['--yes']).stderr).toContain('이미 같은 설정')
  expect(setup(['--display', 'default']).stderr).toContain('기본 상태 표시줄')
  expect(cli(['statusline'], input)).toBe('Claude Test · ctx 40% · 5h 5% · 7d 32%')
  expect(JSON.parse(cli(['status'])).statusline).toEqual({ kind: 'aitk', previous: null, display: 'default' })
  cli(['uninstall'])
  expect(JSON.parse(readFileSync(settings, 'utf8'))).toEqual({ language: 'ko' })
  writeFileSync(settings, original)
})
