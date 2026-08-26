/**
 * 사용량 수집기 공용 타입
 *
 * `UsageRecord`는 서버 수신 계약(`packages/lib/src/features/ax/usage-report.ts`의
 * `AxUsageReportRecord`)과 같은 모양이어야 한다. aitk는 npm에 단독 배포되는 CLI라
 * 워크스페이스 패키지를 런타임 의존성으로 끌어올 수 없어 타입을 여기 둔다.
 * 사본이 조용히 낡는 것은 `tests/contract.test.ts`가 막는다. 그 테스트는 타입을 비교하지 않고
 * 이 CLI가 실제로 전송하는 payload를 가로채 서버의 진짜 `validateUsageReport`에 넣는다.
 */

/** 사용량을 보고하는 클라이언트 */
export type UsageClient = 'claude-code' | 'codex'

/** 클라이언트 하나의 집계 한 건 */
export interface UsageRecord {
  client: UsageClient
  /** 클라이언트가 보고한 원시 티어 문자열 (예: default_claude_max_20x, prolite) */
  planRaw: string | null
  /** 사람이 읽는 플랜명 */
  plan: string | null
  /** 집계 구간 시작 (ISO 8601) */
  periodStart: string
  /** 집계 구간 끝 (ISO 8601) */
  periodEnd: string
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  sessions: number
  /** 모델명 → 토큰 수 */
  models: Record<string, number>
  /** 주간 한도 사용률 (0~100). 최신 한도 스냅샷을 수집하지 못하면 null */
  limitUsedPercent: number | null
  /** 한도 리셋 시각 (ISO 8601). 없으면 null */
  limitResetsAt: string | null
}

/** 집계 구간 */
export interface UsageWindow {
  /** 포함되는 구간 시작 */
  start: Date
  /** 포함되지 않는 구간 끝. 인접 구간은 [start, end)로 이어 붙인다 */
  end: Date
}
