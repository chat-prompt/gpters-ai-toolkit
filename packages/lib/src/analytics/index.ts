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
