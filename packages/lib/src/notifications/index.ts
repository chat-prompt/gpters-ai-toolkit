/**
 * Notification modules for GPTers AI Toolkit
 *
 * Barrel export for notification integrations (Slack, etc.)
 */

export { buildSlackMessage, sendSlackWebhook, notifySlackDeploy, summarizeContent, notifySlackEvoAnalyze, notifySlackEvoAction, notifySlackEvoPromote } from './slack'
export type { SlackDeployParams, SlackPayload, EvoAnalyzeParams, EvoActionParams, EvoPromoteParams } from './slack'
