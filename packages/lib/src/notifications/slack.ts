/**
 * Slack webhook notification module for deploy events
 *
 * Sends Block Kit formatted messages to Slack when skills/agents/commands/guides
 * are deployed or updated. Uses native fetch with fire-and-forget pattern.
 */

import { GoogleGenAI } from '@google/genai'
import { createLogger } from '../core/logger'

const log = createLogger('slack-notification')

/**
 * 배포 알림 요약에 쓰는 모델.
 *
 * 2026-09-07 확인: `gemini-2.0-flash`가 폐기돼 이 요약이 **얼마간 조용히 비어 있었다.**
 * `summarizeContent`가 실패를 null로 삼키고, 호출부는 요약이 없으면 그냥 생략하기 때문에
 * 알림은 정상으로 보였다.
 */
const SUMMARY_MODEL = 'gemini-3.6-flash'

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
  /** 알림·접근성용 대체 텍스트 */
  text?: string
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

/** 크론 실패 알림 인자 */
export interface CronFailureParams {
  /** `vercel.json` 경로에서 딴 잡 이름 */
  jobName: string
  /** 실패 메시지 */
  error: string
}

/**
 * 크론이 예외로 실패했을 때 그 자리에서 알린다.
 *
 * 이 알림이 없던 시절 `evo-promote`가 20주 연속 실패했는데 아무도 몰랐다.
 *
 * @param params - 잡 이름과 실패 메시지
 */
export async function notifySlackCronFailure(params: CronFailureParams): Promise<void> {
  try {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    if (!webhookUrl) return

    // 메시지가 길면 Slack이 잘라내므로 앞부분만 보낸다. 전문은 실행 기록에 남는다.
    const detail = params.error.length > 500 ? `${params.error.slice(0, 500)}…` : params.error
    await sendSlackWebhook(webhookUrl, {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🚨 크론 실패', emoji: true },
        },
        {
          type: 'section',
          fields: [{ type: 'mrkdwn', text: `*잡:*\n\`${params.jobName}\`` }],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `\`\`\`${detail}\`\`\`` },
        },
      ],
    })
  } catch (error) {
    console.error('[slack] cron failure notification failed:', error)
  }
}

/** 크론 감시 결과 알림 인자 */
export interface CronHealthParams {
  /** 감시한 잡 수 */
  checked: number
  /** 발견한 문제 */
  issues: Array<{ jobName: string; label: string; kind: string; detail: string }>
}

/**
 * 크론 감시에서 문제를 찾았을 때 알린다.
 *
 * **문제가 없으면 아무것도 보내지 않는다.** 매일 "이상 없음"을 보내면 그 채널을 아무도 안 읽게 되고,
 * 그러면 진짜 알림도 같이 묻힌다 — evo가 매일 "생성 0건"을 보내며 그렇게 됐다.
 *
 * @param params - 감시 결과
 */
export async function notifySlackCronHealth(params: CronHealthParams): Promise<void> {
  try {
    if (params.issues.length === 0) return
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    if (!webhookUrl) return

    const KIND_LABELS: Record<string, string> = {
      never: '실행 기록 없음',
      silent: '멈춤',
      zero_output: '산출 0 지속',
    }

    await sendSlackWebhook(webhookUrl, {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '⏰ 크론 점검', emoji: true },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: params.issues
              .map((issue) =>
                `• *${issue.label}* (\`${issue.jobName}\`) — ${KIND_LABELS[issue.kind] ?? issue.kind}\n  ${issue.detail}`
              )
              .join('\n'),
          },
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `감시 대상 ${params.checked}개 중 ${params.issues.length}개` }],
        },
      ],
    })
  } catch (error) {
    console.error('[slack] cron health notification failed:', error)
  }
}

/** 계정 점검 알림 인자 — `ops/account-audit`의 결과와 모양이 같다 (순환 import를 피하려고 따로 둔다) */
export interface AccountAuditParams {
  /** 휴면 기준(일) */
  dormantDays: number
  /** 점검한 계정 수 */
  checked: number
  dormant: Array<{
    name: string | null
    email: string
    lastActivityAt: string | null
    daysSinceActivity: number | null
    liveAccessTokens: number
    activeCollectors: number
    ownedItems: number
  }>
  inconsistentSuspended: Array<{
    name: string | null
    email: string
    activeMemberships: number
    liveAccessTokens: number
    liveRefreshTokens: number
  }>
  duplicateNames: Array<{
    name: string
    accounts: Array<{ email: string; lastLoginAt: string | null }>
  }>
}

/** 휴면 목록이 길면 앞에서 자른다 — 채널에 한 화면이면 충분하다 */
const AUDIT_DORMANT_LIMIT = 15

function auditWho(name: string | null, email: string): string {
  return name ? `${name} (${email})` : email
}

function auditDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '기록 없음'
}

/**
 * 계정 점검 결과를 알린다.
 *
 * **문제가 없으면 아무것도 보내지 않는다.** 퇴사 여부는 앱이 판정할 수 없으므로 이 알림은 결론이
 * 아니라 **물어볼 목록**이다 — 조직 멤버 제거는 사람이 admin 화면에서 한다.
 *
 * @param params - 점검 결과
 */
export async function notifySlackAccountAudit(params: AccountAuditParams): Promise<void> {
  try {
    const total = params.dormant.length + params.inconsistentSuspended.length + params.duplicateNames.length
    if (total === 0) return
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    if (!webhookUrl) return

    const sections: Array<{ type: 'section'; text: { type: 'mrkdwn'; text: string } }> = []

    if (params.inconsistentSuspended.length > 0) {
      const lines = params.inconsistentSuspended.map((row) => {
        const left = [
          row.activeMemberships > 0 ? `소속 ${row.activeMemberships}` : null,
          row.liveAccessTokens > 0 ? `access 토큰 ${row.liveAccessTokens}` : null,
          row.liveRefreshTokens > 0 ? `refresh 토큰 ${row.liveRefreshTokens}` : null,
        ].filter(Boolean).join(' · ')
        return `• ${auditWho(row.name, row.email)} — ${left}`
      })
      sections.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*반쪽 정지 ${params.inconsistentSuspended.length}건* — 정지인데 남아 있는 것이 있다. 조직 멤버 제거로 마무리해야 한다\n${lines.join('\n')}`,
        },
      })
    }

    if (params.dormant.length > 0) {
      const shown = params.dormant.slice(0, AUDIT_DORMANT_LIMIT)
      const lines = shown.map((row) => {
        const since = row.daysSinceActivity === null
          ? '활동 기록 없음'
          : `마지막 활동 ${auditDate(row.lastActivityAt)} (${row.daysSinceActivity}일 전)`
        const holds = [
          row.liveAccessTokens > 0 ? `토큰 ${row.liveAccessTokens}` : null,
          row.activeCollectors > 0 ? `수집기 ${row.activeCollectors}` : null,
          row.ownedItems > 0 ? `스킬 ${row.ownedItems}` : null,
        ].filter(Boolean).join(' · ')
        return `• ${auditWho(row.name, row.email)} — ${since}${holds ? ` · ${holds}` : ''}`
      })
      const more = params.dormant.length > shown.length ? `\n… 외 ${params.dormant.length - shown.length}명` : ''
      sections.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*휴면 ${params.dormant.length}명* — ${params.dormantDays}일 넘게 로그인도 스킬 활동도 없는 활성 계정. 퇴사면 조직 멤버 제거\n${lines.join('\n')}${more}`,
        },
      })
    }

    if (params.duplicateNames.length > 0) {
      const lines = params.duplicateNames.map((group) =>
        `• *${group.name}* — ${group.accounts.map((a) => `${a.email} (${auditDate(a.lastLoginAt)})`).join(', ')}`
      )
      sections.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*이름 중복 ${params.duplicateNames.length}건* — 같은 이름의 활성 계정. 옛 계정이 남은 것일 수 있다\n${lines.join('\n')}`,
        },
      })
    }

    await sendSlackWebhook(webhookUrl, {
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: '👤 계정 점검', emoji: true } },
        ...sections,
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `계정 ${params.checked}개 점검 · 처리는 admin → 조직 → 멤버 제거` }],
        },
      ],
    })
  } catch (error) {
    console.error('[slack] account audit notification failed:', error)
  }
}

/** 주간 스킬 소식 알림 인자 */
export interface PopularSkillsParams {
  /** 집계 창 (일) */
  days: number
  /** 창 안의 전체 적용 건수 */
  totalApplies: number
  /** 창 안에 한 번이라도 적용된 스킬 수 */
  distinctSkills: number
  /** 많이 쓴 스킬 줄 */
  lines: string[]
  /** 새로 올라온 스킬 줄 */
  createdLines: string[]
  /** 업데이트된 스킬 줄 */
  updatedLines: string[]
  /** 설명을 채워 달라고 부탁할 줄 */
  missingLines: string[]
}

/** 전송 없이 검토할 수 있는 본문과 답글. 답글마다 같은 본문의 thread_ts를 사용한다. */
export interface PopularSkillsMessages {
  main: SlackPayload
  replies: SlackPayload[]
}

/** 인기·신규는 본문, 업데이트·설명 요청은 각각 별도의 스레드 답글로 만든다. */
export function buildPopularSkillsMessages(params: PopularSkillsParams): PopularSkillsMessages | null {
  const sections = [
    { title: `⭐ 지난 ${params.days}일 많이 쓴 스킬`, lines: params.lines },
    { title: '🆕 새로 올라온 스킬', lines: params.createdLines },
  ].filter((section) => section.lines.length > 0)
  if (sections.length === 0) return null

  const title = '📬 이번 주 스킬 소식'
  const blocks: SlackBlock[] = [
    { type: 'header', text: { type: 'plain_text', text: title, emoji: true } },
  ]
  const sectionText = (section: { title: string; lines: string[] }) =>
    `*${section.title}*\n${section.lines.join('\n')}`
  for (const [index, section] of sections.entries()) {
    if (index > 0) blocks.push({ type: 'divider' })
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: sectionText(section) } })
  }

  const replies: SlackPayload[] = [
    { title: '🔄 업데이트된 스킬', lines: params.updatedLines },
    { title: '✏️ 설명이 비어 있어요 — 만든 분이 한 줄만 채워 주세요', lines: params.missingLines },
  ]
    .filter((section) => section.lines.length > 0)
    .map((section) => ({
      text: sectionText(section),
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: sectionText(section) } }],
    }))
  return {
    main: { text: [title, ...sections.map(sectionText)].join('\n\n'), blocks },
    replies,
  }
}

const WEEKLY_SKILL_DIGEST_BOT_NAME = '뽀밋'

/** Slack은 HTTP 200에도 ok:false를 반환할 수 있다. 수신 확인 없는 성공으로 처리하지 않는다. */
async function postSkillDigestMessage(
  token: string,
  channel: string,
  payload: SlackPayload,
  threadTs?: string
): Promise<string> {
  const body = JSON.stringify({
    ...payload,
    channel,
    username: WEEKLY_SKILL_DIGEST_BOT_NAME,
    unfurl_links: false,
    unfurl_media: false,
    ...(threadTs ? { thread_ts: threadTs, reply_broadcast: false } : {}),
  })
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body,
      signal: AbortSignal.timeout(10_000),
    })
    const retryAfter = Number(response.headers?.get('retry-after'))
    if (response.status === 429 && attempt === 0 && retryAfter > 0 && retryAfter <= 10) {
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
      continue
    }
    if (!response.ok) throw new Error(`Slack skill digest HTTP ${response.status}`)
    const result = (await response.json()) as { ok?: boolean; ts?: string; error?: string }
    if (!result.ok || !result.ts) {
      throw new Error(`Slack skill digest failed: ${result.error ?? 'missing message timestamp'}`)
    }
    return result.ts
  }
  throw new Error('Slack skill digest rate limit exceeded')
}

/**
 * 본문 수신 ts를 받아 답글을 연결한다. Incoming Webhook은 ts를 반환하지 않아 Bot API를 쓴다.
 * 설정 누락·전송 실패는 호출자에 전달해 크론 성공으로 오인하지 않게 한다.
 * 네트워크 오류나 부분 발송 실패에 전체 메시지를 자동 재전송하지 않는다.
 */
export async function notifySlackPopularSkills(params: PopularSkillsParams): Promise<{
  sent: boolean
  repliesSent: number
  threadTs?: string
}> {
  const messages = buildPopularSkillsMessages(params)
  if (!messages) return { sent: false, repliesSent: 0 }
  const token = process.env.SLACK_BOT_TOKEN
  const channel = process.env.SLACK_SKILL_DIGEST_CHANNEL_ID
  if (!token || !channel) {
    throw new Error(
      'Weekly skill digest requires SLACK_BOT_TOKEN and SLACK_SKILL_DIGEST_CHANNEL_ID'
    )
  }
  const threadTs = await postSkillDigestMessage(token, channel, messages.main)
  let repliesSent = 0
  try {
    for (const reply of messages.replies) {
      await postSkillDigestMessage(token, channel, reply, threadTs)
      repliesSent++
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(
      `Weekly skill digest thread ${threadTs}: ${repliesSent}/${messages.replies.length} replies sent; ${reason}`,
      { cause: error }
    )
  }
  return { sent: true, repliesSent, threadTs }
}
