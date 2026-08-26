/** 개인정보를 받지 않는 에이전트 delta telemetry v1 계약 */

import { z } from 'zod'

export const AX_AGENT_TASK_CATEGORIES = [
  'webinar-ops', 'study-ops', 'community-ops', 'marketing-copy', 'sending-exec',
  'design-asset', 'image-gen', 'data-airtable', 'linear-issue', 'report-daily',
  'memory-curation', 'graph-maintenance', 'skill-authoring', 'infra-ops',
  'incident-response', 'research-external', 'code-deploy', 'document-writing',
  'qa-verify', 'session-cleanup', 'unclassified',
] as const

const nonNegativeInt = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const safeId = z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9._:-]*$/)
const safeLabel = z.string().min(1).max(120).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/+<> -]*$/)
const timestamp = z.string().datetime({ offset: true })

const usageSchema = z.object({
  inputTokens: nonNegativeInt,
  outputTokens: nonNegativeInt,
  cacheCreationInputTokens: nonNegativeInt,
  cacheReadInputTokens: nonNegativeInt,
  thinkingTokens: nonNegativeInt,
  thinkingTokensRelation: z.enum(['included-in-output', 'separate-from-output', 'unknown']),
}).strict()

const modelSchema = z.object({ model: safeLabel, turns: nonNegativeInt, usage: usageSchema }).strict()
const toolSchema = z.object({
  name: safeLabel,
  calls: nonNegativeInt,
  failures: nonNegativeInt,
}).strict().refine((row) => row.failures <= row.calls, { message: 'tool failures cannot exceed calls' })
const skillLoadSchema = z.object({
  skillId: safeId,
  loaded: nonNegativeInt,
  failed: nonNegativeInt,
  interrupted: nonNegativeInt,
}).strict()
const taskCategorySchema = z.object({
  category: z.enum(AX_AGENT_TASK_CATEGORIES),
  sessions: nonNegativeInt,
  turns: nonNegativeInt,
  usage: usageSchema,
}).strict()
const executionSchema = z.object({
  status: z.enum(['success', 'partial', 'failed', 'abandoned', 'running']),
  evidence: z.enum(['verified', 'self-reported', 'none']),
  count: nonNegativeInt,
}).strict()

const sourceSchema = z.enum(['openclaw', 'claude-code'])
const healthWarningSchema = z.enum([
  'no-turns-from-records',
  'high-unsupported-rate',
  'claude-code-tools-missing',
  'no-files-in-scope',
])

export const axAgentTelemetryBatchSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  batchId: z.string().uuid(),
  agentId: safeId,
  collectorInstanceId: safeId,
  runtime: z.object({
    openclawVersion: safeLabel,
    claudeCliVersion: safeLabel,
    collectorVersion: safeLabel,
  }).strict(),
  window: z.object({ startUtc: timestamp, endUtc: timestamp }).strict(),
  collectedAtUtc: timestamp,
  usage: usageSchema,
  sessions: nonNegativeInt,
  turns: nonNegativeInt,
  models: z.array(modelSchema).max(100),
  tools: z.array(toolSchema).max(200),
  skillLoads: z.array(skillLoadSchema).max(500),
  taskCategories: z.array(taskCategorySchema).max(100),
  executions: z.array(executionSchema).max(20),
  collection: z.object({
    source: sourceSchema,
    filesDiscovered: nonNegativeInt,
    filesExcludedByScope: nonNegativeInt,
    filesRead: nonNegativeInt,
    filesReset: nonNegativeInt,
    recordsRead: nonNegativeInt,
    includedRecords: nonNegativeInt,
    metadataSkipped: nonNegativeInt,
    nonAssistantSkipped: nonNegativeInt,
    duplicatesSkipped: nonNegativeInt,
    syntheticSkipped: nonNegativeInt,
    malformedSkipped: nonNegativeInt,
    outsideWindowSkipped: nonNegativeInt,
    unsupportedRecordsSkipped: nonNegativeInt,
    missingIdentitySkipped: nonNegativeInt,
    orphanToolResultsSkipped: nonNegativeInt,
    parseFailures: nonNegativeInt,
    lagMinutes: z.number().nonnegative().max(60 * 24 * 30),
    healthStatus: z.enum(['healthy', 'blocked']),
    healthWarnings: z.array(healthWarningSchema).max(4),
  }).strict(),
}).strict().superRefine((batch, ctx) => {
  const start = new Date(batch.window.startUtc).getTime()
  const end = new Date(batch.window.endUtc).getTime()
  const collected = new Date(batch.collectedAtUtc).getTime()
  if (end <= start) ctx.addIssue({ code: 'custom', path: ['window', 'endUtc'], message: 'window end must be after start' })
  if (end > collected) ctx.addIssue({ code: 'custom', path: ['window', 'endUtc'], message: 'window end cannot be after collection time' })
  if (batch.models.some((row) => row.model.toLowerCase() === '<synthetic>')) {
    ctx.addIssue({ code: 'custom', path: ['models'], message: 'synthetic records must be excluded' })
  }
  if (batch.models.reduce((sum, row) => sum + row.turns, 0) > batch.turns) {
    ctx.addIssue({ code: 'custom', path: ['models'], message: 'model turns cannot exceed total turns' })
  }
  const accountedRecords = batch.collection.includedRecords + batch.collection.metadataSkipped +
    batch.collection.nonAssistantSkipped + batch.collection.duplicatesSkipped +
    batch.collection.syntheticSkipped + batch.collection.malformedSkipped +
    batch.collection.outsideWindowSkipped + batch.collection.unsupportedRecordsSkipped +
    batch.collection.missingIdentitySkipped + batch.collection.orphanToolResultsSkipped
  if (accountedRecords !== batch.collection.recordsRead) {
    ctx.addIssue({
      code: 'custom',
      path: ['collection', 'recordsRead'],
      message: 'recordsRead must equal included and skipped record counts',
    })
  }
  if (batch.collection.healthStatus === 'healthy' && batch.collection.healthWarnings.length > 0) {
    ctx.addIssue({
      code: 'custom', path: ['collection', 'healthWarnings'],
      message: 'healthy collection cannot contain health warnings',
    })
  }
  if (batch.collection.healthStatus === 'blocked') {
    ctx.addIssue({
      code: 'custom', path: ['collection', 'healthStatus'],
      message: 'blocked collection cannot be ingested',
    })
  }
  if (batch.collection.filesExcludedByScope > batch.collection.filesDiscovered) {
    ctx.addIssue({
      code: 'custom', path: ['collection', 'filesExcludedByScope'],
      message: 'scope exclusions cannot exceed discovered files',
    })
  }
})

export type AxAgentTelemetryBatch = z.infer<typeof axAgentTelemetryBatchSchema>
export type AxAgentTelemetryValidation =
  | { ok: true; data: AxAgentTelemetryBatch }
  | { ok: false; errors: string[] }

const FORBIDDEN_VALUES = [
  /\b[A-Z][A-Z0-9]{8,}\b/,
  /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/i,
  /\/(?:Users|home)\/[^\s"']+/i,
  /(?:bearer|token|secret|password)\s*[:= ]/i,
  /\b(?:sk|ghp|github_pat)-?[A-Za-z0-9_-]{12,}/i,
]

function sensitivePaths(value: unknown, path = '$', found: string[] = []): string[] {
  if (typeof value === 'string') {
    if (FORBIDDEN_VALUES.some((pattern) => pattern.test(value))) found.push(path)
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => sensitivePaths(item, `${path}[${index}]`, found))
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      sensitivePaths(child, `${path}.${key}`, found)
    }
  }
  return found
}

/** strict schema + allowlist + PII/secret fail-closed 검증 */
export function validateAgentTelemetryBatch(input: unknown): AxAgentTelemetryValidation {
  const parsed = axAgentTelemetryBatchSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'batch'}: ${issue.message}`) }
  }
  const forbidden = sensitivePaths(parsed.data)
  if (forbidden.length > 0) {
    return { ok: false, errors: forbidden.map((path) => `${path}: forbidden PII, path, or credential pattern`) }
  }
  return { ok: true, data: parsed.data }
}
