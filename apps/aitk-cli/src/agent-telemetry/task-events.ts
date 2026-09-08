/** Optional task journal. Only fixed statuses, random IDs and numeric metrics leave the host. */
import { randomUUID } from 'node:crypto'
import { appendFileSync, chmodSync, existsSync, mkdirSync, openSync, closeSync, readSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { AgentTelemetryFileCheckpoint } from './types.js'

export const TASK_PHASES = ['task', 'search', 'search-skip', 'execution-report', 'skill-load', 'execution', 'verification', 'delivery', 'tool', 'read-guard', 'compaction'] as const
export type TaskPhase = typeof TASK_PHASES[number]
export interface AgentTaskEvent {
  taskId: string; eventId: string; attemptId: string; parentEventId?: string
  phase: TaskPhase
  status: 'started' | 'succeeded' | 'failed' | 'skipped' | 'unknown'
  evidence: 'process' | 'api' | 'self-reported'
  atUtc: string
  durationMs?: number
  metrics?: Partial<Record<'contextInputTokens' | 'toolResultChars' | 'readGuardDeniedCount' | 'compactionCount', number>>
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const keys = new Set(['taskId', 'eventId', 'attemptId', 'parentEventId', 'phase', 'status', 'evidence', 'atUtc', 'durationMs', 'metrics'])
export function validTaskEvent(value: unknown): value is AgentTaskEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const e = value as AgentTaskEvent
  const count = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0
  return Object.keys(e).every(key => keys.has(key)) && [e.taskId, e.eventId, e.attemptId].every(v => typeof v === 'string' && UUID.test(v)) &&
    (e.parentEventId === undefined || UUID.test(e.parentEventId)) && TASK_PHASES.includes(e.phase) &&
    ['started', 'succeeded', 'failed', 'skipped', 'unknown'].includes(e.status) && ['process', 'api', 'self-reported'].includes(e.evidence) &&
    typeof e.atUtc === 'string' && /^\d{4}-\d\d-\d\dT.*Z$/.test(e.atUtc) && Number.isFinite(Date.parse(e.atUtc)) && new Date(e.atUtc).toISOString() === e.atUtc &&
    (e.durationMs === undefined || count(e.durationMs)) && (e.metrics === undefined || (e.metrics !== null && typeof e.metrics === 'object' && !Array.isArray(e.metrics) &&
      Object.entries(e.metrics).every(([k,v]) => ['contextInputTokens','toolResultChars','readGuardDeniedCount','compactionCount'].includes(k) && count(v))))
}
export function taskJournalPath(agent: string, source: string, home = homedir()): string {
  if (!/^[a-z0-9][a-z0-9._:-]{0,99}$/.test(agent) || !['claude-code','codex','openclaw','hermes'].includes(source)) throw new Error('Invalid task scope')
  return join(home, '.cache', 'gpters-aitk', 'agent-tasks', agent, `${source}.jsonl`)
}
export function appendTaskEvent(agent: string, source: string, event: AgentTaskEvent, home?: string): void {
  if (!validTaskEvent(event)) throw new Error('Invalid task event: only random identifiers and structured evidence are allowed')
  const path = taskJournalPath(agent, source, home)
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  if ((statSync(dirname(path)).mode & 0o077) !== 0) throw new Error('Task journal directory must be private')
  appendFileSync(path, JSON.stringify(event) + '\n', { mode: 0o600 })
  chmodSync(path, 0o600)
}
export function collectTaskEvents(agent: string, source: string, previous?: AgentTelemetryFileCheckpoint, home?: string, before = new Date()): { events: AgentTaskEvent[]; checkpoint?: AgentTelemetryFileCheckpoint } {
  const path = taskJournalPath(agent, source, home)
  if (!existsSync(path)) return { events: [], checkpoint: previous }
  const info = statSync(path)
  if (previous && (previous.dev !== String(info.dev) || previous.ino !== String(info.ino) || info.size < previous.offset)) throw new Error('Task journal changed: preserve its checkpoint and inspect rotation')
  const offset = previous?.offset ?? 0
  // Bound each read and batch; unread complete records remain for the next run.
  const handle = openSync(path, 'r')
  const buffer = Buffer.alloc(Math.min(1024 * 1024, Math.max(0, info.size - offset)))
  let bytes: Buffer
  try { bytes = buffer.subarray(0, readSync(handle, buffer, 0, buffer.length, offset)) }
  finally { closeSync(handle) }
  const events: AgentTaskEvent[] = []
  let end = 0
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 10) continue
    const event: unknown = JSON.parse(bytes.subarray(end, i).toString('utf8'))
    if (!validTaskEvent(event)) throw new Error('Invalid task journal record; refusing to advance')
    if (Date.parse(event.atUtc) > before.getTime()) break
    events.push(event); end = i + 1
    if (events.length === 500) break
  }
  if (bytes.length === 1024 * 1024 && end === 0) throw new Error('Task journal record exceeds limit')
  return { events, checkpoint: { dev: String(info.dev), ino: String(info.ino), offset: offset + end } }
}
/** API acknowledgment only, never proof that the skill execution or delivery succeeded. */
export async function traceTaskApi<T extends { ok: boolean; data?: unknown }>(phase: TaskPhase | undefined, action: () => Promise<T>, home?: string): Promise<T> {
  const taskId = process.env.AITK_TASK_ID, agent = process.env.AITK_TASK_AGENT, source = process.env.AITK_TASK_SOURCE
  if (!phase || !taskId || !agent || !source) return action()
  const eventId = randomUUID(), attemptId = randomUUID(), started = Date.now()
  const write = (event: AgentTaskEvent) => {
    try { appendTaskEvent(agent, source, event, home) } catch { process.stderr.write('AITK task tracing unavailable; API request continues.\n') }
  }
  write({ taskId, eventId, attemptId, phase, status: 'started', evidence: 'api', atUtc: new Date().toISOString() })
  let status: AgentTaskEvent['status'] = 'failed'
  try {
    const result = await action()
    const data = result.data as { isError?: boolean; success?: boolean } | undefined
    status = result.ok && data?.isError !== true && data?.success !== false ? 'succeeded' : 'failed'
    return result
  } finally {
    write({ taskId, eventId: randomUUID(), attemptId, parentEventId: eventId, phase, status, evidence: 'api', atUtc: new Date().toISOString(), durationMs: Date.now() - started })
  }
}
