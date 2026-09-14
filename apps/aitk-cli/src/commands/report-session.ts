/**
 * report-session 명령어 - 세션 이벤트 보고
 */

import { jsonRpcSessionCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, error } from '../output.js'
import pkg from '../../package.json' with { type: 'json' }

/** report-session 명령어 옵션 */
export interface ReportSessionOptions {
  /** 프롬프트 카운트 */
  count: number
  /** 플러그인 버전 */
  version?: string
}

/**
 * report-session 명령어 실행
 *
 * @param opts - 리포트 옵션
 */
export async function runReportSession(opts: ReportSessionOptions): Promise<void> {
  const token = resolveToken()
  if (!token) {
    // 훅에서는 출력하지 않되 실패 상태를 남겨 다음 SessionEnd 때 다시 시도할 수 있게 한다.
    process.exitCode = 2
    return
  }

  const version = opts.version ?? pkg.version
  const result = await jsonRpcSessionCall<{ isError?: boolean }>(
    'tools/call',
    {
      name: 'report_session_event',
      arguments: {
        eventType: 'session_end',
        promptCount: opts.count,
        // 호출자가 안 넘기면 실제 CLI 버전을 쓴다. 예전 기본값 'unknown'은 운영에 105건 쌓였고
        // 그 필드로는 아무것도 판정할 수 없었다.
        pluginVersion: version,
      },
    },
    token,
    { name: 'aitk-session-reporter', version }
  )

  if (!result.ok) {
    // 세션 리포트 실패는 치명적이지 않음
    error(result.error!)
  }

  if (result.data?.isError) {
    error('Session report rejected by server')
  }

  jsonOut(result.data)
}
