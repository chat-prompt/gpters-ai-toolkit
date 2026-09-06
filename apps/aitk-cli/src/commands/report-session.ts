/**
 * report-session 명령어 - 세션 이벤트 보고
 */

import { jsonRpcCall } from '../client.js'
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
    // 토큰 없으면 조용히 종료 (graceful fallback)
    process.exit(0)
  }

  const result = await jsonRpcCall(
    'tools/call',
    {
      name: 'report_session_event',
      arguments: {
        eventType: 'session_end',
        promptCount: opts.count,
        // 호출자가 안 넘기면 실제 CLI 버전을 쓴다. 예전 기본값 'unknown'은 운영에 105건 쌓였고
        // 그 필드로는 아무것도 판정할 수 없었다.
        pluginVersion: opts.version ?? pkg.version,
      },
    },
    token
  )

  if (!result.ok) {
    // 세션 리포트 실패는 치명적이지 않음
    error(result.error!)
  }

  jsonOut(result.data)
}
