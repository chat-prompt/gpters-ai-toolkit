/**
 * Slack webhook notification module for deploy events
 *
 * Sends Block Kit formatted messages to Slack when skills/agents/commands/guides
 * are deployed or updated. Uses native fetch with fire-and-forget pattern.
 */

import { createLogger } from '../core/logger'

const log = createLogger('slack-notification')

/** Type-to-emoji/label mapping for Slack messages */
const TYPE_LABELS: Record<string, { emoji: string; label: string }> = {
  skill: { emoji: '\uD83D\uDD27', label: 'Skill' },
  agent: { emoji: '\uD83E\uDD16', label: 'Agent' },
  command: { emoji: '\u26A1', label: 'Command' },
  guide: { emoji: '\uD83D\uDCD6', label: 'Guide' },
}

/**
 * Parameters for building a Slack deploy notification message
 */
export interface SlackDeployParams {
  /** Catalog item ID */
  id: string
  /** Display name */
  name: string
  /** Item type (skill, agent, command, guide) */
  type: string
  /** Deployed version string */
  version: string
  /** Previous version if this is an update */
  previousVersion?: string
  /** Changelog description */
  changelog?: string | null
  /** Name of the deployer */
  authorName?: string
  /** Web URL for the deployed item */
  webUrl?: string
  /** Deploy status (published or draft) */
  status?: string
}

/**
 * Slack Block Kit message payload
 */
export interface SlackPayload {
  blocks: SlackBlock[]
}

/** Slack Block Kit block union type */
type SlackBlock =
  | { type: 'header'; text: { type: 'plain_text'; text: string; emoji: boolean } }
  | { type: 'section'; fields: { type: 'mrkdwn'; text: string }[] }
  | { type: 'section'; text: { type: 'mrkdwn'; text: string }; accessory?: SlackAccessory }
  | { type: 'divider' }
  | { type: 'context'; elements: { type: 'mrkdwn'; text: string }[] }

/** Slack button accessory */
interface SlackAccessory {
  type: 'button'
  text: { type: 'plain_text'; text: string; emoji: boolean }
  url: string
}

/**
 * Build a Slack Block Kit message for a deploy event
 *
 * @param params - Deploy notification parameters
 * @returns Slack Block Kit payload
 */
export function buildSlackMessage(params: SlackDeployParams): SlackPayload {
  const { name, type, version, previousVersion, changelog, authorName, webUrl, status } = params
  const isUpdate = !!previousVersion
  const typeInfo = TYPE_LABELS[type] || { emoji: '\uD83D\uDCE6', label: type }

  const headerText = isUpdate
    ? `\uD83D\uDD04 ${typeInfo.label} \uC5C5\uB370\uC774\uD2B8`
    : `\uD83C\uDD95 ${typeInfo.label} \uC2E0\uADDC \uBC30\uD3EC`

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: headerText, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*\uC774\uB984:*\n${typeInfo.emoji} ${name}` },
        {
          type: 'mrkdwn',
          text: isUpdate
            ? `*\uBC84\uC804:*\n${previousVersion} \u2192 ${version}`
            : `*\uBC84\uC804:*\n${version}`,
        },
      ],
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*\uD0C0\uC785:*\n${typeInfo.label}` },
        { type: 'mrkdwn', text: `*\uBC30\uD3EC\uC790:*\n${authorName || '\uC54C \uC218 \uC5C6\uC74C'}` },
      ],
    },
  ]

  if (status === 'draft') {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '\uD83D\uDCDD Draft \u2013 \uC544\uC9C1 \uACF5\uAC1C\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4' }],
    })
  }

  if (changelog) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*\uBCC0\uACBD\uC0AC\uD56D:*\n${changelog}` },
    })
  }

  if (webUrl) {
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `<${webUrl}|\uC0C1\uC138 \uBCF4\uAE30>` },
    })
  }

  return { blocks }
}

/**
 * Send a payload to a Slack Incoming Webhook URL
 *
 * @param webhookUrl - Slack webhook URL
 * @param payload - Slack Block Kit payload
 * @throws Error if the request fails or times out
 */
export async function sendSlackWebhook(webhookUrl: string, payload: SlackPayload): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    throw new Error(`Slack webhook failed: ${response.status} ${response.statusText}`)
  }
}

/**
 * Main entry point for Slack deploy notifications
 *
 * Checks for SLACK_WEBHOOK_URL env var, builds the message, and sends it.
 * Never throws — all errors are logged and swallowed.
 *
 * @param params - Deploy notification parameters
 */
export async function notifySlackDeploy(params: SlackDeployParams): Promise<void> {
  try {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    if (!webhookUrl) {
      return
    }

    const payload = buildSlackMessage(params)
    await sendSlackWebhook(webhookUrl, payload)
    log.info(`Slack notification sent for ${params.type} "${params.name}"`)
  } catch (error) {
    log.error('Failed to send Slack deploy notification', error)
  }
}
