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
      if (event.atUtc < trace.startedAt) trace.startedAt = event.atUtc
      if (event.atUtc > trace.updatedAt) trace.updatedAt = event.atUtc
      tasks.set(key, trace)
    }
  }
  return [...tasks.values()].map(trace => ({ ...trace, events: trace.events.sort((a,b) => a.atUtc.localeCompare(b.atUtc) || a.eventId.localeCompare(b.eventId)) }))
    .sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 100)
}
