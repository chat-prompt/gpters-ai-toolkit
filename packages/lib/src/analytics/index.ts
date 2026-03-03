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
  recordSuggestEvent,
} from './skill-events'
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
