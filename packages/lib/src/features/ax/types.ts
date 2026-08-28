/**
 * AX Dashboard — 공용 타입
 *
 * 사내 AX 대시보드는 "패널(panel)" 단위로 구성된다.
 * 패널 하나 = 데이터 소스 하나 (스킬 사용량, Vercel 배포, 구독 …).
 * 새 지표를 붙이려면 패널 모듈 하나를 만들고 registry에 한 줄 등록하면 된다.
 */

/**
 * 패널 공개 범위
 * - `org`: 로그인한 내부 조직 구성원 전원
 * - `admin`: 관리자 전용 (개인 식별 데이터가 포함된 패널)
 */
export type AxPanelVisibility = 'org' | 'admin'

/** 패널 상태 — 데이터 소스가 아직 연결되지 않은 경우를 1급 상태로 다룬다 */
export type AxPanelStatus = 'ok' | 'not_configured' | 'error'

/** 패널 메타데이터 (목록 조회 시 데이터 없이 이것만 내려간다) */
export interface AxPanelMeta {
  /** URL·레지스트리 키. kebab-case */
  id: string
  /** 화면에서는 이 최상위 패널 아래의 보조 보기로 묶는다 */
  parentId?: string
  /** 화면에 보이는 제목 */
  title: string
  /** 한 줄 설명 */
  description: string
  /** 데이터 출처 표기 (예: "aitk DB", "Vercel API") */
  source: string
  visibility: AxPanelVisibility
  /**
   * 화면 상단의 기간 선택이 이 패널에 적용되는지.
   * false면 항상 현재 시점 스냅숏이며, 화면은 그 사실을 표시해야 한다.
   */
  usesPeriod: boolean
}

/** 패널 로딩 컨텍스트 */
export interface AxPanelContext {
  /** 조회 기간(일). 기간 개념이 없는 패널은 무시한다 */
  days: number
  /**
   * 요청자가 관리자인지.
   * 개인 식별 데이터(팀원별 구독 등)를 내려줄지 가르는 유일한 기준.
   */
  isAdmin: boolean
  /** 관리자가 외부 소스 캐시를 우회해 다시 계산하도록 요청했는지 */
  forceRefresh?: boolean
}

/**
 * 화면 맨 위 요약 밴드에 올릴 핵심 수치
 *
 * 패널이 자기 데이터에서 "한 줄로 말할 수 있는 숫자"를 직접 골라 올린다.
 * 껍데기가 패널 데이터 구조를 알 필요가 없어, 새 패널도 한 줄만 더하면 밴드에 낀다.
 */
export interface AxPanelHighlight {
  /** 지표 이름 (예: "월 구독 비용") */
  label: string
  /** 이미 사람이 읽는 형태로 만든 값 (예: "US$2,220") */
  value: string
  /** 값 옆에 붙는 짧은 보조 설명 (예: "17건") */
  hint?: string
  /**
   * 상단 기간 선택(7/30/90일)에 따라 값이 변하는 지표인지.
   * 화면은 이 값으로 밴드를 "기간 연동"과 "현재 시점 스냅샷" 두 층으로 나눈다.
   * 생략하면 스냅샷으로 취급한다.
   */
  periodLinked?: boolean
}

/** 패널 로딩 결과 */
export interface AxPanelResult<T = unknown> {
  meta: AxPanelMeta
  status: AxPanelStatus
  /** status가 ok가 아닐 때 화면에 보여줄 이유 (설정 누락 안내 등) */
  message?: string
  data: T | null
  /** 요약 밴드에 올릴 수치. 없으면 밴드에 나가지 않는다 */
  highlights?: AxPanelHighlight[]
  /** ISO 8601 */
  generatedAt: string
}

/** 패널 구현체 */
export interface AxPanel<T = unknown> {
  meta: AxPanelMeta
  load(ctx: AxPanelContext): Promise<AxPanelResult<T>>
}

// ============================================
// 패널별 데이터 타입
// ============================================

/** 사용자별 사용량 한 줄 (관리자에게만 내려간다) */
export interface AxOverviewMemberRow {
  /** 계정 표시 이름. 프로필에 이름이 없으면 "이름 미설정" */
  name: string
  /** 기간 내 스킬 이벤트 수 */
  events: number
  /** 그중 실제 적용(apply) 수 */
  applied: number
  /** 마지막 활동 시각 (ISO 8601) */
  lastActiveAt: string | null
}

/** 성과 요약 패널 — 실제로 계측되는 지표만 담는다 */
export interface AxOverviewData {
  /**
   * 누적 참여 인원 — 스킬 이벤트를 한 번이라도 남긴 계정 수.
   * 계정이 식별된 사용자만 센다 — 익명 세션은 "인원"에 넣지 않는다.
   * (기간별 활성 인원은 스킬 사용량 패널의 activeUsers가 담당한다)
   */
  totalParticipants: number
  /** aitk 카탈로그에 발행된 팀 스킬(사람용) 수 — 현재 시점 인벤토리 */
  catalogSkills: number
  /**
   * 잔디밭용 일별 활동량 — 조회 기간과 무관하게 **오늘 포함 최근 365일 고정 윈도우**.
   * 날짜가 지나면 창이 최신 쪽으로 굴러간다.
   */
  grassDaily: Array<{ date: string; events: number }>
  /** 일자별 활성 인원 추이 (조회 기간) */
  dailyActiveUsers: Array<{ date: string; users: number }>
  /** 시간대별 활성 인원 — KST 기준 0~23시 (조회 기간) */
  hourlyDensity: Array<{ hour: number; users: number }>
  /**
   * 사용자별 사용량 (조회 기간, 사용량 내림차순).
   * 개인 식별 데이터이므로 관리자에게만 채워지고 그 외에는 null.
   */
  memberUsage: AxOverviewMemberRow[] | null
  /**
   * 아직 계측하지 않는 지표와 그 이유.
   * 0이나 추정값으로 꾸미는 대신 미계측 상태를 화면에 그대로 밝힌다.
   */
  unmeasured: Array<{ label: string; reason: string }>
}

/** 에이전트 스킬 저장소의 스킬 한 개 */
export interface AxSharedSkillRow {
  /** 디렉터리 이름 = 스킬 id */
  id: string
  /** 저장소 내 경로 */
  path: string
  /** SKILL.md 문서가 있는지 — 없으면 스킬 규격 미준수 후보 */
  hasSkillDoc: boolean
  /**
   * 같은 id의 스킬이 aitk 카탈로그(팀 스킬)에도 등록돼 있는지.
   * 표시용 마킹일 뿐, 두 소스의 수치를 합산하는 근거로 쓰지 않는다.
   */
  inAitk: boolean
}

/** 에이전트 스킬 패널이 내려주는 인벤토리 */
export interface AxSharedSkillsData {
  /** 조회한 저장소 (owner/repo) */
  repo: string
  skills: AxSharedSkillRow[]
  /**
   * aitk 카탈로그와 id가 겹치는 스킬 수.
   * 카탈로그 조회에 실패해 겹침을 판정하지 못했으면 null (0으로 꾸미지 않는다)
   */
  aitkOverlap: number | null
  /**
   * 저장소 일별 커밋 수 — 오늘 포함 최근 365일 (GitHub 통계 API).
   *
   * 에이전트 활동의 **프록시**다: 에이전트들이 워크로그·산출물을 이 저장소에
   * 커밋하므로 활동 리듬은 보이지만, "스킬 실행 횟수"는 아니다(그건 DEV-4221).
   * 통계가 아직 계산 중(202)이거나 조회 실패면 null — 0으로 꾸미지 않는다.
   */
  commitDaily: Array<{ date: string; events: number }> | null
  /**
   * 실행 이벤트 수집 연결 여부.
   * 아직 인벤토리만 있고 사용량은 미연결이므로 화면이 이 사실을 명시해야 한다.
   */
  eventsConnected: boolean
  /** GitHub tree 응답이 잘렸는지 — true면 목록이 일부일 수 있다 */
  truncated: boolean
}

/** 스킬 비교 패널 — 이름 같은 쌍의 내용 판정 한 줄 */
export interface AxSkillDiffRow {
  /** 양쪽에서 같은 스킬 id */
  id: string
  /**
   * 정규화된 내용의 문자 3-그램 자카드 유사도 (0~1).
   * 내용 동일이면 1. 비교 문서를 못 가져왔으면 null
   */
  similarity: number | null
  /** aitk 쪽 정규화 본문 길이 */
  aitkLength: number
  /** 에이전트 쪽 정규화 본문 길이 */
  agentLength: number
}

/** 스킬 비교 패널이 내려주는 대조 결과 */
export interface AxSkillDiffData {
  /** 비교 결과의 재현 가능한 기준과 계산 시각 */
  freshness: {
    comparedAt: string
    agentCommitSha: string
    aitkFingerprint: string
  }
  /** 비교 기준 — 팀 스킬 수 / 에이전트 스킬 수 / 실제 문서 비교 수 */
  basis: { aitkSkills: number; agentSkills: number; comparedDocs: number }
  /** 이름 같고 내용도 동일 (정규화 후 완전 일치) */
  identical: AxSkillDiffRow[]
  /** 이름 같고 내용 유사 — 드리프트된 같은 스킬로 추정 */
  similar: AxSkillDiffRow[]
  /** 이름은 같지만 내용이 실질적으로 다름 — 동명이인 스킬 */
  different: AxSkillDiffRow[]
  /** 이름은 다른데 정규화 내용이 완전히 같은 쌍 */
  crossMatches: Array<{ aitkId: string; agentId: string }>
  /** SKILL.md를 가져오지 못해 판정 불가였던 스킬 수 */
  fetchFailures: number
}

/** 스킬 사용량 패널 */
export interface AxSkillUsageRow {
  skillId: string
  /** 카탈로그에 있으면 표시명, 없으면 skillId */
  name: string
  searched: number
  loaded: number
  applied: number
  skipped: number
  deployed: number
  /** 해당 스킬을 사용한 고유 사용자 수 */
  users: number
  /** ISO 8601, 이벤트가 없으면 null */
  lastUsedAt: string | null
}

/** 스킬 사용량 패널이 내려주는 집계 (카탈로그에 등록된 스킬 기준) */
export interface AxSkillUsageData {
  /** 기간 내 전체 스킬 이벤트 수 */
  totalEvents: number
  /** 기간 내 실제 사용(load/apply) 이벤트 수 */
  meaningfulUses: number
  /** 기간 내 실제 사용(load/apply)을 남긴 고유 사용자 수 */
  activeUsers: number
  /** 실제 사용(load/apply)이 발생한 세션 수 */
  sessions: number
  /** 검색·로드·적용 등 행동별 이벤트 수 */
  actionTotals: Record<'search' | 'load' | 'apply' | 'skip' | 'deploy', number>
  /** 사용량 상위 스킬 (loaded+applied 기준 내림차순) */
  skills: AxSkillUsageRow[]
  /** 일자별 이벤트 추이 */
  daily: Array<{ date: string; events: number }>
  /** 카탈로그에는 있으나 기간 내 load/apply가 0인 스킬의 전체 수 */
  totalUnusedSkills: number
  /** 정리 우선순위 상위 미사용 스킬 */
  unusedSkills: Array<{
    id: string
    name: string
    lastUsedAt: string | null
    usageSessions: number
  }>
}

/** 개선 인사이트 — 검색어 또는 자유 입력 사유의 동일 문구 묶음 */
export interface AxInsightPhraseRow {
  text: string
  count: number
}

/** 로드 이후 결과 보고 상태를 스킬별로 집계한 한 줄 */
export interface AxSkillOutcomeRow {
  skillId: string
  name: string
  loadedPairs: number
  appliedPairs: number
  notAppliedPairs: number
  unreportedPairs: number
  outcomeCoverageRate: number | null
}

/** 검색 후보가 상세 확인과 적용 판단 기록으로 이어지는 흐름 및 실행 건강도. */
export interface AxJourneyInsightsData {
  exploration: {
    observedSearches: number
    unobservedSearches: number
    zeroResultSearches: number
    zeroResultRate: number | null
    totalExposures: number
    exposedPairs: number
    loadedFromSearchPairs: number
    appliedFromSearchPairs: number
    notAppliedFromSearchPairs: number
    unreportedFromSearchPairs: number
    searchToLoadRate: number | null
    loadToDecisionRate: number | null
    sampleIsSignificant: boolean
  }
  zeroResultQueries: Array<AxInsightPhraseRow & { lastSeenAt: string | null }>
  execution: {
    attempts: number
    startedAttempts: number
    completedAttempts: number
    inProgressAttempts: number
    unreportedAttempts: number
    completionWithoutStart: number
    missingVersion: number
    unvalidatedCompleted: number
    averageDurationSeconds: number | null
    success: number
    partial: number
    failed: number
    abandoned: number
    verifiedAttempts: number
    verifiedSuccesses: number
    verifiedSuccessRate: number | null
    selfReportedSuccessRate: number | null
    agents: Array<{
      agentId: string
      runtime: string
      attempts: number
      completed: number
      success: number
      partial: number
      failed: number
      abandoned: number
      inProgress: number
      unreported: number
      verifiedAttempts: number
      verifiedSuccessRate: number | null
      lastReportedAt: string | null
    }>
  } | null
  outcomes: {
    loadedPairs: number
    appliedPairs: number
    notAppliedPairs: number
    unreportedPairs: number
    outcomeCoverageRate: number | null
    confirmedApplyRate: number | null
  }
  skillOutcomes: AxSkillOutcomeRow[]
  searchSkipReasons: AxInsightPhraseRow[]
  notAppliedReasons: AxInsightPhraseRow[]
}

/** Vercel 배포 사이트 패널 */
export interface AxVercelProject {
  id: string
  name: string
  framework: string | null
  /** 프로덕션 도메인 (커스텀 도메인 우선). 없으면 null */
  productionUrl: string | null
  /** 마지막 프로덕션 배포 시각 (ISO 8601) */
  lastDeployedAt: string | null
  /** READY / ERROR / BUILDING … */
  lastDeploymentState: string | null
}

/** 배포 사이트 패널이 내려주는 프로젝트 목록 */
export interface AxVercelData {
  /** 조회한 팀 식별자 (환경변수로 지정) */
  team: string | null
  projects: AxVercelProject[]
}

/** 팀원별 구독 패널 */
export interface AxSubscriptionVendorRow {
  vendor: string
  /** 좌석(구독 건) 수 */
  seats: number
  /** 통화별 월 환산 금액. 환율 환산은 하지 않는다 */
  monthlyByCurrency: Record<string, number>
}

/**
 * 팀원별 구독 한 줄 (관리자에게만 내려간다)
 *
 * 이메일은 담지 않는다. 이 화면에 필요한 건 "누구의 구독인가"이지 연락처가 아니다.
 */
export interface AxSubscriptionMemberRow {
  ownerName: string | null
  vendor: string
  plan: string
  amount: number
  currency: string
  billingCycle: 'monthly' | 'yearly'
  /** 매월 결제일 (1~31) */
  renewalDay: number | null
  /** 결제 주체 — "본인" 또는 대신 결제하는 사람 이름 */
  payer: string | null
  status: 'active' | 'canceled'
}

/** AI 코딩 클라이언트 종류 */
export type AxUsageClient = 'claude-code' | 'codex'

/**
 * 클라이언트별 사용량 집계 한 줄
 *
 * `reportsLimit`이 false면 그 클라이언트는 한도를 로컬에 남기지 않는다는 뜻이다.
 * 화면은 이 값을 보고 "데이터 없음(오류)"과 "원래 안 주는 값"을 구분해야 한다.
 */
export interface AxClientUsageClientRow {
  client: AxUsageClient
  /** 이 클라이언트를 쓴 사람 수 */
  members: number
  totalTokens: number
  sessions: number
  /** 이 클라이언트가 주간 한도 사용률을 보고하는지 */
  reportsLimit: boolean
  /** 한도를 보고한 사람들의 평균 사용률. reportsLimit이 false면 null */
  avgLimitUsedPercent: number | null
}

/**
 * 팀원별 사용량 한 줄 (관리자에게만 내려간다)
 *
 * 구독 패널과 같은 이유로 이메일은 담지 않는다.
 */
export interface AxClientUsageMemberRow {
  /** 인증 사용자 ID. 마이그레이션 전 행은 null일 수 있다 */
  userId: string | null
  memberName: string
  client: AxUsageClient
  plan: string | null
  totalTokens: number
  sessions: number
  /** 주간 한도 사용률. 클라이언트가 보고하지 않으면 null */
  limitUsedPercent: number | null
  /** 한도 리셋 시각 (ISO 8601) */
  limitResetsAt: string | null
  /** 이 레코드가 서버에 마지막으로 보고된 시각 (ISO 8601) */
  lastReportedAt: string | null
}

/** 관리자용 사용자별 수집 참여 상태 */
export type AxUsageParticipationStatus =
  | 'not_using'
  | 'not_installed'
  | 'not_approved'
  | 'stale'
  | 'reporting'

/** 내부 계정 한 명의 수집 참여 상태. 이메일은 포함하지 않는다. */
export interface AxUsageParticipationRow {
  userId: string
  memberName: string
  status: AxUsageParticipationStatus
  lastReportedAt: string | null
  lastLoginAt: string | null
  clients: AxUsageClient[]
  source: 'collector' | 'usage_report' | 'legacy_usage' | 'authorization' | 'none'
}

/** 클라이언트 사용량 패널이 내려주는 집계 */
export interface AxClientUsageData {
  /** 수집기가 마지막으로 보낸 시각 (ISO 8601) */
  syncedAt: string | null
  /**
   * 집계 구간 (ISO 8601). 사람마다 보고일이 달라 구간이 조금씩 다르므로
   * 포함된 보고 전체를 덮는 범위(min~max)다
   */
  periodStart: string | null
  periodEnd: string | null
  /**
   * 최근 창 안에 사용량을 보고한 인원 수 — 참여율의 분자.
   * 수집기 표시명(memberName) 기준이라 계정 수 기반 분모와는 근사 비교다
   */
  reportingMembers: number
  /**
   * 내부 도메인 계정 수 — 참여율의 분모.
   * `INTERNAL_ORGANIZATION_DOMAIN`이 설정되지 않았으면 null (분모를 꾸며내지 않는다)
   */
  internalMembers: number | null
  totalTokens: number
  byClient: AxClientUsageClientRow[]
  /** 모델별 토큰 사용량 (내림차순) */
  byModel: Array<{ model: string; tokens: number }>
  /** 팀원별 상세. 관리자에게만 채워지고 그 외에는 null */
  members: AxClientUsageMemberRow[] | null
  /** 내부 계정 전원의 수집 참여 상태. 관리자에게만 채워지고 그 외에는 null */
  participation: AxUsageParticipationRow[] | null
}

/** 에이전트 텔레메트리 소스. */
export type AxAgentTelemetrySource = 'openclaw' | 'claude-code' | 'codex' | 'hermes'

/** thinking은 output의 부분집합일 수 있으므로 합산 시 관계 필드를 반드시 확인한다. */
export interface AxAgentTokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  thinkingTokens: number
  thinkingTokensRelation: 'included-in-output' | 'separate-from-output' | 'unknown'
}

export interface AxAgentReporterRow {
  agentId: string
  source: AxAgentTelemetrySource
  collectorId: string | null
  managed: boolean
  intervalSeconds: number | null
  lastCollectedAt: string | null
  freshnessHours: number | null
  freshness: 'fresh' | 'stale' | 'waiting'
  healthStatus: 'healthy' | 'blocked' | 'unknown'
  sessions: number
  turns: number
  usage: AxAgentTokenUsage
  toolCalls: number
  toolFailures: number
  healthWarnings: string[]
}

export interface AxAgentSourceCoverageRow {
  source: AxAgentTelemetrySource
  status: 'reporting' | 'stale' | 'installed' | 'missing' | 'unsupported' | 'alternate'
  lastCollectedAt: string | null
  capabilities: { usage: boolean; tools: boolean; skills: boolean }
  note: string
}

/** 에이전트 활동 패널 — 원문·세션 ID·경로 없이 집계값만 담는다. */
export interface AxAgentActivityData {
  syncedAt: string
  windowStart: string
  windowEnd: string
  totalUsage: AxAgentTokenUsage
  /** thinking 포함 관계를 반영한 총 처리 토큰. included-in-output이면 다시 더하지 않는다. */
  totalProcessedTokens: number
  sessions: number
  turns: number
  toolCalls: number
  toolFailures: number
  reporters: AxAgentReporterRow[]
  sourceCoverage: AxAgentSourceCoverageRow[]
  models: Array<{ model: string; turns: number; usage: AxAgentTokenUsage; processedTokens: number }>
  tools: Array<{ name: string; calls: number; failures: number; failureRate: number }>
  skills: Array<{ skillId: string; loaded: number; failed: number; interrupted: number }>
  /** batch에서 관측한 명시 보고 이벤트 수. 검증 정본과 합산하지 않는다. */
  observedExecutionReports: Array<{ status: string; evidence: string; count: number }>
  /** 명시적으로 보고되고 서버 DB에 저장된 실행 결과 정본. */
  verifiedExecutions: {
    attempts: number
    success: number
    partial: number
    failed: number
    abandoned: number
    running: number
    withEvidence: number
  }
  collection: {
    batches: number
    recordsRead: number
    parseFailures: number
    unsupportedRecordsSkipped: number
  }
  insights: Array<{
    severity: 'warning' | 'opportunity' | 'info'
    title: string
    detail: string
  }>
}

/** 구독 패널이 내려주는 집계. 팀원별 상세는 관리자에게만 채워진다 */
export interface AxSubscriptionData {
  /**
   * 이 데이터가 시트에서 마지막으로 넘어온 시각 (ISO 8601).
   * 수동 갱신이라 조회 시각과 다르다 — 화면은 이 값을 기준으로 표시해야 한다.
   */
  syncedAt: string | null
  /** 활성 구독 건수 */
  activeSeats: number
  /** 통화별 월 환산 합계 (yearly는 12로 나눠 합산) */
  monthlyByCurrency: Record<string, number>
  byVendor: AxSubscriptionVendorRow[]
  /**
   * 팀원별 상세. 관리자에게만 채워지고, 그 외에는 null.
   * (개인 식별 데이터이므로 집계만 전원 공개)
   */
  members: AxSubscriptionMemberRow[] | null
}
