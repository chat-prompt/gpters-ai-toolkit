import { z } from 'zod'

export const agentTaskEventSchema = z.object({
  taskId: z.string().uuid(), eventId: z.string().uuid(), attemptId: z.string().uuid(), parentEventId: z.string().uuid().optional(),
  phase: z.enum(['task','search','search-skip','execution-report','skill-load','execution','verification','delivery','tool','read-guard','compaction']),
  status: z.enum(['started','succeeded','failed','skipped','unknown']),
  evidence: z.enum(['process','api','self-reported']),
  atUtc: z.string().datetime(),
  durationMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  metrics: z.object({
    contextInputTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    toolResultChars: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    readGuardDeniedCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    compactionCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  }).strict().optional(),
}).strict()
export type AxAgentTaskEvent = z.infer<typeof agentTaskEventSchema>
export interface AxAgentTaskTrace {
  taskId: string; agentId: string; source: string; versions: string[]
  startedAt: string; updatedAt: string
  events: AxAgentTaskEvent[]
  /** No attribution from overlapping batch time ranges. */
  tokens: null
}
/** Timestamp ties respect causal links. UUID lexical order is never chronology.
 * Unlinked ties keep received order, with starts before terminal states in an attempt.
 * Cycles are invalid causality; retain those records deterministically without looping.
 */
export function orderTaskEvents(events: AxAgentTaskEvent[]): AxAgentTaskEvent[] {
  const pending = [...events].sort((a, b) => Date.parse(a.atUtc) - Date.parse(b.atUtc))
  const result: AxAgentTaskEvent[] = []
  const remaining = new Set(pending.map(event => event.eventId))
  while (pending.length) {
    let index = pending.findIndex(event =>
      (!event.parentEventId || !remaining.has(event.parentEventId)) &&
      !(event.status !== 'started' && pending.some(other =>
        other.attemptId === event.attemptId && other.phase === event.phase &&
        other.status === 'started' && Date.parse(other.atUtc) === Date.parse(event.atUtc) && other.parentEventId !== event.eventId)))
    if (index < 0) index = 0
    const [event] = pending.splice(index, 1)
    remaining.delete(event.eventId)
    result.push(event)
  }
  return result
}
/** Replayed event IDs are counted once within the authenticated agent/source stream. */
export function buildAgentTaskTraces(rows: Array<{ agentId: string; runtime: unknown; collection: unknown }>, cutoff: Date, now: Date): AxAgentTaskTrace[] {
  const tasks = new Map<string, AxAgentTaskTrace>()
  const seen = new Set<string>()
  for (const row of rows) {
    const collection = row.collection as { source?: string; taskEvents?: unknown[] } | null
    if (!collection || !['claude-code','codex','openclaw','hermes'].includes(collection.source ?? '') || !Array.isArray(collection.taskEvents)) continue
    for (const raw of collection.taskEvents) {
      const parsed = agentTaskEventSchema.safeParse(raw)
      if (!parsed.success) continue
      const event = parsed.data
      const at = Date.parse(event.atUtc)
      if (at < cutoff.getTime() || at > now.getTime()) continue
      const identity = `${row.agentId}:${collection.source}:${event.eventId}`
      if (seen.has(identity)) continue
      seen.add(identity)
      const key = `${row.agentId}:${collection.source}:${event.taskId}`
      const trace = tasks.get(key) ?? { taskId: event.taskId, agentId: row.agentId, source: collection.source!, versions: [], startedAt: event.atUtc, updatedAt: event.atUtc, events: [], tokens: null }
      const runtime = row.runtime as { collectorVersion?: unknown } | null
      const version = typeof runtime?.collectorVersion === 'string' ? runtime.collectorVersion : 'unknown'
      if (!trace.versions.includes(version)) trace.versions.push(version)
      trace.events.push(event)
      if (at < Date.parse(trace.startedAt)) trace.startedAt = event.atUtc
      if (at > Date.parse(trace.updatedAt)) trace.updatedAt = event.atUtc
      tasks.set(key, trace)
    }
  }
  return [...tasks.values()].map(trace => ({ ...trace, events: orderTaskEvents(trace.events) }))
    .sort((a,b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
}

/** Bound the response per authenticated agent/source, so a busy stream cannot hide another. */
export function limitAgentTaskTraces(traces: AxAgentTaskTrace[]) {
  const limitPerStream = 100
  const streams = new Map<string, { agentId: string; source: string; total: number; returned: number }>()
  const selected = traces.filter(trace => {
    const key = `${trace.agentId}:${trace.source}`
    const stream = streams.get(key) ?? {agentId: trace.agentId, source: trace.source, total: 0, returned: 0}
    streams.set(key, stream)
    stream.total++
    if (stream.returned >= limitPerStream) return false
    stream.returned++
    return true
  })
  return { traces: selected, coverage: { limitPerStream, truncatedStreams: [...streams.values()].filter(stream => stream.returned < stream.total) } }
}
