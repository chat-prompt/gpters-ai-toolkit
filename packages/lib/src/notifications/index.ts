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
  notifySlackPopularSkills,
  type CronFailureParams,
  type CronHealthParams,
  type PopularSkillsParams,
} from './slack'
export type { SlackDeployParams, SlackPayload, EvoAnalyzeParams, EvoActionParams, EvoPromoteParams } from './slack'

export {
  collectPopularSkills,
  formatCreatedLines,
  formatDigestLines,
  formatUpdatedLines,
  hasAnythingToSay,
  shortSummary,
  rankSkills,
  type CatalogChange,
  type PopularSkill,
  type PopularSkillDigest,
} from './popular-skills'

export { normalizeChangeNote, summarizeChangeNote } from './change-note'
