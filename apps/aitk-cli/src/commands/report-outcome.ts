/**
 * report-outcome 명령어 - 스킬 적용 결과 보고
 */

import { jsonRpcCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, info, error } from '../output.js'

/** report-outcome 명령어 옵션 */
export interface ReportOutcomeOptions {
  /** 스킬 ID */
  skillId: string
  /** 적용 여부 */
  applied: boolean
  /** 결과 요약 */
  summary: string
}

/**
 * report-outcome 명령어 실행 (report_skill_outcome via JSON-RPC)
 *
 * @param opts - 결과 보고 옵션
 */
export async function runReportOutcome(opts: ReportOutcomeOptions): Promise<void> {
  const token = resolveToken()

  const result = await jsonRpcCall(
    'tools/call',
    {
      name: 'report_skill_outcome',
      arguments: {
        skillId: opts.skillId,
        applied: opts.applied,
        summary: opts.summary,
      },
    },
    token
  )

  if (!result.ok) {
    if (result.status === 401) error(result.error!, 2)
    error(result.error!)
  }

  info('결과 보고 완료')
  jsonOut(result.data)
}
