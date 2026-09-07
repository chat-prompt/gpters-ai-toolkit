/**
 * 운영 장치 — 크론 실행 기록과 감시.
 *
 * 지표(`features/ax`)가 "무슨 일이 일어났나"를 말한다면, 여기는 **"우리 장치가 살아 있나"**를 말한다.
 */

export {
  runCronJob,
  type CronOutcome,
  type CronRunResult,
  type CronStats,
} from './cron-run-log'

export {
  CRON_EXPECTATIONS,
  findCronExpectation,
  type CronExpectation,
} from './cron-registry'

export {
  checkCronHealth,
  cleanupCronRuns,
  countZeroStreak,
  diagnose,
  type CronHealthIssue,
  type CronHealthReport,
} from './cron-health'
