/** Hermes SQLite를 원문 없이 PII-free delta 집계로 바꾼다. */

import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { OpenClawCollection } from './openclaw.js'
import type {
  AgentTaskCategory,
  AgentTelemetryCommittedState,
  AgentTelemetryHealthWarning,
  AgentTelemetrySeenMessage,
  AgentTokenUsage,
} from './types.js'
import { emptyAgentUsage } from './types.js'

const SEEN_RETENTION_MS = 90 * 86_400_000
const MAX_SEEN_MESSAGES = 100_000
const MIN_HEALTH_SAMPLE_RECORDS = 20
const MAX_UNSUPPORTED_RATIO = 0.5
const SAFE_LABEL = /^[a-zA-Z0-9][a-zA-Z0-9._:/+<> -]{0,119}$/
const FORBIDDEN_LABELS = [
  /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/i,
  /\/(?:Users|home)\//i,
  /(?:bearer|token|secret|password)\s*[:= ]/i,
  /\b(?:sk|ghp|github_pat)-?[A-Za-z0-9_-]{12,}/i,
]
const FAILED_MARKERS = new Set([
  'error', 'failed', 'failure', 'cancelled', 'canceled', 'aborted', 'denied', 'rejected',
])

const REQUIRED_SESSION_COLUMNS = [
  'id', 'model', 'last_activity_at', 'input_tokens', 'output_tokens',
  'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens', 'profile_name',
] as const
const REQUIRED_MESSAGE_COLUMNS = [
  'id', 'session_id', 'role', 'tool_call_id', 'tool_calls', 'tool_name',
  'effect_disposition', 'timestamp', 'finish_reason', 'display_kind',
] as const

interface HermesSessionRow {
  id?: unknown
  model?: unknown
  last_activity_at?: unknown
  input_tokens?: unknown
  output_tokens?: unknown
  cache_read_tokens?: unknown
  cache_write_tokens?: unknown
  reasoning_tokens?: unknown
}

interface HermesMessageRow {
  id?: unknown
  session_id?: unknown
  role?: unknown
  tool_call_id?: unknown
  tool_calls?: unknown
  tool_name?: unknown
  effect_disposition?: unknown
  timestamp?: unknown
  finish_reason?: unknown
  display_kind?: unknown
}

interface ParsedToolCall {
  hash: string
  name: string
}

interface MutableMetric {
  turns: number
  usage: AgentTokenUsage
}

interface DatabaseStatement {
  all(...params: unknown[]): unknown[]
}

interface DatabaseConnection {
  exec(sql: string): void
  prepare(sql: string): DatabaseStatement
  close(): void
}

export interface CollectHermesOptions {
  sessionsDir: string
  profileName: string
  window: { start: Date; end: Date }
  committed: AgentTelemetryCommittedState
  category: AgentTaskCategory
  source: 'hermes'
}

function toCount(value: unknown): number {
  if (typeof value === 'bigint') {
    if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) return 0
    return Number(value)
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.round(value)
}

function safeLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const candidate = value.trim()
  if (!SAFE_LABEL.test(candidate) || FORBIDDEN_LABELS.some((pattern) => pattern.test(candidate))) return fallback
  return candidate
}

function rawIdentity(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  if (typeof value === 'bigint') return String(value)
  return null
}

function hashIdentity(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function timestampMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const milliseconds = value < 10_000_000_000 ? value * 1000 : value
  return Number.isFinite(milliseconds) ? milliseconds : null
}

function usageFromSession(row: HermesSessionRow): AgentTokenUsage {
  return {
    inputTokens: toCount(row.input_tokens),
    outputTokens: toCount(row.output_tokens),
    cacheCreationInputTokens: toCount(row.cache_write_tokens),
    cacheReadInputTokens: toCount(row.cache_read_tokens),
    thinkingTokens: toCount(row.reasoning_tokens),
    // Hermes가 reasoning을 output에 포함하는지는 아직 원본 대조로 확정되지 않았다.
    thinkingTokensRelation: 'unknown',
  }
}

function deltaCount(current: number, previous: number): number {
  return current >= previous ? current - previous : current
}

function usageDelta(current: AgentTokenUsage, previous?: AgentTokenUsage): AgentTokenUsage {
  if (!previous) return { ...current }
  return {
    inputTokens: deltaCount(current.inputTokens, previous.inputTokens),
    outputTokens: deltaCount(current.outputTokens, previous.outputTokens),
    cacheCreationInputTokens: deltaCount(current.cacheCreationInputTokens, previous.cacheCreationInputTokens),
    cacheReadInputTokens: deltaCount(current.cacheReadInputTokens, previous.cacheReadInputTokens),
    thinkingTokens: deltaCount(current.thinkingTokens, previous.thinkingTokens),
    thinkingTokensRelation: 'unknown',
  }
}

function hasUsage(usage: AgentTokenUsage): boolean {
  return usage.inputTokens > 0 || usage.outputTokens > 0 ||
    usage.cacheCreationInputTokens > 0 || usage.cacheReadInputTokens > 0 || usage.thinkingTokens > 0
}

function addUsage(target: AgentTokenUsage, source: AgentTokenUsage): void {
  target.inputTokens += source.inputTokens
  target.outputTokens += source.outputTokens
  target.cacheCreationInputTokens += source.cacheCreationInputTokens
  target.cacheReadInputTokens += source.cacheReadInputTokens
  target.thinkingTokens += source.thinkingTokens
}

function isFailedResult(row: HermesMessageRow): boolean {
  const effect = typeof row.effect_disposition === 'string' ? row.effect_disposition.toLowerCase() : ''
  const finish = typeof row.finish_reason === 'string' ? row.finish_reason.toLowerCase() : ''
  const display = typeof row.display_kind === 'string' ? row.display_kind.toLowerCase() : ''
  return FAILED_MARKERS.has(effect) || FAILED_MARKERS.has(finish) || FAILED_MARKERS.has(display)
}

function parseToolCalls(raw: unknown, sessionIdentity: string): ParsedToolCall[] | null {
  if (raw === null || raw === undefined || raw === '') return []
  let value: unknown = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown
    } catch {
      return null
    }
  }
  if (!Array.isArray(value)) return null
  const calls: ParsedToolCall[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const call = item as Record<string, unknown>
    const id = rawIdentity(call.id ?? call.tool_call_id ?? call.toolCallId)
    if (!id) continue
    const fn = call.function && typeof call.function === 'object' && !Array.isArray(call.function)
      ? call.function as Record<string, unknown>
      : {}
    // arguments/input은 의도적으로 읽거나 보존하지 않는다.
    const name = safeLabel(call.name ?? call.tool_name ?? fn.name, 'unknown-tool')
    calls.push({ hash: hashIdentity(`${sessionIdentity}\u0000tool-call\u0000${id}`), name })
  }
  return calls
}

function requiredColumns(database: DatabaseConnection, table: string, required: readonly string[]): void {
  const rows = database.prepare(`PRAGMA table_info('${table}')`).all() as Array<Record<string, unknown>>
  const available = new Set(rows.map((row) => row.name).filter((name): name is string => typeof name === 'string'))
  if (required.some((name) => !available.has(name))) throw new Error('Hermes SQLite schema is not supported')
}

async function openReadOnlyDatabase(path: string): Promise<DatabaseConnection> {
  let sqlite: typeof import('node:sqlite')
  try {
    sqlite = await import('node:sqlite')
  } catch {
    throw new Error('Hermes collection requires a Node.js runtime with node:sqlite support')
  }
  return new sqlite.DatabaseSync(path, { readOnly: true }) as unknown as DatabaseConnection
}

export async function collectHermesAgent(options: CollectHermesOptions): Promise<OpenClawCollection> {
  const databasePath = resolve(options.sessionsDir)
  try {
    const info = await stat(databasePath)
    if (!info.isFile()) throw new Error('not-file')
  } catch {
    throw new Error('Hermes SQLite source does not exist or is not a file')
  }

  const startMs = options.window.start.getTime()
  const endMs = options.window.end.getTime()
  const totalUsage = emptyAgentUsage()
  const modelMetrics = new Map<string, MutableMetric>()
  const toolMetrics = new Map<string, { calls: number; failures: number }>()
  const sessions = new Set<string>()
  const sessionInfo = new Map<string, { hash: string; model: string }>()
  const batchSeen = new Set<string>()
  const retainedSeen = new Map<string, AgentTelemetrySeenMessage>()
  const retentionCutoff = endMs - SEEN_RETENTION_MS
  for (const seen of options.committed.seenMessages) {
    if (Date.parse(seen.atUtc) >= retentionCutoff) retainedSeen.set(seen.hash, seen)
  }
  const nextHermesSessions: NonNullable<AgentTelemetryCommittedState['hermesSessions']> = {}
  const collection = {
    source: options.source,
    filesDiscovered: 1,
    filesExcludedByScope: 0,
    filesRead: 1,
    filesReset: 0,
    recordsRead: 0,
    includedRecords: 0,
    metadataSkipped: 0,
    nonAssistantSkipped: 0,
    duplicatesSkipped: 0,
    syntheticSkipped: 0,
    malformedSkipped: 0,
    outsideWindowSkipped: 0,
    unsupportedRecordsSkipped: 0,
    missingIdentitySkipped: 0,
    orphanToolResultsSkipped: 0,
    parseFailures: 0,
    lagMinutes: 0,
    healthStatus: 'healthy' as 'healthy' | 'blocked',
    healthWarnings: [] as AgentTelemetryHealthWarning[],
  }
  let turns = 0
  let latestIncludedAt = 0
  let windowRecords = 0
  let database: DatabaseConnection | null = null

  try {
    database = await openReadOnlyDatabase(databasePath)
    database.exec('PRAGMA query_only = ON')
    database.exec('BEGIN')
    requiredColumns(database, 'sessions', REQUIRED_SESSION_COLUMNS)
    requiredColumns(database, 'messages', REQUIRED_MESSAGE_COLUMNS)

    const sessionRows = database.prepare(`
      SELECT id, model, last_activity_at, input_tokens, output_tokens,
             cache_read_tokens, cache_write_tokens, reasoning_tokens
      FROM sessions
      WHERE profile_name = ?
      ORDER BY last_activity_at, id
    `).all(options.profileName) as HermesSessionRow[]
    if (sessionRows.length === 0) throw new Error('Hermes profile scope does not match any sessions')
    const messageRows = database.prepare(`
      SELECT m.id AS id, m.session_id AS session_id, m.role AS role,
             m.tool_call_id AS tool_call_id, m.tool_calls AS tool_calls,
             m.tool_name AS tool_name, m.effect_disposition AS effect_disposition,
             m.timestamp AS timestamp, m.finish_reason AS finish_reason,
             m.display_kind AS display_kind
      FROM messages AS m
      INNER JOIN sessions AS s ON s.id = m.session_id
      WHERE s.profile_name = ?
      ORDER BY m.timestamp, m.id
    `).all(options.profileName) as HermesMessageRow[]

    const parsedCalls = new Map<string, ParsedToolCall[] | null>()
    const callDirectory = new Map<string, string>()
    const failedCalls = new Set<string>()
    for (const row of messageRows) {
      const sessionIdentity = rawIdentity(row.session_id)
      const messageIdentity = rawIdentity(row.id)
      if (!sessionIdentity || !messageIdentity) continue
      const role = String(row.role ?? '').toLowerCase()
      if (role === 'assistant' && row.tool_calls !== null && row.tool_calls !== undefined && row.tool_calls !== '') {
        const calls = parseToolCalls(row.tool_calls, sessionIdentity)
        parsedCalls.set(messageIdentity, calls)
        for (const call of calls ?? []) callDirectory.set(call.hash, call.name)
      }
      if (role === 'tool') {
        const callId = rawIdentity(row.tool_call_id)
        if (callId && isFailedResult(row)) {
          failedCalls.add(hashIdentity(`${sessionIdentity}\u0000tool-call\u0000${callId}`))
        }
      }
    }

    for (const row of sessionRows) {
      collection.recordsRead++
      const sessionIdentity = rawIdentity(row.id)
      if (!sessionIdentity) {
        collection.missingIdentitySkipped++
        continue
      }
      const sessionHash = hashIdentity(sessionIdentity)
      const model = safeLabel(row.model, 'unknown-model')
      const currentUsage = usageFromSession(row)
      sessionInfo.set(sessionIdentity, { hash: sessionHash, model })
      nextHermesSessions[sessionHash] = { model, usage: { ...currentUsage } }

      const at = timestampMs(row.last_activity_at)
      if (at === null) {
        collection.malformedSkipped++
        continue
      }
      if (at < startMs || at >= endMs) {
        collection.outsideWindowSkipped++
        continue
      }
      windowRecords++
      const previous = options.committed.hermesSessions?.[sessionHash]?.usage
      const delta = usageDelta(currentUsage, previous)
      if (!hasUsage(delta)) {
        if (previous) collection.duplicatesSkipped++
        else collection.metadataSkipped++
        continue
      }
      addUsage(totalUsage, delta)
      const metric = modelMetrics.get(model) ?? { turns: 0, usage: emptyAgentUsage() }
      addUsage(metric.usage, delta)
      modelMetrics.set(model, metric)
      sessions.add(sessionHash)
      collection.includedRecords++
      latestIncludedAt = Math.max(latestIncludedAt, at)
    }

    for (const row of messageRows) {
      collection.recordsRead++
      const at = timestampMs(row.timestamp)
      if (at === null) {
        collection.malformedSkipped++
        continue
      }
      if (at < startMs || at >= endMs) {
        collection.outsideWindowSkipped++
        continue
      }
      windowRecords++
      const sessionIdentity = rawIdentity(row.session_id)
      const messageIdentity = rawIdentity(row.id)
      if (!sessionIdentity || !messageIdentity) {
        collection.missingIdentitySkipped++
        continue
      }
      const info = sessionInfo.get(sessionIdentity) ?? {
        hash: hashIdentity(sessionIdentity),
        model: 'unknown-model',
      }
      const role = String(row.role ?? '').toLowerCase()

      if (role === 'user') {
        const messageHash = hashIdentity(`${sessionIdentity}\u0000user\u0000${messageIdentity}`)
        if (retainedSeen.has(messageHash) || batchSeen.has(messageHash)) {
          collection.duplicatesSkipped++
          continue
        }
        batchSeen.add(messageHash)
        retainedSeen.set(messageHash, { hash: messageHash, atUtc: new Date(at).toISOString() })
        const metric = modelMetrics.get(info.model) ?? { turns: 0, usage: emptyAgentUsage() }
        metric.turns++
        modelMetrics.set(info.model, metric)
        turns++
        sessions.add(info.hash)
        collection.includedRecords++
        latestIncludedAt = Math.max(latestIncludedAt, at)
        continue
      }

      if (role === 'assistant') {
        const calls = parsedCalls.get(messageIdentity)
        if (calls === null) {
          collection.malformedSkipped++
          continue
        }
        if (!calls || calls.length === 0) {
          collection.metadataSkipped++
          continue
        }
        let added = 0
        for (const call of calls) {
          if (retainedSeen.has(call.hash) || batchSeen.has(call.hash)) continue
          batchSeen.add(call.hash)
          retainedSeen.set(call.hash, { hash: call.hash, atUtc: new Date(at).toISOString() })
          const metric = toolMetrics.get(call.name) ?? { calls: 0, failures: 0 }
          metric.calls++
          if (failedCalls.has(call.hash)) metric.failures++
          toolMetrics.set(call.name, metric)
          added++
        }
        if (added === 0) collection.duplicatesSkipped++
        else {
          sessions.add(info.hash)
          collection.includedRecords++
          latestIncludedAt = Math.max(latestIncludedAt, at)
        }
        continue
      }

      if (role === 'tool') {
        const callId = rawIdentity(row.tool_call_id)
        if (!callId) {
          collection.missingIdentitySkipped++
          continue
        }
        const callHash = hashIdentity(`${sessionIdentity}\u0000tool-call\u0000${callId}`)
        if (!callDirectory.has(callHash)) {
          collection.orphanToolResultsSkipped++
          continue
        }
        const resultHash = hashIdentity(`${sessionIdentity}\u0000tool-result\u0000${messageIdentity}`)
        if (retainedSeen.has(resultHash) || batchSeen.has(resultHash)) {
          collection.duplicatesSkipped++
          continue
        }
        batchSeen.add(resultHash)
        retainedSeen.set(resultHash, { hash: resultHash, atUtc: new Date(at).toISOString() })
        sessions.add(info.hash)
        collection.includedRecords++
        latestIncludedAt = Math.max(latestIncludedAt, at)
        continue
      }

      if (role === 'session_meta') collection.metadataSkipped++
      else collection.unsupportedRecordsSkipped++
    }

    database.exec('ROLLBACK')
  } catch (cause) {
    try {
      database?.exec('ROLLBACK')
    } catch {
      // 연결이 이미 닫혔거나 transaction이 시작되지 않았을 수 있다.
    }
    if (cause instanceof Error && (
      cause.message === 'Hermes SQLite schema is not supported' ||
      cause.message === 'Hermes profile scope does not match any sessions' ||
      cause.message.includes('node:sqlite support')
    )) throw cause
    throw new Error('Hermes SQLite source could not be read safely')
  } finally {
    database?.close()
  }

  collection.lagMinutes = latestIncludedAt > 0
    ? Math.min(60 * 24 * 30, Math.max(0, Math.round((endMs - latestIncludedAt) / 6000) / 10))
    : 0
  const healthWarnings: AgentTelemetryHealthWarning[] = []
  if (windowRecords >= MIN_HEALTH_SAMPLE_RECORDS && turns === 0 && collection.includedRecords === 0) {
    healthWarnings.push('no-turns-from-records')
  }
  if (windowRecords >= MIN_HEALTH_SAMPLE_RECORDS &&
    collection.unsupportedRecordsSkipped / windowRecords >= MAX_UNSUPPORTED_RATIO) {
    healthWarnings.push('high-unsupported-rate')
  }
  collection.healthWarnings = healthWarnings
  collection.healthStatus = healthWarnings.length > 0 ? 'blocked' : 'healthy'

  const seenMessages = [...retainedSeen.values()]
    .sort((a, b) => Date.parse(a.atUtc) - Date.parse(b.atUtc))
    .slice(-MAX_SEEN_MESSAGES)

  return {
    usage: totalUsage,
    sessions: sessions.size,
    turns,
    models: [...modelMetrics.entries()].map(([model, metric]) => ({ model, ...metric }))
      .sort((a, b) => b.turns - a.turns || a.model.localeCompare(b.model)),
    tools: [...toolMetrics.entries()].map(([name, metric]) => ({ name, ...metric }))
      .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name)),
    skillLoads: [],
    taskCategories: turns > 0 ? [{
      category: options.category,
      sessions: sessions.size,
      turns,
      usage: { ...totalUsage },
    }] : [],
    executions: [],
    collection,
    nextCommitted: {
      lastWindowEndUtc: options.window.end.toISOString(),
      files: options.committed.files,
      seenMessages,
      hermesSessions: nextHermesSessions,
    },
  }
}
