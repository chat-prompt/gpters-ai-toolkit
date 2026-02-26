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
  recordSearchEvents,
  recordLoadEvent,
  recordOutcomeEvent,
  recordSearchSkipEvent,
  recordDeployEvent,
  recordSuggestEvent,
  recordSkillRating,
} from './skill-events'
export {
  getSkillFunnelStats,
  getSkillRatings,
  invalidateSkillStatsCache,
  type SkillFunnelStats,
  type SkillRatingStats,
  type StatsPeriod,
} from './skill-stats'
