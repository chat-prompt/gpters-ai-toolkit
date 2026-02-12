/**
 * Notification modules for GPTers AI Toolkit
 *
 * Barrel export for notification integrations (Slack, etc.)
 */

export { buildSlackMessage, sendSlackWebhook, notifySlackDeploy } from './slack'
export type { SlackDeployParams, SlackPayload } from './slack'
