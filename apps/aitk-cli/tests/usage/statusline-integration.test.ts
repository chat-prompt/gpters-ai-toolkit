/** 실제 CLI를 가짜 홈에서 실행해 stdin 전달·설정 복구·캐시 최소화를 검증한다. 서버로 보내지 않는다. */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
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

describe('setup --auto — 플러그인 훅이 부르는 무인 연결 (DEV-4570)', () => {
  /** 테스트마다 새 홈을 만든다. 공유 홈(root)의 설치 상태와 섞이지 않게. */
  function freshHome(settings?: unknown): string {
    const home = mkdtempSync(join(root, 'home-'))
    mkdirSync(join(home, '.claude'), { recursive: true })
    if (settings !== undefined) writeFileSync(join(home, '.claude/settings.json'), typeof settings === 'string' ? settings : JSON.stringify(settings))
    return home
  }
  /** 실제 빌드를 그 홈에서 실행한다. 실패해도 예외 대신 결과를 돌려준다. */
  function run(home: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}, input?: string) {
    return spawnSync(process.execPath, ['--import', preload, entry, 'usage', ...args],
      { env: { ...env, AITK_TEST_HOME: home, ...extraEnv }, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  }
  const settingsOf = (home: string) => readFileSync(join(home, '.claude/settings.json'), 'utf8')
  const userRenderer = () => {
    const renderer = join(root, 'renderer.mjs')
    return { type: 'command', command: `${JSON.stringify(process.execPath)} ${JSON.stringify(renderer)}`, padding: 1 }
  }
  const plainInput = JSON.stringify({ model: { display_name: 'Claude Test' } })
  /** settings.json에 저장된 명령을 Claude Code처럼 /bin/sh로 실행한다. 래퍼의 홈은 테스트 홈으로 고정한다. */
  function runStored(home: string, command: string, input: string) {
    return spawnSync('/bin/sh', ['-c', command], {
      env: { ...env, AITK_TEST_HOME: home, NODE_OPTIONS: `--import=${preload}` }, input, encoding: 'utf8', timeout: 15_000,
    })
  }

  it('기존 표시줄은 감싸서 연결하고 출력은 그대로다. 두 번째 실행은 바꾸지 않는다', () => {
    const home = freshHome({ language: 'ko', statusLine: userRenderer() })
    const first = run(home, ['setup', '--auto'])
    expect(first.status).toBe(0)
    expect(first.stderr).toContain('connected: 기존 상태 표시줄')
    expect(run(home, ['statusline'], {}, plainInput).stdout).toBe('original:' + plainInput)
    const second = run(home, ['setup', '--auto'])
    expect(second.stderr).toContain('unchanged')
    expect(JSON.parse(settingsOf(home)).language).toBe('ko')
  })

  it('표시줄이 없으면 묻지 않고 화면 표시 없이 연결한다', () => {
    const home = freshHome({ language: 'ko' })
    const result = run(home, ['setup', '--auto'])
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('connected: 화면 표시 없이')
    expect(JSON.parse(run(home, ['status']).stdout).statusline).toEqual({ kind: 'aitk', previous: null, display: 'none' })
    expect(run(home, ['statusline'], {}, plainInput).stdout).toBe('')
  })

  it('settings.json이 아예 없어도 ~/.claude가 있으면 화면 표시 없이 연결한다', () => {
    const home = freshHome()
    expect(run(home, ['setup', '--auto']).stderr).toContain('connected: 화면 표시 없이')
    expect(JSON.parse(settingsOf(home)).statusLine.command).toContain('usage statusline')
  })

  it('uninstall 뒤에는 자동 연결이 다시 켜지 않고, 직접 setup하면 다시 켜진다', () => {
    const original = { language: 'ko', statusLine: userRenderer() }
    const home = freshHome(original)
    run(home, ['setup', '--auto'])
    expect(run(home, ['uninstall']).stderr).toContain('will not reconnect')
    expect(JSON.parse(settingsOf(home))).toEqual(original)
    expect(run(home, ['setup', '--auto']).stderr).toContain('skipped: declined')
    expect(JSON.parse(settingsOf(home))).toEqual(original)
    run(home, ['setup'])
    run(home, ['uninstall'])
    run(home, ['setup'])
    // 직접 setup이 거부 표식을 지웠으니 이후 자동 실행은 정상 경로(이미 연결됨)를 탄다
    expect(run(home, ['setup', '--auto']).stderr).toContain('unchanged')
  })

  it('건너뛰는 경우는 설정 파일을 한 바이트도 바꾸지 않는다', () => {
    const cases: Array<{ settings: unknown; env?: NodeJS.ProcessEnv; reason: string; agent?: boolean }> = [
      { settings: { statusLine: 'not-a-command' }, reason: 'unsupported' },
      { settings: { statusLine: { type: 'static', text: 'hi' } }, reason: 'unsupported' },
      { settings: { language: 'ko' }, env: { AITK_USAGE_SETUP: '0' }, reason: 'disabled' },
      { settings: { language: 'ko' }, env: { AITK_USAGE_REPORT: '0' }, reason: 'report-disabled' },
      { settings: { language: 'ko' }, agent: true, reason: 'agent' },
    ]
    for (const c of cases) {
      const home = freshHome(c.settings)
      if (c.agent) {
        mkdirSync(join(home, '.config/aitk'), { recursive: true })
        writeFileSync(join(home, '.config/aitk/agent.json'), JSON.stringify({ version: 1, agentId: 'test-agent', serverUrl: 'https://example.com' }))
      }
      const before = settingsOf(home)
      const result = run(home, ['setup', '--auto'], c.env)
      expect(result.status, c.reason).toBe(0)
      expect(result.stderr, c.reason).toContain(`skipped: ${c.reason}`)
      expect(settingsOf(home), c.reason).toBe(before)
    }
  })

  it('~/.claude가 없으면 만들지 않는다 (Claude Code를 안 쓰는 사람)', () => {
    const home = mkdtempSync(join(root, 'home-'))
    const result = run(home, ['setup', '--auto'])
    expect(result.stderr).toContain('skipped: no-claude')
    expect(existsSync(join(home, '.claude'))).toBe(false)
  })

  it('깨진 settings.json은 덮어쓰지 않고 실패를 기록하되 exit 0이다', () => {
    const home = freshHome('{ "language": "ko", ')
    const result = run(home, ['setup', '--auto'])
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('failed:')
    expect(settingsOf(home)).toBe('{ "language": "ko", ')
  })

  it('aitk 설치 경로가 바뀌면 원래 표시줄을 지킨 채 명령 경로만 새 설치본으로 맞춘다', () => {
    const original = { language: 'ko', statusLine: userRenderer() }
    const home = freshHome(original)
    run(home, ['setup', '--auto'])
    // node 버전 전환·재설치로 aitk가 다른 경로에 깔린 상황
    const moved = join(root, `moved-${Date.now()}.mjs`)
    copyFileSync(entry, moved)
    const result = spawnSync(process.execPath, ['--import', preload, moved, 'usage', 'setup', '--auto'],
      { env: { ...env, AITK_TEST_HOME: home }, encoding: 'utf8' })
    expect(result.stderr).toContain('refreshed')
    const command = JSON.parse(settingsOf(home)).statusLine.command as string
    expect(command).toContain(moved)
    // 저장된 명령 자체를 Claude Code처럼 셸로 실행한다 (따옴표·경로가 실제로 동작하는지)
    expect(runStored(home, command, plainInput).stdout).toBe('original:' + plainInput)
    // node 버전 정리·aitk 삭제로 경로가 사라져도 원래 표시줄은 그대로 나온다
    rmSync(moved)
    const fallback = runStored(home, command, plainInput)
    expect(fallback.status).toBe(0)
    expect(fallback.stdout).toBe('original:' + plainInput)
    run(home, ['uninstall'])
    expect(JSON.parse(settingsOf(home))).toEqual(original)
  })

  it('표시 없이 연결된 사람은 경로가 사라져도 아무것도 그리지 않고 exit 0이다', () => {
    const home = freshHome({ language: 'ko' })
    const moved = join(root, `moved-none-${Date.now()}.mjs`)
    copyFileSync(entry, moved)
    spawnSync(process.execPath, ['--import', preload, moved, 'usage', 'setup', '--auto'], { env: { ...env, AITK_TEST_HOME: home } })
    const command = JSON.parse(settingsOf(home)).statusLine.command as string
    expect(runStored(home, command, plainInput).stdout).toBe('')
    rmSync(moved)
    const gone = runStored(home, command, plainInput)
    expect(gone.status).toBe(0)
    expect(gone.stdout).toBe('')
  })

  it('settings.json이 심링크면(dotfiles 공유) 자동 연결하지 않는다', () => {
    const home = freshHome()
    const shared = join(root, `dotfiles-${Date.now()}.json`)
    writeFileSync(shared, JSON.stringify({ language: 'ko', statusLine: userRenderer() }))
    symlinkSync(shared, join(home, '.claude/settings.json'))
    const before = readFileSync(shared, 'utf8')
    expect(run(home, ['setup', '--auto']).stderr).toContain('skipped: symlink')
    expect(readFileSync(shared, 'utf8')).toBe(before)
    expect(lstatSync(join(home, '.claude/settings.json')).isSymbolicLink()).toBe(true)
  })

  it('대상이 없는 심링크는 직접 setup해도 일반 파일로 덮어쓰지 않는다', () => {
    const home = freshHome()
    const link = join(home, '.claude/settings.json')
    symlinkSync(join(root, 'missing-dotfiles/settings.json'), link)
    const result = run(home, ['setup', '--display', 'none'])
    expect(result.status).not.toBe(0)
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(existsSync(join(home, '.claude/aitk-usage/statusline.json'))).toBe(false)
  })

  it('연결 뒤 사람이 settings.json에서 직접 뺐으면 다시 켜지 않는다', () => {
    const home = freshHome({ language: 'ko', statusLine: userRenderer() })
    run(home, ['setup', '--auto'])
    // 사용자가 uninstall 대신 손으로 원래 명령으로 되돌림
    writeFileSync(join(home, '.claude/settings.json'), JSON.stringify({ language: 'ko', statusLine: userRenderer() }))
    const before = settingsOf(home)
    expect(run(home, ['setup', '--auto']).stderr).toContain('skipped: drifted')
    expect(settingsOf(home)).toBe(before)
    expect(run(home, ['setup', '--auto']).stderr).toContain('skipped: declined')
  })

  it('CLAUDE_CONFIG_DIR이 다른 곳이면 ~/.claude를 건드리지 않고, 같은 곳이면 연결한다', () => {
    const home = freshHome({ language: 'ko' })
    const before = settingsOf(home)
    expect(run(home, ['setup', '--auto'], { CLAUDE_CONFIG_DIR: join(root, 'bot-config') }).stderr).toContain('skipped: config-dir')
    expect(settingsOf(home)).toBe(before)
    expect(run(home, ['setup', '--auto'], { CLAUDE_CONFIG_DIR: join(home, '.claude') }).stderr).toContain('connected')
  })

  it('다른 setup이 도는 중이면 건너뛰고, 1분 넘은 잠금은 회수한다', () => {
    const home = freshHome({ language: 'ko' })
    const lock = join(home, '.claude/aitk-usage/setup.lock')
    mkdirSync(lock, { recursive: true })
    expect(run(home, ['setup', '--auto']).stderr).toContain('skipped: busy')
    const old = new Date(Date.now() - 120_000)
    utimesSync(lock, old, old)
    expect(run(home, ['setup', '--auto']).stderr).toContain('connected')
    expect(existsSync(lock)).toBe(false)
  })
})

describe('래퍼 실패 내성 — 자동 연결로 모두에게 깔리므로 원래 표시줄을 절대 깨지 않는다 (DEV-4570)', () => {
  function wrapped(command: string): string {
    const home = mkdtempSync(join(root, 'wrap-'))
    mkdirSync(join(home, '.claude'), { recursive: true })
    writeFileSync(join(home, '.claude/settings.json'), JSON.stringify({ statusLine: { type: 'command', command } }))
    spawnSync(process.execPath, ['--import', preload, entry, 'usage', 'setup', '--auto'], { env: { ...env, AITK_TEST_HOME: home } })
    return home
  }
  function statusline(home: string, input: string) {
    return spawnSync(process.execPath, ['--import', preload, entry, 'usage', 'statusline'],
      { env: { ...env, AITK_TEST_HOME: home }, input, encoding: 'utf8', timeout: 15_000 })
  }
  const quotaInput = JSON.stringify({ rate_limits: { seven_day: { used_percentage: 12, resets_at: Math.floor(Date.now() / 1000) + 86400 } } })

  it('원래 명령이 출력 후 실패해도 그 출력을 그대로 내보내고 래퍼는 exit 0이다', () => {
    const home = wrapped(`printf 'partial'; exit 3`)
    const result = statusline(home, '{}')
    expect(result.stdout).toBe('partial')
    expect(result.status).toBe(0)
  })

  it('원래 명령이 없어져도 래퍼는 멈추거나 실패하지 않는다', () => {
    const home = wrapped('/nonexistent/statusline-renderer')
    const result = statusline(home, '{}')
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
  })

  it('원래 명령이 stdin을 읽지 않고 끝나도 출력이 보존된다', () => {
    const home = wrapped(`printf 'no-stdin'`)
    const result = statusline(home, quotaInput.repeat(2000))
    expect(result.stdout).toBe('no-stdin')
    expect(result.status).toBe(0)
  })

  it('한도 스냅샷을 저장할 수 없어도(권한 없음) 원래 출력은 그대로다', () => {
    const home = wrapped(`printf 'kept'`)
    const usageDir = join(home, '.claude/aitk-usage')
    chmodSync(usageDir, 0o500)
    try {
      const result = statusline(home, quotaInput)
      expect(result.stdout).toBe('kept')
      expect(result.status).toBe(0)
      expect(existsSync(join(usageDir, 'claude.json'))).toBe(false)
    } finally {
      chmodSync(usageDir, 0o700)
    }
  })

  it('빈 입력·깨진 입력에도 원래 표시줄에 그대로 넘긴다', () => {
    const home = wrapped(`cat`)
    expect(statusline(home, '').stdout).toBe('')
    expect(statusline(home, '{oops').stdout).toBe('{oops')
  })
})
