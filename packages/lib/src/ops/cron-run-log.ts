/**
 * 크론 실행을 감싸 기록하고, 실패하면 그 자리에서 알린다.
 *
 * 크론 라우트마다 흩어져 있던 try/catch를 하나로 모은다. 라우트는 "무엇을 하는지"만 쓰고
 * 인증·기록·알림은 여기가 맡는다.
 *
 * ## 기록이 실패해도 잡은 성공시킨다
 *
 * 실행 기록은 감시 장치지 잡의 목적이 아니다. `cron_runs` 삽입이 실패했다고 스냅숏이나
 * 세션 마감을 실패로 만들면 감시하려다 본체를 망가뜨린다. 그래서 기록·알림 실패는 삼킨다.
 */

import { cronRuns, db } from '@gpters/db'
import { createLogger } from '../core/logger'
import { notifySlackCronFailure } from '../notifications/slack'

const log = createLogger('cron-run-log')

/** 잡이 무엇을 했는지 — 전부 숫자여야 산출량 감시에 쓸 수 있다 */
export type CronStats = Record<string, number>

/** 잡 본문이 돌려주는 것 */
export interface CronOutcome {
  /** 실행 기록과 응답에 함께 담는 산출량 */
  stats: CronStats
  /** 응답 본문에 덧붙일 값 (선택) */
  body?: Record<string, unknown>
}

/** 감싼 실행의 결과 */
export interface CronRunResult {
  ok: boolean
  jobName: string
  stats: CronStats
  durationMs: number
  error?: string
  body?: Record<string, unknown>
}

/**
 * 실행 한 건을 기록한다. 실패해도 던지지 않는다.
 *
 * @param row - 남길 실행 기록
 */
async function record(row: {
  jobName: string
  startedAt: Date
  finishedAt: Date
  status: 'success' | 'failure'
  stats: CronStats
  error?: string
}): Promise<void> {
  try {
    await db.insert(cronRuns).values({
      jobName: row.jobName,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      durationMs: row.finishedAt.getTime() - row.startedAt.getTime(),
      status: row.status,
      stats: row.stats,
      error: row.error ?? null,
    })
  } catch (error) {
    // 기록 실패로 잡을 실패시키지 않는다
    log.error('Failed to record cron run', { jobName: row.jobName, error })
  }
}

/**
 * 크론 잡 본문을 실행하고 결과를 기록한다.
 *
 * 실패하면 기록에 남기고 Slack으로 알린 뒤, 던지지 않고 `ok: false`로 돌려준다 —
 * 라우트가 상태 코드를 정하게 한다.
 *
 * @param jobName - `vercel.json` 경로에서 딴 잡 이름
 * @param handler - 실제로 할 일. 산출량을 숫자로 돌려준다
 * @returns 성공 여부와 산출량
 */
export async function runCronJob(
  jobName: string,
  handler: () => Promise<CronOutcome>
): Promise<CronRunResult> {
  const startedAt = new Date()
  try {
    const outcome = await handler()
    const finishedAt = new Date()
    await record({ jobName, startedAt, finishedAt, status: 'success', stats: outcome.stats })
    log.info('Cron job finished', { jobName, ...outcome.stats })
    return {
      ok: true,
      jobName,
      stats: outcome.stats,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      body: outcome.body,
    }
  } catch (error) {
    const finishedAt = new Date()
    const message = error instanceof Error ? error.message : 'Unknown error'
    await record({ jobName, startedAt, finishedAt, status: 'failure', stats: {}, error: message })
    log.error('Cron job failed', { jobName, error: message })
    // 알림이 실패해도 라우트 응답은 그대로 간다
    await notifySlackCronFailure({ jobName, error: message }).catch(() => undefined)
    return {
      ok: false,
      jobName,
      stats: {},
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      error: message,
    }
  }
}
