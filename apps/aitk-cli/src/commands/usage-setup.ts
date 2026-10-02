/**
 * usage setup 명령어 - Claude Code 공식 주간 한도 수집을 연결한다.
 *
 * 기존 표시줄이 있으면 그대로 감싸고, 없으면 aitk 기본 표시줄을 보여줄지 묻는다.
 * 대화형이 아닐 때(스킬·스크립트)는 --display로 답을 받는다.
 * `--auto`는 플러그인 SessionStart 훅이 부르는 무인 경로로, 화면이 바뀌지 않는 경우만 연결한다.
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import {
  clearAutoSetupDeclined, inspectClaudeStatusline, installClaudeStatusline, isAutoSetupDeclined,
  markAutoSetupDeclined, uninstallClaudeStatusline, type StatuslineDisplay,
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
  const result = installClaudeStatusline(undefined, undefined, undefined, display ? { display } : {})
  // 직접 실행한 setup은 이전에 uninstall로 남긴 자동 연결 거부를 푼다.
  clearAutoSetupDeclined()
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
  | { status: 'skipped'; reason: 'disabled' | 'report-disabled' | 'agent' | 'no-claude' | 'declined' | 'unsupported' }
  | { status: 'failed'; reason: string }

/** 테스트가 가짜 홈·실행 경로를 넘길 수 있게 한다. */
export interface UsageAutoSetupOptions {
  home?: string
  entry?: string
  env?: NodeJS.ProcessEnv
}

/**
 * 무인 자동 연결. 화면이 바뀌지 않는 경우만 연결하고, 어떤 경우에도 예외를 던지지 않는다.
 *
 * - 기존 command 표시줄: 감싼다(출력 그대로)
 * - 표시줄 없음: `display: none`으로 연결한다(아무것도 그리지 않음)
 * - 이미 aitk: 이전 선택을 유지한 채 명령 경로만 현재 설치본으로 맞춘다(node·aitk 경로가 바뀌면 표시줄이 깨지므로)
 * - 끔(`AITK_USAGE_SETUP=0`·`AITK_USAGE_REPORT=0`), 에이전트 머신, `~/.claude` 없음, 사용자가 uninstall 함,
 *   command가 아닌 표시줄: 건너뛴다
 */
export function runUsageAutoSetup(opts: UsageAutoSetupOptions = {}): UsageAutoSetupResult {
  const home = opts.home ?? homedir()
  const env = opts.env ?? process.env
  try {
    if (env.AITK_USAGE_SETUP === '0') return { status: 'skipped', reason: 'disabled' }
    if (env.AITK_USAGE_REPORT === '0') return { status: 'skipped', reason: 'report-disabled' }
    // 에이전트 머신은 개인 사용량을 보내지 않으므로 수집도 연결하지 않는다 (usage report와 같은 경계).
    if (readAgentConfig(home)) return { status: 'skipped', reason: 'agent' }
    if (!existsSync(join(home, '.claude'))) return { status: 'skipped', reason: 'no-claude' }
    if (isAutoSetupDeclined(home)) return { status: 'skipped', reason: 'declined' }
    const state = inspectClaudeStatusline(home)
    if (state.kind === 'unsupported') return { status: 'skipped', reason: 'unsupported' }
    const result = installClaudeStatusline(opts.entry, home, undefined, state.kind === 'none' ? { display: 'none' } : {})
    if (result.mode === 'unchanged') return { status: 'unchanged' }
    if (state.kind === 'aitk') return { status: 'refreshed' }
    return { status: 'connected', mode: result.mode === 'wrapped' ? 'wrapped' : 'none' }
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
export function runUsageUninstall(home = homedir()): boolean {
  const restored = uninstallClaudeStatusline(home)
  markAutoSetupDeclined(home)
  return restored
}
