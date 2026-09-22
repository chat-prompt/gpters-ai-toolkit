/**
 * Agent observation contract: aggregates only (histograms, counts, sizes), never prompt text, paths or IDs.
 *
 * Every level is strict. New fields are optional so rows stored before they existed still parse.
 */
import { z } from 'zod'

export const OBSERVABILITY_BOUNDS = [0, 100, 1000, 8000, 32000, 64000, 128000, 200000, 500000, 1000000] as const
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const utc = z.string().datetime({ offset: false }).refine(value => new Date(value).toISOString() === value)
export const capabilitySchema = z.enum(['supported', 'unsupported', 'uncollected', 'incomplete'])
export const observationHistogramSchema = z.object({
  bounds: z.array(count).length(OBSERVABILITY_BOUNDS.length),
  counts: z.array(count).length(OBSERVABILITY_BOUNDS.length + 1),
  count, sum: count, min: count.nullable(), max: count.nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.bounds.some((bound, i) => bound !== OBSERVABILITY_BOUNDS[i]) ||
      value.counts.reduce((a,b) => a+b,0) !== value.count ||
      (value.count === 0 ? value.sum !== 0 || value.min !== null || value.max !== null :
        value.min === null || value.max === null || value.min > value.max ||
        value.sum < value.min * value.count || value.sum > value.max * value.count)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid mergeable histogram' })
  }
})
export const runtimeReceiptSchema = z.object({
  receiptId: z.string().uuid(), taskId: z.string().uuid(), attemptId: z.string().uuid(), atUtc: utc,
  kind: z.enum(['scheduler', 'process', 'slack-api']), status: z.enum(['succeeded', 'failed', 'unknown']),
  evidence: z.enum(['scheduler', 'process', 'api']),
  claim: z.enum(['scheduler-completed', 'process-exited', 'api-accepted']),
  durationMs: count.optional(), expectedDeadlineUtc: utc.optional(),
}).strict().superRefine((value, ctx) => {
  const pairs = { scheduler: ['scheduler', 'scheduler-completed'], process: ['process', 'process-exited'], 'slack-api': ['api', 'api-accepted'] }
  if (pairs[value.kind][0] !== value.evidence || pairs[value.kind][1] !== value.claim) ctx.addIssue({code: z.ZodIssueCode.custom, message: 'Receipt claim does not match evidence'})
})
/**
 * Boot-file health for runtimes that inject workspace files into the system prompt (OpenClaw).
 * Counts are snapshots generated inside the window; sizes are characters of the largest injected file.
 * No file names are carried — only numbers.
 */
export const bootstrapObservationSchema = z.object({
  /** Boot snapshots generated inside the window */
  sessions: count,
  /** Snapshots where any injected file was truncated */
  truncatedSessions: count,
  /** Snapshots where any injected file was near the per-file limit */
  nearLimitSessions: count,
  /** Snapshots where the runtime showed a truncation warning */
  warningSessions: count,
  /** Largest injected file size (characters) across the window's snapshots */
  largestFileCharsMax: count.nullable(),
  /** Largest injected file size (characters) in the window's latest snapshot */
  largestFileCharsLatest: count.nullable(),
  /** Per-file injection limit (characters) reported by the latest snapshot */
  fileCharsLimit: count.nullable(),
  /** Whole system prompt (characters) of the latest snapshot; optional so rows stored before it still parse */
  promptCharsLatest: count.nullable().optional(),
  /** Largest whole system prompt (characters) across the window's snapshots */
  promptCharsMax: count.nullable().optional(),
  /** Sum of whole system prompt sizes across snapshots, so windows merge into an average */
  promptCharsSum: count.nullable().optional(),
  /** Injected workspace files in the latest snapshot's prompt (characters) */
  projectContextCharsLatest: count.nullable().optional(),
  /** Tool schemas sent with the latest snapshot (characters) */
  toolSchemaCharsLatest: count.nullable().optional(),
}).strict().superRefine((value, ctx) => {
  // Prompt sizes travel together: all absent (older collectors), or all present — null exactly when there is no snapshot.
  const prompt = [value.promptCharsLatest, value.promptCharsMax, value.promptCharsSum, value.projectContextCharsLatest, value.toolSchemaCharsLatest]
  if (prompt.some(v => v !== undefined)) {
    if (prompt.some(v => v === undefined) || (value.sessions === 0 ? prompt.some(v => v !== null) : prompt.some(v => v === null))
      || (value.sessions > 0 && (value.promptCharsLatest! > value.promptCharsMax! || value.promptCharsSum! < value.promptCharsMax!
        || value.promptCharsSum! > value.promptCharsMax! * value.sessions || value.projectContextCharsLatest! > value.promptCharsLatest!))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid boot prompt size' })
    }
  }
  if (value.truncatedSessions > value.sessions || value.nearLimitSessions > value.sessions || value.warningSessions > value.sessions
    || (value.sessions === 0 ? value.largestFileCharsMax !== null || value.largestFileCharsLatest !== null || value.fileCharsLimit !== null
      : value.largestFileCharsMax === null || value.largestFileCharsLatest === null || value.largestFileCharsLatest > value.largestFileCharsMax)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid boot-file observation' })
  }
})
/** Boot-file observation aggregate */
export type BootstrapObservation = z.infer<typeof bootstrapObservationSchema>
const metricNames = ['firstTurnTokens', 'peakContextTokens', 'toolResultChars', 'compactionEvents', 'readGuardAllow', 'readGuardDeny'] as const
const metricCapabilities = z.object({ firstTurnTokens: capabilitySchema, peakContextTokens: capabilitySchema,
  toolResultChars: capabilitySchema, compactionEvents: capabilitySchema, readGuardAllow: capabilitySchema, readGuardDeny: capabilitySchema,
  bootstrap: capabilitySchema.optional(), probeFirstTurnTokens: capabilitySchema.optional() }).strict()
const counters = z.object({ filesExpected: count, filesRead: count, recordsRead: count, parseFailures: count,
  unsupportedRecords: count, missingTimestamps: count, duplicates: count, rotatedFiles: count }).strict()
export const agentObservabilitySchema = z.object({
  schemaVersion: z.literal(1), agentId: z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,99}$/), source: z.enum(['claude-code', 'codex', 'openclaw', 'hermes']),
  window: z.object({ startUtc: utc, endUtc: utc }).strict(),
  capabilities: z.object({ runtimeReceipts: capabilitySchema, cliMetrics: capabilitySchema, readGuard: capabilitySchema }).strict(),
  receipts: z.array(runtimeReceiptSchema).max(500),
  metrics: z.object({ firstTurnTokens: observationHistogramSchema.nullable(), peakContextTokens: observationHistogramSchema.nullable(),
    toolResultChars: observationHistogramSchema.nullable(), compactionEvents: count.nullable(), readGuardAllow: count.nullable(), readGuardDeny: count.nullable(),
    bootstrap: bootstrapObservationSchema.nullable().optional(),
    /** First-turn input of the daily fixed boot probe sessions (same prompt every day), apart from real sessions */
    probeFirstTurnTokens: observationHistogramSchema.nullable().optional() }).strict(),
  metricCapabilities,
  provenance: z.object({ adapterVersion: z.enum(['1', '2', '3']), cli: counters, readGuard: counters,
    runtime: z.object({ recordsRead: count, unmatchedRecords: count, unsupportedRecords: count, missingTimestamps: count, duplicates: count, conflicts: count }).strict() }).strict(),
}).strict().superRefine((value, ctx) => {
  const start = Date.parse(value.window.startUtc), end = Date.parse(value.window.endUtc)
  if (start >= end || value.receipts.some(r => Date.parse(r.atUtc) < start || Date.parse(r.atUtc) >= end)) ctx.addIssue({code: z.ZodIssueCode.custom, message: 'Observation outside window'})
  if (new Set(value.receipts.map(r => r.receiptId)).size !== value.receipts.length) ctx.addIssue({code: z.ZodIssueCode.custom, message: 'Duplicate receipt'})
  for (const key of metricNames) {
    const capability = value.metricCapabilities[key]
    if ((capability === 'unsupported' || capability === 'uncollected') && value.metrics[key] !== null) ctx.addIssue({code: z.ZodIssueCode.custom, message: 'Unobserved metrics must be null'})
    if (capability === 'supported' && value.metrics[key] === null) ctx.addIssue({code: z.ZodIssueCode.custom, message: 'Supported metrics require observed values'})
  }
  // Optional metrics (boot-file health, boot probe) are absent from older rows; value and capability travel together.
  for (const key of ['bootstrap', 'probeFirstTurnTokens'] as const) {
    const metric = value.metrics[key], capability = value.metricCapabilities[key]
    if ((metric === undefined) !== (capability === undefined)) ctx.addIssue({code: z.ZodIssueCode.custom, message: 'Optional metric value and capability must be present together'})
    else if (capability !== undefined) {
      if ((capability === 'unsupported' || capability === 'uncollected') && metric !== null) ctx.addIssue({code: z.ZodIssueCode.custom, message: 'Unobserved metrics must be null'})
      if (capability === 'supported' && metric === null) ctx.addIssue({code: z.ZodIssueCode.custom, message: 'Supported metrics require observed values'})
    }
  }
})
/** Validated agent observation for one collection window */
export type AgentObservability = z.infer<typeof agentObservabilitySchema>
/**
 * Fixed reasons a managed collector sent a window without observability because a source changed while it
 * was scanned. They describe timing, not a safety failure; the window has usage telemetry but no observation.
 */
export const OBSERVATION_FAILURE_REASONS = ['source-changed', 'partial-tail'] as const
/** Timing reason a window was sent without observability */
export type ObservationFailureReason = typeof OBSERVATION_FAILURE_REASONS[number]
