/**
 * usage report 명령어 - 로컬 사용량을 집계해 서버로 보고
 */

import { jsonRpcCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, info, error } from '../output.js'
import { collectClaudeCode } from '../usage/claude-code.js'
import { collectCodex } from '../usage/codex.js'
import type { UsageRecord } from '../usage/types.js'

/** 수신 계약이 거부하는 상한. 넘겨 보내지 않고 여기서 막는다 */
const MAX_DAYS = 90

/** usage report 명령어 옵션 */
export interface UsageReportOptions {
  /** 집계 구간 길이 (일) */
  days: number
  /** 전송 없이 집계 결과만 출력 */
  dryRun: boolean
}

/**
 * usage report 명령어 실행
 *
 * @param opts - 집계 옵션
 */
export async function runUsageReport(opts: UsageReportOptions): Promise<void> {
  if (!Number.isFinite(opts.days) || opts.days < 1 || opts.days > MAX_DAYS) {
    error(`--days must be between 1 and ${MAX_DAYS}`)
  }

  const end = new Date()
  const start = new Date(end.getTime() - opts.days * 86_400_000)
  const window = { start, end }

  const collected = await Promise.all([collectClaudeCode(window), collectCodex(window)])
  const records = collected.filter((record): record is UsageRecord => record !== null)

  // --dry-run은 무엇을 보낼지 확인하는 용도라 인증도, 결과가 비었는지도 따지지 않는다
  if (opts.dryRun) {
    jsonOut({ records })
    return
  }

  if (records.length === 0) {
    info('No local usage found for the period.')
    process.exit(0)
  }

  const token = resolveToken()
  if (!token) {
    // 훅에서 돌 수 있어 미인증은 실패가 아니다 (report-session과 같은 처리)
    process.exit(0)
  }

  const result = await jsonRpcCall('tools/call', { name: 'report_usage', arguments: { records } }, token)

  if (!result.ok) {
    error(result.error!)
  }

  jsonOut(result.data)
}
