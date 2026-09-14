/**
 * usage setup 명령어 - Claude Code 공식 주간 한도 수집을 연결한다.
 *
 * 기존 표시줄이 있으면 그대로 감싸고, 없으면 aitk 기본 표시줄을 보여줄지 묻는다.
 * 대화형이 아닐 때(스킬·스크립트)는 --display로 답을 받는다.
 */
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { inspectClaudeStatusline, installClaudeStatusline, type StatuslineDisplay } from '../usage/claude-statusline.js'
import { error, info } from '../output.js'

/** usage setup 옵션 */
export interface UsageSetupOptions {
  /** 표시줄이 없을 때 무엇을 그릴지. 생략하면 TTY에서 묻는다. */
  display?: string
  /** true면 묻지 않고 `default`를 고른다. */
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
    let answer: string
    try { answer = (await rl.question('기본 표시줄 보기 [Y/n] ')).trim().toLowerCase() }
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
