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
  /**
   * 요청자의 현재 조직 id.
   * 조직별로 격리된 자료(카탈로그 등)를 읽는 패널은 이 값으로 범위를 좁혀야 한다.
   */
  orgId: string | null
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
  /** 기간 내 이벤트를 남긴 고유 사용자 수 */
  activeUsers: number
  /** 스킬이 쓰인 세션 수 (위 이벤트와 같은 집합에서 센다) */
  sessions: number
  /** 사용량 상위 스킬 (loaded+applied 기준 내림차순) */
  skills: AxSkillUsageRow[]
  /** 일자별 이벤트 추이 */
  daily: Array<{ date: string; events: number }>
  /** 카탈로그에는 있으나 기간 내 이벤트가 0인 스킬 */
  unusedSkills: Array<{ id: string; name: string }>
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
  memberName: string
  client: AxUsageClient
  plan: string | null
  totalTokens: number
  sessions: number
  /** 주간 한도 사용률. 클라이언트가 보고하지 않으면 null */
  limitUsedPercent: number | null
  /** 한도 리셋 시각 (ISO 8601) */
  limitResetsAt: string | null
}

/** 클라이언트 사용량 패널이 내려주는 집계 */
export interface AxClientUsageData {
  /** 수집기가 마지막으로 보낸 시각 (ISO 8601) */
  syncedAt: string | null
  /** 집계 구간 (ISO 8601) */
  periodStart: string | null
  periodEnd: string | null
  totalTokens: number
  byClient: AxClientUsageClientRow[]
  /** 모델별 토큰 사용량 (내림차순) */
  byModel: Array<{ model: string; tokens: number }>
  /** 팀원별 상세. 관리자에게만 채워지고 그 외에는 null */
  members: AxClientUsageMemberRow[] | null
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
