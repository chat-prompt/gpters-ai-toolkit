/**
 * 어떤 크론이 얼마 만에 한 번 돌아야 하는지 — 감시의 기준선.
 *
 * `vercel.json`은 "언제 부를지"만 말하고 "안 불렸다"를 말해주지 않는다. 그래서 기대 주기를
 * 여기에 따로 적고, 실제 실행 기록(`cron_runs`)과 대조해 침묵을 잡아낸다.
 *
 * ## 산출량 0을 언제 문제로 볼지도 잡별로 다르다
 *
 * 커뮤니티 스킬 임포트는 "성공했는데 0건"이 6개월 이어졌는데 아무도 몰랐다. 반면
 * `redact-skill-text`는 지울 게 없으면 0이 정상이다. 그래서 0을 세는 키(`outputKeys`)를
 * 잡마다 정하고, 그 키가 없으면 산출량을 감시하지 않는다.
 */

/** 감시 대상 크론 하나의 기대치 */
export interface CronExpectation {
  /** `vercel.json` 경로에서 딴 이름 */
  jobName: string
  /** 사람이 읽을 설명 */
  label: string
  /**
   * 이 시간(시) 안에 성공한 실행이 한 번은 있어야 한다.
   *
   * 스케줄 주기에 여유를 더한 값이다 — 배포 중 한 번 건너뛰는 것으로 알림이 오면 안 된다.
   */
  maxSilentHours: number
  /**
   * 산출량으로 볼 `stats` 키들. 전부 0인 실행이 연속되면 의심한다.
   *
   * 비워 두면 산출량을 감시하지 않는다 (0이 정상인 잡).
   */
  outputKeys: string[]
  /**
   * 산출량 0이 이만큼 연속되면 알린다. `outputKeys`가 비어 있으면 무시된다.
   */
  zeroStreakLimit: number
}

/**
 * 운영에 등록된 크론과 기대치.
 *
 * `vercel.json`의 crons와 짝이 맞아야 한다 — 어긋나면 테스트가 잡는다.
 */
export const CRON_EXPECTATIONS: CronExpectation[] = [
  {
    jobName: 'finalize-sessions',
    label: 'MCP 세션 마감·정리',
    // 매일 03:00 UTC
    maxSilentHours: 30,
    // 마감할 세션이 하루도 없으면 팀이 아무도 안 썼다는 뜻이라 그것도 알 만하다
    outputKeys: ['finalized'],
    zeroStreakLimit: 3,
  },
  {
    jobName: 'redact-skill-text',
    label: '자유 텍스트 90일 보관 기한',
    // 매일 03:20 UTC
    maxSilentHours: 30,
    // 지울 게 없는 날이 정상이다 — 산출량을 감시하지 않는다
    outputKeys: [],
    zeroStreakLimit: 0,
  },
  {
    jobName: 'catalog-health-snapshot',
    label: '카탈로그 위생 스냅숏',
    // 매일 04:20 UTC
    maxSilentHours: 30,
    // 카탈로그가 비어 있을 리 없으므로 0이면 뭔가 잘못된 것이다
    outputKeys: ['totalItems'],
    zeroStreakLimit: 1,
  },
  {
    jobName: 'sync-model-docs',
    label: 'AI 모델 문서 동기화',
    // 매일 17:00 UTC
    maxSilentHours: 30,
    outputKeys: [],
    zeroStreakLimit: 0,
  },
  {
    jobName: 'popular-skills',
    label: '주간 인기 스킬 알림',
    // 월요일 01:00 UTC
    maxSilentHours: 8 * 24,
    // 적용이 0인 주가 있을 수 있다 — 팀이 안 쓴 것이지 잡이 고장난 것이 아니다
    outputKeys: [],
    zeroStreakLimit: 0,
  },
  {
    jobName: 'account-audit',
    label: '계정 점검 (휴면·반쪽 정지·이름 중복)',
    // 매일 05:30 UTC
    maxSilentHours: 30,
    // 문제가 0인 날이 정상이다 — 산출량을 감시하지 않는다
    outputKeys: [],
    zeroStreakLimit: 0,
  },
  {
    jobName: 'weekly-report',
    label: '주간·월간 리포트',
    // 월요일 00:00 UTC + 매월 1일. 주간 쪽 기준으로 여유를 둔다
    maxSilentHours: 8 * 24,
    outputKeys: [],
    zeroStreakLimit: 0,
  },
]

/**
 * 이름으로 기대치를 찾는다.
 *
 * @param jobName - 크론 잡 이름
 * @returns 등록된 기대치. 없으면 undefined
 */
export function findCronExpectation(jobName: string): CronExpectation | undefined {
  return CRON_EXPECTATIONS.find((entry) => entry.jobName === jobName)
}

/** Separate operator-DM watchdog; do not send these failures to the shared cron webhook. */
export const INDEPENDENTLY_WATCHED_CRONS = [{jobName:'agent-monitor',watchdog:'infra/agent-observability/watch-monitor.ts'}] as const
