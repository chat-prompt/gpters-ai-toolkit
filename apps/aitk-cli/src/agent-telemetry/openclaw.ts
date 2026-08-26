/** OpenClaw session JSONL을 원문 없이 PII-free delta 집계로 바꾼다. */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import type {
  AgentTaskCategory,
  AgentTelemetryCommittedState,
  AgentTelemetryFileCheckpoint,
  AgentTelemetrySeenMessage,
  AgentTokenUsage,
  ThinkingTokensRelation,
} from './types.js'
import { emptyAgentUsage } from './types.js'

const SEEN_RETENTION_MS = 90 * 86_400_000
const MAX_SEEN_MESSAGES = 100_000
const SAFE_LABEL = /^[a-zA-Z0-9][a-zA-Z0-9._:/+<> -]{0,119}$/
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,99}$/
const FORBIDDEN_LABELS = [
  /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/i,
  /\/(?:Users|home)\//i,
  /(?:bearer|token|secret|password)\s*[:= ]/i,
  /\b(?:sk|ghp|github_pat)-?[A-Za-z0-9_-]{12,}/i,
]

interface OpenClawMessage {
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
  executions: []
  collection: {
    filesRead: number
    filesReset: number
    recordsRead: number
    duplicatesSkipped: number
    syntheticSkipped: number
    malformedSkipped: number
    outsideWindowSkipped: number
    parseFailures: number
    lagMinutes: number
  }
  nextCommitted: AgentTelemetryCommittedState
}

export interface CollectOpenClawOptions {
  sessionsDir: string
  window: { start: Date; end: Date }
  committed: AgentTelemetryCommittedState
  category: AgentTaskCategory
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

function usageFromMessage(message: OpenClawMessage): AgentTokenUsage {
  const usage = message.usage ?? {}
  const thinkingTokens = firstCount(usage, ['thinkingTokens', 'thinking_tokens', 'thinking'])
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

function entryTimestamp(entry: OpenClawEntry): number | null {
  const raw = entry.timestamp ?? entry.message?.timestamp
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const milliseconds = raw < 10_000_000_000 ? raw * 1000 : raw
    return milliseconds
  }
  if (typeof raw !== 'string') return null
  const milliseconds = Date.parse(raw)
  return Number.isFinite(milliseconds) ? milliseconds : null
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

async function listSessionFiles(root: string): Promise<string[]> {
  let entries: string[]
  try {
    entries = await readdir(root, { recursive: true })
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('OpenClaw sessions directory does not exist')
    }
    throw cause
  }
  return entries.filter((entry) => entry.endsWith('.jsonl')).map((entry) => resolve(root, entry)).sort()
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
  const root = resolve(options.sessionsDir)
  const files = await listSessionFiles(root)
  const startMs = options.window.start.getTime()
  const endMs = options.window.end.getTime()
  const totalUsage = emptyAgentUsage()
  const modelMetrics = new Map<string, MutableMetric>()
  const toolMetrics = new Map<string, { calls: number; failures: number }>()
  const skillMetrics = new Map<string, { loaded: number; failed: number; interrupted: number }>()
  const toolCalls = new Map<string, ToolCallMetric>()
  const sessions = new Set<string>()
  const batchSeen = new Set<string>()
  const retainedSeen = new Map<string, AgentTelemetrySeenMessage>()
  const retentionCutoff = endMs - SEEN_RETENTION_MS
  for (const seen of options.committed.seenMessages) {
    if (Date.parse(seen.atUtc) >= retentionCutoff) retainedSeen.set(seen.hash, seen)
  }
  const nextFiles: Record<string, AgentTelemetryFileCheckpoint> = { ...options.committed.files }
  const collection = {
    filesRead: 0,
    filesReset: 0,
    recordsRead: 0,
    duplicatesSkipped: 0,
    syntheticSkipped: 0,
    malformedSkipped: 0,
    outsideWindowSkipped: 0,
    parseFailures: 0,
    lagMinutes: 0,
  }
  let turns = 0
  let latestIncludedAt = 0

  for (const filePath of files) {
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
    let offset = sameFile ? previous.offset : 0
    if (previous && !sameFile) collection.filesReset++
    if (!previous && info.mtimeMs < startMs) continue
    if (info.size <= offset) continue

    collection.filesRead++
    let sessionIdentity = fileKey
    try {
      const nextOffset = await scanCompleteLines(filePath, offset, (line) => {
        let entry: OpenClawEntry
        try {
          entry = JSON.parse(line) as OpenClawEntry
        } catch {
          collection.malformedSkipped++
          return
        }
        collection.recordsRead++
        if (entry.type === 'session' && typeof entry.id === 'string') {
          sessionIdentity = entry.id
          return
        }

        const at = entryTimestamp(entry)
        if (at === null || at < startMs || at >= endMs) {
          collection.outsideWindowSkipped++
          return
        }

        const result = resultInfo(entry)
        if (result?.id) {
          const call = toolCalls.get(result.id)
          if (call) {
            if (result.failed) toolMetrics.get(call.name)!.failures++
            if (call.skillId) {
              const skill = skillMetrics.get(call.skillId) ?? { loaded: 0, failed: 0, interrupted: 0 }
              if (result.failed) skill.failed++
              else skill.loaded++
              skillMetrics.set(call.skillId, skill)
            }
          }
          return
        }

        const message = entry.message
        if (entry.type !== 'message' || message?.role !== 'assistant') return
        if (isSynthetic(message)) {
          collection.syntheticSkipped++
          return
        }

        const messageId = entry.id ?? entry.uuid
        if (typeof messageId !== 'string' || messageId.length === 0) return
        const messageHash = hashIdentity(`${sessionIdentity}\u0000${messageId}`)
        if (retainedSeen.has(messageHash) || batchSeen.has(messageHash)) {
          collection.duplicatesSkipped++
          return
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
        sessions.add(hashIdentity(sessionIdentity))
        turns++
        latestIncludedAt = Math.max(latestIncludedAt, at)

        for (const block of contentBlocks(message.content)) {
          if (!['toolCall', 'tool_call', 'tool_use', 'toolUse'].includes(String(block.type ?? ''))) continue
          const name = safeLabel(block.name, 'unknown-tool')
          const metric = toolMetrics.get(name) ?? { calls: 0, failures: 0 }
          metric.calls++
          toolMetrics.set(name, metric)
          const id = callId(block)
          if (id) toolCalls.set(id, { name, skillId: skillFromCall(name, callArguments(block)) })
        }
      })
      nextFiles[fileKey] = { dev: String(info.dev), ino: String(info.ino), offset: nextOffset }
    } catch {
      collection.parseFailures++
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
    },
  }
}
