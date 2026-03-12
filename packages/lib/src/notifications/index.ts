/**
 * Notification modules for GPTers AI Toolkit
 *
 * Barrel export for notification integrations (Slack, etc.)
 */

export { buildSlackMessage, sendSlackWebhook, notifySlackDeploy, summarizeContent, notifySlackEvoAction } from './slack'
export type { SlackDeployParams, SlackPayload, EvoActionParams } from './slack'
