/** AX Dashboard — 에이전트 활동·수집 건강도 패널 */

import { axAgentTelemetryBatches, db } from '@gpters/db'
import { gte } from 'drizzle-orm'
import type {
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
  usesPeriod: true,
}

const SOURCE_INFO: Record<AxAgentTelemetrySource, Omit<AxAgentSourceCoverageRow, 'source' | 'status' | 'lastCollectedAt'>> = {
  openclaw: {
    capabilities: { usage: true, tools: false, skills: false },
    note: '게이트웨이 요약 로그라 토큰 일부만 보이며 도구·스킬은 보이지 않습니다',
  },
  'claude-code': {
    capabilities: { usage: true, tools: true, skills: true },
    note: 'usage·tool·skill 원본 대조를 마친 정밀 수집 소스입니다',
  },
  codex: {
    capabilities: { usage: true, tools: true, skills: false },
    note: 'usage·turn·tool·execution을 수집하며 skill load는 아직 별도 신호가 없습니다',
  },
  hermes: {
    capabilities: { usage: true, tools: true, skills: false },
    note: 'SQLite 누적 usage의 delta·user turn·tool call을 수집하며 reasoning 포함 관계와 skill 신호는 아직 미확정입니다',
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

async function load(ctx: AxPanelContext): Promise<AxPanelResult<AxAgentActivityData>> {
  try {
    const cutoff = new Date(Date.now() - ctx.days * 86_400_000)
    const rows = await db.select().from(axAgentTelemetryBatches).where(gte(axAgentTelemetryBatches.windowEnd, cutoff))
    if (rows.length === 0) {
      return panelNotConfigured(meta, '선택한 기간에 수집된 에이전트 텔레메트리가 없습니다')
    }

    const totalUsage = emptyUsage()
    const reporterMap = new Map<string, AxAgentReporterRow>()
    const modelMap = new Map<string, { turns: number; usage: AxAgentTokenUsage }>()
    const toolMap = new Map<string, { calls: number; failures: number }>()
    const skillMap = new Map<string, { loaded: number; failed: number; interrupted: number }>()
    const sourceLatest = new Map<AxAgentTelemetrySource, number>()
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
      sessions += number(row.sessions)
      turns += number(row.turns)
      recordsRead += collectionNumber(collection, 'recordsRead')
      parseFailures += collectionNumber(collection, 'parseFailures')
      unsupportedRecordsSkipped += collectionNumber(collection, 'unsupportedRecordsSkipped')
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
        lastCollectedAt: new Date(collectedAt).toISOString(),
        freshnessHours: 0,
        freshness: 'fresh',
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
      if (collectedAt > new Date(reporter.lastCollectedAt).getTime()) reporter.lastCollectedAt = new Date(collectedAt).toISOString()
      const warnings = Array.isArray(collection.healthWarnings)
        ? collection.healthWarnings.filter((item): item is string => typeof item === 'string')
        : []
      reporter.healthWarnings = [...new Set([...reporter.healthWarnings, ...warnings])]

      for (const raw of row.models ?? []) {
        if (!raw || typeof raw !== 'object') continue
        const item = raw as Record<string, unknown>
        if (typeof item.model !== 'string') continue
        const metric = modelMap.get(item.model) ?? { turns: 0, usage: emptyUsage() }
        metric.turns += number(item.turns)
        addUsage(metric.usage, usageFrom(item.usage))
        modelMap.set(item.model, metric)
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
      }
      reporterMap.set(reporterKey, reporter)
    }

    const now = Date.now()
    const reporters = [...reporterMap.values()].map((reporter) => {
      const freshnessHours = Math.max(0, Math.round(((now - new Date(reporter.lastCollectedAt).getTime()) / 3_600_000) * 10) / 10)
      return { ...reporter, freshnessHours, freshness: freshnessHours <= FRESH_HOURS ? 'fresh' as const : 'stale' as const }
    }).sort((a, b) => a.agentId.localeCompare(b.agentId) || a.source.localeCompare(b.source))

    const sourceCoverage = ALL_SOURCES.map((source): AxAgentSourceCoverageRow => {
      const last = sourceLatest.get(source)
      let status: AxAgentSourceCoverageRow['status']
      if (source === 'openclaw' && !last && sourceLatest.has('claude-code')) status = 'alternate'
      else if (!last) status = 'missing'
      else status = (now - last) / 3_600_000 <= FRESH_HOURS ? 'reporting' : 'stale'
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
    const total = processedTokens(totalUsage)
    const insights: AxAgentActivityData['insights'] = []

    const coveredHours = (windowEnd - windowStart) / 3_600_000
    if (coveredHours > ctx.days * 24 + 1) {
      insights.push({
        severity: 'warning',
        title: `실제 집계 범위 ${Math.round((coveredHours / 24) * 10) / 10}일`,
        detail: '초기 backfill batch가 선택 기간과 일부 겹쳐 있습니다. 화면은 이를 숨기지 않고 실제 집계 시작·종료 시각을 함께 표시합니다.',
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
      insights.push({ severity: 'warning', title: '수집 지연', detail: `${stale.length}개 reporter가 ${FRESH_HOURS}시간 넘게 새 배치를 보내지 않았습니다.` })
    }
    const failureHotspot = tools.find((row) => row.calls >= 10 && row.failureRate >= 5)
    if (failureHotspot) {
      insights.push({
        severity: 'opportunity',
        title: `${failureHotspot.name} 실패율 ${failureHotspot.failureRate}%`,
        detail: '반복 실패의 입력 검증·재시도 정책·권한 설정을 먼저 점검할 만합니다.',
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
        title: `출력 중 reasoning ${Math.round(thinkingShare * 100)}%`,
        detail: 'thinking은 output에 포함된 값이므로 총 토큰에 다시 더하지 않았습니다.',
      })
    }

    return panelOk(meta, {
      syncedAt: new Date(syncedAt).toISOString(),
      windowStart: new Date(windowStart).toISOString(),
      windowEnd: new Date(windowEnd).toISOString(),
      totalUsage,
      totalProcessedTokens: total,
      sessions,
      turns,
      toolCalls,
      toolFailures,
      reporters,
      sourceCoverage,
      models,
      tools,
      skills,
      collection: { batches: rows.length, recordsRead, parseFailures, unsupportedRecordsSkipped },
      insights,
    }, [
      { label: '에이전트 토큰', value: formatTokens(total), hint: `${reporters.length} reporters`, periodLinked: true },
      { label: '에이전트 턴', value: turns.toLocaleString('ko-KR'), hint: `${sessions} sessions`, periodLinked: true },
    ])
  } catch (error) {
    log.error('에이전트 활동 조회 실패', error)
    return panelError(meta, '에이전트 활동 데이터를 불러오지 못했습니다')
  }
}

export const agentActivityPanel: AxPanel<AxAgentActivityData> = { meta, load }
