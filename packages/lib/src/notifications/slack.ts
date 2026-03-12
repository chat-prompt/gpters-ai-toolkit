/**
 * Slack webhook notification module for deploy events
 *
 * Sends Block Kit formatted messages to Slack when skills/agents/commands/guides
 * are deployed or updated. Uses native fetch with fire-and-forget pattern.
 */

import { GoogleGenAI } from '@google/genai'
import { createLogger } from '../core/logger'

const log = createLogger('slack-notification')

const SUMMARY_MODEL = 'gemini-2.0-flash'

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
  /** Raw skill content (markdown) for AI summary */
  content?: string | null
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
 * Summarize skill content using Gemini API
 *
 * @param content - Raw markdown content to summarize
 * @returns One-line Korean summary, or null on failure
 */
export async function summarizeContent(content: string): Promise<string | null> {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return null

    const client = new GoogleGenAI({ apiKey })
    const response = await client.models.generateContent({
      model: SUMMARY_MODEL,
      contents: `다음 스킬/플러그인 내용을 한국어 1줄(50자 이내)로 요약해줘. 설명만 출력하고 다른 말은 하지 마:\n\n${content.slice(0, 2000)}`,
    })

    return response.text?.trim() || null
  } catch (error) {
    log.error('Failed to summarize content', error)
    return null
  }
}

/**
 * Build a Slack Block Kit message for a deploy event
 *
 * @param params - Deploy notification parameters
 * @param summary - Optional AI-generated summary of the content
 * @returns Slack Block Kit payload
 */
export function buildSlackMessage(params: SlackDeployParams, summary?: string | null): SlackPayload {
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

  if (summary) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*\uC694\uC57D:*\n${summary}` },
    })
  }

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

    const isNew = !params.previousVersion
    const summary = isNew && params.content ? await summarizeContent(params.content) : null
    const payload = buildSlackMessage(params, summary)
    await sendSlackWebhook(webhookUrl, payload)
    log.info(`Slack notification sent for ${params.type} "${params.name}"`)
  } catch (error) {
    log.error('Failed to send Slack deploy notification', error)
  }
}

// ============================================
// EvoSkill Notifications
// ============================================

export interface EvoActionParams {
  skillsCreated: number
  suggestionsCreated: number
  processed: number
  errors: number
}

export interface EvoAnalyzeParams {
  patternsFound: number
  byType: { zero_result_cluster: number; low_conversion: number; repeated_skip: number }
  errors: number
}

export interface EvoPromoteParams {
  promoted: number
  retired: number
  held: number
  errors: number
}

/**
 * Slack notification for evo-analyze cron (failure pattern detection).
 */
export async function notifySlackEvoAnalyze(params: EvoAnalyzeParams): Promise<void> {
  try {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    if (!webhookUrl) return

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '\uD83D\uDD0D EvoSkill \uC2E4\uD328 \uD328\uD134 \uBD84\uC11D', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*\uC2E0\uADDC \uD328\uD134:*\n${params.patternsFound}\uAC74` },
          { type: 'mrkdwn', text: `*\uC624\uB958:*\n${params.errors}\uAC74` },
        ],
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*\uBB34\uACB0\uACFC \uD074\uB7EC\uC2A4\uD130:*\n${params.byType.zero_result_cluster}\uAC74` },
          { type: 'mrkdwn', text: `*\uB0AE\uC740 \uC804\uD658\uC728:*\n${params.byType.low_conversion}\uAC74` },
        ],
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `\uBC18\uBCF5 \uC2A4\uD0B5: ${params.byType.repeated_skip}\uAC74 | \uB9E4\uC77C 06:00 UTC \uC2E4\uD589` }],
      },
    ]

    await sendSlackWebhook(webhookUrl, { blocks })
  } catch (error) {
    log.error('Failed to send EvoSkill analyze notification', error)
  }
}

/**
 * Slack notification for evo-generate cron (skill generation).
 */
export async function notifySlackEvoAction(params: EvoActionParams): Promise<void> {
  try {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    if (!webhookUrl) return

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '\uD83E\uDDEC EvoSkill \uC2A4\uD0AC \uC0DD\uC131', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*\uCC98\uB9AC:*\n${params.processed}\uAC74` },
          { type: 'mrkdwn', text: `*\uC2A4\uD0AC \uC0DD\uC131:*\n${params.skillsCreated}\uAC74` },
        ],
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*\uAC1C\uC120 \uC81C\uC548:*\n${params.suggestionsCreated}\uAC74` },
          { type: 'mrkdwn', text: `*\uC624\uB958:*\n${params.errors}\uAC74` },
        ],
      },
    ]

    if (params.skillsCreated > 0) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: '\uD83D\uDCDD Draft \uC0C1\uD0DC\uB85C \uC0DD\uC131\uB428 \u2014 \uD37C\uB110 \uC9C0\uD45C \uAE30\uBC18 \uC790\uB3D9 \uC2B9\uACA9/\uD3D0\uAE30 \uC608\uC815' }],
      })
    }

    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '\uB9E4\uC77C 07:00 UTC \uC2E4\uD589' }],
    })

    await sendSlackWebhook(webhookUrl, { blocks })
  } catch (error) {
    log.error('Failed to send EvoSkill generate notification', error)
  }
}

/**
 * Slack notification for evo-promote cron (Pareto selection).
 */
export async function notifySlackEvoPromote(params: EvoPromoteParams): Promise<void> {
  try {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    if (!webhookUrl) return

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '\uD83C\uDFC6 EvoSkill Pareto \uC120\uD0DD', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*\uC2B9\uACA9:*\n${params.promoted}\uAC74` },
          { type: 'mrkdwn', text: `*\uD3D0\uAE30:*\n${params.retired}\uAC74` },
        ],
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*\uBCF4\uB958:*\n${params.held}\uAC74` },
          { type: 'mrkdwn', text: `*\uC624\uB958:*\n${params.errors}\uAC74` },
        ],
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: '\uB9E4\uC8FC \uC6D4\uC694\uC77C 08:00 UTC \uC2E4\uD589' }],
      },
    ]

    await sendSlackWebhook(webhookUrl, { blocks })
  } catch (error) {
    log.error('Failed to send EvoSkill promote notification', error)
  }
}
