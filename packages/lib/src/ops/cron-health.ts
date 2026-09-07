/**
 * 크론 감시 — 조용히 죽은 잡과 조용히 아무것도 안 하는 잡을 찾는다.
 *
 * 실패는 `runCronJob`이 그 자리에서 알린다. 여기서 잡는 것은 **알림조차 못 보내는 실패**다.
 *
 * - 잡이 아예 안 불렸다 (라우트 404, 크론 등록 누락, 배포 사고) → 실행 기록 자체가 없다
 * - 잡이 성공하는데 산출이 계속 0이다 (커뮤니티 임포트가 6개월간 그랬다)
 *
 * 판정은 실측만 쓴다. 기록이 없으면 "0건 처리"가 아니라 **"실행 기록 없음"**이라고 말한다 —
 * 미관측과 0을 같은 말로 쓰지 않는다.
 */

import { cronRuns, db } from '@gpters/db'
import { and, desc, eq, sql } from 'drizzle-orm'
import { createLogger } from '../core/logger'
import { CRON_EXPECTATIONS, type CronExpectation } from './cron-registry'

const log = createLogger('cron-health')

/** 산출량 연속 0을 볼 때 최대 몇 회차까지 거슬러 보는가 */
const STREAK_LOOKBACK = 10

/** 잡 하나의 진단 */
export interface CronHealthIssue {
  jobName: string
  label: string
  /** `never` 한 번도 기록 없음 · `silent` 최근 성공이 없음 · `zero_output` 산출 연속 0 */
  kind: 'never' | 'silent' | 'zero_output'
  /** 사람이 읽을 한 줄 */
  detail: string
}

/** 감시 결과 */
export interface CronHealthReport {
  checkedAt: string
  /** 감시 대상 잡 수 */
  checked: number
  /** 실행 기록을 처음 남긴 시각. 짧으면 판정을 보류한 잡이 있다는 뜻이다 */
  observingSince: string | null
  issues: CronHealthIssue[]
}

/** 한 잡의 최근 실행 요약 */
export interface JobObservation {
  lastSuccessAt: Date | null
  /** 최근 것부터의 성공 실행들 (최대 STREAK_LOOKBACK) */
  recentSuccessStats: Array<Record<string, number>>
}

/**
 * 잡 하나의 최근 실행을 읽는다.
 *
 * @param jobName - 크론 잡 이름
 * @returns 마지막 성공 시각과 최근 성공들의 산출량
 */
async function observe(jobName: string): Promise<JobObservation> {
  const rows = await db
    .select({ startedAt: cronRuns.startedAt, stats: cronRuns.stats })
    .from(cronRuns)
    .where(and(eq(cronRuns.jobName, jobName), eq(cronRuns.status, 'success')))
    .orderBy(desc(cronRuns.startedAt))
    .limit(STREAK_LOOKBACK)

  return {
    lastSuccessAt: rows[0] ? new Date(rows[0].startedAt) : null,
    recentSuccessStats: rows.map((row) => row.stats ?? {}),
  }
}

/**
 * 실행 기록을 처음 남긴 시각.
 *
 * "기록이 없다"가 잡의 문제인지 우리가 아직 안 본 것인지 가르는 기준이다.
 *
 * @returns 가장 오래된 실행 기록의 시각. 기록이 하나도 없으면 null
 */
async function readObservationStart(): Promise<Date | null> {
  const [row] = await db
    .select({ startedAt: cronRuns.startedAt })
    .from(cronRuns)
    .orderBy(cronRuns.startedAt)
    .limit(1)
  return row ? new Date(row.startedAt) : null
}

/**
 * 산출량이 연속으로 0인 회차를 센다.
 *
 * @param stats - 최근 것부터 정렬된 성공 실행들의 산출량
 * @param keys - 산출량으로 볼 키들
 * @returns 최근부터 이어지는 0 회차 수
 */
export function countZeroStreak(
  stats: Array<Record<string, number>>,
  keys: string[]
): number {
  if (keys.length === 0) return 0
  let streak = 0
  for (const entry of stats) {
    const total = keys.reduce((sum, key) => sum + Number(entry[key] ?? 0), 0)
    if (total !== 0) break
    streak += 1
  }
  return streak
}

/**
 * 관측값 하나를 기대치와 대조해 문제를 판정한다.
 *
 * 순수 함수라 테스트에서 DB 없이 검증한다.
 *
 * ## 관측을 시작한 지 얼마 안 됐으면 판정하지 않는다
 *
 * 기록 자체가 방금 시작됐으면 "기록이 없다"는 잡의 상태가 아니라 **우리가 아직 안 봤다**는 뜻이다.
 * 그 둘을 같게 다루면 표를 만든 다음 날 아침에 모든 잡이 빨갛게 뜬다. 주간 잡은 일주일 내내
 * 그렇게 뜬다. 첫 알림이 전부 오탐이면 그 뒤로 아무도 안 읽는다.
 *
 * 미관측과 0을 구분하는 원칙을 **감시 장치 자신에게도** 적용한 것이다.
 *
 * @param expectation - 이 잡의 기대치
 * @param observation - 실제로 관측한 최근 실행
 * @param now - 판정 기준 시각
 * @param observationStart - 실행 기록을 처음 남긴 시각. 없으면 아직 아무것도 관측하지 못했다
 * @returns 문제. 없으면 null
 */
export function diagnose(
  expectation: CronExpectation,
  observation: JobObservation,
  now: Date,
  observationStart: Date | null
): CronHealthIssue | null {
  const base = { jobName: expectation.jobName, label: expectation.label }

  // 이 잡이 한 번은 돌았어야 할 만큼 지켜봤는가
  const watchedHours = observationStart === null
    ? 0
    : (now.getTime() - observationStart.getTime()) / 3_600_000
  const watchedLongEnough = watchedHours >= expectation.maxSilentHours

  if (observation.lastSuccessAt === null) {
    if (!watchedLongEnough) return null
    return {
      ...base,
      kind: 'never',
      detail: `기록을 남기기 시작한 ${Math.floor(watchedHours)}시간 동안 성공한 실행이 없다`,
    }
  }

  const silentHours = (now.getTime() - observation.lastSuccessAt.getTime()) / 3_600_000
  if (silentHours > expectation.maxSilentHours) {
    return {
      ...base,
      kind: 'silent',
      detail: `마지막 성공이 ${Math.floor(silentHours)}시간 전이다 (기대 ${expectation.maxSilentHours}시간 이내)`,
    }
  }

  if (expectation.outputKeys.length > 0) {
    const streak = countZeroStreak(observation.recentSuccessStats, expectation.outputKeys)
    if (streak >= expectation.zeroStreakLimit && expectation.zeroStreakLimit > 0) {
      return {
        ...base,
        kind: 'zero_output',
        detail: `성공했지만 ${expectation.outputKeys.join('·')}가 ${streak}회 연속 0이다`,
      }
    }
  }

  return null
}

/**
 * 등록된 크론 전부를 감시한다.
 *
 * @param now - 판정 기준 시각 (기본 현재)
 * @returns 발견한 문제들
 */
export async function checkCronHealth(now = new Date()): Promise<CronHealthReport> {
  const observationStart = await readObservationStart()
  const issues: CronHealthIssue[] = []
  for (const expectation of CRON_EXPECTATIONS) {
    const observation = await observe(expectation.jobName)
    const issue = diagnose(expectation, observation, now, observationStart)
    if (issue) issues.push(issue)
  }

  log.info('Checked cron health', { checked: CRON_EXPECTATIONS.length, issues: issues.length })
  return {
    checkedAt: now.toISOString(),
    checked: CRON_EXPECTATIONS.length,
    observingSince: observationStart?.toISOString() ?? null,
    issues,
  }
}

/**
 * 오래된 실행 기록을 지운다.
 *
 * 감시에 필요한 것은 최근 몇 회차뿐이라 무한히 쌓아둘 이유가 없다.
 *
 * @param retentionDays - 보관 기간(일)
 * @returns 지운 행 수
 */
export async function cleanupCronRuns(retentionDays = 90): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  const result = await db.delete(cronRuns).where(sql`${cronRuns.startedAt} < ${cutoff}`)
  return Number((result as unknown as { rowCount?: number })?.rowCount ?? 0)
}

