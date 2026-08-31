/**
 * report-outcome 명령어 - 스킬 적용 결과 보고
 */

import { jsonRpcCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, info, error } from '../output.js'
import { markJourneyReported, resolveJourneyForSkill } from '../journey.js'

/** report-outcome 명령어 옵션 */
export interface ReportOutcomeOptions {
  /** 스킬 ID */
  skillId: string
  /** 적용 여부 */
  applied: boolean
  /** 결과 요약 */
  summary: string
  /** 검색·로드 흐름 UUID. 보통 CLI가 자동으로 찾는다. */
  journeyId?: string
}

/**
 * report-outcome 명령어 실행 (report_skill_outcome via JSON-RPC)
 *
 * @param opts - 결과 보고 옵션
 */
export async function runReportOutcome(opts: ReportOutcomeOptions): Promise<void> {
  const token = resolveToken()
  const journeyId = await resolveJourneyForSkill(opts.skillId, opts.journeyId)

  const result = await jsonRpcCall(
    'tools/call',
    {
      name: 'report_skill_outcome',
      arguments: {
        skillId: opts.skillId,
        journeyId,
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
  const toolResult = result.data as { isError?: boolean; content?: Array<{ text?: string }> } | undefined
  if (toolResult?.isError) {
    error(toolResult.content?.[0]?.text ?? 'Outcome report rejected')
  }

  await markJourneyReported(journeyId)
  info('Outcome reported')
  jsonOut(result.data)
}
