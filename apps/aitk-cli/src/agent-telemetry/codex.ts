/** Codex rollout JSONL을 원문 없이 PII-free delta 집계로 바꾼다. */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open, readdir, stat } from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'
import type { OpenClawCollection } from './openclaw.js'
import type {
  AgentTaskCategory,
  AgentTelemetryCommittedState,
  AgentTelemetryFileCheckpoint,
  AgentTelemetryHealthWarning,
  AgentTelemetrySeenMessage,
  AgentTokenUsage,
} from './types.js'
import { emptyAgentUsage } from './types.js'

const SEEN_RETENTION_MS = 90 * 86_400_000
const MAX_SEEN_MESSAGES = 100_000
const MIN_HEALTH_SAMPLE_RECORDS = 20
const MAX_UNSUPPORTED_RATIO = 0.5
const MAX_FIRST_LINE_BYTES = 2 * 1024 * 1024
const SAFE_LABEL = /^[a-zA-Z0-9][a-zA-Z0-9._:/+<> -]{0,119}$/
const FORBIDDEN_LABELS = [
  /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/i,
  /\/(?:Users|home)\//i,
  /(?:bearer|token|secret|password)\s*[:= ]/i,
]
const TOOL_ITEM_TYPES = new Set([
  'CommandExecution', 'DynamicToolCall', 'Extension', 'FileChange', 'ImageView',
  'McpToolCall', 'SubAgentActivity',
])

interface CodexEntry {
  timestamp?: unknown
  type?: unknown
  payload?: Record<string, unknown>
}

interface MutableMetric {
  turns: number
  usage: AgentTokenUsage
}

export interface CollectCodexOptions {
  sessionsDir: string
  window: { start: Date; end: Date }
  committed: AgentTelemetryCommittedState
  category: AgentTaskCategory
  source: 'codex'
  projectSlugs: string[]
}

function toCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.round(value)
}

function safeLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const candidate = value.trim()
  if (!SAFE_LABEL.test(candidate) || FORBIDDEN_LABELS.some((pattern) => pattern.test(candidate))) return fallback
  return candidate
}

function hashIdentity(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function addUsage(target: AgentTokenUsage, source: AgentTokenUsage): void {
  target.inputTokens += source.inputTokens
  target.outputTokens += source.outputTokens
  target.cacheCreationInputTokens += source.cacheCreationInputTokens
  target.cacheReadInputTokens += source.cacheReadInputTokens
  target.thinkingTokens += source.thinkingTokens
  if (source.thinkingTokensRelation !== 'unknown') target.thinkingTokensRelation = source.thinkingTokensRelation
}

function usageFromTokenCount(payload: Record<string, unknown>): AgentTokenUsage | null {
  const info = payload.info
  if (!info || typeof info !== 'object' || Array.isArray(info)) return null
  const raw = (info as Record<string, unknown>).last_token_usage
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const usage = raw as Record<string, unknown>
  const cached = toCount(usage.cached_input_tokens)
  const thinking = toCount(usage.reasoning_output_tokens)
  return {
    inputTokens: Math.max(0, toCount(usage.input_tokens) - cached),
    outputTokens: toCount(usage.output_tokens),
    cacheCreationInputTokens: toCount(usage.cache_write_input_tokens),
    cacheReadInputTokens: cached,
    thinkingTokens: thinking,
    thinkingTokensRelation: thinking > 0 ? 'included-in-output' : 'unknown',
  }
}

function cumulativeUsageIdentity(payload: Record<string, unknown>): string | null {
  const info = payload.info
  if (!info || typeof info !== 'object' || Array.isArray(info)) return null
  const raw = (info as Record<string, unknown>).total_token_usage
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const usage = raw as Record<string, unknown>
  return JSON.stringify({
    inputTokens: toCount(usage.input_tokens),
    outputTokens: toCount(usage.output_tokens),
    cacheCreationInputTokens: toCount(usage.cache_write_input_tokens),
    cacheReadInputTokens: toCount(usage.cached_input_tokens),
    thinkingTokens: toCount(usage.reasoning_output_tokens),
    totalTokens: toCount(usage.total_tokens),
  })
}

function entryTimestamp(entry: CodexEntry): number | null {
  if (typeof entry.timestamp !== 'string') return null
  const milliseconds = Date.parse(entry.timestamp)
  return Number.isFinite(milliseconds) ? milliseconds : null
}

function scopeName(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  const name = basename(value.replaceAll('\\', '/'))
  return name && name !== '.' && name !== '..' ? name : null
}

async function firstEntry(filePath: string): Promise<CodexEntry | null> {
  const handle = await open(filePath, 'r')
  try {
    let buffer = Buffer.alloc(0)
    let position = 0
    while (buffer.length < MAX_FIRST_LINE_BYTES) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, MAX_FIRST_LINE_BYTES - buffer.length))
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, position)
      if (bytesRead === 0) break
      position += bytesRead
      buffer = Buffer.concat([buffer, chunk.subarray(0, bytesRead)])
      const newline = buffer.indexOf(0x0a)
      if (newline >= 0) buffer = buffer.subarray(0, newline)
      if (newline >= 0) break
    }
    if (buffer.length === 0 || buffer.length >= MAX_FIRST_LINE_BYTES) return null
    return JSON.parse(buffer.toString('utf8').replace(/\r$/, '')) as CodexEntry
  } catch {
    return null
  } finally {
    await handle.close()
  }
}

async function listCodexFiles(
  root: string,
  projectSlugs: string[]
): Promise<{ files: string[]; discovered: number; excludedByScope: number }> {
  let entries: string[]
  try {
    entries = await readdir(root, { recursive: true })
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Codex sessions directory does not exist')
    throw cause
  }
  const jsonlEntries = entries.filter((entry) => entry.endsWith('.jsonl'))
  const allowed = new Set(projectSlugs)
  const files: string[] = []
  for (const entry of jsonlEntries) {
    const filePath = resolve(root, entry)
    const first = await firstEntry(filePath)
    if (first?.type === 'session_meta' && allowed.has(scopeName(first.payload?.cwd) ?? '')) files.push(filePath)
  }
  return { files: files.sort(), discovered: jsonlEntries.length, excludedByScope: jsonlEntries.length - files.length }
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

function toolInfo(item: Record<string, unknown>): { name: string; failed: boolean } | null {
  const type = String(item.type ?? '')
  if (!TOOL_ITEM_TYPES.has(type)) return null
  let name = type
  if (type === 'McpToolCall' || type === 'DynamicToolCall') {
    name = safeLabel(item.tool, type)
  }
  if (type === 'SubAgentActivity') name = 'Agent'
  const status = String(item.status ?? '').toLowerCase()
  const failed = status === 'failed' || item.success === false ||
    (typeof item.exit_code === 'number' && item.exit_code !== 0)
  return { name, failed }
}

export async function collectCodexAgent(options: CollectCodexOptions): Promise<OpenClawCollection> {
  const root = resolve(options.sessionsDir)
  const listed = await listCodexFiles(root, options.projectSlugs)
  const startMs = options.window.start.getTime()
  const endMs = options.window.end.getTime()
  const allowed = new Set(options.projectSlugs)
  const totalUsage = emptyAgentUsage()
  const modelMetrics = new Map<string, MutableMetric>()
  const toolMetrics = new Map<string, { calls: number; failures: number }>()
  const executions = new Map<'success' | 'failed', number>()
  const sessions = new Set<string>()
  const batchSeen = new Set<string>()
  const retainedSeen = new Map<string, AgentTelemetrySeenMessage>()
  const retentionCutoff = endMs - SEEN_RETENTION_MS
  for (const seen of options.committed.seenMessages) {
    if (Date.parse(seen.atUtc) >= retentionCutoff) retainedSeen.set(seen.hash, seen)
  }
  const nextFiles: Record<string, AgentTelemetryFileCheckpoint> = { ...options.committed.files }
  const collection = {
    source: options.source,
    filesDiscovered: listed.discovered,
    filesExcludedByScope: listed.excludedByScope,
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

  for (const filePath of listed.files) {
    let info
    try {
      info = await stat(filePath)
    } catch {
      collection.parseFailures++
      continue
    }
    const fileKey = relative(root, filePath).replaceAll('\\', '/')
    const previous = options.committed.files[fileKey]
    const sameFile = previous?.dev === String(info.dev) && previous.ino === String(info.ino) && info.size >= previous.offset
    const offset = sameFile ? previous.offset : 0
    if (previous && !sameFile) collection.filesReset++
    if (!previous && info.mtimeMs < startMs) continue
    if (info.size <= offset) continue

    collection.filesRead++
    let currentModel = 'unknown-model'
    let currentInScope = true
    let currentTurnId: string | null = null
    const sessionHash = hashIdentity(fileKey)
    try {
      const nextOffset = await scanCompleteLines(filePath, offset, (line) => {
        collection.recordsRead++
        let entry: CodexEntry
        try {
          entry = JSON.parse(line) as CodexEntry
        } catch {
          collection.malformedSkipped++
          return
        }
        const payload = entry.payload ?? {}
        const payloadType = String(payload.type ?? '')

        if (entry.type === 'turn_context') {
          currentModel = safeLabel(payload.model, currentModel)
          currentInScope = allowed.has(scopeName(payload.cwd) ?? '')
        } else if (entry.type === 'event_msg' && payloadType === 'task_started') {
          currentTurnId = typeof payload.turn_id === 'string' ? payload.turn_id : null
        }

        const at = entryTimestamp(entry)
        if (at === null) {
          collection.malformedSkipped++
          return
        }
        if (at < startMs || at >= endMs) {
          collection.outsideWindowSkipped++
          return
        }

        if (entry.type === 'session_meta' || entry.type === 'turn_context' ||
          (entry.type === 'event_msg' && payloadType === 'task_started')) {
          collection.metadataSkipped++
          return
        }
        if (!currentInScope) {
          collection.metadataSkipped++
          return
        }

        if (entry.type === 'event_msg' && payloadType === 'token_count') {
          const usage = usageFromTokenCount(payload)
          if (!usage) {
            collection.malformedSkipped++
            return
          }
          // Codex는 같은 누적 total_token_usage 스냅샷을 timestamp만 바꿔 재방출할 수 있다.
          // last_token_usage는 그때도 그대로라 timestamp 기준 합산은 실제 사용량을 부풀린다.
          const cumulativeIdentity = cumulativeUsageIdentity(payload)
          const usageIdentity = hashIdentity(cumulativeIdentity
            ? `${fileKey}\u0000token-total\u0000${cumulativeIdentity}`
            : `${fileKey}\u0000token-fallback\u0000${entry.timestamp}\u0000${currentTurnId ?? ''}\u0000${JSON.stringify(usage)}`)
          if (retainedSeen.has(usageIdentity) || batchSeen.has(usageIdentity)) {
            collection.duplicatesSkipped++
            return
          }
          batchSeen.add(usageIdentity)
          retainedSeen.set(usageIdentity, { hash: usageIdentity, atUtc: new Date(at).toISOString() })
          addUsage(totalUsage, usage)
          const model = modelMetrics.get(currentModel) ?? { turns: 0, usage: emptyAgentUsage() }
          addUsage(model.usage, usage)
          modelMetrics.set(currentModel, model)
          sessions.add(sessionHash)
          collection.includedRecords++
          latestIncludedAt = Math.max(latestIncludedAt, at)
          return
        }

        if (entry.type === 'event_msg' && payloadType === 'item_completed') {
          const item = payload.item
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            collection.malformedSkipped++
            return
          }
          const itemRecord = item as Record<string, unknown>
          const tool = toolInfo(itemRecord)
          if (!tool) {
            collection.metadataSkipped++
            return
          }
          const itemId = itemRecord.id
          if (typeof itemId !== 'string' || itemId.length === 0) {
            collection.missingIdentitySkipped++
            return
          }
          const itemHash = hashIdentity(`${fileKey}\u0000tool\u0000${itemId}`)
          if (retainedSeen.has(itemHash) || batchSeen.has(itemHash)) {
            collection.duplicatesSkipped++
            return
          }
          batchSeen.add(itemHash)
          retainedSeen.set(itemHash, { hash: itemHash, atUtc: new Date(at).toISOString() })
          const metric = toolMetrics.get(tool.name) ?? { calls: 0, failures: 0 }
          metric.calls++
          if (tool.failed) metric.failures++
          toolMetrics.set(tool.name, metric)
          sessions.add(sessionHash)
          collection.includedRecords++
          latestIncludedAt = Math.max(latestIncludedAt, at)
          return
        }

        if (entry.type === 'event_msg' && payloadType === 'task_complete') {
          const turnId = typeof payload.turn_id === 'string' ? payload.turn_id : currentTurnId
          currentTurnId = null
          if (!turnId) {
            collection.missingIdentitySkipped++
            return
          }
          const turnHash = hashIdentity(`${fileKey}\u0000turn\u0000${turnId}`)
          if (retainedSeen.has(turnHash) || batchSeen.has(turnHash)) {
            collection.duplicatesSkipped++
            return
          }
          batchSeen.add(turnHash)
          retainedSeen.set(turnHash, { hash: turnHash, atUtc: new Date(at).toISOString() })
          const model = modelMetrics.get(currentModel) ?? { turns: 0, usage: emptyAgentUsage() }
          model.turns++
          modelMetrics.set(currentModel, model)
          turns++
          const status = payload.error ? 'failed' : 'success'
          executions.set(status, (executions.get(status) ?? 0) + 1)
          sessions.add(sessionHash)
          collection.includedRecords++
          latestIncludedAt = Math.max(latestIncludedAt, at)
          return
        }

        if (entry.type === 'response_item' || entry.type === 'event_msg') {
          collection.metadataSkipped++
          return
        }
        collection.unsupportedRecordsSkipped++
      })
      nextFiles[fileKey] = { dev: String(info.dev), ino: String(info.ino), offset: nextOffset }
    } catch {
      collection.parseFailures++
    }
  }

  const relation = totalUsage.thinkingTokens > 0 ? 'included-in-output' : 'unknown'
  totalUsage.thinkingTokensRelation = relation
  for (const metric of modelMetrics.values()) metric.usage.thinkingTokensRelation = relation
  collection.lagMinutes = latestIncludedAt > 0
    ? Math.min(60 * 24 * 30, Math.max(0, Math.round((endMs - latestIncludedAt) / 6000) / 10))
    : 0

  const healthWarnings: AgentTelemetryHealthWarning[] = []
  if (listed.files.length === 0) healthWarnings.push('no-files-in-scope')
  if (collection.recordsRead >= MIN_HEALTH_SAMPLE_RECORDS && turns === 0 && collection.includedRecords === 0) {
    healthWarnings.push('no-turns-from-records')
  }
  if (collection.recordsRead >= MIN_HEALTH_SAMPLE_RECORDS &&
    collection.unsupportedRecordsSkipped / collection.recordsRead >= MAX_UNSUPPORTED_RATIO) {
    healthWarnings.push('high-unsupported-rate')
  }
  if (turns > 0 && toolMetrics.size === 0) healthWarnings.push('codex-tools-missing')
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
    executions: [...executions.entries()].map(([status, count]) => ({ status, evidence: 'verified' as const, count })),
    collection,
    nextCommitted: {
      lastWindowEndUtc: options.window.end.toISOString(),
      files: nextFiles,
      seenMessages,
    },
  }
}
