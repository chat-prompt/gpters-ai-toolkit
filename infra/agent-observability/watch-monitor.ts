/** Independent read-only heartbeat check. Scheduling and behavior changes require operator notice. */
import { constants, readFileSync, fstatSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync, lstatSync, realpathSync, fsyncSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { deliverOperatorAlert } from '../../packages/lib/src/features/ax/monitor-notifications'
import type { DeliveryResult } from '../../packages/lib/src/features/ax/monitor-notifications'

export interface WatchMonitorConfig { origin: string; healthSecret: string; recipient: string; slackToken: string; stateFile: string }
export interface WatchMonitorState {
  version: 1; checkedAt: number; healthy: boolean; alertActive: boolean; outageSince?: number; notifiedAt?: number
  pending?: { id: string; kind: 'outage' | 'recovery'; status: 'ready' | 'sending' | 'uncertain' | 'blocked'; retryAt?: number }
}
type Deliver = (id: string, text: string, fetcher: typeof fetch, env: Record<string, string | undefined>) => Promise<DeliveryResult>
const DAY = 86_400_000

function privateJson(path: string): unknown {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600 || stat.size > 16_000) throw new Error('Owned 0600 regular file required')
    return JSON.parse(readFileSync(fd, 'utf8'))
  } finally { closeSync(fd) }
}
export function readWatchMonitorConfig(path: string): WatchMonitorConfig {
  const config = privateJson(path) as WatchMonitorConfig
  validateConfig(config)
  return config
}
function validateConfig(config: WatchMonitorConfig) {
  const origin = new URL(config.origin)
  if (origin.protocol !== 'https:' || origin.origin !== config.origin || typeof config.healthSecret !== 'string' || config.healthSecret.length < 32
    || typeof config.slackToken !== 'string' || !config.slackToken || !/^[UW][A-Z0-9]{8,20}$/.test(config.recipient)
    || !isAbsolute(config.stateFile)) throw new Error('Invalid private monitor configuration')
  const parent = dirname(config.stateFile)
  const stat = lstatSync(parent)
  if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700 || realpathSync(parent) !== resolve(parent)) throw new Error('Owned real 0700 state directory required')
}
function readState(path: string, now: number): WatchMonitorState {
  let value: unknown
  try { value = privateJson(path) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, checkedAt: now, healthy: true, alertActive: false }
    throw error
  }
  const state = value as WatchMonitorState
  if (state.version !== 1 || !Number.isFinite(state.checkedAt) || state.checkedAt > now || typeof state.healthy !== 'boolean' || typeof state.alertActive !== 'boolean'
    || (state.notifiedAt !== undefined && (!Number.isFinite(state.notifiedAt) || state.notifiedAt > now))
    || (state.outageSince !== undefined && (!Number.isFinite(state.outageSince) || state.outageSince > now))
    || (state.pending && (!/^heartbeat:[a-f0-9]{64}$/.test(state.pending.id) || !['outage', 'recovery'].includes(state.pending.kind)
      || !['ready', 'sending', 'uncertain', 'blocked'].includes(state.pending.status) || (state.pending.retryAt !== undefined && !Number.isFinite(state.pending.retryAt))))) throw new Error('Invalid or future watchdog state; operator reconciliation required')
  return state
}
function saveState(path: string, state: WatchMonitorState) {
  const temporary = `${path}.${randomUUID()}.tmp`
  const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try { writeFileSync(fd, JSON.stringify(state)); fsyncSync(fd) }
  finally { closeSync(fd) }
  try {
    renameSync(temporary, path)
    const directory = openSync(dirname(path), constants.O_RDONLY)
    try { fsyncSync(directory) } finally { closeSync(directory) }
  } finally { try { unlinkSync(temporary) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error } }
}
function pendingNotice(config: WatchMonitorConfig, state: WatchMonitorState, kind: 'outage' | 'recovery') {
  const id = createHash('sha256').update(JSON.stringify([config.origin, config.recipient, state.outageSince, kind, state.notifiedAt ?? 0])).digest('hex')
  return { id: `heartbeat:${id}`, kind, status: 'ready' as const }
}

/** The lock is intentionally never stolen by age; crashed locks require operator inspection. */
export async function watchMonitor(config: WatchMonitorConfig, fetcher: typeof fetch = fetch, at?: number, deliver: Deliver = deliverOperatorAlert) {
  const now = at ?? Date.now()
  validateConfig(config)
  if (!Number.isFinite(now) || now < 0) throw new Error('Invalid watchdog time')
  const lock = `${config.stateFile}.lock`
  const lockFd = openSync(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    writeFileSync(lockFd, JSON.stringify({ pid: process.pid, createdAt: now })); fsyncSync(lockFd)
    const state = readState(config.stateFile, now)
    if (state.pending?.status === 'sending') state.pending.status = 'uncertain'
    let healthy = false
    try {
      const response = await fetcher(`${config.origin}/api/cron/agent-monitor?heartbeat=1`, { method: 'GET', headers: { Authorization: `Bearer ${config.healthSecret}` }, redirect: 'error', signal: AbortSignal.timeout(15_000) })
      const data = await response.json() as { healthy?: boolean; lastSuccessAt?: string; backlog?: number }
      const age = now - Date.parse(data.lastSuccessAt ?? '')
      healthy = response.ok && data.healthy === true && data.backlog === 0 && Number.isFinite(age) && age >= 0 && age <= 900_000
    } catch { healthy = false }
    state.checkedAt = now; state.healthy = healthy
    const uncertain = state.pending?.status === 'uncertain'
    if (!uncertain) {
      if (!healthy) {
        state.outageSince ??= now
        if (state.pending?.kind === 'recovery') delete state.pending
        if (!state.pending && (!state.alertActive || state.notifiedAt === undefined || now - state.notifiedAt >= DAY)) state.pending = pendingNotice(config, state, 'outage')
      } else {
        if (state.pending?.kind === 'outage') delete state.pending
        if (state.alertActive && !state.pending) state.pending = pendingNotice(config, state, 'recovery')
        if (!state.alertActive) delete state.outageSince
      }
    }
    const notice = state.pending
    if (notice?.status === 'ready' && (!notice.retryAt || now >= notice.retryAt)) {
      notice.status = 'sending'
      saveState(config.stateFile, state)
      let result: DeliveryResult
      try {
        result = await deliver(notice.id, notice.kind === 'recovery' ? '중앙 에이전트 감시의 실행과 백로그 처리가 복구됐습니다.' : '중앙 에이전트 감시의 최근 실행 또는 백로그 처리를 확인하지 못했습니다. 감시 서버와 연결 상태를 확인하세요.', fetcher,
          { AX_MONITOR_ALERTS_ENABLED: 'true', AX_MONITOR_SLACK_TOKEN: config.slackToken, AX_MONITOR_SLACK_USER: config.recipient })
      } catch { result = { status: 'uncertain', reason: 'delivery-uncertain' } }
      if (result.status === 'accepted' && result.receipt) {
        state.alertActive = notice.kind === 'outage'; state.notifiedAt = at ?? Date.now(); delete state.pending
        if (!state.alertActive) delete state.outageSince
      } else if (result.status === 'retry') {
        notice.status = 'ready'; notice.retryAt = (at ?? Date.now()) + Math.min(86_400, Math.max(60, result.retryAfterSeconds ?? 300)) * 1000
      } else notice.status = result.status === 'blocked' ? 'blocked' : 'uncertain'
    }
    saveState(config.stateFile, state)
    return { healthy, deliveryUncertain: state.pending?.status === 'uncertain', deliveryBlocked: state.pending?.status === 'blocked' }
  } finally { closeSync(lockFd); unlinkSync(lock) }
}
async function main() {
  const path = process.argv[2]
  if (!path || process.argv.length !== 3) throw new Error('Private config path required')
  const result = await watchMonitor(readWatchMonitorConfig(path))
  process.stdout.write(JSON.stringify(result) + '\n')
  process.exitCode = result.deliveryUncertain || result.deliveryBlocked ? 2 : result.healthy ? 0 : 1
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => {
  process.stderr.write('Monitor watchdog failed; inspect private configuration, state and lock.\n'); process.exitCode = 2
})
