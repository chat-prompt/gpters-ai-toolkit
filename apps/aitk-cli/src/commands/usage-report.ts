/**
 * usage report 명령어 - 로컬 사용량을 집계해 서버로 보고
 */

import { jsonRpcCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, info, error } from '../output.js'
import { collectClaudeCode } from '../usage/claude-code.js'
import { collectCodex } from '../usage/codex.js'
import type { UsageRecord } from '../usage/types.js'

/**
 * UTC 기준 그날 0시로 내린다
 *
 * 로컬 타임존을 쓰면 같은 순간에 돌려도 사람마다 구간 경계가 달라져,
 * 서버에서 같은 구간으로 묶이지 않는다.
 *
 * @param date - 기준 시각
 * @returns 그날 0시(UTC)
 */
function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

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

  // 구간 경계를 UTC 하루 단위로 스냅한다.
  //
  // 서버는 (member, client, period_start)로 upsert 하는데, 경계가 실행 시각이면
  // 초 단위로 매번 달라져 키가 절대 일치하지 않는다 — 하루에 두 번 돌리면 행이
  // 두 벌 쌓인다. 하루로 스냅하면 같은 날 몇 번을 돌려도 같은 행을 갱신한다.
  //
  // end는 오늘 0시가 아니라 내일 0시다. 오늘 0시로 잡으면 오늘 쓴 양이 통째로 빠진다.
  const end = new Date(startOfUtcDay(new Date()).getTime() + 86_400_000)
  const start = new Date(end.getTime() - opts.days * 86_400_000)
  const window = { start, end }

  const collected = await Promise.all([collectClaudeCode(window), collectCodex(window)])
  const records = collected.filter((record): record is UsageRecord => record !== null)

  // --dry-run은 무엇을 보낼지 확인하는 용도라 인증도, 결과가 비었는지도 따지지 않는다
  if (opts.dryRun) {
    jsonOut({ records })
    return
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

  if (records.length === 0) {
    info('No local usage found for the period. Collector status reported.')
  }

  jsonOut(result.data)
}
