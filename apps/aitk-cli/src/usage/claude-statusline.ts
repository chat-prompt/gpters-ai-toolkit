/**
 * Claude Code 공식 statusline 입력과 AITK 사이의 로컬 연결.
 * 원본 stdin은 저장하지 않는다. 한도 사용률·리셋·관측 시각만 별도 캐시에 보관한다.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
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
    declined: join(directory, 'auto-setup-declined.json'),
    connected: join(directory, 'connected.json'),
  }
}

/** 읽을 수 없는 로컬 JSON은 없는 값으로 취급한다. */
export function readUsageJson(path: string): unknown {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

/**
 * 사용자 전용 파일을 원자적으로 교체해 여러 세션의 부분 쓰기를 막는다.
 * settings.json이 dotfiles 심링크면 링크가 아니라 실제 파일을 바꾸고, 기존 권한도 유지한다.
 */
export function writeUsageJson(path: string, value: unknown): void {
  let target = path
  let mode = 0o600
  let link = false
  try { link = lstatSync(path).isSymbolicLink() } catch { /* 새 파일 */ }
  // 대상이 없는 심링크를 일반 파일로 바꾸면 dotfiles 연결이 조용히 끊긴다. 쓰지 않고 멈춘다.
  if (link) target = realpathSync(path)
  try { mode = statSync(target).mode & 0o777 } catch { /* 새 파일 */ }
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode, flag: 'wx' })
    renameSync(temporary, target)
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
  // 빈 명령은 "표시줄 없음"과 구분할 수 없어 감싸면 화면이 바뀐다 — 지원하지 않는 설정으로 본다.
  if (!current || current.type !== 'command' || typeof current.command !== 'string' || !current.command.trim()) return { kind: 'unsupported' }
  const receipt = readClaudeStatuslineInstallation(home)
  // aitk가 만든 새 형식 명령이면 기록이 없거나 어긋나도 aitk다. 원래 명령은 명령에 실어 둔 값이 정본이다.
  const fromCommand = resolvePrevious(current, receipt)
  if (fromCommand !== undefined) {
    // 표시 모드: 기록이 같은 명령이면 기록을, 아니면 지금 화면 그대로(원래 표시줄이 없었으면 아무것도 안 그림).
    const display = receipt && receipt.command === current.command ? receipt.display ?? 'default' : 'none'
    return { kind: 'aitk', previous: fromCommand, display }
  }
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

/**
 * statusLine에 넣을 명령. node 버전 정리·aitk 삭제로 경로가 사라져도 원래 표시줄은 그대로 그리도록
 * 경로가 있을 때만 래퍼를 실행하고, 없으면 원래 명령(없으면 아무것도 안 함)으로 넘어간다.
 * 자동 연결은 동의 없이 모두에게 깔리므로, 다음 setup이 경로를 갱신할 때까지 화면이 비면 안 된다.
 */
export function buildStatuslineCommand(node: string, entry: string, previous: Record<string, unknown> | null): string {
  const original = typeof previous?.command === 'string' ? previous.command : ''
  const fallback = original ? `exec /bin/sh -c ${shellQuote(original)}` : ':'
  // 원래 명령을 환경 변수로도 넘긴다. 연결 기록(statusline.json)이 사라진 순간에도 래퍼가 원래 화면을 그릴 수 있게.
  return `if [ -x ${shellQuote(node)} ] && [ -f ${shellQuote(entry)} ]; then exec /usr/bin/env ${STATUSLINE_PREVIOUS_ENV}=${shellQuote(original)} ${shellQuote(node)} ${shellQuote(entry)} usage statusline; else ${fallback}; fi`
}

/** 저장 명령이 래퍼에 넘기는 원래 표시줄 명령. 빈 값은 원래 표시줄이 없었다는 뜻이다. */
export const STATUSLINE_PREVIOUS_ENV = 'AITK_STATUSLINE_PREVIOUS'

/**
 * `buildStatuslineCommand`가 만든 명령에서 원래 명령을 꺼낸다. aitk 형식이 아니면 null, 원래 표시줄이 없었으면 ''.
 * shellQuote의 역이다: 바깥 작은따옴표를 벗기고 `'"'"'`를 `'`로 되돌린다.
 */
export function parseHandedOverPrevious(command: string): string | null {
  const quoted = `'((?:[^']|'"'"')*)'`
  const match = command.match(new RegExp(`^if \\[ -x ${quoted} \\] && \\[ -f ${quoted} \\]; then exec /usr/bin/env ${STATUSLINE_PREVIOUS_ENV}=${quoted} `))
  if (!match) return null
  const unquote = (value: string) => value.replace(/'"'"'/g, "'")
  const [node, entry, original] = [unquote(match[1]), unquote(match[2]), unquote(match[3])]
  // aitk가 만든 그대로일 때만 인정한다. 사용자가 뒤에 파이프·명령을 덧붙였다면 사용자 명령으로 보고 건드리지 않는다.
  return buildStatuslineCommand(node, entry, original ? { command: original } : null) === command ? original : null
}

/**
 * 지금 설정의 aitk 명령에 대한 원래 statusLine. 저장 명령이 넘기는 값을 정본으로 보고,
 * 기록의 previous는 원래 명령이 같을 때만(부가 필드까지 되살리려고) 쓴다. 다른 머신에서 온 기록·중간 종료로
 * 어긋난 기록으로 설정을 바꾸지 않는다. aitk 새 형식 명령이 아니면 undefined.
 */
export function resolvePrevious(current: Record<string, unknown> | null, receipt: ClaudeStatuslineInstallation | null): Record<string, unknown> | null | undefined {
  const original = typeof current?.command === 'string' ? parseHandedOverPrevious(current.command) : null
  if (original === null) return undefined
  if (original === '') return null
  if (receipt?.previous && receipt.previous.command === original) return receipt.previous
  return { ...current, command: original }
}

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
  if (typeof current?.command === 'string' && !current.command.trim()) throw new Error('Unsupported statusLine setting; existing settings were preserved.')
  let previous: Record<string, unknown> | null
  // 새 형식 aitk 명령이면 명령에 실어 둔 원래 명령이 정본이다(기록이 없거나 어긋나도).
  const fromCommand = resolvePrevious(current, receipt)
  if (fromCommand !== undefined) previous = fromCommand
  else if (receipt && current?.command === receipt.command) previous = receipt.previous
  else if (typeof current?.command === 'string' && current.command.includes(' usage statusline')) {
    throw new Error('AITK statusline backup is missing; restore the previous statusLine before installing.')
  } else previous = current
  const command = buildStatuslineCommand(node, resolve(entry), previous ?? null)
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

/**
 * AITK가 설치한 명령일 때만 원래 statusLine을 복원한다.
 * 공식 스냅샷·보고 상태도 지운다. 스냅샷이 남아 있으면 legacy 캐시 경로가 계속 막힌다.
 */
export function uninstallClaudeStatusline(home = homedir()): boolean {
  const paths = claudeUsagePaths(home)
  const receipt = readClaudeStatuslineInstallation(home)
  const raw = existsSync(paths.settings) ? readFileSync(paths.settings, 'utf8') : null
  const settings = object(raw === null ? null : (() => { try { return JSON.parse(raw) } catch { return null } })())
  if (!settings) return false
  const current = object(settings.statusLine)
  // 새 형식이면 저장 명령에 실어 둔 원래 명령으로 되돌린다 — 기록이 사라졌거나 어긋나도 해제는 되어야 한다.
  // 옛 형식(원래 명령을 싣지 않음)은 기록과 명령이 같을 때만 기록으로 되돌린다.
  const fromCommand = resolvePrevious(current, receipt)
  const previous = fromCommand !== undefined ? fromCommand
    : receipt && current?.command === receipt.command ? receipt.previous : undefined
  if (previous === undefined) return false
  if (previous === null) delete settings.statusLine
  else settings.statusLine = previous
  // 다른 프로세스가 바꾼 설정을 덮어쓰지 않는다.
  if (readFileSync(paths.settings, 'utf8') !== raw) throw new Error('Claude settings changed during uninstall. Retry.')
  writeUsageJson(paths.settings, settings)
  // 수집 폴더에 쓸 수 없어도 설정 복원은 끝났다. 남은 파일 정리는 최선만 다한다.
  for (const file of [paths.installation, paths.snapshot, paths.report, paths.lock]) {
    try { unlinkSync(file) } catch { /* 없음 */ }
  }
  return true
}

/**
 * 사용자가 직접 해제했다는 표식. 자동 연결은 이 표식이 있으면 다시 켜지 않는다.
 * 수집 데이터 폴더(`~/.claude/aitk-usage`)를 통째로 지워도 의사가 남도록 aitk 설정 폴더에도 같이 둔다.
 * 수동 `aitk usage setup`만 지운다.
 */
function declinedPaths(home: string): [primary: string, mirror: string] {
  return [claudeUsagePaths(home).declined, join(home, '.config', 'aitk', 'usage-auto-setup-declined.json')]
}

/** 연결한 적이 있다는 기록. 수집 폴더를 지워도 남도록 aitk 설정 폴더에도 둔다. */
function connectedPaths(home: string): [primary: string, mirror: string] {
  return [claudeUsagePaths(home).connected, join(home, '.config', 'aitk', 'usage-connected.json')]
}

/**
 * 두 곳에 각각 시도한다. 한쪽 실패가 다른 쪽이나 해제·연결 자체를 막지 않게 한다
 * (`~/.config`가 root 소유이거나 수집 폴더 권한이 바뀐 머신이 있다).
 * @returns 실제로 쓴 곳의 수 (0~2)
 */
function writeMarker(paths: [string, string], value: unknown): string[] {
  const written: string[] = []
  for (const path of paths) { try { writeUsageJson(path, value); written.push(path) } catch { /* 다른 쪽을 시도 */ } }
  return written
}

/** @returns 해제 표식을 실제로 남긴 경로들 */
export function markAutoSetupDeclined(home = homedir(), now = Date.now()): string[] {
  return writeMarker(declinedPaths(home), { version: 1, declinedAt: new Date(now).toISOString() })
}

/** 수동 setup은 사용자의 명시적 선택이므로 이전 해제 표식을 지운다. */
export function clearAutoSetupDeclined(home = homedir()): void {
  for (const path of declinedPaths(home)) { try { unlinkSync(path) } catch { /* 없음 */ } }
}

/** 해제 표식이 하나라도 있으면 자동 연결을 건너뛴다. 내용이 손상돼도 사용자의 해제 의사로 본다. */
export function isAutoSetupDeclined(home = homedir()): boolean {
  return declinedPaths(home).some(path => existsSync(path))
}

/** 연결 기록을 남긴다. 이미 있으면 그대로 둔다. */
export function markConnected(home = homedir(), now = Date.now()): void {
  const paths = connectedPaths(home)
  if (paths.every(path => existsSync(path))) return
  writeMarker(paths, { version: 1, connectedAt: new Date(now).toISOString() })
}

/** 연결한 적이 있는지. 옛 aitk uninstall·수집 폴더 삭제 뒤에도 남는 기록을 본다. */
export function wasConnected(home = homedir()): boolean {
  return connectedPaths(home).some(path => existsSync(path))
}
