/**
 * AX Dashboard — 사용량 리포트 수신 계약
 *
 * aitk CLI가 각 팀원 머신에서 집계해 서버로 보내는 payload의 정본이다.
 * CLI(보내는 쪽)와 API 라우트(받는 쪽)가 이 파일 하나를 함께 본다.
 *
 * **보내는 값의 범위**: 집계 수치와 플랜 문자열, 로그인 계정 이메일의 sha256 해시(계정 키),
 * Claude 한도 수집 연결 상태(고정 코드와 시각)뿐이다. 이메일 원문은 보내지 않는다.
 * 대화 내용, 파일 경로, 인증 토큰은 이 계약에 자리가 없다 — 그런 필드를 추가하지 말 것.
 */

import type { AxUsageClient } from './types'

/** 허용되는 클라이언트 값 (DB enum `ax_usage_client`와 일치해야 한다) */
export const AX_USAGE_CLIENTS = ['claude-code', 'codex'] as const

/** 한 번에 받을 수 있는 레코드 수 상한 */
const MAX_RECORDS = 20

/** 모델별 집계에 담을 수 있는 모델 종류 상한 */
const MAX_MODELS = 50

/** 집계 구간이 이보다 길면 거부한다 (일) */
const MAX_PERIOD_DAYS = 90

/**
 * 클라이언트 하나의 집계 한 건
 *
 * `limitUsedPercent`·`limitResetsAt`이 nullable인 게 이 계약의 핵심이다.
 * Claude Code는 최신 로컬 usage cache가 있을 때만 계정 한도를 보고한다.
 * 수집하지 못한 값을 0으로 채우면 "한도를 안 쓴 사람"과 구분되지 않으므로 null로 보낸다.
 */
export interface AxUsageReportRecord {
  client: AxUsageClient
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
  /** 주간 한도 사용률 (0~100). 클라이언트가 보고하지 않으면 null */
  limitUsedPercent: number | null
  /** 한도 리셋 시각 (ISO 8601). 없으면 null */
  limitResetsAt: string | null
  /**
   * 그 클라이언트 로그인 계정 이메일의 sha256 hex (EDU-11835). 공용 구독 `account_key` 와 같은 해시라
   * 공용 계정을 개인이 쓴 사용을 계정으로 짝짓는다. 옛 aitk 는 보내지 않고, 계정을 못 읽으면 null
   */
  accountKey?: string | null
}

/**
 * CLI가 POST 하는 본문
 *
 * **`memberName`이 없는 것은 의도다.** 누구의 사용량인지는 서버가 인증 세션에서
 * 유도한다. 클라이언트가 이름을 실어 보내면 남의 이름으로 기록을 남길 수 있다.
 */
export interface AxUsageReportPayload {
  /** 비어 있어도 유효하다. 빈 배열은 수집기는 정상 실행됐지만 사용량이 없다는 점검 신호다 */
  records: AxUsageReportRecord[]
  /** Claude 한도 수집 연결 상태. 옛 aitk 이거나 형식이 맞지 않으면 null (보고 자체는 거부하지 않는다) */
  limitCapture: AxLimitCapture | null
}

/**
 * Claude 주간 한도 수집 연결 상태 (aitk `readLimitCapture`)
 *
 * 고정 코드와 시각만 받는다. 자유 문구가 들어올 자리가 없도록 코드 형식을 여기서 제한한다.
 */
export interface AxLimitCapture {
  /** settings.json 의 statusLine 상태 */
  statusline: 'none' | 'user' | 'aitk' | 'unsupported'
  /** 마지막 자동 연결 결과 (`connected:wrapped`·`unchanged`·`skipped:symlink`·`failed` 등) */
  autoSetup: string | null
  autoSetupAt: string | null
  /** 표시줄이 Claude Code 에서 주간 한도를 마지막으로 받은 시각 */
  snapshotAt: string | null
  /**
   * 서버가 이 상태를 받은 시각. 저장할 때 서버가 채운다 — 옛 aitk 보고는 상태를 보내지 않아 이전 값이 남으므로,
   * 화면이 "지금 보고와 다른 시점의 관측"을 구분하는 근거다
   */
  observedAt?: string
}

const LIMIT_CAPTURE_STATUSLINES = ['none', 'user', 'aitk', 'unsupported'] as const
/** aitk `AUTO_SETUP_CODES`와 같은 목록. 모르는 코드는 자유 문구가 섞일 수 있어 받지 않는다 */
const AUTO_SETUP_CODES: ReadonlySet<string> = new Set([
  'connected:wrapped', 'connected:none', 'unchanged', 'refreshed', 'failed',
  ...['disabled', 'report-disabled', 'agent', 'config-dir', 'declined', 'drifted', 'symlink', 'unsupported', 'platform']
    .map((reason) => `skipped:${reason}`),
])

/**
 * 연결 상태를 검증한다. 부가 정보라 틀려도 보고를 거부하지 않는다 — 형식이 틀리면 null, 모르는 결과 코드는 그 필드만 null
 *
 * @param input - `limitCapture` 인자
 * @returns 통과한 값 또는 null
 */
export function parseLimitCapture(input: unknown): AxLimitCapture | null {
  if (typeof input !== 'object' || input === null) return null
  const v = input as Record<string, unknown>
  if (!LIMIT_CAPTURE_STATUSLINES.includes(v.statusline as AxLimitCapture['statusline'])) return null
  for (const field of ['autoSetupAt', 'snapshotAt'] as const) {
    if (v[field] !== null && !isIsoDate(v[field])) return null
  }
  return {
    statusline: v.statusline as AxLimitCapture['statusline'],
    // 모르는 코드(서버보다 새 aitk 의 새 사유 또는 자유 문구)는 그 필드만 버리고 나머지 진단은 받는다
    autoSetup: typeof v.autoSetup === 'string' && AUTO_SETUP_CODES.has(v.autoSetup) ? v.autoSetup : null,
    autoSetupAt: v.autoSetupAt === null ? null : new Date(v.autoSetupAt as string).toISOString(),
    snapshotAt: v.snapshotAt === null ? null : new Date(v.snapshotAt as string).toISOString(),
  }
}

/** 검증 결과 */
export type AxUsageReportValidation =
  | { ok: true; payload: AxUsageReportPayload }
  | { ok: false; errors: string[] }

/** 값이 유한한 0 이상의 정수인지 */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isInteger(value)
}

/** ISO 8601로 파싱되는 문자열인지 */
function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime())
}

/** null이거나 문자열인지 */
function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

/**
 * 레코드 한 건 검증
 *
 * @param record - 검증할 값
 * @param index - 배열 내 위치 (오류 메시지용)
 * @returns 오류 메시지 목록. 비어 있으면 통과
 */
function validateRecord(record: unknown, index: number): string[] {
  const errors: string[] = []
  const at = `records[${index}]`

  if (typeof record !== 'object' || record === null) {
    return [`${at}: 객체가 아닙니다`]
  }
  const r = record as Record<string, unknown>

  if (!AX_USAGE_CLIENTS.includes(r.client as AxUsageClient)) {
    errors.push(`${at}.client: '${AX_USAGE_CLIENTS.join("' 또는 '")}' 중 하나여야 합니다`)
  }

  for (const field of ['planRaw', 'plan'] as const) {
    if (!isNullableString(r[field])) errors.push(`${at}.${field}: 문자열이거나 null이어야 합니다`)
  }

  for (const field of ['periodStart', 'periodEnd'] as const) {
    if (!isIsoDate(r[field])) errors.push(`${at}.${field}: ISO 8601 시각이어야 합니다`)
  }

  // 구간이 뒤집혀 있거나 비상식적으로 길면 집계가 오염된다
  if (isIsoDate(r.periodStart) && isIsoDate(r.periodEnd)) {
    const start = new Date(r.periodStart).getTime()
    const end = new Date(r.periodEnd).getTime()
    if (end <= start) {
      errors.push(`${at}: periodEnd가 periodStart보다 뒤여야 합니다`)
    } else if (end - start > MAX_PERIOD_DAYS * 86_400_000) {
      errors.push(`${at}: 집계 구간이 ${MAX_PERIOD_DAYS}일을 넘습니다`)
    }
  }

  for (const field of ['inputTokens', 'outputTokens', 'cachedTokens', 'sessions'] as const) {
    if (!isCount(r[field])) errors.push(`${at}.${field}: 0 이상의 정수여야 합니다`)
  }

  if (typeof r.models !== 'object' || r.models === null || Array.isArray(r.models)) {
    errors.push(`${at}.models: 객체여야 합니다`)
  } else {
    const entries = Object.entries(r.models as Record<string, unknown>)
    if (entries.length > MAX_MODELS) {
      errors.push(`${at}.models: 모델 종류가 ${MAX_MODELS}개를 넘습니다`)
    }
    for (const [model, tokens] of entries) {
      if (!isCount(tokens)) errors.push(`${at}.models['${model}']: 0 이상의 정수여야 합니다`)
    }
  }

  // 한도는 없을 수 있다(Claude Code). 있다면 범위를 확인한다.
  if (r.limitUsedPercent !== null) {
    const pct = r.limitUsedPercent
    if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      errors.push(`${at}.limitUsedPercent: 0~100 사이의 수이거나 null이어야 합니다`)
    }
  }
  if (r.limitResetsAt !== null && !isIsoDate(r.limitResetsAt)) {
    errors.push(`${at}.limitResetsAt: ISO 8601 시각이거나 null이어야 합니다`)
  }
  // 옛 aitk 는 보내지 않는다. 보낸다면 해시 형식만 받는다 — 이메일 원문 같은 값이 들어올 자리를 막는다
  if (r.accountKey != null && (typeof r.accountKey !== 'string' || !/^[a-f0-9]{64}$/.test(r.accountKey))) {
    errors.push(`${at}.accountKey: 64자리 소문자 hex(sha256)이거나 null이어야 합니다`)
  }

  return errors
}

/**
 * CLI가 보낸 본문을 검증한다
 *
 * 서버는 이 함수를 통과한 값만 저장한다. 통과해도 `memberName`은 여기서 나오지 않는다 —
 * 호출하는 쪽이 인증 세션에서 채워야 한다.
 *
 * @param input - 파싱된 요청 본문
 * @returns 통과 시 payload, 실패 시 오류 메시지 목록
 */
export function validateUsageReport(input: unknown): AxUsageReportValidation {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, errors: ['본문이 객체가 아닙니다'] }
  }

  const records = (input as Record<string, unknown>).records
  if (!Array.isArray(records)) {
    return { ok: false, errors: ['records: 배열이어야 합니다'] }
  }
  if (records.length > MAX_RECORDS) {
    return { ok: false, errors: [`records: ${MAX_RECORDS}건을 넘을 수 없습니다`] }
  }

  const errors = records.flatMap((record, index) => validateRecord(record, index))
  if (errors.length > 0) return { ok: false, errors }

  // 같은 클라이언트·구간이 두 번 오면 어느 쪽을 남길지 서버가 임의로 정하게 된다.
  // 보내는 쪽에서 합쳐 오도록 여기서 거부한다.
  const seen = new Set<string>()
  for (const record of records as AxUsageReportRecord[]) {
    const key = `${record.client}|${new Date(record.periodStart).toISOString()}`
    if (seen.has(key)) {
      return { ok: false, errors: [`records: ${record.client}의 같은 구간이 중복됐습니다`] }
    }
    seen.add(key)
  }

  return {
    ok: true,
    payload: {
      records: records as AxUsageReportRecord[],
      limitCapture: parseLimitCapture((input as Record<string, unknown>).limitCapture),
    },
  }
}
