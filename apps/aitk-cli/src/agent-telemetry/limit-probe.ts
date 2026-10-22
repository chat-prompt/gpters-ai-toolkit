/**
 * 봇 수집기의 구독 계정 주간 한도 측정 (EDU-11519)
 *
 * 주간 한도는 봇이 아니라 로그인한 계정에 걸린다. 그래서 측정값마다 계정 키(이메일 sha256)를 붙여 보내고,
 * 서버가 구독 시트의 공용·서포트 행과 잇는다. 원문 이메일은 이 머신 밖으로 나가지 않는다.
 *
 * - Claude: 봇은 상태 표시줄이 없고 세션 기록에도 한도가 남지 않는다. 대신 헤드리스 실행의
 *   `rate_limit_event`가 `seven_day` 사용률을 싣는다. 세션·설정·MCP·도구를 모두 끈 haiku 호출 한 번으로 읽는다.
 *   계정은 같은 설정 디렉터리의 `claude auth status`로 읽는다 — cswap 이 바꾼 실제 로그인 계정이다.
 * - Codex: 롤아웃에 한도가 남으므로 호출 없이 마지막 스냅샷을 읽는다. 계정은 auth.json id_token 의 email.
 *   롤아웃에는 계정이 남지 않는다 — 계정이 바뀌면 그 시각을 로컬에 적고, 그 뒤에 관측된 한도만 보낸다.
 *   그렇지 않으면 옛 계정의 높은 값이 새 계정 회차의 최댓값으로 굳는다.
 *
 * 측정은 사용량 수집을 막지 않는다. 실패하면 이유 하나만 돌려준다.
 * 계정 키는 솔트 없는 sha256 이라 익명화가 아니라 가명화다 — 후보 이메일을 알면 되돌릴 수 있다.
 * 사내 공용 계정을 잇는 용도라 그대로 둔다.
 */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { latestCodexLimit } from '../usage/codex.js'
import type { AgentTelemetrySource } from './types.js'

/** 서버로 보내는 한도 스냅샷 */
export interface AgentLimitSnapshot {
  agentId: string
  collectorInstanceId: string
  client: 'claude-code' | 'codex'
  accountKey: string
  usedPercent: number
  resetsAt: string
  observedAt: string
}

/** 측정 결과 — 실패도 이유를 담아 doctor·run 출력에 그대로 싣는다 */
export type AgentLimitProbeResult =
  | { ok: true; snapshot: AgentLimitSnapshot }
  | { ok: false; reason: 'unsupported-source' | 'no-account' | 'no-limit' | 'claude-not-found' | 'probe-failed' | 'account-changed' }

/** 측정에 필요한 설치 정보 */
export interface AgentLimitProbeInput {
  agentId: string
  collectorInstanceId: string
  source: AgentTelemetrySource
  sessionsDir: string
  /** Codex 계정 전환 시각을 적어 두는 디렉터리 (설치의 checkpointDir) */
  stateDir: string
  home?: string
  /** 테스트용 — 외부 명령 실행 */
  run?: (command: string, args: string[], env: NodeJS.ProcessEnv, cwd: string) => Promise<string>
  now?: Date
}

const PROBE_TIMEOUT_MS = 60_000
/** Codex 롤아웃은 이보다 오래된 한도를 보지 않는다 — 회차(7일)를 넘긴 값은 쓸모가 없다 */
const CODEX_LOOKBACK_MS = 8 * 86_400_000

/**
 * 계정 이메일을 계정 키로 바꾼다
 *
 * @param email - 계정 이메일
 * @returns 소문자·trim 후 sha256 hex
 */
export function accountKey(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

/**
 * 헤드리스 Claude 의 stream-json 출력에서 주간 한도를 꺼낸다
 *
 * @param output - `claude -p --output-format stream-json --verbose` 출력
 * @returns 사용률(0~100)과 초기화 시각. 없으면 null
 */
export function parseClaudeWeeklyLimit(output: string): { usedPercent: number; resetsAt: string } | null {
  for (const line of output.split('\n')) {
    if (!line.includes('"rate_limit_event"')) continue
    try {
      const event = JSON.parse(line) as {
        rate_limit_info?: { unifiedWindows?: { seven_day?: { utilization?: unknown; resetsAt?: unknown } } }
      }
      const week = event.rate_limit_info?.unifiedWindows?.seven_day
      const utilization = week?.utilization
      const resets = week?.resetsAt
      if (typeof utilization !== 'number' || !Number.isFinite(utilization) || utilization < 0 || utilization > 1) continue
      if (typeof resets !== 'number' || !Number.isFinite(resets)) continue
      return { usedPercent: Math.round(utilization * 10_000) / 100, resetsAt: new Date(resets * 1000).toISOString() }
    } catch {
      continue
    }
  }
  return null
}

/**
 * Codex id_token 에서 계정 이메일을 꺼낸다. 토큰 원문은 반환하지 않는다
 *
 * @param codexHome - Codex 홈
 */
export function readCodexAccountEmail(codexHome: string): string | null {
  try {
    const auth = JSON.parse(readFileSync(join(codexHome, 'auth.json'), 'utf-8')) as { tokens?: { id_token?: unknown } }
    const token = auth.tokens?.id_token
    if (typeof token !== 'string') return null
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf-8')) as { email?: unknown }
    return typeof payload.email === 'string' && payload.email.includes('@') ? payload.email : null
  } catch {
    return null
  }
}

/**
 * 출처별로 봇의 Claude 설정 디렉터리를 정한다
 *
 * claude-code 출처는 수집 대상이 `<설정>/projects` 라 그 부모다. OpenClaw 봇은 claude-cli 를 기본 설정으로 돌린다
 * (뽀짝이 실측: CLAUDE_CONFIG_DIR 비어 있음).
 *
 * @returns 기본 `~/.claude` 이면 null — CLAUDE_CONFIG_DIR 을 넘기지 않는다
 */
export function claudeConfigDirFor(source: AgentTelemetrySource, sessionsDir: string, home: string): string | null {
  if (source !== 'claude-code') return null
  const dir = basename(sessionsDir) === 'projects' ? dirname(resolve(sessionsDir)) : resolve(sessionsDir)
  return dir === join(home, '.claude') ? null : dir
}

/** launchd 는 PATH 가 짧다 — 흔한 설치 위치를 덧붙인다 */
function probePath(home: string): string {
  return [
    process.env.PATH ?? '',
    // launchd 가 aitk 를 띄운 node — npm 으로 깐 claude 는 이 node 와 같은 bin 에 있고 실행에도 node 가 필요하다
    dirname(process.execPath),
    join(home, '.local', 'bin'),
    join(home, '.claude', 'local'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ].filter(Boolean).join(':')
}

/** 실패해도 stdout 을 붙여 던진다 — 한도에 걸려 비정상 종료해도 rate_limit_event 는 실려 온다 */
class ProbeRunError extends Error {
  constructor(readonly code: string | number | undefined, readonly stdout: string) {
    super('probe command failed')
  }
}

const defaultRun: NonNullable<AgentLimitProbeInput['run']> = (command, args, env, cwd) =>
  new Promise((resolvePromise, reject) => {
    const child = execFile(command, args, { env, cwd, timeout: PROBE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (cause, stdout) => {
      if (cause) reject(new ProbeRunError((cause as NodeJS.ErrnoException).code, String(stdout ?? '')))
      else resolvePromise(stdout)
    })
    // `< /dev/null` 과 같다 — 열어 두면 claude -p 가 추가 입력을 기다리다 시간 초과된다
    child.stdin?.end()
  })

/**
 * Codex 계정이 이 키로 바뀐 시각. 처음 보거나 바뀌었으면 지금으로 적는다
 *
 * @param stateDir - 상태 디렉터리
 * @param agentId - 봇
 * @param key - 지금 계정 키
 * @param now - 지금
 */
function codexAccountSince(stateDir: string, agentId: string, key: string, now: Date): Date {
  const path = join(stateDir, `limit-account-${agentId}-codex.json`)
  try {
    const saved = JSON.parse(readFileSync(path, 'utf-8')) as { accountKey?: unknown; since?: unknown }
    const since = typeof saved.since === 'string' ? new Date(saved.since) : null
    if (saved.accountKey === key && since && Number.isFinite(since.getTime())) return since
  } catch {
    // 처음이거나 깨졌다 — 아래에서 새로 적는다
  }
  mkdirSync(stateDir, { recursive: true, mode: 0o700 })
  writeFileSync(path, JSON.stringify({ accountKey: key, since: now.toISOString() }), { mode: 0o600 })
  return now
}

/**
 * 설치 하나의 활성 계정 주간 한도를 측정한다
 *
 * @param input - 설치 정보
 * @returns 스냅샷 또는 실패 이유
 */
export async function probeAgentLimit(input: AgentLimitProbeInput): Promise<AgentLimitProbeResult> {
  const home = input.home ?? homedir()
  const now = input.now ?? new Date()
  const base = { agentId: input.agentId, collectorInstanceId: input.collectorInstanceId }

  if (input.source === 'codex') {
    const codexHome = basename(input.sessionsDir) === 'sessions' ? dirname(resolve(input.sessionsDir)) : join(home, '.codex')
    const email = readCodexAccountEmail(codexHome)
    if (!email) return { ok: false, reason: 'no-account' }
    const key = accountKey(email)
    // 같은 계정으로 돌아온 경우(A→B→A)도 계정을 바꾸면 auth.json 이 다시 쓰인다 — 그 뒤 관측만 이 계정 것으로 본다.
    // 토큰 갱신도 파일을 다시 써서 창이 짧아지지만, 남의 값을 붙이는 쪽보다 안전하다
    const authWrittenAt = statSync(join(codexHome, 'auth.json')).mtimeMs
    const since = new Date(Math.max(codexAccountSince(input.stateDir, input.agentId, key, now).getTime(), authWrittenAt))
    const lookback = new Date(Math.max(since.getTime(), now.getTime() - CODEX_LOOKBACK_MS))
    const limit = await latestCodexLimit(codexHome, lookback)
    if (!limit || Date.parse(limit.resetsAt) <= now.getTime()) return { ok: false, reason: 'no-limit' }
    // 읽는 도중 계정이 바뀌었으면 마지막 관측이 어느 계정 것인지 모른다 — 버린다
    const afterEmail = readCodexAccountEmail(codexHome)
    let afterWrittenAt = Number.NaN
    try { afterWrittenAt = statSync(join(codexHome, 'auth.json')).mtimeMs } catch { /* 지워졌다 */ }
    if (!afterEmail || accountKey(afterEmail) !== key || afterWrittenAt !== authWrittenAt) {
      return { ok: false, reason: 'account-changed' }
    }
    return { ok: true, snapshot: { ...base, client: 'codex', accountKey: key, ...limit } }
  }

  if (input.source !== 'claude-code' && input.source !== 'openclaw') return { ok: false, reason: 'unsupported-source' }

  const configDir = claudeConfigDirFor(input.source, input.sessionsDir, home)
  // 측정 호출이 봇이 쓰는 claude 를 업데이트하지 않게 한다
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, PATH: probePath(home), DISABLE_AUTOUPDATER: '1' }
  if (configDir) env.CLAUDE_CONFIG_DIR = configDir
  else delete env.CLAUDE_CONFIG_DIR
  const run = input.run ?? defaultRun
  // 측정 호출이 봇 프로젝트 기록에 섞이지 않게 임시 디렉터리에서 돌리고 세션도 남기지 않는다
  const cwd = tmpdir()

  const readEmail = async (): Promise<string | null> => {
    const status = JSON.parse(await run('claude', ['auth', 'status', '--json'], env, cwd)) as { email?: unknown }
    return typeof status.email === 'string' && status.email.includes('@') ? status.email : null
  }
  let email: string | null = null
  try {
    email = await readEmail()
  } catch (cause) {
    if ((cause as { code?: unknown })?.code === 'ENOENT') return { ok: false, reason: 'claude-not-found' }
    return { ok: false, reason: 'no-account' }
  }
  if (!email) return { ok: false, reason: 'no-account' }

  let output: string
  try {
    output = await run('claude', [
      '-p', '--model', 'haiku', '--output-format', 'stream-json', '--verbose',
      '--no-session-persistence', '--setting-sources', '', '--strict-mcp-config', '--tools', '', '--disable-slash-commands',
      'ok',
    ], env, cwd)
  } catch (cause) {
    // 한도에 걸려 비정상 종료해도 출력에 한도가 있으면 쓴다 — 100% 근처 값이 판정에 가장 중요하다
    const stdout = (cause as { stdout?: unknown })?.stdout
    output = typeof stdout === 'string' ? stdout : ''
    if (!parseClaudeWeeklyLimit(output)) return { ok: false, reason: 'probe-failed' }
  }
  const limit = parseClaudeWeeklyLimit(output)
  if (!limit || Date.parse(limit.resetsAt) <= now.getTime()) return { ok: false, reason: 'no-limit' }
  // 측정 도중 cswap 이 계정을 바꿨으면 이 값이 어느 계정 것인지 모른다 — 버린다
  const after = await readEmail().catch(() => null)
  if (!after || accountKey(after) !== accountKey(email)) return { ok: false, reason: 'account-changed' }
  return {
    ok: true,
    snapshot: { ...base, client: 'claude-code', accountKey: accountKey(email), ...limit, observedAt: now.toISOString() },
  }
}

/**
 * 스냅샷을 서버로 보낸다
 *
 * @param snapshot - 측정값
 * @param serverUrl - 툴킷 서버
 * @param token - 수집기 토큰
 * @returns 서버가 회차에 반영했는지
 */
export async function sendAgentLimitSnapshot(snapshot: AgentLimitSnapshot, serverUrl: string, token: string): Promise<boolean> {
  const response = await fetch(`${serverUrl}/api/ax/agent-telemetry/limits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
    signal: AbortSignal.timeout(30_000),
  })
  const body = await response.json().catch(() => ({})) as { ok?: boolean; recorded?: boolean; error?: string }
  if (!response.ok || body.ok !== true) throw new Error(body.error ?? `limit snapshot HTTP ${response.status}`)
  return body.recorded === true
}
