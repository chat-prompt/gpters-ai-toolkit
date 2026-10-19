// 문자열 하나에서 민감정보를 가린다. 규칙은 위에서부터 차례로 적용된다.
// 토큰을 먼저 가려야 토큰 안의 숫자가 전화번호로 오인되지 않는다.

type Rule = { kind: string; scope: 'secret' | 'pii'; pattern: RegExp; replace: (m: string, ...g: string[]) => string }

export const RULES: Rule[] = [
  // Authorization 헤더 값
  { kind: 'token', scope: 'secret', pattern: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/g, replace: (_m, scheme) => `${scheme} [토큰 가림]` },
  // 서비스별 키 접두어 (OpenAI·Anthropic sk-, Slack xox*, GitHub gh*_, Airtable pat, AWS AKIA, Google AIza)
  { kind: 'token', scope: 'secret', pattern: /\b(?:sk-[A-Za-z0-9_-]{16,}|xox[abposr]-[A-Za-z0-9-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|pat[A-Za-z0-9]{10,}\.[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})/g, replace: () => '[토큰 가림]' },
  // KEY=값, "token": "값" 형태 (환경변수·JSON 설정)
  {
    kind: 'token',
    scope: 'secret',
    pattern: /\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*|"?(?:api_?key|token|secret|password|authorization)"?)(\s*[:=]\s*"?)([^\s"',}]{8,})/gi,
    replace: (_m, key, sep) => `${key}${sep}[토큰 가림]`,
  },
  // 주민등록번호
  { kind: 'rrn', scope: 'pii', pattern: /\b(\d{6})-?[1-4]\d{6}\b/g, replace: (_m, birth) => `${birth}-*******` },
  // 휴대폰 번호 (+82 포함) — 뒤 4자리만 남겨 본인 확인은 가능하게
  { kind: 'phone', scope: 'pii', pattern: /(?<!\d)(?:\+?82[-\s]?1|01)[016789][-.\s]?\d{3,4}[-.\s]?(\d{4})(?!\d)/g, replace: (_m, last4) => `010-****-${last4}` },
  // 이메일 — 첫 글자와 도메인만 남긴다 (회사 메일인지 개인 메일인지는 보이게)
  { kind: 'email', scope: 'pii', pattern: /\b([A-Za-z0-9])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, replace: (_m, first, domain) => `${first}***@${domain}` },
]

export type MaskCount = Record<string, number>

// strict: 토큰 + 개인정보 / secrets: 토큰·키만
export type Mode = 'strict' | 'secrets'

export function maskText(text: string, count: MaskCount = {}, mode: Mode = 'strict'): string {
  let out = text
  for (const rule of RULES) {
    if (mode === 'secrets' && rule.scope === 'pii') continue
    out = out.replace(rule.pattern, (...args) => {
      count[rule.kind] = (count[rule.kind] ?? 0) + 1
      return rule.replace(...(args as [string, ...string[]]))
    })
  }
  return out
}

// 도구 결과는 도구마다 모양이 달라서(문자열·객체·배열) 안의 문자열을 전부 훑는다.
export function maskDeep<T>(value: T, count: MaskCount = {}, mode: Mode = 'strict'): T {
  if (typeof value === 'string') return maskText(value, count, mode) as T
  if (Array.isArray(value)) return value.map(v => maskDeep(v, count, mode)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = maskDeep(v, count, mode)
    return out as T
  }
  return value
}

export function total(count: MaskCount): number {
  return Object.values(count).reduce((a, b) => a + b, 0)
}

// ── 언제 개인정보까지 가릴지 (슬랙 기준) ──
// 누가 개인정보를 볼 수 있는지, 어느 워크스페이스가 우리 것인지는 userConfig 로 받는다(register 가 configure 호출).
// 비워 두면 사람이 보낸 요청은 전부 개인정보까지 가린다(안전한 기본값). 봇·발신자 없는 메시지는 토큰·키만.
let PII_ALLOWED = new Set<string>()
// 이 밖(다른 회사·외부 워크스페이스)에서 온 요청은 전부 가린다.
let HOME_WORKSPACE = ''

// piiAllowedIds 는 쉼표·공백 구분 문자열.
export function configure(options: { piiAllowedIds?: unknown; homeWorkspaceId?: unknown }) {
  PII_ALLOWED = new Set(String(options.piiAllowedIds ?? '').split(/[\s,]+/).filter(Boolean))
  HOME_WORKSPACE = String(options.homeWorkspaceId ?? '').trim()
}

const SENDER = /"sender"\s*:\s*\{([^}]*)\}/
const SPACE = /"group_space"\s*:\s*"([^"]+)"/
const DISCORD = /"chat_id"\s*:\s*"(?:[a-z]+:)?\d{17,20}"|"(?:provider|channel|surface)"\s*:\s*"(?:discord|telegram|whatsapp)"/i
// 발표·화면 공유 중처럼 사람이 직접 "가림모드"를 켜는 경우
export const MANUAL = /가림\s*모드/

// 이 메시지를 보고 개인정보까지 가려야 하면 사유를, 아니면 null을 돌려준다.
export function strictReason(promptText: string): string | null {
  if (MANUAL.test(promptText)) return '가림모드 요청'
  if (DISCORD.test(promptText)) return '외부 메신저'
  const space = promptText.match(SPACE)?.[1]
  if (space && space !== HOME_WORKSPACE) return '외부 워크스페이스'
  const sender = promptText.match(SENDER)?.[1]
  if (sender) {
    if (/"is_bot"\s*:\s*true/.test(sender)) return null // 형제봇·자동화
    const id = sender.match(/"id"\s*:\s*"([^"]+)"/)?.[1]
    if (id && !PII_ALLOWED.has(id)) return '개인정보 권한 없는 요청자'
  }
  return null
}

export function isExternal(promptText: string): boolean {
  return strictReason(promptText) !== null
}
