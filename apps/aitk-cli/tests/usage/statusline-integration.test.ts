/** 실제 CLI를 가짜 홈에서 실행해 stdin 전달·설정 복구·캐시 최소화를 검증한다. 서버로 보내지 않는다. */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
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
  // 공유 홈 테스트는 HOME을 바꾸지 않고 homedir()만 임시 경로로 고정한다. NODE_OPTIONS로 손자 프로세스까지 전달한다.
  // 새 홈을 쓰는 테스트는 isolated()가 HOME까지 바꾼다.
  writeFileSync(preload, `import os from 'node:os'; import {syncBuiltinESMExports} from 'node:module'; os.homedir=()=>process.env.AITK_TEST_HOME; syncBuiltinESMExports();`)
  env = { ...process.env, AITK_TEST_HOME: root, NODE_OPTIONS: `--import=${preload}` }
  delete env.AITK_USAGE_REPORT
  // 개발자 셸 설정이 자동 연결 판단을 바꾸지 않게 한다
  delete env.AITK_USAGE_SETUP
  delete env.CLAUDE_CONFIG_DIR
  // 개발자 셸의 토큰·서버 주소로 테스트가 서버에 닿지 않게 한다
  delete env.GPTERS_TOKEN
  delete env.AITK_SERVER_URL
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

/**
 * 테스트 홈으로 고정한 env. preload를 NODE_OPTIONS로 넘겨 래퍼가 띄우는 auto-report 같은 손자 프로세스도
 * 실제 홈을 보지 않게 한다.
 */
function isolated(home: string): NodeJS.ProcessEnv {
  // HOME도 같이 바꾼다 — preload가 닿지 않는 손자 프로세스라도 os.homedir()이 HOME을 먼저 본다
  return { ...env, HOME: home, AITK_TEST_HOME: home, NODE_OPTIONS: `--import=${preload}` }
}

/** 오늘 보고 성공 상태를 심어 auto-report가 네트워크로 나가지 않게 한다. */
function quietReports(home: string): void {
  mkdirSync(join(home, '.claude/aitk-usage'), { recursive: true })
  const now = new Date().toISOString()
  writeFileSync(join(home, '.claude/aitk-usage/report.json'), JSON.stringify({ lastSuccessAt: now, lastAttemptAt: now }))
}

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
  // uninstall이 지운 보고 상태를 다시 심어 다음 테스트의 래퍼가 auto-report를 띄우지 않게 한다
  writeFileSync(join(root, '.claude/aitk-usage/report.json'), JSON.stringify({ lastSuccessAt: new Date().toISOString(), lastAttemptAt: new Date().toISOString() }))
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
    // Claude Code가 만드는 대화 기록 폴더 — 이게 있어야 Claude Code 사용자로 본다
    mkdirSync(join(home, '.claude/projects'), { recursive: true })
    quietReports(home)
    if (settings !== undefined) writeFileSync(join(home, '.claude/settings.json'), typeof settings === 'string' ? settings : JSON.stringify(settings))
    return home
  }
  /** 실제 빌드를 그 홈에서 실행한다. 실패해도 예외 대신 결과를 돌려준다. */
  function run(home: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}, input?: string) {
    return spawnSync(process.execPath, [entry, 'usage', ...args],
      { env: { ...isolated(home), ...extraEnv }, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  }
  const settingsOf = (home: string) => readFileSync(join(home, '.claude/settings.json'), 'utf8')
  const userRenderer = () => {
    const renderer = join(root, 'renderer.mjs')
    return { type: 'command', command: `${JSON.stringify(process.execPath)} ${JSON.stringify(renderer)}`, padding: 1 }
  }
  const plainInput = JSON.stringify({ model: { display_name: 'Claude Test' } })
  const quotaInput = JSON.stringify({ rate_limits: { seven_day: { used_percentage: 12, resets_at: Math.floor(Date.now() / 1000) + 86400 } } })
  /** settings.json에 저장된 명령을 Claude Code처럼 /bin/sh로 실행한다. 래퍼의 홈은 테스트 홈으로 고정한다. */
  function runStored(home: string, command: string, input: string) {
    return spawnSync('/bin/sh', ['-c', command], { env: isolated(home), input, encoding: 'utf8', timeout: 15_000 })
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

  it('aitk 보고가 만든 ~/.claude/aitk-usage만 있으면 Claude Code 사용자로 보지 않는다 (Codex만 쓰는 사람)', () => {
    const home = mkdtempSync(join(root, 'home-'))
    mkdirSync(join(home, '.claude/aitk-usage'), { recursive: true })
    writeFileSync(join(home, '.claude/aitk-usage/aggregate.json'), '{}')
    expect(run(home, ['setup', '--auto']).stderr).toContain('skipped: no-claude')
    expect(existsSync(join(home, '.claude/settings.json'))).toBe(false)
    // Claude Code가 사용자 설정 파일을 만들면 그때부터 연결한다
    writeFileSync(join(home, '.claude.json'), '{}')
    expect(run(home, ['setup', '--auto']).stderr).toContain('connected')
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
    const result = spawnSync(process.execPath, [moved, 'usage', 'setup', '--auto'], { env: isolated(home), encoding: 'utf8' })
    expect(result.stderr).toContain('refreshed')
    const command = JSON.parse(settingsOf(home)).statusLine.command as string
    expect(command).toContain(moved)
    // 저장된 명령 자체를 Claude Code처럼 셸로 실행한다. 대체 경로도 같은 출력을 내므로
    // 한도 스냅샷이 생기는지로 래퍼(수집)가 실제로 돌았음을 확인한다.
    const snapshot = join(home, '.claude/aitk-usage/claude.json')
    expect(runStored(home, command, quotaInput).stdout).toBe('original:' + quotaInput)
    expect(JSON.parse(readFileSync(snapshot, 'utf8')).usedPercent).toBe(12)
    // node 버전 정리·aitk 삭제로 경로가 사라져도 원래 표시줄은 그대로 나오고, 수집은 하지 않는다
    rmSync(moved)
    rmSync(snapshot)
    const fallback = runStored(home, command, quotaInput)
    expect(fallback.status).toBe(0)
    expect(fallback.stdout).toBe('original:' + quotaInput)
    expect(existsSync(snapshot)).toBe(false)
    run(home, ['uninstall'])
    expect(JSON.parse(settingsOf(home))).toEqual(original)
  })

  it('표시 없이 연결된 사람은 경로가 사라져도 아무것도 그리지 않고 exit 0이다', () => {
    const home = freshHome({ language: 'ko' })
    const moved = join(root, `moved-none-${Date.now()}.mjs`)
    copyFileSync(entry, moved)
    spawnSync(process.execPath, [moved, 'usage', 'setup', '--auto'], { env: isolated(home) })
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

  it('연결 기록이 사라지면 래퍼는 원래 명령만 그리고 수집하지 않는다 (기본 한 줄로 바뀌지 않음)', () => {
    const home = freshHome({ statusLine: userRenderer() })
    run(home, ['setup', '--auto'])
    const command = JSON.parse(settingsOf(home)).statusLine.command as string
    rmSync(join(home, '.claude/aitk-usage/statusline.json'))
    const result = runStored(home, command, quotaInput)
    expect(result.stdout).toBe('original:' + quotaInput)
    expect(existsSync(join(home, '.claude/aitk-usage/claude.json'))).toBe(false)

    const none = freshHome({ language: 'ko' })
    run(none, ['setup', '--auto'])
    const noneCommand = JSON.parse(settingsOf(none)).statusLine.command as string
    rmSync(join(none, '.claude/aitk-usage/statusline.json'))
    expect(runStored(none, noneCommand, quotaInput).stdout).toBe('')
  })

  it('옛 aitk(0.7.22 이하)로 uninstall해 해제 표식이 없어도 다시 켜지 않는다', () => {
    const original = { language: 'ko', statusLine: userRenderer() }
    const home = freshHome(original)
    run(home, ['setup', '--auto'])
    // 옛 uninstall: 설정을 되돌리고 네 파일만 지운다 (해제 표식·연결 기록은 모름)
    writeFileSync(join(home, '.claude/settings.json'), JSON.stringify(original))
    for (const f of ['statusline.json', 'claude.json', 'report.json', 'report.lock']) rmSync(join(home, '.claude/aitk-usage', f), { force: true })
    expect(run(home, ['setup', '--auto']).stderr).toContain('skipped: drifted')
    expect(JSON.parse(settingsOf(home))).toEqual(original)
  })

  it('~/.claude 폴더 자체가 심링크여도 자동 연결하지 않는다', () => {
    const home = mkdtempSync(join(root, 'home-'))
    const synced = mkdtempSync(join(root, 'icloud-claude-'))
    writeFileSync(join(synced, 'settings.json'), JSON.stringify({ language: 'ko' }))
    symlinkSync(synced, join(home, '.claude'))
    expect(run(home, ['setup', '--auto']).stderr).toContain('skipped: symlink')
    expect(JSON.parse(readFileSync(join(synced, 'settings.json'), 'utf8'))).toEqual({ language: 'ko' })
  })

  it('연결된 사람의 settings.json이 편집 중 깨져 있으면 해제로 오판하지 않는다', () => {
    const home = freshHome({ statusLine: userRenderer() })
    expect(run(home, ['setup', '--auto']).stderr).toContain('connected')
    writeFileSync(join(home, '.claude/settings.json'), '{ "statusLine": ')
    expect(run(home, ['setup', '--auto']).stderr).toContain('failed:')
    expect(existsSync(join(home, '.claude/aitk-usage/auto-setup-declined.json'))).toBe(false)
  })

  it('잠금 폴더를 만들 권한이 없으면 멈추지 않고 실패로 끝난다', () => {
    const home = freshHome({ language: 'ko' })
    const usage = join(home, '.claude/aitk-usage')
    mkdirSync(usage, { recursive: true })
    chmodSync(usage, 0o500)
    try {
      const result = spawnSync(process.execPath, [entry, 'usage', 'setup', '--auto'], { env: isolated(home), encoding: 'utf8', timeout: 10_000 })
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(0)
      expect(result.stderr).toContain('failed:')
    } finally {
      chmodSync(usage, 0o700)
    }
  })

  it('다른 setup이 도는 중이면 건너뛰고, 1분 넘은 잠금은 회수한다', () => {
    const home = freshHome({ language: 'ko' })
    const lock = join(home, '.claude/aitk-usage/setup.lock')
    mkdirSync(lock, { recursive: true })
    expect(run(home, ['setup', '--auto']).stderr).toContain('skipped: busy')
    const old = new Date(Date.now() - 120_000)
    // 주인이 살아 있으면(이 테스트 프로세스) 오래돼도 회수하지 않는다
    writeFileSync(join(lock, 'owner'), `${process.pid}-live`)
    utimesSync(lock, old, old)
    expect(run(home, ['setup', '--auto']).stderr).toContain('skipped: busy')
    // 주인 pid가 살아 있어도 10분 넘은 잠금은 버려진 것으로 본다 (pid 재사용)
    const abandoned = new Date(Date.now() - 11 * 60_000)
    utimesSync(lock, abandoned, abandoned)
    expect(run(home, ['setup', '--auto']).stderr).toContain('connected')
    expect(existsSync(lock)).toBe(false)
    run(home, ['uninstall'])
    run(home, ['setup', '--display', 'none'])
    mkdirSync(lock)
    // 주인이 죽었으면 1분 뒤 회수한다
    writeFileSync(join(lock, 'owner'), '999999-dead')
    utimesSync(lock, old, old)
    expect(run(home, ['setup', '--auto']).stderr).toContain('unchanged')
    expect(existsSync(lock)).toBe(false)
  })

  it('uninstall 뒤 수집 폴더를 통째로 지워도 해제 의사가 남는다', () => {
    const original = { language: 'ko', statusLine: userRenderer() }
    const home = freshHome(original)
    run(home, ['setup', '--auto'])
    run(home, ['uninstall'])
    rmSync(join(home, '.claude/aitk-usage'), { recursive: true, force: true })
    expect(run(home, ['setup', '--auto']).stderr).toContain('skipped: declined')
    expect(JSON.parse(settingsOf(home))).toEqual(original)
    // 직접 setup하면 두 표식이 모두 지워진다
    run(home, ['setup'])
    expect(existsSync(join(home, '.config/aitk/usage-auto-setup-declined.json'))).toBe(false)
  })

  it('settings.json을 손으로 되돌리고 수집 폴더까지 지워도 다시 켜지 않는다', () => {
    const original = { language: 'ko', statusLine: userRenderer() }
    const home = freshHome(original)
    run(home, ['setup', '--auto'])
    writeFileSync(join(home, '.claude/settings.json'), JSON.stringify(original))
    rmSync(join(home, '.claude/aitk-usage'), { recursive: true, force: true })
    expect(run(home, ['setup', '--auto']).stderr).toContain('skipped: drifted')
    expect(JSON.parse(settingsOf(home))).toEqual(original)
  })

  it('~/.config에 쓸 수 없어도 uninstall은 원래 표시줄을 복원한다', () => {
    const original = { language: 'ko', statusLine: userRenderer() }
    const home = freshHome(original)
    expect(run(home, ['setup', '--auto']).stderr).toContain('connected')
    const config = join(home, '.config')
    mkdirSync(config, { recursive: true })
    rmSync(join(config, 'aitk'), { recursive: true, force: true })
    chmodSync(config, 0o500)
    try {
      const result = run(home, ['uninstall'])
      expect(result.status).toBe(0)
      expect(result.stderr).toContain('Previous Claude statusline restored.')
      expect(result.stderr).toContain('한 곳에만')
      expect(JSON.parse(settingsOf(home))).toEqual(original)
      expect(run(home, ['setup', '--auto']).stderr).toContain('skipped: declined')
    } finally {
      chmodSync(config, 0o700)
    }
  })

  it('수집 폴더를 지운 뒤에도(연결 기록 없음) uninstall이 원래 설정으로 되돌린다', () => {
    const original = { language: 'ko', statusLine: userRenderer() }
    const home = freshHome(original)
    run(home, ['setup', '--auto'])
    rmSync(join(home, '.claude/aitk-usage'), { recursive: true, force: true })
    expect(run(home, ['uninstall']).stderr).toContain('Previous Claude statusline restored.')
    expect(JSON.parse(settingsOf(home))).toEqual(original)

    const none = freshHome({ language: 'ko' })
    run(none, ['setup', '--auto'])
    rmSync(join(none, '.claude/aitk-usage'), { recursive: true, force: true })
    run(none, ['uninstall'])
    expect(JSON.parse(settingsOf(none))).toEqual({ language: 'ko' })
  })

  it('연결 기록만 사라진 사람(설정은 그대로)은 해제로 오판하지 않고 기록을 되살려 수집을 이어간다', () => {
    const original = { language: 'ko', statusLine: userRenderer() }
    const home = freshHome(original)
    run(home, ['setup', '--auto'])
    const command = JSON.parse(settingsOf(home)).statusLine.command as string
    rmSync(join(home, '.claude/aitk-usage'), { recursive: true, force: true })
    quietReports(home)
    expect(run(home, ['setup', '--auto']).stderr).toContain('refreshed')
    expect(existsSync(join(home, '.claude/aitk-usage/auto-setup-declined.json'))).toBe(false)
    expect(JSON.parse(readFileSync(join(home, '.claude/aitk-usage/statusline.json'), 'utf8')).previous).toEqual(userRenderer())
    expect(JSON.parse(settingsOf(home)).statusLine.command).toBe(command)
    expect(runStored(home, command, quotaInput).stdout).toBe('original:' + quotaInput)
    expect(existsSync(join(home, '.claude/aitk-usage/claude.json'))).toBe(true)
    run(home, ['uninstall'])
    expect(JSON.parse(settingsOf(home))).toEqual(original)
  })

  it('기록과 저장 명령이 어긋나면 실제로 실행된 저장 명령이 넘긴 원래 명령을 그린다', () => {
    const home = freshHome({ statusLine: userRenderer() })
    run(home, ['setup', '--auto'])
    const command = JSON.parse(settingsOf(home)).statusLine.command as string
    const receiptPath = join(home, '.claude/aitk-usage/statusline.json')
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
    // 다른 머신에서 동기화돼 들어온 기록처럼 원래 명령이 다른 경우
    writeFileSync(receiptPath, JSON.stringify({ ...receipt, previous: { type: 'command', command: `printf 'other-machine'` } }))
    expect(runStored(home, command, plainInput).stdout).toBe('original:' + plainInput)
  })

  it('작은따옴표가 든 원래 명령도 기록 없이 정확히 되돌린다', () => {
    const original = { statusLine: { type: 'command', command: `printf '%s' "it's"`, padding: 2 } }
    const home = freshHome(original)
    run(home, ['setup', '--auto'])
    rmSync(join(home, '.claude/aitk-usage/statusline.json'))
    run(home, ['uninstall'])
    expect(JSON.parse(settingsOf(home))).toEqual(original)
  })

  it('수집 폴더에 쓸 수 없어도(잠금·표식 실패) uninstall은 설정을 되돌린다', () => {
    const original = { language: 'ko', statusLine: userRenderer() }
    const home = freshHome(original)
    expect(run(home, ['setup', '--auto']).stderr).toContain('connected')
    const usage = join(home, '.claude/aitk-usage')
    chmodSync(usage, 0o500)
    try {
      const result = run(home, ['uninstall'])
      expect(result.status).toBe(0)
      expect(JSON.parse(settingsOf(home))).toEqual(original)
      // 사본(~/.config/aitk) 표식은 남아 다시 켜지지 않고, 안내도 실제로 남은 쪽을 가리킨다
      expect(result.stderr).toContain('.config/aitk/usage-auto-setup-declined.json')
      expect(run(home, ['setup', '--auto']).stderr).toContain('skipped: declined')
    } finally {
      chmodSync(usage, 0o700)
    }
  })

  it('연결 전에 uninstall해 두면 처음부터 자동 연결하지 않는다 (env가 전달되지 않는 실행 환경용)', () => {
    const home = freshHome({ language: 'ko' })
    run(home, ['uninstall'])
    expect(run(home, ['setup', '--auto']).stderr).toContain('skipped: declined')
    expect(JSON.parse(settingsOf(home))).toEqual({ language: 'ko' })
  })
})

describe('래퍼 실패 내성 — 자동 연결로 모두에게 깔리므로 원래 표시줄을 절대 깨지 않는다 (DEV-4570)', () => {
  function wrapped(command: string): string {
    const home = mkdtempSync(join(root, 'wrap-'))
    mkdirSync(join(home, '.claude'), { recursive: true })
    quietReports(home)
    writeFileSync(join(home, '.claude/settings.json'), JSON.stringify({ statusLine: { type: 'command', command } }))
    const setup = spawnSync(process.execPath, [entry, 'usage', 'setup', '--auto'], { env: isolated(home), encoding: 'utf8' })
    // 연결이 조용히 실패하면 래퍼가 아무것도 안 하고 끝나 아래 테스트가 헛통과한다
    expect(setup.stderr).toContain('connected')
    return home
  }
  function statusline(home: string, input: string) {
    return spawnSync(process.execPath, [entry, 'usage', 'statusline'], { env: isolated(home), input, encoding: 'utf8', timeout: 15_000 })
  }
  const quotaInput = JSON.stringify({ rate_limits: { seven_day: { used_percentage: 12, resets_at: Math.floor(Date.now() / 1000) + 86400 } } })

  it('원래 명령의 출력과 종료 코드를 그대로 돌려준다 (감싸지 않았을 때와 같게)', () => {
    const home = wrapped(`printf 'partial'; exit 3`)
    const result = statusline(home, '{}')
    expect(result.stdout).toBe('partial')
    // Claude Code는 종료 코드로 출력 사용 여부를 정한다 — 래퍼가 0으로 바꾸면 화면이 달라진다
    expect(result.status).toBe(3)
  })

  it('원래 명령이 시그널로 끝나면 128+번호로 알린다 (실패를 성공으로 바꾸지 않음)', () => {
    const home = wrapped(`printf 'partial'; kill -TERM $$`)
    const result = statusline(home, '{}')
    expect(result.stdout).toBe('partial')
    expect(result.status).toBe(143)
  })

  it('원래 명령이 없어져도 래퍼는 멈추지 않고, 셸과 같은 종료 코드를 낸다', () => {
    const home = wrapped('/nonexistent/statusline-renderer')
    const result = statusline(home, '{}')
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(127)
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

  it('같은 한도 값이면 렌더마다 스냅샷 파일을 다시 쓰지 않는다', () => {
    const home = wrapped(`printf 'x'`)
    const snapshot = join(home, '.claude/aitk-usage/claude.json')
    statusline(home, quotaInput)
    const first = readFileSync(snapshot, 'utf8')
    const ino = statSync(snapshot).ino
    statusline(home, quotaInput)
    // 원자적 교체는 새 inode를 만든다 — 그대로면 다시 쓰지 않은 것이다
    expect(statSync(snapshot).ino).toBe(ino)
    expect(readFileSync(snapshot, 'utf8')).toBe(first)
    const changed = JSON.stringify({ rate_limits: { seven_day: { used_percentage: 13, resets_at: Math.floor(Date.now() / 1000) + 86400 } } })
    statusline(home, changed)
    expect(JSON.parse(readFileSync(snapshot, 'utf8')).usedPercent).toBe(13)
  })

  it('빈 입력·깨진 입력에도 원래 표시줄에 그대로 넘긴다', () => {
    const home = wrapped(`cat`)
    expect(statusline(home, '').stdout).toBe('')
    expect(statusline(home, '{oops').stdout).toBe('{oops')
  })
})
