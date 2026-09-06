/**
 * Analytics utilities for forwarding events and session tracking
 */

export { forwardToAnalytics } from './gpters-analytics'
export {
  upsertSessionSummary,
  mergeClientContext,
  mapToolToAction,
  extractSkillId,
  extractSearchQuery,
  type SessionUpsertInput,
  type ClientContextInput,
  type SessionAction,
} from './session-tracker'
export {
  finalizeSession,
  finalizeStaleSessions,
  cleanupOldSessions,
} from './session-finalizer'
export {
  ZERO_RESULT_SKILL_ID,
  recordSearchEvents,
  recordLoadEvent,
  recordOutcomeEvent,
  recordAutoSkipEvents,
  recordSearchSkipEvent,
  recordDeployEvent,
  recordExerciseSearchEvents,
  recordExerciseApplyEvent,
} from './skill-events'
export { recordSkillExecutionAttempt, recordSkillExecutionStart } from './skill-execution'
export {
  redactOldSkillText,
  SKILL_TEXT_RETENTION_DAYS,
  AUTO_CONTEXT_MARKER,
  type SkillTextRedactionResult,
} from './skill-text-retention'
export { recordAgentTelemetryBatch } from './agent-telemetry'
export {
  AgentTelemetryCollectorConflictError,
  authenticateAgentTelemetryCollector,
  enrollAgentTelemetryCollector,
  isAgentTelemetryCollectorToken,
  recordAgentTelemetryCollectorSuccess,
  revokeAgentTelemetryCollector,
  type AgentTelemetryCollectorCredential,
  type EnrollAgentTelemetryCollectorInput,
} from './agent-telemetry-collectors'
export {
  getSkillFunnelStats,
  invalidateSkillStatsCache,
  type SkillFunnelStats,
  type StatsPeriod,
} from './skill-stats'
export {
  SCOPE_A_LABEL,
  SCOPE_B_CLIENT_TYPES,
  SCOPE_B_LABEL,
  MIN_SAMPLE_SIZE,
  ZERO_RESULT_TARGET_PCT,
  measureZeroResultRate,
  measureZeroResultRateByClient,
  type ZeroResultMetrics,
} from './search-metrics'
export {
  analyzeFailurePatterns,
  detectZeroResultClusters,
  detectLowConversion,
  detectRepeatedSkips,
  type FailurePattern,
  type AnalysisResult,
} from './evo-analyzer'
export {
  generateFromPatterns,
  type GenerateResult,
} from './evo-agent'
export {
  evaluateEvoDrafts,
  type SelectionDecision,
  type SelectionResult,
  type Verdict,
} from './evo-selector'
export {
  generateWeeklyReport,
  TARGETS as WEEKLY_REPORT_TARGETS,
  type WeeklyReportData,
  type TargetMetric,
  type ClientBreakdown,
  type SessionFunnel,
} from './weekly-report'
