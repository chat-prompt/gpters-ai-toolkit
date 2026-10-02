/**
 * usage setup 명령어 - Claude Code 공식 주간 한도 수집을 연결한다.
 *
 * 기존 표시줄이 있으면 그대로 감싸고, 없으면 aitk 기본 표시줄을 보여줄지 묻는다.
 * 대화형이 아닐 때(스킬·스크립트)는 --display로 답을 받는다.
 * `--auto`는 플러그인 SessionStart 훅이 부르는 무인 경로로, 화면이 바뀌지 않는 경우만 연결한다.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import {
  claudeUsagePaths, clearAutoSetupDeclined, inspectClaudeStatusline, installClaudeStatusline, isAutoSetupDeclined,
  markAutoSetupDeclined, markConnected, readClaudeStatuslineInstallation, uninstallClaudeStatusline, wasConnected, type StatuslineDisplay,
} from '../usage/claude-statusline.js'
import { readAgentConfig } from '../agent-auth.js'
import { error, info } from '../output.js'

/** usage setup 옵션 */
export interface UsageSetupOptions {
  /** 표시줄이 없을 때 무엇을 그릴지. 생략하면 TTY에서 묻는다. */
  display?: string
  /** true면 새 설치에서 묻지 않고 `default`를 고른다. 이미 연결된 설치는 이전 선택을 유지한다. */
  yes?: boolean
}

/** --display 값을 검증한다. */
function parseDisplay(value: string | undefined): StatuslineDisplay | undefined {
  if (value === undefined) return undefined
  if (value === 'default' || value === 'none') return value
  error(`--display must be "default" or "none" (got "${value}")`)
}

/** TTY에서 기본 표시줄을 보여줄지 묻는다. Enter는 예다. */
async function askDisplay(): Promise<StatuslineDisplay> {
  const rl = createInterface({ input: stdin, output: stdout })
  try {
    info('Claude Code 상태 표시줄이 설정돼 있지 않습니다.')
    info('aitk 기본 표시줄(모델 · 컨텍스트 · 5시간/주간 한도)을 보여드릴까요?')
    info('아니오를 고르면 화면에는 아무것도 그리지 않고 주간 한도만 수집합니다.')
    // readline의 question은 EOF(Ctrl+D)에서 영원히 대기하므로 close 이벤트를 따로 듣는다.
    const closed = new Promise<never>((_, reject) => rl.once('close', () => reject(new Error('eof'))))
    let answer: string
    try { answer = (await Promise.race([rl.question('기본 표시줄 보기 [Y/n] '), closed])).trim().toLowerCase() }
    catch { error('입력이 없어 설정을 바꾸지 않았습니다. 다시 실행하거나 --display default|none 을 넘기세요.') }
    return answer === '' || answer === 'y' || answer === 'yes' ? 'default' : 'none'
  } finally {
    rl.close()
  }
}

/**
 * usage setup 실행
 *
 * @param opts - 표시 모드와 자동 응답 여부
 */
export async function runUsageSetup(opts: UsageSetupOptions = {}): Promise<void> {
  const state = inspectClaudeStatusline()
  if (state.kind === 'unsupported') {
    error('settings.json의 statusLine이 command 형식이 아니라 감쌀 수 없습니다. 기존 설정은 그대로 뒀습니다.')
  }
  let display = parseDisplay(opts.display)
  const needsChoice = state.kind === 'none' || (state.kind === 'aitk' && state.previous === null)
  if (needsChoice && display === undefined) {
    // 이미 연결돼 있으면 이전 선택을 유지한다. --display를 넘겨야 바꾼다.
    if (state.kind === 'aitk') display = state.display
    else if (opts.yes) display = 'default'
    else if (stdin.isTTY && stdout.isTTY) display = await askDisplay()
    else error('상태 표시줄이 없습니다. 비대화형 환경에서는 --display default|none 으로 선택하세요.')
  }
  const home = homedir()
  const result = withSetupLock(home, true, () => {
    const installed = installClaudeStatusline(undefined, home, undefined, display ? { display } : {})
    markConnected(home)
    // 직접 실행한 setup은 이전에 uninstall로 남긴 자동 연결 거부를 푼다.
    clearAutoSetupDeclined(home)
    return installed
  })
  if (result === 'busy') error(busyMessage(home))
  switch (result.mode) {
    case 'wrapped':
      info('기존 상태 표시줄은 그대로 두고 주간 한도만 수집하도록 연결했습니다.')
      break
    case 'default':
      info('aitk 기본 상태 표시줄을 설치하고 주간 한도 수집을 연결했습니다.')
      break
    case 'none':
      info('화면에는 아무것도 그리지 않고 주간 한도만 수집하도록 연결했습니다.')
      break
    case 'unchanged':
      info('이미 같은 설정으로 연결돼 있습니다.')
      break
  }
  info('Claude Code를 재시작하면 적용됩니다. 되돌리려면: aitk usage uninstall')
}

/** 자동 연결 결과. 훅 로그에 한 줄로 남긴다. */
export type UsageAutoSetupResult =
  | { status: 'connected'; mode: 'wrapped' | 'none' }
  | { status: 'unchanged' }
  | { status: 'refreshed' }
  | { status: 'skipped'; reason: AutoSetupSkipReason }
  | { status: 'failed'; reason: string }

/** 자동 연결을 건너뛴 이유. 로그에 그대로 남는다. */
export type AutoSetupSkipReason =
  | 'disabled' | 'report-disabled' | 'agent' | 'no-claude' | 'config-dir' | 'declined'
  | 'drifted' | 'symlink' | 'unsupported' | 'busy' | 'platform'

/** 테스트가 가짜 홈·실행 경로를 넘길 수 있게 한다. */
export interface UsageAutoSetupOptions {
  home?: string
  entry?: string
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
}


const LOCK_STALE_MS = 60_000

/** 잠금 폴더를 만들 수 없을 때(권한·디스크). 경합(EEXIST)과 구분한다. */
export class LockUnavailableError extends Error {}
/** setup은 ms 단위로 끝난다. 이보다 오래된 잠금은 주인 pid가 살아 있어도(pid 재사용) 회수한다. */
const LOCK_ABANDONED_MS = 10 * 60_000

/** 사람이 친 명령이 잠금에 막혔을 때 직접 풀 수 있게 경로를 알려준다. */
function busyMessage(home: string): string {
  const lock = join(claudeUsagePaths(home).directory, 'setup.lock')
  return `다른 aitk usage setup이 실행 중입니다. 잠시 뒤 다시 실행하세요. 계속 막히면: rm -rf '${lock}'`
}

/** 잠금 주인 토큰(`<pid>-<uuid>`). 없거나 읽을 수 없으면 빈 문자열. */
function readOwner(path: string): string {
  try { return readFileSync(path, 'utf8') } catch { return '' }
}

/** 토큰의 pid가 살아 있는지. 주인을 모르면(owner 쓰기 전 죽음) 죽은 것으로 본다. */
function ownerAlive(token: string): boolean {
  const pid = Number.parseInt(token.split('-')[0] ?? '', 10)
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch (err) { return (err as NodeJS.ErrnoException).code === 'EPERM' }
}

/** Claude Code를 실제로 쓰는 머신인지. aitk가 만든 흔적은 신호로 쓰지 않는다. */
function usesClaudeCode(home: string): boolean {
  return [join(home, '.claude', 'projects'), join(home, '.claude.json'), join(home, '.claude', 'settings.json')].some(path => existsSync(path))
}

/** 동기 대기. 잠금 재시도 사이에만 쓴다. */
function sleepSync(ms: number): void { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) }

/**
 * setup·uninstall을 한 프로세스씩만 돌게 한다. 디렉터리 생성은 원자적이라 잠금으로 쓴다.
 * 자동 연결은 기다리지 않고 건너뛰고(`wait: false`), 사람이 친 명령은 최대 5초 기다린다.
 *
 * - 경합(EEXIST)만 재시도한다. 권한·디스크 오류는 그대로 던진다 — 재시도하면 끝나지 않는다.
 * - 1분 넘은 잠금은 이름을 바꿔 회수한다. 바꾼 뒤 보니 방금 갱신된 잠금이면(다른 프로세스가 먼저
 *   회수해 새로 잡은 것) 되돌려 놓고 기다린다.
 * - 잠금 안에 소유 토큰을 두고, 자기 토큰일 때만 푼다.
 */
export function withSetupLock<T>(home: string, wait: boolean, fn: () => T): T | 'busy' {
  const lock = join(claudeUsagePaths(home).directory, 'setup.lock')
  const owner = join(lock, 'owner')
  try { mkdirSync(dirname(lock), { recursive: true, mode: 0o700 }) } catch (err) { throw new LockUnavailableError((err as Error).message) }
  const token = `${process.pid}-${randomUUID()}`
  const deadline = Date.now() + (wait ? 5_000 : 0)
  for (let attempt = 0; ; attempt++) {
    try {
      mkdirSync(lock)
      writeFileSync(owner, token)
      break
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw new LockUnavailableError((err as Error).message)
    }
    let reclaimed = false
    try {
      // 1분 넘었고 주인 프로세스가 죽은 잠금만 회수한다. 살아 있는 잠금은 오래 걸려도 건드리지 않는다.
      const seen = readOwner(owner)
      const age = Date.now() - statSync(lock).mtimeMs
      if ((age > LOCK_STALE_MS && !ownerAlive(seen)) || age > LOCK_ABANDONED_MS) {
        const grave = `${lock}.stale-${token}`
        renameSync(lock, grave)
        // 옮긴 것이 판단한 그 잠금(같은 주인 토큰)일 때만 지운다. 그 사이 다른 프로세스가 새로 잡은 잠금이면 되돌린다.
        if (readOwner(join(grave, 'owner')) === seen) {
          rmSync(grave, { recursive: true, force: true })
          reclaimed = true
        } else {
          try { renameSync(grave, lock) } catch { /* 또 다른 잠금이 생겼다 — 옮긴 잠금은 주인이 끝날 때까지 grave 에 둔다 */ }
        }
      }
    } catch (err) {
      // 그 사이 잠금이 사라졌으면 바로 다시 잡아 본다. 회수 중 권한 오류는 잠금을 쓸 수 없는 것으로 본다.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') reclaimed = true
      else throw new LockUnavailableError((err as Error).message)
    }
    if (reclaimed && attempt < 3) continue
    if (Date.now() >= deadline) return 'busy'
    sleepSync(100)
  }
  try { return fn() } finally {
    try { if (readFileSync(owner, 'utf8') === token) rmSync(lock, { recursive: true, force: true }) } catch { /* 이미 없음 */ }
  }
}

/**
 * 무인 자동 연결. 화면이 바뀌지 않는 경우만 연결하고, 어떤 경우에도 예외를 던지지 않는다.
 *
 * - 기존 command 표시줄: 감싼다(출력 그대로)
 * - 표시줄 없음: `display: none`으로 연결한다(아무것도 그리지 않음)
 * - 이미 aitk: 이전 선택을 유지한 채 명령 경로만 현재 설치본으로 맞춘다(node·aitk 경로가 바뀌면 표시줄이 깨지므로)
 * - 건너뜀: 끔(`AITK_USAGE_SETUP=0`·`AITK_USAGE_REPORT=0`), 에이전트 머신, Windows, `~/.claude` 없음,
 *   `CLAUDE_CONFIG_DIR`이 다른 곳(실제로 안 쓰는 파일을 바꾸지 않게), uninstall 함,
 *   연결 뒤 사용자가 settings.json을 직접 되돌림(drifted — 가장 분명한 거부 신호),
 *   settings.json이나 ~/.claude가 심링크(dotfiles로 여러 머신이 공유하면 이 머신 경로가 다른 머신 표시줄을 깬다),
 *   settings.json을 읽을 수 없음(실패로 기록),
 *   command가 아닌 표시줄, 다른 setup이 도는 중
 */
export function runUsageAutoSetup(opts: UsageAutoSetupOptions = {}): UsageAutoSetupResult {
  const home = opts.home ?? homedir()
  const env = opts.env ?? process.env
  const skip = (reason: AutoSetupSkipReason): UsageAutoSetupResult => ({ status: 'skipped', reason })
  try {
    if (env.AITK_USAGE_SETUP === '0') return skip('disabled')
    if (env.AITK_USAGE_REPORT === '0') return skip('report-disabled')
    // 에이전트 머신은 개인 사용량을 보내지 않으므로 수집도 연결하지 않는다 (usage report와 같은 경계).
    if (readAgentConfig(home)) return skip('agent')
    // 래퍼·저장 명령이 POSIX 셸(/bin/sh)을 전제한다. Windows에서는 원래 표시줄이 사라질 수 있다.
    if ((opts.platform ?? process.platform) === 'win32') return skip('platform')
    const claudeDir = join(home, '.claude')
    if (!existsSync(claudeDir)) return skip('no-claude')
    // ~/.claude 폴더만으로는 판단하지 않는다 — aitk 사용량 보고가 Codex만 쓰는 사람에게도 ~/.claude/aitk-usage를 만든다.
    // Claude Code가 직접 만드는 것(대화 기록 폴더·사용자 설정 파일·settings.json)이 있어야 쓰는 사람으로 본다.
    if (!usesClaudeCode(home)) return skip('no-claude')
    if (env.CLAUDE_CONFIG_DIR && resolve(env.CLAUDE_CONFIG_DIR) !== resolve(claudeDir)) return skip('config-dir')
    // ~/.claude 자체(또는 상위)가 dotfiles·클라우드 폴더로 연결돼 있으면 여러 머신이 같은 설정을 쓴다.
    if (realpathSync(claudeDir) !== join(realpathSync(home), '.claude')) return skip('symlink')
    const paths = claudeUsagePaths(home)
    // 잠금(폴더 생성)보다 먼저 거를 수 있는 것은 먼저 거른다 — 건너뛰면 아무것도 만들지 않는다.
    if (isAutoSetupDeclined(home)) return skip('declined')
    try { if (lstatSync(paths.settings).isSymbolicLink()) return skip('symlink') } catch { /* 없음 */ }
    const result = withSetupLock(home, false, (): UsageAutoSetupResult => {
      // 잠금 안에서 다시 판단한다 — 그 사이 uninstall이 끝났을 수 있다.
      if (isAutoSetupDeclined(home)) return skip('declined')
      // 편집 중이거나 깨진 settings.json을 "표시줄 없음"으로 읽으면 직접 해제로 오판한다. 읽을 수 없으면 손대지 않는다.
      if (existsSync(paths.settings)) {
        const parsed: unknown = JSON.parse(readFileSync(paths.settings, 'utf8'))
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('settings.json is not a JSON object')
      }
      const state = inspectClaudeStatusline(home)
      if (state.kind === 'unsupported') return skip('unsupported')
      // aitk가 만든 명령은 기록이 없어도 inspect가 aitk로 읽는다(아래 설치가 기록을 되살린다).
      if (state.kind !== 'aitk' && (readClaudeStatuslineInstallation(home) || wasConnected(home))) {
        // 연결한 적이 있는데 설정에서 빠졌다 = 사람이 직접 되돌렸거나 옛 aitk로 uninstall했다. 다시 켜지 않는다.
        markAutoSetupDeclined(home)
        return skip('drifted')
      }
      // 표시 모드를 늘 명시한다. 생략하면 기록이 사라진 경합에서 기본 한 줄(화면 변화)로 떨어진다.
      const display: StatuslineDisplay = state.kind === 'aitk' ? state.display : 'none'
      const installed = installClaudeStatusline(opts.entry, home, undefined, { display })
      markConnected(home)
      if (installed.mode === 'unchanged') return { status: 'unchanged' }
      if (state.kind === 'aitk') return { status: 'refreshed' }
      return { status: 'connected', mode: installed.mode === 'wrapped' ? 'wrapped' : 'none' }
    })
    return result === 'busy' ? skip('busy') : result
  } catch (err) {
    return { status: 'failed', reason: err instanceof Error ? err.message : String(err) }
  }
}

/** 자동 연결 결과를 한 줄로 쓴다. 실패도 exit 0 — 세션 시작 훅을 깨뜨리지 않는다. */
export function formatUsageAutoSetup(result: UsageAutoSetupResult): string {
  switch (result.status) {
    case 'connected': return result.mode === 'wrapped'
      ? 'connected: 기존 상태 표시줄을 그대로 두고 주간 한도 수집을 연결했습니다. 끄려면: aitk usage uninstall'
      : 'connected: 화면 표시 없이 주간 한도 수집만 연결했습니다. 끄려면: aitk usage uninstall'
    case 'unchanged': return 'unchanged: 이미 연결돼 있습니다.'
    case 'refreshed': return 'refreshed: 저장된 명령 경로를 현재 aitk 설치본으로 갱신했습니다.'
    case 'skipped': return `skipped: ${result.reason}`
    case 'failed': return `failed: ${result.reason}`
  }
}

/** uninstall은 원래 표시줄을 복원하고, 자동 연결이 다시 켜지지 않게 표식을 남긴다. */
export function runUsageUninstall(home = homedir()): { restored: boolean; declined: boolean } {
  let declined = false
  // 해제는 어떤 경우에도 막히면 안 된다. 표식을 먼저 남기고(복원 중 실패해도 다시 켜지지 않게), 표식이나
  // 잠금을 못 만들어도(수집 폴더 권한 없음 등) 설정 복원은 한다.
  const body = () => {
    const marked = markAutoSetupDeclined(home)
    declined = marked.length > 0
    const result = uninstallClaudeStatusline(home)
    if (marked.length === 0) info('해제 표식을 남기지 못했습니다(~/.claude/aitk-usage, ~/.config/aitk 쓰기 실패). 자동 연결이 다시 켜질 수 있으니 AITK_USAGE_SETUP=0 도 설정하세요.')
    else if (marked.length === 1) info(`해제 표식을 한 곳에만 남겼습니다: ${marked[0]} — 이 파일을 지우면 다음 날 다시 연결될 수 있습니다.`)
    return result
  }
  let restored: boolean | 'busy'
  try { restored = withSetupLock(home, true, body) } catch (err) {
    // 잠금을 못 만든 경우만(수집 폴더 권한 없음 등) 잠금 없이 복원한다. 복원 자체의 오류는 그대로 알린다.
    if (!(err instanceof LockUnavailableError)) throw err
    restored = body()
  }
  if (restored === 'busy') error(busyMessage(home))
  return { restored, declined }
}
