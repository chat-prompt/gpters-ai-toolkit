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
const metricNames = ['firstTurnTokens', 'peakContextTokens', 'toolResultChars', 'compactionEvents', 'readGuardAllow', 'readGuardDeny'] as const
const metricCapabilities = z.object({ firstTurnTokens: capabilitySchema, peakContextTokens: capabilitySchema,
  toolResultChars: capabilitySchema, compactionEvents: capabilitySchema, readGuardAllow: capabilitySchema, readGuardDeny: capabilitySchema }).strict()
const counters = z.object({ filesExpected: count, filesRead: count, recordsRead: count, parseFailures: count,
  unsupportedRecords: count, missingTimestamps: count, duplicates: count, rotatedFiles: count }).strict()
export const agentObservabilitySchema = z.object({
  schemaVersion: z.literal(1), agentId: z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,99}$/), source: z.enum(['claude-code', 'codex', 'openclaw', 'hermes']),
  window: z.object({ startUtc: utc, endUtc: utc }).strict(),
  capabilities: z.object({ runtimeReceipts: capabilitySchema, cliMetrics: capabilitySchema, readGuard: capabilitySchema }).strict(),
  receipts: z.array(runtimeReceiptSchema).max(500),
  metrics: z.object({ firstTurnTokens: observationHistogramSchema.nullable(), peakContextTokens: observationHistogramSchema.nullable(),
    toolResultChars: observationHistogramSchema.nullable(), compactionEvents: count.nullable(), readGuardAllow: count.nullable(), readGuardDeny: count.nullable() }).strict(),
  metricCapabilities,
  provenance: z.object({ adapterVersion: z.enum(['1', '2']), cli: counters, readGuard: counters,
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
})
export type AgentObservability = z.infer<typeof agentObservabilitySchema>
