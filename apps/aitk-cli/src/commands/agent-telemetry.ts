/** 에이전트 delta telemetry 수집·전송 명령 */

import { createHash, randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { readConfig } from '../config.js'
import { error, jsonOut } from '../output.js'
import { readAgentTelemetryCheckpoint, writeAgentTelemetryCheckpoint } from '../agent-telemetry/checkpoint.js'
import { collectOpenClawAgent } from '../agent-telemetry/openclaw.js'
import { collectCodexAgent } from '../agent-telemetry/codex.js'
import { collectHermesAgent } from '../agent-telemetry/hermes.js'
import {
  AGENT_TASK_CATEGORIES,
  type AgentTaskCategory,
  type AgentTelemetryBatch,
  type AgentTelemetryCheckpoint,
  type AgentTelemetryCommittedState,
  type AgentTelemetrySource,
} from '../agent-telemetry/types.js'

const MAX_DAYS = 90
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,99}$/
const SAFE_LABEL = /^[a-zA-Z0-9][a-zA-Z0-9._:/+<> -]{0,119}$/
const FORBIDDEN_LABELS = [
  /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/i,
  /\/(?:Users|home)\//i,
  /(?:bearer|token|secret|password)\s*[:= ]/i,
]

export interface AgentTelemetryOptions {
  agentId: string
  source?: string
  days: number
  dryRun: boolean
  collectorVersion: string
  sessionsDir?: string
  projectSlugs?: string
  openclawAgent?: string
  hermesProfile?: string
  checkpointDir?: string
  collectorInstanceId?: string
  category?: string
  serverUrl?: string
  openclawVersion?: string
  claudeCliVersion?: string
  now?: Date
  /** 설치형 runner가 Keychain에서 읽어 직접 넘기는 collector 전용 토큰. */
  telemetryToken?: string
  /** install/doctor 내부 검증처럼 호출자가 결과를 조합할 때 stdout 출력을 생략한다. */
  emitOutput?: boolean
}

export interface AgentTelemetryCollectResult {
  dryRun: boolean
  inserted?: boolean
  batch: AgentTelemetryBatch
  checkpoint: {
    pending: boolean
    wouldAdvanceToUtc: string | null
    filesTracked: number
    seenMessageHashes: number
  }
}

interface AgentTelemetryResponse {
  ok?: boolean
  inserted?: boolean
  error?: string
}

function safeId(value: string, flag: string): string {
  if (!SAFE_ID.test(value)) error(`${flag} must match ${SAFE_ID}`)
  return value
}

function safeRuntimeLabel(value: string, flag: string): string {
  if (!SAFE_LABEL.test(value) || FORBIDDEN_LABELS.some((pattern) => pattern.test(value))) {
    error(`${flag} contains unsupported or sensitive characters`)
  }
  return value
}

function emptyCommitted(): AgentTelemetryCommittedState {
  return { lastWindowEndUtc: null, files: {}, seenMessages: [] }
}

function createCheckpoint(agentId: string, collectorInstanceId?: string): AgentTelemetryCheckpoint {
  return {
    version: 1,
    agentId,
    collectorInstanceId: collectorInstanceId ?? `collector-${randomUUID()}`,
    committed: emptyCommitted(),
  }
}

function resolveCategory(value: string | undefined): AgentTaskCategory {
  const category = value ?? 'unclassified'
  if (!(AGENT_TASK_CATEGORIES as readonly string[]).includes(category)) {
    error(`--category must be one of: ${AGENT_TASK_CATEGORIES.join(', ')}`)
  }
  return category as AgentTaskCategory
}

function resolveSource(value: string | undefined): AgentTelemetrySource {
  const source = value ?? 'openclaw'
  if (source !== 'openclaw' && source !== 'claude-code' && source !== 'codex' && source !== 'hermes') {
    error('--source must be one of: openclaw, claude-code, codex, hermes')
  }
  return source as AgentTelemetrySource
}

function resolveProjectSlugs(source: AgentTelemetrySource, value: string | undefined): string[] | undefined {
  if (source === 'openclaw' || source === 'hermes') {
    if (value) error('--project-slugs is only supported with --source claude-code or codex')
    return undefined
  }
  if (!value) error(`--project-slugs is required when --source ${source} is used`)
  const slugs = [...new Set(value!.split(',').map((item) => item.trim()))].sort()
  if (
    slugs.length === 0 || slugs.length > 50 ||
    slugs.some((slug) => slug.length === 0 || slug.length > 255 || slug === '.' || slug === '..' || /[\\/\0]/.test(slug))
  ) {
    error('--project-slugs must contain 1-50 comma-separated directory names')
  }
  return slugs
}

function resolveHermesProfile(source: AgentTelemetrySource, value: string | undefined): string | undefined {
  if (source !== 'hermes') {
    if (value) error('--hermes-profile is only supported with --source hermes')
    return undefined
  }
  if (!value) error('--hermes-profile is required when --source hermes is used')
  const profile = value!.trim()
  if (profile.length > 255 || profile.length === 0 || profile.includes('\0')) {
    error('--hermes-profile must contain a non-empty profile name of at most 255 characters')
  }
  return profile
}

function resolveOpenClawAgent(source: AgentTelemetrySource, value: string | undefined): string | undefined {
  if (source !== 'openclaw') {
    if (value) error('--openclaw-agent is only supported with --source openclaw')
    return undefined
  }
  return value ? safeId(value.trim(), '--openclaw-agent') : undefined
}

/** 설치 범위(project slugs / Hermes profile)마다 다른 checkpoint 파일 이름. lifecycle 명령도 같은 규칙을 써야 한다. */
export function checkpointName(
  agentId: string,
  source: AgentTelemetrySource,
  projectSlugs: string[] | undefined,
  hermesProfile: string | undefined
): string {
  const scope = projectSlugs?.join('\u0000') ?? hermesProfile
  if (!scope) return `${agentId}-${source}.json`
  const scopeHash = createHash('sha256').update(scope).digest('hex').slice(0, 12)
  return `${agentId}-${source}-${scopeHash}.json`
}

function resolveServerUrl(value?: string): string {
  return (value ?? process.env.AITK_SERVER_URL ?? readConfig().serverUrl).replace(/\/+$/, '')
}

async function sendAgentTelemetryBatch(
  batch: AgentTelemetryBatch,
  serverUrl: string,
  token: string
): Promise<{ inserted: boolean }> {
  let response: Response
  try {
    response = await fetch(`${serverUrl}/api/ax/agent-telemetry`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'network error'
    throw new Error(`Agent telemetry request failed: ${message}`)
  }

  let body: AgentTelemetryResponse = {}
  try {
    body = await response.json() as AgentTelemetryResponse
  } catch {
    // 응답 본문이 비어도 HTTP status로 실패를 설명한다.
  }
  if (!response.ok || body.ok !== true) {
    throw new Error(body.error ?? `Agent telemetry HTTP ${response.status}`)
  }
  return { inserted: body.inserted === true }
}

function committedAfterSuccess(state: AgentTelemetryCheckpoint): AgentTelemetryCheckpoint {
  if (!state.pending) return state
  return {
    version: 1,
    agentId: state.agentId,
    collectorInstanceId: state.collectorInstanceId,
    committed: state.pending.nextCommitted,
  }
}

export async function runAgentTelemetryCollect(options: AgentTelemetryOptions): Promise<AgentTelemetryCollectResult> {
  const agentId = safeId(options.agentId, '--agent')
  const source = resolveSource(options.source)
  if (!Number.isFinite(options.days) || options.days < 1 || options.days > MAX_DAYS) {
    error(`--days must be between 1 and ${MAX_DAYS}`)
  }
  if (options.collectorInstanceId) safeId(options.collectorInstanceId, '--collector-id')
  const category = resolveCategory(options.category)
  if (!options.sessionsDir) error('--sessions-dir is required for every telemetry source')
  const projectSlugs = resolveProjectSlugs(source, options.projectSlugs)
  const openclawAgent = resolveOpenClawAgent(source, options.openclawAgent)
  const hermesProfile = resolveHermesProfile(source, options.hermesProfile)
  const sessionsDir = resolve(options.sessionsDir!)
  const checkpointDir = resolve(options.checkpointDir ?? join(homedir(), '.cache', 'gpters-aitk', 'agent-telemetry'))
  const checkpointPath = join(checkpointDir, checkpointName(agentId, source, projectSlugs, hermesProfile))
  let state = await readAgentTelemetryCheckpoint(checkpointPath) ?? createCheckpoint(agentId, options.collectorInstanceId)

  if (state.agentId !== agentId) error('Checkpoint belongs to a different agent')
  if (options.collectorInstanceId && state.collectorInstanceId !== options.collectorInstanceId) {
    error('Checkpoint collector ID does not match --collector-id')
  }

  const token = options.telemetryToken ?? process.env.AX_AGENT_TELEMETRY_TOKEN
  if (!options.dryRun && !token) error('AX_AGENT_TELEMETRY_TOKEN is required unless --dry-run is used')

  if (!state.pending) {
    const now = options.now ?? new Date()
    const fallbackStart = new Date(now.getTime() - options.days * 86_400_000)
    const checkpointStart = state.committed.lastWindowEndUtc ? new Date(state.committed.lastWindowEndUtc) : fallbackStart
    const start = checkpointStart.getTime() < fallbackStart.getTime() ? fallbackStart : checkpointStart
    if (!Number.isFinite(start.getTime()) || start.getTime() >= now.getTime()) {
      error('Checkpoint window must end before the current collection time')
    }
    const collectOptions = {
      sessionsDir,
      window: { start, end: now },
      committed: state.committed,
      category,
      source,
      projectSlugs,
      openclawAgent,
    }
    const collected = source === 'codex'
      ? await collectCodexAgent({ ...collectOptions, source: 'codex', projectSlugs: projectSlugs! })
      : source === 'hermes'
        ? await collectHermesAgent({ ...collectOptions, source: 'hermes', profileName: hermesProfile! })
        : await collectOpenClawAgent(collectOptions)
    const batch: AgentTelemetryBatch = {
      schemaVersion: '1.0.0',
      batchId: randomUUID(),
      agentId,
      collectorInstanceId: state.collectorInstanceId,
      runtime: {
        openclawVersion: safeRuntimeLabel(options.openclawVersion ?? process.env.OPENCLAW_VERSION ?? 'unknown', '--openclaw-version'),
        claudeCliVersion: safeRuntimeLabel(options.claudeCliVersion ?? process.env.CLAUDE_CLI_VERSION ?? 'unknown', '--claude-cli-version'),
        collectorVersion: safeRuntimeLabel(options.collectorVersion, 'collector version'),
      },
      window: { startUtc: start.toISOString(), endUtc: now.toISOString() },
      collectedAtUtc: now.toISOString(),
      usage: collected.usage,
      sessions: collected.sessions,
      turns: collected.turns,
      models: collected.models,
      tools: collected.tools,
      skillLoads: collected.skillLoads,
      taskCategories: collected.taskCategories,
      executions: collected.executions,
      collection: collected.collection,
    }
    state = { ...state, pending: { batch, nextCommitted: collected.nextCommitted } }
  }
  const pending = state.pending
  if (!pending) error('Agent telemetry batch was not created')

  if (options.dryRun) {
    const result: AgentTelemetryCollectResult = {
      dryRun: true,
      batch: pending.batch,
      checkpoint: {
        pending: true,
        wouldAdvanceToUtc: pending.nextCommitted.lastWindowEndUtc,
        filesTracked: Object.keys(pending.nextCommitted.files).length,
        seenMessageHashes: pending.nextCommitted.seenMessages.length,
      },
    }
    if (options.emitOutput !== false) jsonOut(result)
    return result
  }

  if (pending.batch.collection.healthStatus === 'blocked') {
    error(`Agent telemetry collection health is blocked: ${pending.batch.collection.healthWarnings.join(', ')}`)
  }

  // 전송 전에 pending batch를 먼저 원자적으로 기록한다. 요청이 성공하고 프로세스가 죽어도
  // 다음 실행은 같은 batchId를 재전송하므로 서버 멱등성이 이중 계상을 막는다.
  await writeAgentTelemetryCheckpoint(checkpointPath, state)
  try {
    const result = await sendAgentTelemetryBatch(pending.batch, resolveServerUrl(options.serverUrl), token!)
    const committed = committedAfterSuccess(state)
    await writeAgentTelemetryCheckpoint(checkpointPath, committed)
    const output = {
      ok: true,
      inserted: result.inserted,
      batchId: pending.batch.batchId,
      agentId,
      window: pending.batch.window,
      sessions: pending.batch.sessions,
      turns: pending.batch.turns,
    }
    if (options.emitOutput !== false) jsonOut(output)
    return {
      dryRun: false,
      inserted: result.inserted,
      batch: pending.batch,
      checkpoint: {
        pending: false,
        wouldAdvanceToUtc: pending.nextCommitted.lastWindowEndUtc,
        filesTracked: Object.keys(pending.nextCommitted.files).length,
        seenMessageHashes: pending.nextCommitted.seenMessages.length,
      },
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Agent telemetry upload failed'
    error(`${message}. Pending batch was preserved for retry.`)
  }
}
