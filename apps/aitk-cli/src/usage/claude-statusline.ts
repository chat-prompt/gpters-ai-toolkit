/**
 * Claude Code 공식 statusline 입력과 AITK 사이의 로컬 연결.
 * 원본 stdin은 저장하지 않는다. 한도 사용률·리셋·관측 시각만 별도 캐시에 보관한다.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const CLAUDE_QUOTA_MAX_AGE_MS = 15 * 60_000

/** 공식 입력에서 관측한 주간 한도. 대화·경로·자격증명은 들어가지 않는다. */
export interface ClaudeQuotaSnapshot {
  version: 1
  source: 'claude-code-statusline'
  capturedAt: string
  usedPercent: number
  resetsAt: string
}

/** 설치·캐시·보고 상태 파일 위치. 테스트는 가짜 홈을 넘긴다. */
export function claudeUsagePaths(home = homedir()) {
  const directory = join(home, '.claude', 'aitk-usage')
  return {
    directory,
    settings: join(home, '.claude', 'settings.json'),
    installation: join(directory, 'statusline.json'),
    snapshot: join(directory, 'claude.json'),
    report: join(directory, 'report.json'),
    lock: join(directory, 'report.lock'),
  }
}

/** 읽을 수 없는 로컬 JSON은 없는 값으로 취급한다. */
export function readUsageJson(path: string): unknown {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

/** 사용자 전용 파일을 원자적으로 교체해 여러 세션의 부분 쓰기를 막는다. */
export function writeUsageJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
    renameSync(temporary, path)
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

/** unknown을 JSON 객체로 좁힌다. 배열·null은 객체로 받지 않는다. */
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

/** 실제 제공된 주간 창만 채택한다. null·문자열·다른 창을 0%로 바꾸지 않는다. */
export function extractClaudeQuota(input: unknown, now = Date.now()): ClaudeQuotaSnapshot | null {
  const weekly = object(object(object(input)?.rate_limits)?.seven_day)
  const used = weekly?.used_percentage
  const reset = weekly?.resets_at
  if (typeof used !== 'number' || !Number.isFinite(used) || used < 0 || used > 100) return null
  if (typeof reset !== 'number' || !Number.isFinite(reset) || reset * 1000 <= now) return null
  const date = new Date(reset * 1000)
  if (!Number.isFinite(date.getTime())) return null
  return { version: 1, source: 'claude-code-statusline', capturedAt: new Date(now).toISOString(), usedPercent: used, resetsAt: date.toISOString() }
}

/** 파일 mtime 대신 실제 관측 시각과 리셋 시각으로 최신성을 판단한다. */
export function readClaudeQuota(home = homedir(), now = Date.now()): ClaudeQuotaSnapshot | null {
  const value = object(readUsageJson(claudeUsagePaths(home).snapshot))
  if (!value || value.version !== 1 || value.source !== 'claude-code-statusline') return null
  if (typeof value.capturedAt !== 'string' || typeof value.resetsAt !== 'string') return null
  const age = now - Date.parse(value.capturedAt)
  if (!Number.isFinite(age) || age < 0 || age > CLAUDE_QUOTA_MAX_AGE_MS) return null
  const parsed = extractClaudeQuota({ rate_limits: { seven_day: {
    used_percentage: value.usedPercent, resets_at: Date.parse(value.resetsAt) / 1000,
  } } }, now)
  return parsed ? { ...parsed, capturedAt: value.capturedAt } : null
}

/** 원래 표시줄이 없을 때 aitk가 무엇을 그릴지. `default`는 모델·컨텍스트·한도 한 줄, `none`은 수집만. */
export type StatuslineDisplay = 'default' | 'none'

/** 기존 statusLine의 부가 설정까지 복구할 수 있도록 보존한다. */
export interface ClaudeStatuslineInstallation {
  version: 1
  command: string
  previous: Record<string, unknown> | null
  /** previous가 null일 때만 의미가 있다. 생략은 `default`로 본다 (파일럿 설치본 호환). */
  display?: StatuslineDisplay
}

/** 설치 메타데이터에는 원래 상태 표시줄 설정과 표시 모드만 담긴다. */
export function readClaudeStatuslineInstallation(home = homedir()): ClaudeStatuslineInstallation | null {
  const value = object(readUsageJson(claudeUsagePaths(home).installation))
  if (!value || value.version !== 1 || typeof value.command !== 'string') return null
  if (value.previous !== null && !object(value.previous)) return null
  if (value.display !== undefined && value.display !== 'default' && value.display !== 'none') return null
  return value as unknown as ClaudeStatuslineInstallation
}

/** setup이 무엇을 물어야 하는지 정하기 위한 현재 상태. 설정을 바꾸지 않는다. */
export type ClaudeStatuslineState =
  | { kind: 'none' }
  | { kind: 'user'; command: string }
  | { kind: 'aitk'; previous: Record<string, unknown> | null; display: StatuslineDisplay }
  | { kind: 'unsupported' }

/** settings.json의 statusLine이 없음·사용자 명령·aitk 래퍼 중 무엇인지 읽는다. */
export function inspectClaudeStatusline(home = homedir()): ClaudeStatuslineState {
  const paths = claudeUsagePaths(home)
  const settings = object(readUsageJson(paths.settings))
  const current = object(settings?.statusLine)
  if (settings?.statusLine == null) return { kind: 'none' }
  if (!current || current.type !== 'command' || typeof current.command !== 'string') return { kind: 'unsupported' }
  const receipt = readClaudeStatuslineInstallation(home)
  if (receipt && current.command === receipt.command) {
    return { kind: 'aitk', previous: receipt.previous, display: receipt.display ?? 'default' }
  }
  return { kind: 'user', command: current.command }
}

/** 공식 입력에서 퍼센트 필드 하나를 정수로 읽는다. 없거나 범위 밖이면 표시하지 않는다. */
function percent(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value) : null
}

/**
 * 원래 표시줄이 없는 사용자를 위한 기본 한 줄.
 * 공식 입력에 실제로 있는 값만 쓴다. 주간 한도는 검증된 스냅샷을 우선한다.
 */
export function renderDefaultStatusline(input: unknown, quota: ClaudeQuotaSnapshot | null = null): string {
  const data = object(input)
  const model = object(data?.model)?.display_name
  const parts: string[] = [typeof model === 'string' && model ? model : 'Claude Code']
  const context = percent(object(data?.context_window)?.used_percentage)
  if (context !== null) parts.push(`ctx ${context}%`)
  const limits = object(data?.rate_limits)
  const fiveHour = percent(object(limits?.five_hour)?.used_percentage)
  if (fiveHour !== null) parts.push(`5h ${fiveHour}%`)
  const weekly = quota ? percent(quota.usedPercent) : percent(object(limits?.seven_day)?.used_percentage)
  if (weekly !== null) parts.push(`7d ${weekly}%`)
  return parts.join(' · ')
}

/** 설정의 명령 문자열에 공백·따옴표·$가 있어도 경로 그대로 실행되게 한다. */
function shellQuote(value: string): string { return `'${value.replace(/'/g, `'"'"'`)}'` }

/** setup 결과. 메시지와 재시작 안내에만 쓴다. */
export interface ClaudeStatuslineInstallResult {
  /** wrapped: 기존 표시줄 유지, default/none: 표시줄이 없어 aitk가 맡음, unchanged: 이미 같은 설치 */
  mode: 'wrapped' | 'default' | 'none' | 'unchanged'
}

/** 기존 표시줄을 감싼다. 재설치로 중첩하지 않고 repo 빌드의 절대 경로도 지원한다. */
export function installClaudeStatusline(
  entry = process.argv[1], home = homedir(), node = process.execPath,
  options: { display?: StatuslineDisplay } = {},
): ClaudeStatuslineInstallResult {
  if (!entry || !existsSync(entry)) throw new Error('Build AITK before installing the statusline collector.')
  const paths = claudeUsagePaths(home)
  const raw = existsSync(paths.settings) ? readFileSync(paths.settings, 'utf8') : '{}'
  const settings = object(JSON.parse(raw))
  if (!settings) throw new Error('Claude settings must be a JSON object.')
  const current = object(settings.statusLine)
  if (settings.statusLine != null && (!current || current.type !== 'command' || typeof current.command !== 'string')) {
    throw new Error('Unsupported statusLine setting; existing settings were preserved.')
  }
  const receipt = readClaudeStatuslineInstallation(home)
  if (current?.command !== receipt?.command && typeof current?.command === 'string' && current.command.includes(' usage statusline')) {
    throw new Error('AITK statusline backup is missing; restore the previous statusLine before installing.')
  }
  const previous = receipt && current?.command === receipt.command ? receipt.previous : current
  const command = `${shellQuote(node)} ${shellQuote(resolve(entry))} usage statusline`
  // 원래 표시줄이 없을 때만 표시 모드가 필요하다. 재설치에서 생략하면 이전 선택을 유지한다.
  const display: StatuslineDisplay | undefined = previous ? undefined : (options.display ?? receipt?.display ?? 'default')
  if (current?.command === command && receipt && (receipt.display ?? 'default') === (display ?? 'default')) return { mode: 'unchanged' }
  // 다른 프로세스가 바꾼 설정을 덮어쓰지 않는다.
  if (existsSync(paths.settings) && readFileSync(paths.settings, 'utf8') !== raw) throw new Error('Claude settings changed during setup. Retry setup.')
  const installation: ClaudeStatuslineInstallation = display ? { version: 1, command, previous, display } : { version: 1, command, previous }
  writeUsageJson(paths.installation, installation)
  try {
    writeUsageJson(paths.settings, { ...settings, statusLine: { ...current, type: 'command', command } })
  } catch (err) {
    if (receipt) writeUsageJson(paths.installation, receipt)
    else unlinkSync(paths.installation)
    throw err
  }
  return { mode: previous ? 'wrapped' : display! }
}

/** AITK가 설치한 명령일 때만 원래 statusLine을 복원한다. */
export function uninstallClaudeStatusline(home = homedir()): boolean {
  const paths = claudeUsagePaths(home)
  const receipt = readClaudeStatuslineInstallation(home)
  const settings = object(readUsageJson(paths.settings))
  if (!receipt || !settings || object(settings.statusLine)?.command !== receipt.command) return false
  if (receipt.previous === null) delete settings.statusLine
  else settings.statusLine = receipt.previous
  writeUsageJson(paths.settings, settings)
  unlinkSync(paths.installation)
  return true
}
