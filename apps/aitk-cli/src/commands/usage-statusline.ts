/** Claude statusline stdin을 기존 표시줄에 전달하면서 공식 한도만 수집한다. */
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { claudeUsagePaths, extractClaudeQuota, readClaudeStatuslineInstallation, renderDefaultStatusline, writeUsageJson } from '../usage/claude-statusline.js'
import { shouldScheduleClaudeReport } from '../usage/claude-auto-report.js'

/** 원본 입력은 메모리에서만 사용하고 기존 명령의 stdout은 그대로 전달한다. */
export async function runUsageStatusline(): Promise<void> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  const input = Buffer.concat(chunks)
  const home = homedir()
  const installation = readClaudeStatuslineInstallation(home)
  const previous = installation?.previous
  let rendered = Promise.resolve()
  if (typeof previous?.command === 'string') {
    rendered = new Promise<void>((done) => {
      const renderer = spawn('/bin/sh', ['-c', previous.command as string], { stdio: ['pipe', 'inherit', 'inherit'] })
      renderer.on('error', () => done())
      renderer.on('close', () => done())
      renderer.stdin.on('error', () => { /* renderer exited before reading */ })
      renderer.stdin.end(input)
    })
  }

  try {
    const data = JSON.parse(input.toString('utf8'))
    const quota = extractClaudeQuota(data)
    if (quota && process.env.AITK_USAGE_REPORT !== '0') {
      writeUsageJson(claudeUsagePaths(home).snapshot, quota)
      if (shouldScheduleClaudeReport(home)) {
        const worker = spawn(process.execPath, [process.argv[1], 'usage', 'auto-report'], {
          detached: true, stdio: 'ignore',
        })
        worker.on('error', () => { /* 다음 statusline 입력에서 재시도 */ })
        worker.unref()
      }
    }
    // 원래 표시줄이 없던 사용자: setup에서 고른 대로 기본 한 줄을 그리거나 아무것도 그리지 않는다.
    if (!previous && (installation?.display ?? 'default') === 'default') {
      process.stdout.write(renderDefaultStatusline(data, quota))
    }
  } catch { /* 입력 누락·캐시 실패가 기존 상태 표시줄을 깨뜨리지 않게 한다. */ }
  await rendered
}
