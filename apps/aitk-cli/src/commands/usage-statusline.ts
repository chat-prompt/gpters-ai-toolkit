/** Claude statusline stdin을 기존 표시줄에 전달하면서 공식 한도만 수집한다. */
import { spawn } from 'node:child_process'
import { constants, homedir } from 'node:os'
import { STATUSLINE_PREVIOUS_ENV, claudeUsagePaths, extractClaudeQuota, readClaudeQuota, readClaudeStatuslineInstallation, renderDefaultStatusline, writeUsageJson } from '../usage/claude-statusline.js'
import { shouldScheduleClaudeReport } from '../usage/claude-auto-report.js'

const RENDERER_TIMEOUT_MS = 10_000
/** 같은 한도 값이면 이 간격보다 자주 스냅샷을 다시 쓰지 않는다. 최신성 판단(15분)보다 충분히 짧다. */
const SNAPSHOT_REFRESH_MS = 60_000

/** 원본 입력은 메모리에서만 사용하고 기존 명령의 stdout은 그대로 전달한다. */
export async function runUsageStatusline(): Promise<void> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  const input = Buffer.concat(chunks)
  const home = homedir()
  const installation = readClaudeStatuslineInstallation(home)
  // 연결 기록이 없으면(해제 직후·폴더 삭제·다른 머신에서 동기화된 설정) 수집하지 않고,
  // 저장 명령이 넘겨준 원래 명령만 그린다. 기록 부재를 기본 한 줄 동의로 해석하지 않는다.
  // 원래 명령은 실제로 실행된 저장 명령이 넘긴 값을 우선한다 — 기록은 다른 머신·중간 종료로 어긋날 수 있다.
  // 옛 형식 명령(값을 넘기지 않음)일 때만 기록을 본다.
  const handedOver = process.env[STATUSLINE_PREVIOUS_ENV]
  const previousCommand = handedOver !== undefined
    ? (handedOver || undefined)
    : (typeof installation?.previous?.command === 'string' ? installation.previous.command : undefined)
  const childEnv = { ...process.env }
  delete childEnv[STATUSLINE_PREVIOUS_ENV]
  let rendered = Promise.resolve()
  if (previousCommand !== undefined) {
    rendered = new Promise<void>((done) => {
      const renderer = spawn('/bin/sh', ['-c', previousCommand], { stdio: ['pipe', 'inherit', 'inherit'], env: childEnv })
      // 끝나지 않는 표시줄 명령이 래퍼를 붙잡지 않게 한다. Claude Code는 표시줄을 수백 ms마다 다시 부른다.
      const deadline = setTimeout(() => { try { renderer.kill('SIGKILL') } catch { /* 이미 종료 */ } }, RENDERER_TIMEOUT_MS)
      const finish = () => { clearTimeout(deadline); done() }
      renderer.on('error', finish)
      // 원래 명령의 종료 코드를 그대로 돌려준다. Claude Code는 종료 코드로 출력 사용 여부를 정한다.
      renderer.on('close', (code, signal) => {
        // 시그널로 끝났으면(타임아웃 SIGKILL 포함) 셸처럼 128+번호로 알린다 — 0으로 바꾸면 실패가 성공이 된다.
        if (typeof code === 'number') process.exitCode = code
        else if (signal) process.exitCode = 128 + (constants.signals[signal] ?? 0)
        finish()
      })
      renderer.stdin.on('error', () => { /* renderer exited before reading */ })
      renderer.stdin.end(input)
    })
  }

  if (!installation) { await rendered; return }

  try {
    const data = JSON.parse(input.toString('utf8'))
    const quota = extractClaudeQuota(data)
    if (quota && process.env.AITK_USAGE_REPORT !== '0') {
      // 렌더마다 파일을 교체하지 않는다. 값이 바뀌었거나 관측 시각이 1분 넘게 지났을 때만 쓴다.
      const stored = readClaudeQuota(home)
      const stale = !stored || stored.usedPercent !== quota.usedPercent || stored.resetsAt !== quota.resetsAt
        || Date.parse(quota.capturedAt) - Date.parse(stored.capturedAt) >= SNAPSHOT_REFRESH_MS
      if (stale) writeUsageJson(claudeUsagePaths(home).snapshot, quota)
      if (shouldScheduleClaudeReport(home)) {
        const worker = spawn(process.execPath, [process.argv[1], 'usage', 'auto-report'], {
          detached: true, stdio: 'ignore',
        })
        worker.on('error', () => { /* 다음 statusline 입력에서 재시도 */ })
        worker.unref()
      }
    }
    // 원래 표시줄이 없던 사용자: setup에서 고른 대로 기본 한 줄을 그리거나 아무것도 그리지 않는다.
    if (previousCommand === undefined && (installation.display ?? 'default') === 'default') {
      process.stdout.write(renderDefaultStatusline(data, quota))
    }
  } catch { /* 입력 누락·캐시 실패가 기존 상태 표시줄을 깨뜨리지 않게 한다. */ }
  await rendered
}
