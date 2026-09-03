/** OpenClaw 에이전트 telemetry v1의 CLI 측 계약 사본 */

export const AGENT_TASK_CATEGORIES = [
  'webinar-ops', 'study-ops', 'community-ops', 'marketing-copy', 'sending-exec',
  'design-asset', 'image-gen', 'data-airtable', 'linear-issue', 'report-daily',
  'memory-curation', 'graph-maintenance', 'skill-authoring', 'infra-ops',
  'incident-response', 'research-external', 'code-deploy', 'document-writing',
  'qa-verify', 'session-cleanup', 'unclassified',
] as const

export type AgentTaskCategory = typeof AGENT_TASK_CATEGORIES[number]
export type ThinkingTokensRelation = 'included-in-output' | 'separate-from-output' | 'unknown'
export type AgentTelemetrySource = 'openclaw' | 'claude-code' | 'codex' | 'hermes'
export type AgentTelemetryHealthWarning =
  | 'no-turns-from-records'
  | 'high-unsupported-rate'
  | 'claude-code-tools-missing'
  | 'codex-tools-missing'
  | 'hermes-tools-missing'
  | 'no-files-in-scope'

export interface AgentTokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  thinkingTokens: number
  thinkingTokensRelation: ThinkingTokensRelation
}

export interface AgentTelemetryBatch {
  schemaVersion: '1.0.0'
  batchId: string
  agentId: string
  collectorInstanceId: string
  runtime: {
    openclawVersion: string
    claudeCliVersion: string
    collectorVersion: string
  }
  window: { startUtc: string; endUtc: string }
  collectedAtUtc: string
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
  executions: Array<{
    status: 'success' | 'partial' | 'failed' | 'abandoned' | 'running'
    evidence: 'verified' | 'self-reported' | 'none'
    count: number
  }>
  collection: {
    source: AgentTelemetrySource
    filesDiscovered: number
    filesExcludedByScope: number
    filesRead: number
    filesReset: number
    recordsRead: number
    includedRecords: number
    metadataSkipped: number
    nonAssistantSkipped: number
    duplicatesSkipped: number
    syntheticSkipped: number
    malformedSkipped: number
    outsideWindowSkipped: number
    unsupportedRecordsSkipped: number
    missingIdentitySkipped: number
    orphanToolResultsSkipped: number
    parseFailures: number
    lagMinutes: number
    healthStatus: 'healthy' | 'blocked'
    healthWarnings: AgentTelemetryHealthWarning[]
  }
}

export interface AgentTelemetryFileCheckpoint {
  dev: string
  ino: string
  offset: number
}

export interface AgentTelemetrySeenMessage {
  hash: string
  atUtc: string
}

export interface AgentTelemetryCommittedState {
  lastWindowEndUtc: string | null
  files: Record<string, AgentTelemetryFileCheckpoint>
  seenMessages: AgentTelemetrySeenMessage[]
  /** OpenClaw 내부 agent 경계를 원문 ID 없이 고정하고 저장소 전환을 추적한다. */
  openclawSource?: {
    agentHash: string
    backend: 'jsonl' | 'sqlite'
  }
  /** Hermes SQLite의 세션 누적 usage를 delta로 바꾸기 위한 PII-free snapshot. */
  hermesSessions?: Record<string, {
    model: string
    usage: AgentTokenUsage
  }>
  /**
   * 결과 행을 아직 만나지 못한 Hermes skill_view 호출.
   *
   * 스킬 로드는 결과가 도착해야 확정하는데, 수집 창은 앞으로만 움직인다. 결과가 뒤늦게 기록되면 그 호출을
   * 다시 볼 수 없으므로 여기에 들고 다니다가 결과를 만나면 그때 센다.
   */
  hermesPendingSkillCalls?: AgentTelemetryPendingSkillCall[]
}

/** 결과를 기다리는 skill_view 호출 하나 */
export interface AgentTelemetryPendingSkillCall {
  /** 세션·호출 ID에서 만든 해시 (원문 ID는 담지 않는다) */
  hash: string
  /** 호출이 열려던 스킬 ID */
  skillId: string
  /** 호출 시각. 너무 오래된 항목을 버리는 기준이다 */
  atUtc: string
}

export interface AgentTelemetryCheckpoint {
  version: 1
  agentId: string
  collectorInstanceId: string
  committed: AgentTelemetryCommittedState
  pending?: {
    batch: AgentTelemetryBatch
    nextCommitted: AgentTelemetryCommittedState
  }
}

export function emptyAgentUsage(relation: ThinkingTokensRelation = 'unknown'): AgentTokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    thinkingTokens: 0,
    thinkingTokensRelation: relation,
  }
}
