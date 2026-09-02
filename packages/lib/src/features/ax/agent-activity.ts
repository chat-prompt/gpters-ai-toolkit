/** AX Dashboard — 에이전트 활동·수집 건강도 패널 */

import { axAgentTelemetryBatches, axAgentTelemetryCollectors, axSkillExecutionAttempts, db } from '@gpters/db'
import { eq, gte } from 'drizzle-orm'
import type {
  AxAgentActivityAgentRow,
  AxAgentActivityData,
  AxAgentReporterRow,
  AxAgentSourceCoverageRow,
  AxAgentTelemetrySource,
  AxAgentTokenUsage,
  AxPanel,
  AxPanelContext,
  AxPanelMeta,
  AxPanelResult,
} from './types'
import { panelError, panelNotConfigured, panelOk } from './panel'
import { createLogger } from '../../core/logger'

const log = createLogger('ax-agent-activity')
const FRESH_HOURS = 12
const ALL_SOURCES: AxAgentTelemetrySource[] = ['openclaw', 'claude-code', 'codex', 'hermes']

const meta: AxPanelMeta = {
  id: 'agent-activity',
  title: '에이전트 활동',
  description: '에이전트별 토큰·도구·스킬 사용과 수집 누락·실패를 함께 점검합니다',
  source: '에이전트 로컬 PII-free 텔레메트리',
  visibility: 'org',
  parentId: 'skill-usage',
  usesPeriod: true,
}

const SOURCE_INFO: Record<AxAgentTelemetrySource, Omit<AxAgentSourceCoverageRow, 'source' | 'status' | 'lastCollectedAt'>> = {
  openclaw: {
    capabilities: { usage: true, tools: false, skills: false },
    note: '게이트웨이 요약 로그라 토큰 일부만 보이며 도구·스킬은 보이지 않습니다',
  },
  'claude-code': {
    capabilities: { usage: true, tools: true, skills: true },
    note: '토큰·도구·스킬 값을 원본과 대조한 정밀 수집 소스입니다',
  },
  codex: {
    capabilities: { usage: true, tools: true, skills: false },
    note: '토큰·턴·도구 호출·실행 보고를 수집하며 스킬 로드는 아직 별도 신호가 없습니다',
  },
  hermes: {
    capabilities: { usage: true, tools: true, skills: false },
    note: 'SQLite 누적 사용량의 증분·사용자 턴·도구 호출을 수집하며 추론 토큰 포함 관계와 스킬 신호는 아직 미확정입니다',
  },
}

function emptyUsage(): AxAgentTokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    thinkingTokens: 0,
    thinkingTokensRelation: 'unknown',
  }
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function usageFrom(value: unknown): AxAgentTokenUsage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyUsage()
  const row = value as Record<string, unknown>
  const relation = row.thinkingTokensRelation
  return {
    inputTokens: number(row.inputTokens),
    outputTokens: number(row.outputTokens),
    cacheCreationInputTokens: number(row.cacheCreationInputTokens),
    cacheReadInputTokens: number(row.cacheReadInputTokens),
    thinkingTokens: number(row.thinkingTokens),
    thinkingTokensRelation: relation === 'included-in-output' || relation === 'separate-from-output'
      ? relation
      : 'unknown',
  }
}

function addUsage(target: AxAgentTokenUsage, source: AxAgentTokenUsage): void {
  target.inputTokens += source.inputTokens
  target.outputTokens += source.outputTokens
  target.cacheCreationInputTokens += source.cacheCreationInputTokens
  target.cacheReadInputTokens += source.cacheReadInputTokens
  target.thinkingTokens += source.thinkingTokens
  if (target.thinkingTokensRelation === 'unknown') target.thinkingTokensRelation = source.thinkingTokensRelation
  else if (source.thinkingTokensRelation !== 'unknown' && target.thinkingTokensRelation !== source.thinkingTokensRelation) {
    target.thinkingTokensRelation = 'unknown'
  }
}

function processedTokens(usage: AxAgentTokenUsage): number {
  const base = usage.inputTokens + usage.outputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens
  return base + (usage.thinkingTokensRelation === 'separate-from-output' ? usage.thinkingTokens : 0)
}

function dateIso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

function collectionNumber(collection: Record<string, unknown>, key: string): number {
  return number(collection[key])
}

function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return String(value)
}

interface AgentAccumulator {
  agentId: string
  totalUsage: AxAgentTokenUsage
  sessions: number
  turns: number
  toolCalls: number
  toolFailures: number
  models: Map<string, { turns: number; usage: AxAgentTokenUsage }>
  tools: Map<string, { calls: number; failures: number }>
  skills: Map<string, { loaded: number; failed: number; interrupted: number }>
  observedExecutions: Map<string, { status: string; evidence: string; count: number }>
  verifiedExecutions: AxAgentActivityAgentRow['verifiedExecutions']
  collection: AxAgentActivityAgentRow['collection']
}

function emptyVerifiedExecutions(): AxAgentActivityAgentRow['verifiedExecutions'] {
  return { attempts: 0, success: 0, partial: 0, failed: 0, abandoned: 0, running: 0, withEvidence: 0 }
}

function createAgentAccumulator(agentId: string): AgentAccumulator {
  return {
    agentId,
    totalUsage: emptyUsage(),
    sessions: 0,
    turns: 0,
    toolCalls: 0,
    toolFailures: 0,
    models: new Map(),
    tools: new Map(),
    skills: new Map(),
    observedExecutions: new Map(),
    verifiedExecutions: emptyVerifiedExecutions(),
    collection: { batches: 0, recordsRead: 0, parseFailures: 0, unsupportedRecordsSkipped: 0 },
  }
}

function finalizeAgent(accumulator: AgentAccumulator): AxAgentActivityAgentRow {
  return {
    agentId: accumulator.agentId,
    totalUsage: accumulator.totalUsage,
    totalProcessedTokens: processedTokens(accumulator.totalUsage),
    sessions: accumulator.sessions,
    turns: accumulator.turns,
    toolCalls: accumulator.toolCalls,
    toolFailures: accumulator.toolFailures,
    models: [...accumulator.models.entries()].map(([model, metric]) => ({
      model,
      turns: metric.turns,
      usage: metric.usage,
      processedTokens: processedTokens(metric.usage),
    })).sort((a, b) => b.processedTokens - a.processedTokens || a.model.localeCompare(b.model)).slice(0, 12),
    tools: [...accumulator.tools.entries()].map(([name, metric]) => ({
      name,
      ...metric,
      failureRate: metric.calls > 0 ? Math.round((metric.failures / metric.calls) * 1000) / 10 : 0,
    })).sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name)).slice(0, 20),
    skills: [...accumulator.skills.entries()].map(([skillId, metric]) => ({ skillId, ...metric }))
      .sort((a, b) => b.loaded - a.loaded || a.skillId.localeCompare(b.skillId)).slice(0, 20),
    observedExecutionReports: [...accumulator.observedExecutions.values()]
      .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status)),
    verifiedExecutions: accumulator.verifiedExecutions,
    collection: accumulator.collection,
  }
}

function addVerifiedExecution(
  target: AxAgentActivityAgentRow['verifiedExecutions'],
  execution: { status: string; validationMethod: string; validationPassed: boolean | null },
): void {
  target.attempts += 1
  if (execution.status === 'success' || execution.status === 'partial' || execution.status === 'failed' ||
    execution.status === 'abandoned' || execution.status === 'running') {
    target[execution.status] += 1
  }
  if (execution.validationMethod !== 'none' && execution.validationPassed !== null) target.withEvidence += 1
}

/** 실행 결과 마이그레이션이 아직 없는 환경에서도 텔레메트리 본체는 계속 보여준다. */
async function loadVerifiedExecutions(cutoff: Date): Promise<{
  available: boolean
  rows: Array<{
    agentId: string
    status: string
    validationMethod: string
    validationPassed: boolean | null
  }>
}> {
  try {
    const rows = await db.select({
      agentId: axSkillExecutionAttempts.agentId,
      status: axSkillExecutionAttempts.status,
      validationMethod: axSkillExecutionAttempts.validationMethod,
      validationPassed: axSkillExecutionAttempts.validationPassed,
    })
      .from(axSkillExecutionAttempts)
      .where(gte(axSkillExecutionAttempts.startedAt, cutoff))
    return { available: true, rows }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ax_skill_execution_attempts') && message.includes('does not exist')) {
      return { available: false, rows: [] }
    }
    throw error
  }
}

/** 0031 이전 DB에서도 기존 batch 패널은 계속 동작한다. */
async function loadCollectors(): Promise<{
  available: boolean
  rows: Array<{
    collectorId: string
    agentId: string
    source: string
    intervalSeconds: number
    lastSuccessAt: Date | null
    lastHealthStatus: string | null
    lastHealthWarnings: string[]
    createdAt: Date
  }>
}> {
  try {
    const rows = await db.select({
      collectorId: axAgentTelemetryCollectors.collectorId,
      agentId: axAgentTelemetryCollectors.agentId,
      source: axAgentTelemetryCollectors.source,
      intervalSeconds: axAgentTelemetryCollectors.intervalSeconds,
      lastSuccessAt: axAgentTelemetryCollectors.lastSuccessAt,
      lastHealthStatus: axAgentTelemetryCollectors.lastHealthStatus,
      lastHealthWarnings: axAgentTelemetryCollectors.lastHealthWarnings,
      createdAt: axAgentTelemetryCollectors.createdAt,
    }).from(axAgentTelemetryCollectors).where(eq(axAgentTelemetryCollectors.isActive, true))
    return { available: true, rows }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ax_agent_telemetry_collectors') && message.includes('does not exist')) {
      return { available: false, rows: [] }
    }
    throw error
  }
}

async function load(ctx: AxPanelContext): Promise<AxPanelResult<AxAgentActivityData>> {
  try {
    const cutoff = new Date(Date.now() - ctx.days * 86_400_000)
    const [candidateRows, executionResult, collectorResult] = await Promise.all([
      db.select().from(axAgentTelemetryBatches).where(gte(axAgentTelemetryBatches.windowEnd, cutoff)),
      loadVerifiedExecutions(cutoff),
      loadCollectors(),
    ])
    // 한 batch는 내부 시간대별 분포를 보존하지 않는 집계 단위다. 기간 경계에 걸친 초기
    // backfill을 비례 배분하면 사용량이 균등했다는 거짓 가정이 생기므로, 완전히 기간 안에
    // 들어온 batch만 합산한다. 제외 사실은 아래 insight로 숨기지 않는다.
    const rows = candidateRows.filter((row) => new Date(row.windowStart).getTime() >= cutoff.getTime())
    const excludedBoundaryBatches = candidateRows.length - rows.length
    if (rows.length === 0 && collectorResult.rows.length === 0) {
      return panelNotConfigured(meta, '선택한 기간에 수집된 에이전트 텔레메트리가 없습니다')
    }

    const totalUsage = emptyUsage()
    const reporterMap = new Map<string, AxAgentReporterRow>()
    const modelMap = new Map<string, { turns: number; usage: AxAgentTokenUsage }>()
    const toolMap = new Map<string, { calls: number; failures: number }>()
    const skillMap = new Map<string, { loaded: number; failed: number; interrupted: number }>()
    const observedExecutionMap = new Map<string, { status: string; evidence: string; count: number }>()
    const agentMap = new Map<string, AgentAccumulator>()
    const sourceLatest = new Map<AxAgentTelemetrySource, number>()
    const sourceStaleAfterHours = new Map<AxAgentTelemetrySource, number>()
    let sessions = 0
    let turns = 0
    let recordsRead = 0
    let parseFailures = 0
    let unsupportedRecordsSkipped = 0
    let windowStart = Number.POSITIVE_INFINITY
    let windowEnd = 0
    let syncedAt = 0

    for (const row of rows) {
      const collection = row.collection ?? {}
      const sourceValue = collection.source
      if (sourceValue !== 'openclaw' && sourceValue !== 'claude-code' &&
        sourceValue !== 'codex' && sourceValue !== 'hermes') continue
      const source = sourceValue as AxAgentTelemetrySource
      const agent = agentMap.get(row.agentId) ?? createAgentAccumulator(row.agentId)
      agentMap.set(row.agentId, agent)
      const usage: AxAgentTokenUsage = {
        inputTokens: number(row.inputTokens),
        outputTokens: number(row.outputTokens),
        cacheCreationInputTokens: number(row.cacheCreationInputTokens),
        cacheReadInputTokens: number(row.cacheReadInputTokens),
        thinkingTokens: number(row.thinkingTokens),
        thinkingTokensRelation: row.thinkingTokensRelation === 'included-in-output' || row.thinkingTokensRelation === 'separate-from-output'
          ? row.thinkingTokensRelation
          : 'unknown',
      }
      addUsage(totalUsage, usage)
      addUsage(agent.totalUsage, usage)
      sessions += number(row.sessions)
      turns += number(row.turns)
      agent.sessions += number(row.sessions)
      agent.turns += number(row.turns)
      recordsRead += collectionNumber(collection, 'recordsRead')
      parseFailures += collectionNumber(collection, 'parseFailures')
      unsupportedRecordsSkipped += collectionNumber(collection, 'unsupportedRecordsSkipped')
      agent.collection.batches += 1
      agent.collection.recordsRead += collectionNumber(collection, 'recordsRead')
      agent.collection.parseFailures += collectionNumber(collection, 'parseFailures')
      agent.collection.unsupportedRecordsSkipped += collectionNumber(collection, 'unsupportedRecordsSkipped')
      const startAt = new Date(row.windowStart).getTime()
      const endAt = new Date(row.windowEnd).getTime()
      const collectedAt = new Date(row.collectedAt).getTime()
      windowStart = Math.min(windowStart, startAt)
      windowEnd = Math.max(windowEnd, endAt)
      syncedAt = Math.max(syncedAt, collectedAt)
      sourceLatest.set(source, Math.max(sourceLatest.get(source) ?? 0, collectedAt))

      const reporterKey = `${row.agentId}\u0000${source}`
      const reporter = reporterMap.get(reporterKey) ?? {
        agentId: row.agentId,
        source,
        collectorId: null,
        managed: false,
        intervalSeconds: null,
        lastCollectedAt: new Date(collectedAt).toISOString(),
        freshnessHours: 0,
        freshness: 'fresh',
        healthStatus: 'unknown',
        sessions: 0,
        turns: 0,
        usage: emptyUsage(),
        toolCalls: 0,
        toolFailures: 0,
        healthWarnings: [],
      }
      reporter.sessions += number(row.sessions)
      reporter.turns += number(row.turns)
      addUsage(reporter.usage, usage)
      if (!reporter.lastCollectedAt || collectedAt > new Date(reporter.lastCollectedAt).getTime()) {
        reporter.lastCollectedAt = new Date(collectedAt).toISOString()
      }
      const warnings = Array.isArray(collection.healthWarnings)
        ? collection.healthWarnings.filter((item): item is string => typeof item === 'string')
        : []
      reporter.healthWarnings = [...new Set([...reporter.healthWarnings, ...warnings])]
      if (collection.healthStatus === 'healthy' || collection.healthStatus === 'blocked') {
        reporter.healthStatus = collection.healthStatus
      }

      for (const raw of row.models ?? []) {
        if (!raw || typeof raw !== 'object') continue
        const item = raw as Record<string, unknown>
        if (typeof item.model !== 'string') continue
        const metric = modelMap.get(item.model) ?? { turns: 0, usage: emptyUsage() }
        metric.turns += number(item.turns)
        addUsage(metric.usage, usageFrom(item.usage))
        modelMap.set(item.model, metric)
        const agentMetric = agent.models.get(item.model) ?? { turns: 0, usage: emptyUsage() }
        agentMetric.turns += number(item.turns)
        addUsage(agentMetric.usage, usageFrom(item.usage))
        agent.models.set(item.model, agentMetric)
      }
      for (const raw of row.tools ?? []) {
        if (!raw || typeof raw !== 'object') continue
        const item = raw as Record<string, unknown>
        if (typeof item.name !== 'string') continue
        const metric = toolMap.get(item.name) ?? { calls: 0, failures: 0 }
        const calls = number(item.calls)
        const failures = number(item.failures)
        metric.calls += calls
        metric.failures += failures
        toolMap.set(item.name, metric)
        const agentMetric = agent.tools.get(item.name) ?? { calls: 0, failures: 0 }
        agentMetric.calls += calls
        agentMetric.failures += failures
        agent.tools.set(item.name, agentMetric)
        agent.toolCalls += calls
        agent.toolFailures += failures
        reporter.toolCalls += calls
        reporter.toolFailures += failures
      }
      for (const raw of row.skillLoads ?? []) {
        if (!raw || typeof raw !== 'object') continue
        const item = raw as Record<string, unknown>
        if (typeof item.skillId !== 'string') continue
        const metric = skillMap.get(item.skillId) ?? { loaded: 0, failed: 0, interrupted: 0 }
        metric.loaded += number(item.loaded)
        metric.failed += number(item.failed)
        metric.interrupted += number(item.interrupted)
        skillMap.set(item.skillId, metric)
        const agentMetric = agent.skills.get(item.skillId) ?? { loaded: 0, failed: 0, interrupted: 0 }
        agentMetric.loaded += number(item.loaded)
        agentMetric.failed += number(item.failed)
        agentMetric.interrupted += number(item.interrupted)
        agent.skills.set(item.skillId, agentMetric)
      }
      for (const raw of row.executions ?? []) {
        if (!raw || typeof raw !== 'object') continue
        const item = raw as Record<string, unknown>
        if (typeof item.status !== 'string' || typeof item.evidence !== 'string') continue
        const key = `${item.status}\u0000${item.evidence}`
        const metric = observedExecutionMap.get(key) ?? {
          status: item.status,
          evidence: item.evidence,
          count: 0,
        }
        metric.count += number(item.count)
        observedExecutionMap.set(key, metric)
        const agentMetric = agent.observedExecutions.get(key) ?? {
          status: item.status,
          evidence: item.evidence,
          count: 0,
        }
        agentMetric.count += number(item.count)
        agent.observedExecutions.set(key, agentMetric)
      }
      reporterMap.set(reporterKey, reporter)
    }

    const installedSources = new Set<AxAgentTelemetrySource>()
    for (const collector of collectorResult.rows) {
      if (collector.source !== 'openclaw' && collector.source !== 'claude-code' &&
        collector.source !== 'codex' && collector.source !== 'hermes') continue
      const collectorSource = collector.source as AxAgentTelemetrySource
      if (!agentMap.has(collector.agentId)) agentMap.set(collector.agentId, createAgentAccumulator(collector.agentId))
      installedSources.add(collectorSource)
      sourceStaleAfterHours.set(
        collectorSource,
        Math.max(
          sourceStaleAfterHours.get(collectorSource) ?? FRESH_HOURS,
          FRESH_HOURS,
          collector.intervalSeconds * 2 / 3600,
        ),
      )
      const reporterKey = `${collector.agentId}\u0000${collectorSource}`
      const reporter = reporterMap.get(reporterKey) ?? {
        agentId: collector.agentId,
        source: collectorSource,
        collectorId: collector.collectorId,
        managed: true,
        intervalSeconds: collector.intervalSeconds,
        lastCollectedAt: null,
        freshnessHours: null,
        freshness: 'waiting' as const,
        healthStatus: 'unknown' as const,
        sessions: 0,
        turns: 0,
        usage: emptyUsage(),
        toolCalls: 0,
        toolFailures: 0,
        healthWarnings: [],
      }
      reporter.collectorId = collector.collectorId
      reporter.managed = true
      reporter.intervalSeconds = collector.intervalSeconds
      if (collector.lastSuccessAt) {
        const lastSuccess = new Date(collector.lastSuccessAt).getTime()
        if (!reporter.lastCollectedAt || lastSuccess > new Date(reporter.lastCollectedAt).getTime()) {
          reporter.lastCollectedAt = new Date(lastSuccess).toISOString()
        }
        sourceLatest.set(collectorSource, Math.max(sourceLatest.get(collectorSource) ?? 0, lastSuccess))
        syncedAt = Math.max(syncedAt, lastSuccess)
      }
      if (collector.lastHealthStatus === 'healthy' || collector.lastHealthStatus === 'blocked') {
        reporter.healthStatus = collector.lastHealthStatus
      }
      reporter.healthWarnings = [...new Set([
        ...reporter.healthWarnings,
        ...(Array.isArray(collector.lastHealthWarnings) ? collector.lastHealthWarnings : []),
      ])]
      reporterMap.set(reporterKey, reporter)
      syncedAt = Math.max(syncedAt, new Date(collector.createdAt).getTime())
    }

    const now = Date.now()
    const reporters = [...reporterMap.values()].map((reporter) => {
      if (!reporter.lastCollectedAt) return { ...reporter, freshnessHours: null, freshness: 'waiting' as const }
      const freshnessHours = Math.max(0, Math.round(((now - new Date(reporter.lastCollectedAt).getTime()) / 3_600_000) * 10) / 10)
      const staleAfterHours = reporter.intervalSeconds ? Math.max(FRESH_HOURS, reporter.intervalSeconds * 2 / 3600) : FRESH_HOURS
      return { ...reporter, freshnessHours, freshness: freshnessHours <= staleAfterHours ? 'fresh' as const : 'stale' as const }
    }).sort((a, b) => a.agentId.localeCompare(b.agentId) || a.source.localeCompare(b.source))

    const sourceCoverage = ALL_SOURCES.map((source): AxAgentSourceCoverageRow => {
      const last = sourceLatest.get(source)
      let status: AxAgentSourceCoverageRow['status']
      if (source === 'openclaw' && !last && sourceLatest.has('claude-code')) status = 'alternate'
      else if (!last && installedSources.has(source)) status = 'installed'
      else if (!last) status = 'missing'
      else status = (now - last) / 3_600_000 <= (sourceStaleAfterHours.get(source) ?? FRESH_HOURS)
        ? 'reporting'
        : 'stale'
      return {
        source,
        status,
        lastCollectedAt: last ? new Date(last).toISOString() : null,
        ...SOURCE_INFO[source],
      }
    })

    const toolCalls = [...toolMap.values()].reduce((sum, row) => sum + row.calls, 0)
    const toolFailures = [...toolMap.values()].reduce((sum, row) => sum + row.failures, 0)
    const tools = [...toolMap.entries()].map(([name, metric]) => ({
      name,
      ...metric,
      failureRate: metric.calls > 0 ? Math.round((metric.failures / metric.calls) * 1000) / 10 : 0,
    })).sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name)).slice(0, 20)
    const models = [...modelMap.entries()].map(([model, metric]) => ({
      model,
      turns: metric.turns,
      usage: metric.usage,
      processedTokens: processedTokens(metric.usage),
    })).sort((a, b) => b.processedTokens - a.processedTokens).slice(0, 12)
    const skills = [...skillMap.entries()].map(([skillId, metric]) => ({ skillId, ...metric }))
      .sort((a, b) => b.loaded - a.loaded || a.skillId.localeCompare(b.skillId)).slice(0, 20)
    const observedExecutionReports = [...observedExecutionMap.values()]
      .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status))
    const verifiedExecutions: AxAgentActivityData['verifiedExecutions'] = emptyVerifiedExecutions()
    for (const execution of executionResult.rows) {
      addVerifiedExecution(verifiedExecutions, execution)
      const agent = agentMap.get(execution.agentId)
      if (agent) addVerifiedExecution(agent.verifiedExecutions, execution)
    }
    const agents = [...agentMap.values()].map(finalizeAgent)
      .sort((a, b) => b.totalProcessedTokens - a.totalProcessedTokens || a.agentId.localeCompare(b.agentId))
    const total = processedTokens(totalUsage)
    const insights: AxAgentActivityData['insights'] = []

    if (excludedBoundaryBatches > 0) {
      insights.push({
        severity: 'info',
        title: `기간 경계 batch ${excludedBoundaryBatches}개 제외`,
        detail: '기간 밖 사용량이 섞인 초기 backfill은 비례 추정하지 않고 합계에서 제외했습니다. 이후 완전히 기간 안에 들어온 증분 batch만 표시합니다.',
      })
    }

    const unavailable = sourceCoverage.filter((row) => row.status === 'missing' || row.status === 'unsupported')
    if (unavailable.length > 0) {
      insights.push({
        severity: 'warning',
        title: '소스 커버리지 공백',
        detail: `${unavailable.map((row) => row.source).join(', ')} 활동은 현재 전체 집계에 포함되지 않습니다.`,
      })
    }
    if (sourceLatest.has('openclaw') && sourceLatest.has('claude-code')) {
      insights.push({
        severity: 'warning',
        title: 'OpenClaw·Claude 중복 가능성',
        detail: '같은 작업이 게이트웨이 요약과 런타임 원본에 함께 있으면 토큰·턴을 이중 계상할 수 있습니다.',
      })
    }
    const stale = reporters.filter((row) => row.freshness === 'stale')
    if (stale.length > 0) {
      insights.push({ severity: 'warning', title: '수집 지연', detail: `${stale.length}개 수집기가 허용된 두 번의 수집 주기 안에 새 배치를 보내지 않았습니다.` })
    }
    const waiting = reporters.filter((row) => row.freshness === 'waiting')
    if (waiting.length > 0) {
      insights.push({ severity: 'info', title: '첫 수집 대기', detail: `${waiting.length}개 수집기가 설치됐지만 아직 첫 정상 배치를 보내지 않았습니다.` })
    }
    const failureHotspot = tools.find((row) => row.calls >= 10 && row.failureRate >= 5)
    if (failureHotspot) {
      insights.push({
        severity: 'opportunity',
        title: `${failureHotspot.name} 실패율 ${failureHotspot.failureRate}%`,
        detail: '반복 실패의 입력 검증·재시도 정책·권한 설정을 먼저 점검할 만합니다.',
      })
    }
    const dominantModel = models[0]
    const dominantModelShare = dominantModel && total > 0 ? dominantModel.processedTokens / total : 0
    if (models.length > 1 && dominantModel && dominantModelShare >= 0.8) {
      insights.push({
        severity: 'opportunity',
        title: `${dominantModel.model} 처리 토큰 ${Math.round(dominantModelShare * 100)}%`,
        detail: '반복·정형 작업을 더 가벼운 모델로 분기하고 품질을 대조하면 모델 라우팅 최적화 여지를 확인할 수 있습니다.',
      })
    }
    const contextPerTurn = turns > 0
      ? Math.round((totalUsage.inputTokens + totalUsage.cacheCreationInputTokens + totalUsage.cacheReadInputTokens) / turns)
      : 0
    if (contextPerTurn >= 100_000) {
      insights.push({
        severity: 'opportunity',
        title: `턴당 컨텍스트 ${formatTokens(contextPerTurn)}`,
        detail: '긴 세션 분리, 메모리 압축, 필요한 파일만 읽기로 컨텍스트 비용을 줄일 여지가 있습니다.',
      })
    }
    const thinkingShare = totalUsage.outputTokens > 0 ? totalUsage.thinkingTokens / totalUsage.outputTokens : 0
    if (thinkingShare >= 0.3) {
      insights.push({
        severity: 'info',
        title: `출력 중 추론 토큰 ${Math.round(thinkingShare * 100)}%`,
        detail: '추론 토큰은 출력 토큰에 포함된 값이므로 총 토큰에 다시 더하지 않았습니다.',
      })
    }
    if (!executionResult.available) {
      insights.push({
        severity: 'info',
        title: '실행 결과 계측 준비 중',
        detail: '사용량 텔레메트리는 정상이며, 검증된 실행 결과는 후속 DB 마이그레이션 적용 뒤 표시됩니다.',
      })
    }

    return panelOk(meta, {
      syncedAt: new Date(syncedAt || now).toISOString(),
      windowStart: new Date(rows.length > 0 ? windowStart : cutoff.getTime()).toISOString(),
      windowEnd: new Date(rows.length > 0 ? windowEnd : now).toISOString(),
      totalUsage,
      totalProcessedTokens: total,
      sessions,
      turns,
      toolCalls,
      toolFailures,
      agents,
      reporters,
      sourceCoverage,
      models,
      tools,
      skills,
      observedExecutionReports,
      verifiedExecutions,
      collection: { batches: rows.length, recordsRead, parseFailures, unsupportedRecordsSkipped },
      insights,
    }, [
      { label: '에이전트 처리 토큰', value: formatTokens(total), hint: `수집기 ${reporters.length}개`, periodLinked: true },
      { label: '에이전트 턴', value: turns.toLocaleString('ko-KR'), hint: `세션 ${sessions.toLocaleString('ko-KR')}개`, periodLinked: true },
    ])
  } catch (error) {
    log.error('에이전트 활동 조회 실패', error)
    return panelError(meta, '에이전트 활동 데이터를 불러오지 못했습니다')
  }
}

export const agentActivityPanel: AxPanel<AxAgentActivityData> = { meta, load }
