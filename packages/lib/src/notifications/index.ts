/**
 * Notification modules for GPTers AI Toolkit
 *
 * Barrel export for notification integrations (Slack, etc.)
 */

export {
  buildSlackMessage,
  sendSlackWebhook,
  notifySlackDeploy,
  summarizeContent,
  notifySlackEvoAnalyze,
  notifySlackEvoAction,
  notifySlackEvoPromote,
  notifySlackCronFailure,
  notifySlackCronHealth,
  notifySlackAccountAudit,
  notifySlackPopularSkills,
  buildPopularSkillsMessages,
  type PopularSkillsMessages,
  type CronFailureParams,
  type CronHealthParams,
  type AccountAuditParams,
  type PopularSkillsParams,
} from './slack'
export type { SlackDeployParams, SlackPayload, EvoAnalyzeParams, EvoActionParams, EvoPromoteParams } from './slack'

export {
  collectPopularSkills,
  formatCreatedLines,
  formatDigestLines,
  formatMissingDescriptionLines,
  formatUpdatedLines,
  hasAnythingToSay,
  shortSummary,
  rankSkills,
  type CatalogChange,
  type MissingDescription,
  type PopularSkill,
  type PopularSkillDigest,
} from './popular-skills'

export {
  compactDescription,
  firstSentence,
  normalizeChangeNote,
  parseBatchResponse,
  retryDelayMs,
  summarizeBatch,
  summarizeChangeNote,
  summarizeSkillContent,
} from './change-note'
