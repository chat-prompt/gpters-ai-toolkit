/** OpenClaw session JSONL을 원문 없이 PII-free delta 집계로 바꾼다. */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import type {
  AgentTaskCategory,
  AgentTelemetryCommittedState,
  AgentTelemetryFileCheckpoint,
  AgentTelemetryHealthWarning,
  AgentTelemetrySeenMessage,
  AgentTelemetrySource,
  AgentTokenUsage,
  ThinkingTokensRelation,
} from './types.js'
import { emptyAgentUsage } from './types.js'

const SEEN_RETENTION_MS = 90 * 86_400_000
const MAX_SEEN_MESSAGES = 100_000
const MIN_HEALTH_SAMPLE_RECORDS = 20
const MAX_UNSUPPORTED_RATIO = 0.5
const CLAUDE_CODE_METADATA_TYPES = new Set([
  'attachment',
  'system',
  'file-history-delta',
  'file-history-snapshot',
  'last-prompt',
  'atis-latch',
  'mode',
  'permission-mode',
  'ai-title',
])
const SAFE_LABEL = /^[a-zA-Z0-9][a-zA-Z0-9._:/+<> -]{0,119}$/
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,99}$/
const FORBIDDEN_LABELS = [
  /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/i,
  /\/(?:Users|home)\//i,
  /(?:bearer|token|secret|password)\s*[:= ]/i,
  /\b(?:sk|ghp|github_pat)-?[A-Za-z0-9_-]{12,}/i,
]

interface OpenClawMessage {
  id?: unknown
  role?: unknown
  provider?: unknown
  model?: unknown
  timestamp?: unknown
  usage?: Record<string, unknown>
  content?: unknown
  toolCallId?: unknown
  tool_call_id?: unknown
  toolName?: unknown
  tool_name?: unknown
  isError?: unknown
  is_error?: unknown
}

interface OpenClawEntry {
  type?: unknown
  id?: unknown
  uuid?: unknown
  sessionId?: unknown
  session_id?: unknown
  timestamp?: unknown
  message?: OpenClawMessage
}

interface MutableMetric {
  turns: number
  usage: AgentTokenUsage
}

interface ToolCallMetric {
  name: string
  skillId: string | null
}

interface MessageUsageMetric {
  model: string
  usage: AgentTokenUsage
}

export interface OpenClawCollection {
  usage: AgentTokenUsage
  sessions: number
  turns: number
  models: Array<{ model: string; turns: number; usage: AgentTokenUsage }>
  tools: Array<{ name: string; calls: number; failures: number }>
  skillLoads: Array<{ skillId: string; loaded: number; failed: number; interrupted: number }>
  taskCategories: Array<{
    category: AgentTaskCategory
    sessions: number
    turns: number
    usage: AgentTokenUsage
  }>
  executions: Array<{
    status: 'success' | 'partial' | 'failed' | 'abandoned' | 'running'
    evidence: 'verified' | 'self-reported' | 'none'
    count: number
  }>
  collection: {
    source: AgentTelemetrySource
    filesDiscovered: number
    filesExcludedByScope: number
    filesRead: number
    filesReset: number
    recordsRead: number
    includedRecords: number
    metadataSkipped: number
    nonAssistantSkipped: number
    duplicatesSkipped: number
    syntheticSkipped: number
    malformedSkipped: number
    outsideWindowSkipped: number
    unsupportedRecordsSkipped: number
    missingIdentitySkipped: number
    orphanToolResultsSkipped: number
    parseFailures: number
    lagMinutes: number
    healthStatus: 'healthy' | 'blocked'
    healthWarnings: AgentTelemetryHealthWarning[]
  }
  nextCommitted: AgentTelemetryCommittedState
}

export interface CollectOpenClawOptions {
  sessionsDir: string
  window: { start: Date; end: Date }
  committed: AgentTelemetryCommittedState
  category: AgentTaskCategory
  source: AgentTelemetrySource
  projectSlugs?: string[]
  openclawAgent?: string
}

interface DatabaseStatement {
  all(...params: unknown[]): unknown[]
}

interface DatabaseConnection {
  exec(sql: string): void
  prepare(sql: string): DatabaseStatement
  close(): void
}

interface OpenClawSqliteRow {
  session_id?: unknown
  event_json?: unknown
  created_at?: unknown
}

type OpenClawInput =
  | {
    kind: 'jsonl'
    root: string
    files: string[]
    discovered: number
    excludedByScope: number
    internalAgentId?: string
  }
  | {
    kind: 'sqlite'
    databasePath: string
    internalAgentId: string
  }

function toCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.round(value)
}

function firstCount(usage: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    if (usage[key] !== undefined) return toCount(usage[key])
  }
  return 0
}

function firstRecord(value: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  for (const key of keys) {
    const candidate = value[key]
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate as Record<string, unknown>
    }
  }
  return {}
}

function usageFromMessage(message: OpenClawMessage): AgentTokenUsage {
  const usage = message.usage ?? {}
  const outputDetails = firstRecord(usage, ['outputTokensDetails', 'output_tokens_details', 'outputDetails'])
  // 일부 런타임은 같은 값을 최상위에도 복제하므로 합산하지 않고 큰 값을 택한다.
  const thinkingTokens = Math.max(
    firstCount(usage, ['thinkingTokens', 'thinking_tokens', 'thinking']),
    firstCount(outputDetails, ['thinkingTokens', 'thinking_tokens', 'thinking'])
  )
  return {
    inputTokens: firstCount(usage, ['input', 'inputTokens', 'input_tokens']),
    outputTokens: firstCount(usage, ['output', 'outputTokens', 'output_tokens']),
    cacheCreationInputTokens: firstCount(usage, [
      'cacheWrite', 'cacheCreationInputTokens', 'cache_creation_input_tokens', 'cache_write_input_tokens',
    ]),
    cacheReadInputTokens: firstCount(usage, ['cacheRead', 'cacheReadInputTokens', 'cache_read_input_tokens']),
    thinkingTokens,
    thinkingTokensRelation: thinkingTokens > 0 ? 'included-in-output' : 'unknown',
  }
}

function addUsage(target: AgentTokenUsage, source: AgentTokenUsage): void {
  target.inputTokens += source.inputTokens
  target.outputTokens += source.outputTokens
  target.cacheCreationInputTokens += source.cacheCreationInputTokens
  target.cacheReadInputTokens += source.cacheReadInputTokens
  target.thinkingTokens += source.thinkingTokens
  if (source.thinkingTokensRelation !== 'unknown') target.thinkingTokensRelation = source.thinkingTokensRelation
}

function cloneUsage(source: AgentTokenUsage): AgentTokenUsage {
  return { ...source }
}

function maxUsage(current: AgentTokenUsage, candidate: AgentTokenUsage): AgentTokenUsage {
  const thinkingTokens = Math.max(current.thinkingTokens, candidate.thinkingTokens)
  return {
    inputTokens: Math.max(current.inputTokens, candidate.inputTokens),
    outputTokens: Math.max(current.outputTokens, candidate.outputTokens),
    cacheCreationInputTokens: Math.max(current.cacheCreationInputTokens, candidate.cacheCreationInputTokens),
    cacheReadInputTokens: Math.max(current.cacheReadInputTokens, candidate.cacheReadInputTokens),
    thinkingTokens,
    thinkingTokensRelation: thinkingTokens > 0 ? 'included-in-output' : 'unknown',
  }
}

function usageIncrease(previous: AgentTokenUsage, next: AgentTokenUsage): AgentTokenUsage {
  const thinkingTokens = next.thinkingTokens - previous.thinkingTokens
  return {
    inputTokens: next.inputTokens - previous.inputTokens,
    outputTokens: next.outputTokens - previous.outputTokens,
    cacheCreationInputTokens: next.cacheCreationInputTokens - previous.cacheCreationInputTokens,
    cacheReadInputTokens: next.cacheReadInputTokens - previous.cacheReadInputTokens,
    thinkingTokens,
    thinkingTokensRelation: thinkingTokens > 0 ? next.thinkingTokensRelation : 'unknown',
  }
}

function safeLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const candidate = value.trim()
  if (!SAFE_LABEL.test(candidate) || FORBIDDEN_LABELS.some((pattern) => pattern.test(candidate))) return fallback
  return candidate
}

function safeSkillId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const candidate = value.trim().toLowerCase()
  return SAFE_ID.test(candidate) ? candidate : null
}

function hashIdentity(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function timestampMs(raw: unknown): number | null {
  if (typeof raw === 'bigint') {
    if (raw <= 0n || raw > BigInt(Number.MAX_SAFE_INTEGER)) return null
    return timestampMs(Number(raw))
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const milliseconds = raw < 10_000_000_000 ? raw * 1000 : raw
    return Number.isFinite(milliseconds) ? milliseconds : null
  }
  if (typeof raw !== 'string') return null
  const milliseconds = Date.parse(raw)
  return Number.isFinite(milliseconds) ? milliseconds : null
}

function entryTimestamp(entry: OpenClawEntry, fallback?: unknown): number | null {
  const raw = entry.timestamp ?? entry.message?.timestamp
  return timestampMs(raw) ?? timestampMs(fallback)
}

function isSynthetic(message: OpenClawMessage): boolean {
  return String(message.model ?? '').toLowerCase() === '<synthetic>' ||
    String(message.provider ?? '').toLowerCase() === 'openclaw'
}

function contentBlocks(content: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(content)) return []
  return content.filter((block): block is Record<string, unknown> => !!block && typeof block === 'object')
}

function callId(block: Record<string, unknown>): string | null {
  const value = block.id ?? block.toolCallId ?? block.tool_call_id ?? block.toolUseId ?? block.tool_use_id
  return typeof value === 'string' && value.length > 0 ? value : null
}

function callArguments(block: Record<string, unknown>): Record<string, unknown> {
  const value = block.arguments ?? block.input ?? block.args
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function skillFromPath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.replaceAll('\\', '/').match(/\/(?:\.claude|\.agents|\.openclaw)?\/?skills\/([^/]+)\/SKILL\.md$/i)
  return safeSkillId(match?.[1])
}

function skillFromCall(name: string, args: Record<string, unknown>): string | null {
  if (/skill/i.test(name)) {
    for (const key of ['skillId', 'skill_id', 'skill', 'name']) {
      const skillId = safeSkillId(args[key])
      if (skillId) return skillId
    }
  }
  for (const key of ['path', 'filePath', 'file_path']) {
    const skillId = skillFromPath(args[key])
    if (skillId) return skillId
  }
  return null
}

async function listSessionFiles(
  root: string,
  projectSlugs: string[] | undefined
): Promise<{ files: string[]; discovered: number; excludedByScope: number }> {
  let entries: string[]
  try {
    entries = await readdir(root, { recursive: true })
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('sessions directory does not exist')
    }
    throw cause
  }
  const jsonlEntries = entries.filter((entry) => entry.endsWith('.jsonl'))
  const allowed = projectSlugs ? new Set(projectSlugs) : null
  const included = allowed
    ? jsonlEntries.filter((entry) => allowed.has(entry.replaceAll('\\', '/').split('/')[0]))
    : jsonlEntries
  return {
    files: included.map((entry) => resolve(root, entry)).sort(),
    discovered: jsonlEntries.length,
    excludedByScope: jsonlEntries.length - included.length,
  }
}

async function pathKind(path: string): Promise<'file' | 'directory' | null> {
  try {
    const info = await stat(path)
    if (info.isFile()) return 'file'
    if (info.isDirectory()) return 'directory'
    return null
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw cause
  }
}

function requiredColumns(database: DatabaseConnection, table: string, required: readonly string[]): void {
  const rows = database.prepare(`PRAGMA table_info('${table}')`).all() as Array<Record<string, unknown>>
  const available = new Set(rows.map((row) => row.name).filter((name): name is string => typeof name === 'string'))
  if (required.some((name) => !available.has(name))) {
    throw new Error('OpenClaw SQLite schema is not supported')
  }
}

async function openReadOnlyDatabase(path: string): Promise<DatabaseConnection> {
  let sqlite: typeof import('node:sqlite')
  try {
    sqlite = await import('node:sqlite')
  } catch {
    throw new Error('OpenClaw SQLite collection requires a Node.js runtime with node:sqlite support')
  }
  return new sqlite.DatabaseSync(path, { readOnly: true }) as unknown as DatabaseConnection
}

function inspectOpenClawDatabase(database: DatabaseConnection): string {
  requiredColumns(database, 'schema_meta', ['meta_key', 'role', 'agent_id', 'schema_version'])
  requiredColumns(database, 'transcript_events', ['session_id', 'seq', 'event_json', 'created_at'])
  const rows = database.prepare(`
    SELECT role, agent_id
    FROM schema_meta
    WHERE meta_key = 'primary'
    LIMIT 1
  `).all() as Array<Record<string, unknown>>
  const row = rows[0]
  if (row?.role !== 'agent' || typeof row.agent_id !== 'string' ||
    row.agent_id.length === 0 || row.agent_id.length > 255 || row.agent_id.includes('\0')) {
    throw new Error('OpenClaw SQLite agent identity is missing or invalid')
  }
  return row.agent_id
}

async function readOpenClawDatabaseIdentity(path: string): Promise<string> {
  let database: DatabaseConnection | null = null
  try {
    database = await openReadOnlyDatabase(path)
    database.exec('PRAGMA query_only = ON')
    database.exec('BEGIN')
    const agentId = inspectOpenClawDatabase(database)
    database.exec('ROLLBACK')
    return agentId
  } catch (cause) {
    try { database?.exec('ROLLBACK') } catch { /* transaction이 시작되지 않았을 수 있다. */ }
    if (cause instanceof Error && (
      cause.message.startsWith('OpenClaw SQLite') || cause.message.includes('node:sqlite support')
    )) throw cause
    throw new Error('OpenClaw SQLite source could not be read safely')
  } finally {
    database?.close()
  }
}

async function containsOpenClawAgentSources(parent: string): Promise<boolean> {
  if (await pathKind(parent) !== 'directory') return false
  const entries = await readdir(parent, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const agentRoot = join(parent, entry.name)
    if (await pathKind(join(agentRoot, 'agent', 'openclaw-agent.sqlite')) === 'file' ||
      await pathKind(join(agentRoot, 'sessions')) === 'directory') return true
  }
  return false
}

async function resolveOpenClawInput(path: string, projectSlugs?: string[]): Promise<OpenClawInput> {
  const root = resolve(path)
  const kind = await pathKind(root)
  if (!kind) throw new Error('sessions directory does not exist')
  if (kind === 'file') {
    return { kind: 'sqlite', databasePath: root, internalAgentId: await readOpenClawDatabaseIdentity(root) }
  }

  // 업그레이드 뒤에도 기존 `.../<agent>/sessions` 설정을 그대로 사용할 수 있게
  // sibling SQLite를 먼저 찾는다. JSONL은 이 시점부터 legacy archive이므로 합치지 않는다.
  const databaseCandidates = [
    join(root, 'openclaw-agent.sqlite'),
    join(root, 'agent', 'openclaw-agent.sqlite'),
    ...(basename(root) === 'sessions' ? [join(dirname(root), 'agent', 'openclaw-agent.sqlite')] : []),
  ]
  for (const databasePath of databaseCandidates) {
    if (await pathKind(databasePath) !== 'file') continue
    return {
      kind: 'sqlite',
      databasePath,
      internalAgentId: await readOpenClawDatabaseIdentity(databasePath),
    }
  }

  if (
    (basename(root) === 'agents' && await containsOpenClawAgentSources(root)) ||
    await containsOpenClawAgentSources(join(root, 'agents'))
  ) {
    throw new Error('OpenClaw source contains multiple agents; select one explicit agent directory')
  }

  const nestedSessions = join(root, 'sessions')
  const jsonlRoot = await pathKind(nestedSessions) === 'directory' ? nestedSessions : root
  const listed = await listSessionFiles(jsonlRoot, projectSlugs)
  const internalAgentId = jsonlRoot === nestedSessions
    ? basename(root)
    : basename(jsonlRoot) === 'sessions' ? basename(dirname(jsonlRoot)) : undefined
  return { kind: 'jsonl', root: jsonlRoot, ...listed, internalAgentId }
}

async function scanCompleteLines(
  filePath: string,
  offset: number,
  onLine: (line: string) => void
): Promise<number> {
  const stream = createReadStream(filePath, { start: offset })
  let carry = Buffer.alloc(0)
  let bytesRead = 0
  for await (const rawChunk of stream) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk)
    bytesRead += chunk.length
    const buffer = carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk
    let start = 0
    for (let index = 0; index < buffer.length; index++) {
      if (buffer[index] !== 0x0a) continue
      const line = buffer.subarray(start, index).toString('utf8').replace(/\r$/, '')
      if (line.length > 0) onLine(line)
      start = index + 1
    }
    carry = buffer.subarray(start)
  }
  return offset + bytesRead - carry.length
}

function resultInfo(entry: OpenClawEntry): { id: string | null; failed: boolean } | null {
  const message = entry.message
  if (!message) return null
  const role = String(message.role ?? '')
  if (role === 'toolResult' || role === 'tool_result') {
    const id = message.toolCallId ?? message.tool_call_id
    return {
      id: typeof id === 'string' ? id : null,
      failed: message.isError === true || message.is_error === true,
    }
  }
  for (const block of contentBlocks(message.content)) {
    if (!['tool_result', 'toolResult'].includes(String(block.type ?? ''))) continue
    return {
      id: callId(block),
      failed: block.is_error === true || block.isError === true,
    }
  }
  return null
}

export async function collectOpenClawAgent(options: CollectOpenClawOptions): Promise<OpenClawCollection> {
  if (options.openclawAgent && options.source !== 'openclaw') {
    throw new Error('OpenClaw agent scope is only supported with the OpenClaw source')
  }
  if (options.openclawAgent && !SAFE_ID.test(options.openclawAgent)) {
    throw new Error('OpenClaw agent ID is invalid')
  }
  const input: OpenClawInput = options.source === 'openclaw'
    ? await resolveOpenClawInput(options.sessionsDir, options.projectSlugs)
    : await (async () => {
      const root = resolve(options.sessionsDir)
      const listed = await listSessionFiles(root, options.projectSlugs)
      return { kind: 'jsonl' as const, root, ...listed }
    })()
  if (options.openclawAgent && input.internalAgentId !== options.openclawAgent) {
    throw new Error('OpenClaw source agent does not match --openclaw-agent')
  }
  const internalAgentHash = input.internalAgentId ? hashIdentity(input.internalAgentId) : null
  if (options.source === 'openclaw' && options.committed.openclawSource?.agentHash &&
    options.committed.openclawSource.agentHash !== internalAgentHash) {
    throw new Error('OpenClaw source agent does not match the existing checkpoint')
  }
  const startMs = options.window.start.getTime()
  const endMs = options.window.end.getTime()
  const totalUsage = emptyAgentUsage()
  const modelMetrics = new Map<string, MutableMetric>()
  const toolMetrics = new Map<string, { calls: number; failures: number }>()
  const skillMetrics = new Map<string, { loaded: number; failed: number; interrupted: number }>()
  const toolCalls = new Map<string, ToolCallMetric>()
  const messageUsageMetrics = new Map<string, MessageUsageMetric>()
  const sessions = new Set<string>()
  const batchSeen = new Set<string>()
  const retainedSeen = new Map<string, AgentTelemetrySeenMessage>()
  const retentionCutoff = endMs - SEEN_RETENTION_MS
  for (const seen of options.committed.seenMessages) {
    if (Date.parse(seen.atUtc) >= retentionCutoff) retainedSeen.set(seen.hash, seen)
  }
  const nextFiles: Record<string, AgentTelemetryFileCheckpoint> = input.kind === 'sqlite'
    ? {}
    : { ...options.committed.files }
  const collection = {
    source: options.source,
    filesDiscovered: input.kind === 'sqlite' ? 1 : input.discovered,
    filesExcludedByScope: input.kind === 'sqlite' ? 0 : input.excludedByScope,
    filesRead: 0,
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

  const processEntry = (
    entry: OpenClawEntry,
    initialSessionIdentity: string,
    fallbackTimestamp?: unknown,
  ): string => {
    let sessionIdentity = initialSessionIdentity
    if (entry.type === 'session' && typeof entry.id === 'string') {
      collection.metadataSkipped++
      return entry.id
    }

    const explicitSessionId = entry.sessionId ?? entry.session_id
    if (typeof explicitSessionId === 'string' && explicitSessionId.length > 0) {
      sessionIdentity = explicitSessionId
    }

    if (options.source === 'claude-code' && CLAUDE_CODE_METADATA_TYPES.has(String(entry.type ?? ''))) {
      collection.metadataSkipped++
      return sessionIdentity
    }

    const at = entryTimestamp(entry, fallbackTimestamp)
    if (at === null) {
      collection.malformedSkipped++
      return sessionIdentity
    }
    if (at < startMs || at >= endMs) {
      collection.outsideWindowSkipped++
      return sessionIdentity
    }
    windowRecords++

    const result = resultInfo(entry)
    if (result) {
      const resultIdentity = result.id ?? entry.message?.id ?? entry.id ?? entry.uuid
      if (typeof resultIdentity === 'string' && resultIdentity.length > 0) {
        const resultHash = hashIdentity(`${sessionIdentity}\u0000tool-result\u0000${resultIdentity}`)
        if (retainedSeen.has(resultHash) || batchSeen.has(resultHash)) {
          collection.duplicatesSkipped++
          return sessionIdentity
        }
        batchSeen.add(resultHash)
        retainedSeen.set(resultHash, { hash: resultHash, atUtc: new Date(at).toISOString() })
      }
      const resultCallHash = result.id
        ? hashIdentity(`${sessionIdentity}\u0000tool-call\u0000${result.id}`)
        : null
      const call = resultCallHash ? toolCalls.get(resultCallHash) : undefined
      if (!call) {
        collection.orphanToolResultsSkipped++
        return sessionIdentity
      }
      if (result.failed) toolMetrics.get(call.name)!.failures++
      if (call.skillId) {
        const skill = skillMetrics.get(call.skillId) ?? { loaded: 0, failed: 0, interrupted: 0 }
        if (result.failed) skill.failed++
        else skill.loaded++
        skillMetrics.set(call.skillId, skill)
      }
      collection.includedRecords++
      latestIncludedAt = Math.max(latestIncludedAt, at)
      return sessionIdentity
    }

    const message = entry.message
    const expectedAssistantType = options.source === 'claude-code' ? 'assistant' : 'message'
    if (entry.type !== expectedAssistantType || message?.role !== 'assistant') {
      if (entry.type === 'user' || message?.role === 'user') collection.nonAssistantSkipped++
      else collection.unsupportedRecordsSkipped++
      return sessionIdentity
    }
    if (isSynthetic(message)) {
      collection.syntheticSkipped++
      return sessionIdentity
    }

    const messageId = options.source === 'claude-code'
      ? message.id ?? entry.id ?? entry.uuid
      : entry.id ?? entry.uuid ?? message.id
    if (typeof messageId !== 'string' || messageId.length === 0) {
      collection.missingIdentitySkipped++
      return sessionIdentity
    }

    // Claude Code/OpenClaw는 한 assistant message를 여러 조각으로 남길 수 있다.
    // 토큰/turn은 message ID 단위로 합치고 각 조각의 고유 tool call은 모두 보존한다.
    for (const block of contentBlocks(message.content)) {
      if (!['toolCall', 'tool_call', 'tool_use', 'toolUse'].includes(String(block.type ?? ''))) continue
      const name = safeLabel(block.name, 'unknown-tool')
      const id = callId(block)
      if (id) {
        const toolCallHash = hashIdentity(`${sessionIdentity}\u0000tool-call\u0000${id}`)
        if (retainedSeen.has(toolCallHash) || batchSeen.has(toolCallHash)) continue
        batchSeen.add(toolCallHash)
        retainedSeen.set(toolCallHash, { hash: toolCallHash, atUtc: new Date(at).toISOString() })
        toolCalls.set(toolCallHash, { name, skillId: skillFromCall(name, callArguments(block)) })
      }
      const metric = toolMetrics.get(name) ?? { calls: 0, failures: 0 }
      metric.calls++
      toolMetrics.set(name, metric)
    }

    const messageHash = hashIdentity(`${sessionIdentity}\u0000assistant\u0000${messageId}`)
    if (retainedSeen.has(messageHash) || batchSeen.has(messageHash)) {
      collection.duplicatesSkipped++
      const previous = messageUsageMetrics.get(messageHash)
      if (previous) {
        const merged = maxUsage(previous.usage, usageFromMessage(message))
        const increase = usageIncrease(previous.usage, merged)
        addUsage(totalUsage, increase)
        const modelMetric = modelMetrics.get(previous.model)
        if (modelMetric) addUsage(modelMetric.usage, increase)
        previous.usage = merged
        latestIncludedAt = Math.max(latestIncludedAt, at)
      }
      return sessionIdentity
    }
    batchSeen.add(messageHash)
    retainedSeen.set(messageHash, { hash: messageHash, atUtc: new Date(at).toISOString() })

    const usage = usageFromMessage(message)
    const model = safeLabel(message.model, 'unknown-model')
    addUsage(totalUsage, usage)
    const modelMetric = modelMetrics.get(model) ?? { turns: 0, usage: emptyAgentUsage() }
    modelMetric.turns++
    addUsage(modelMetric.usage, usage)
    modelMetrics.set(model, modelMetric)
    messageUsageMetrics.set(messageHash, { model, usage: cloneUsage(usage) })
    sessions.add(hashIdentity(sessionIdentity))
    turns++
    collection.includedRecords++
    latestIncludedAt = Math.max(latestIncludedAt, at)
    return sessionIdentity
  }

  if (input.kind === 'jsonl') {
    for (const filePath of input.files) {
      let info
      try {
        info = await stat(filePath)
      } catch {
        collection.parseFailures++
        continue
      }
      const fileKey = relative(input.root, filePath).replaceAll('\\', '/')
      const previous = options.committed.files[fileKey]
      const sameFile = previous?.dev === String(info.dev) && previous.ino === String(info.ino) && info.size >= previous.offset
      const offset = sameFile ? previous.offset : 0
      if (previous && !sameFile) collection.filesReset++
      if (!previous && info.mtimeMs < startMs) continue
      if (info.size <= offset) continue

      collection.filesRead++
      let sessionIdentity = fileKey
      try {
        const nextOffset = await scanCompleteLines(filePath, offset, (line) => {
          collection.recordsRead++
          let entry: OpenClawEntry
          try {
            entry = JSON.parse(line) as OpenClawEntry
          } catch {
            collection.malformedSkipped++
            return
          }
          sessionIdentity = processEntry(entry, sessionIdentity)
        })
        nextFiles[fileKey] = { dev: String(info.dev), ino: String(info.ino), offset: nextOffset }
      } catch {
        collection.parseFailures++
      }
    }
  } else {
    let database: DatabaseConnection | null = null
    try {
      database = await openReadOnlyDatabase(input.databasePath)
      database.exec('PRAGMA query_only = ON')
      database.exec('BEGIN')
      const databaseAgentId = inspectOpenClawDatabase(database)
      if (databaseAgentId !== input.internalAgentId) {
        throw new Error('OpenClaw SQLite agent identity changed during collection')
      }
      const rows = database.prepare(`
        SELECT session_id, event_json, created_at
        FROM transcript_events
        ORDER BY created_at, session_id, seq
      `).all() as OpenClawSqliteRow[]
      collection.filesRead = 1
      for (const row of rows) {
        collection.recordsRead++
        const sessionIdentity = typeof row.session_id === 'string'
          ? row.session_id
          : typeof row.session_id === 'number' || typeof row.session_id === 'bigint'
            ? String(row.session_id)
            : null
        if (!sessionIdentity) {
          collection.missingIdentitySkipped++
          continue
        }
        if (typeof row.event_json !== 'string') {
          collection.malformedSkipped++
          continue
        }
        let entry: OpenClawEntry
        try {
          entry = JSON.parse(row.event_json) as OpenClawEntry
        } catch {
          collection.malformedSkipped++
          continue
        }
        processEntry(entry, sessionIdentity, row.created_at)
      }
      database.exec('ROLLBACK')
    } catch (cause) {
      try { database?.exec('ROLLBACK') } catch { /* transaction이 시작되지 않았을 수 있다. */ }
      if (cause instanceof Error && cause.message.startsWith('OpenClaw SQLite')) throw cause
      throw new Error('OpenClaw SQLite source could not be read safely')
    } finally {
      database?.close()
    }
  }

  const relation: ThinkingTokensRelation = totalUsage.thinkingTokens > 0 ? 'included-in-output' : 'unknown'
  totalUsage.thinkingTokensRelation = relation
  for (const metric of modelMetrics.values()) metric.usage.thinkingTokensRelation = relation
  // 서버 v1 계약은 collector lag를 최대 30일로 제한한다. 더 오래된 마지막 활동도
  // 30일로 포화시켜 계약을 깨지 않되, reporting stale 판정에는 충분한 신호를 남긴다.
  collection.lagMinutes = latestIncludedAt > 0
    ? Math.min(60 * 24 * 30, Math.max(0, Math.round((endMs - latestIncludedAt) / 6000) / 10))
    : 0

  const healthWarnings: AgentTelemetryHealthWarning[] = []
  if (options.projectSlugs && input.kind === 'jsonl' && input.files.length === 0) {
    healthWarnings.push('no-files-in-scope')
  }
  if (windowRecords > 0 && turns === 0) healthWarnings.push('no-turns-from-records')
  if (
    windowRecords >= MIN_HEALTH_SAMPLE_RECORDS &&
    collection.unsupportedRecordsSkipped / windowRecords >= MAX_UNSUPPORTED_RATIO
  ) {
    healthWarnings.push('high-unsupported-rate')
  }
  const suspiciousClaudeSkips = collection.unsupportedRecordsSkipped +
    collection.missingIdentitySkipped + collection.orphanToolResultsSkipped
  if (options.source === 'claude-code' && toolMetrics.size === 0 && suspiciousClaudeSkips >= MIN_HEALTH_SAMPLE_RECORDS) {
    healthWarnings.push('claude-code-tools-missing')
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
    models: [...modelMetrics.entries()].map(([model, metric]) => ({
      model,
      turns: metric.turns,
      usage: metric.usage,
    })).sort((a, b) => b.turns - a.turns || a.model.localeCompare(b.model)),
    tools: [...toolMetrics.entries()].map(([name, metric]) => ({ name, ...metric }))
      .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name)),
    skillLoads: [...skillMetrics.entries()].map(([skillId, metric]) => ({ skillId, ...metric }))
      .sort((a, b) => b.loaded - a.loaded || a.skillId.localeCompare(b.skillId)),
    taskCategories: turns > 0 ? [{
      category: options.category,
      sessions: sessions.size,
      turns,
      usage: cloneUsage(totalUsage),
    }] : [],
    executions: [],
    collection,
    nextCommitted: {
      lastWindowEndUtc: options.window.end.toISOString(),
      files: nextFiles,
      seenMessages,
      ...(options.source === 'openclaw' && internalAgentHash ? {
        openclawSource: { agentHash: internalAgentHash, backend: input.kind },
      } : {}),
    },
  }
}
