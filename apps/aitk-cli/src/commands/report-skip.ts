/**
 * report-skip 명령어 - 스킬 검색 스킵 보고
 */

import { jsonRpcCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, info, error } from '../output.js'

/** report-skip 명령어 옵션 */
export interface ReportSkipOptions {
  /** 검색 쿼리 */
  query: string
  /** 검색 결과 ID 목록 (쉼표 구분) */
  resultIds?: string
  /** 스킵 사유 */
  reason: string
}

/**
 * report-skip 명령어 실행 (report_search_skip via JSON-RPC)
 *
 * @param opts - 스킵 보고 옵션
 */
export async function runReportSkip(opts: ReportSkipOptions): Promise<void> {
  const token = resolveToken()
  const ids = opts.resultIds ? opts.resultIds.split(',').map(s => s.trim()) : []

  const result = await jsonRpcCall(
    'tools/call',
    {
      name: 'report_search_skip',
      arguments: {
        query: opts.query,
        resultIds: ids,
        reason: opts.reason,
      },
    },
    token
  )

  if (!result.ok) {
    if (result.status === 401) error(result.error!, 2)
    error(result.error!)
  }

  info('Skip reported')
  jsonOut(result.data)
}
