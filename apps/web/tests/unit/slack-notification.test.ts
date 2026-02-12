/**
 * Tests for Slack deploy notification module
 *
 * Covers message building, webhook sending, and the main notifySlackDeploy entry point.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildSlackMessage, sendSlackWebhook, notifySlackDeploy } from '@gpters/lib/notifications'
import type { SlackDeployParams } from '@gpters/lib/notifications'

describe('buildSlackMessage', () => {
  const baseParams: SlackDeployParams = {
    id: 'my-skill',
    name: 'My Skill',
    type: 'skill',
    version: '1.0.0',
    webUrl: 'https://ai-toolkit.gpters.org/skill/my-skill',
  }

  it('should build a new deploy message', () => {
    const payload = buildSlackMessage(baseParams)

    const header = payload.blocks[0]
    expect(header).toMatchObject({
      type: 'header',
      text: expect.objectContaining({ text: expect.stringContaining('\uC2E0\uADDC \uBC30\uD3EC') }),
    })
  })

  it('should build an update message with version diff', () => {
    const payload = buildSlackMessage({
      ...baseParams,
      version: '1.1.0',
      previousVersion: '1.0.0',
    })

    const header = payload.blocks[0]
    expect(header).toMatchObject({
      type: 'header',
      text: expect.objectContaining({ text: expect.stringContaining('\uC5C5\uB370\uC774\uD2B8') }),
    })

    const versionBlock = JSON.stringify(payload.blocks)
    expect(versionBlock).toContain('1.0.0')
    expect(versionBlock).toContain('1.1.0')
    expect(versionBlock).toContain('\u2192')
  })

  it('should use correct emoji/label for each type', () => {
    for (const [type, expected] of [
      ['skill', '\uD83D\uDD27'],
      ['agent', '\uD83E\uDD16'],
      ['command', '\u26A1'],
      ['guide', '\uD83D\uDCD6'],
    ] as const) {
      const payload = buildSlackMessage({ ...baseParams, type })
      const text = JSON.stringify(payload.blocks)
      expect(text).toContain(expected)
    }
  })

  it('should include author name when provided', () => {
    const payload = buildSlackMessage({ ...baseParams, authorName: 'Alice' })
    const text = JSON.stringify(payload.blocks)
    expect(text).toContain('Alice')
  })

  it('should show fallback when author name is missing', () => {
    const payload = buildSlackMessage({ ...baseParams, authorName: undefined })
    const text = JSON.stringify(payload.blocks)
    expect(text).toContain('\uC54C \uC218 \uC5C6\uC74C')
  })

  it('should include changelog when provided', () => {
    const payload = buildSlackMessage({ ...baseParams, changelog: 'Fixed a bug' })
    const text = JSON.stringify(payload.blocks)
    expect(text).toContain('Fixed a bug')
    expect(text).toContain('\uBCC0\uACBD\uC0AC\uD56D')
  })

  it('should not include changelog block when absent', () => {
    const payload = buildSlackMessage(baseParams)
    const text = JSON.stringify(payload.blocks)
    expect(text).not.toContain('\uBCC0\uACBD\uC0AC\uD56D')
  })

  it('should include web URL link', () => {
    const payload = buildSlackMessage(baseParams)
    const text = JSON.stringify(payload.blocks)
    expect(text).toContain(baseParams.webUrl)
    expect(text).toContain('\uC0C1\uC138 \uBCF4\uAE30')
  })

  it('should add draft context when status is draft', () => {
    const payload = buildSlackMessage({ ...baseParams, status: 'draft' })
    const text = JSON.stringify(payload.blocks)
    expect(text).toContain('Draft')
  })

  it('should not add draft context when status is published', () => {
    const payload = buildSlackMessage({ ...baseParams, status: 'published' })
    const text = JSON.stringify(payload.blocks)
    expect(text).not.toContain('Draft')
  })

  it('should handle unknown type gracefully', () => {
    const payload = buildSlackMessage({ ...baseParams, type: 'unknown' })
    const text = JSON.stringify(payload.blocks)
    expect(text).toContain('unknown')
  })
})

describe('sendSlackWebhook', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('should POST payload to webhook URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    globalThis.fetch = mockFetch

    const payload = { blocks: [] }
    await sendSlackWebhook('https://hooks.slack.com/services/test', payload)

    expect(mockFetch).toHaveBeenCalledWith(
      'https://hooks.slack.com/services/test',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    )
  })

  it('should throw on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    })

    await expect(
      sendSlackWebhook('https://hooks.slack.com/services/test', { blocks: [] })
    ).rejects.toThrow('Slack webhook failed: 400 Bad Request')
  })

  it('should propagate network errors', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    await expect(
      sendSlackWebhook('https://hooks.slack.com/services/test', { blocks: [] })
    ).rejects.toThrow('Network error')
  })
})

describe('notifySlackDeploy', () => {
  const originalFetch = globalThis.fetch
  const originalEnv = process.env.SLACK_WEBHOOK_URL

  afterEach(() => {
    globalThis.fetch = originalFetch
    if (originalEnv !== undefined) {
      process.env.SLACK_WEBHOOK_URL = originalEnv
    } else {
      delete process.env.SLACK_WEBHOOK_URL
    }
  })

  const params: SlackDeployParams = {
    id: 'my-skill',
    name: 'My Skill',
    type: 'skill',
    version: '1.0.0',
  }

  it('should skip when SLACK_WEBHOOK_URL is not set', async () => {
    delete process.env.SLACK_WEBHOOK_URL
    const mockFetch = vi.fn()
    globalThis.fetch = mockFetch

    await notifySlackDeploy(params)

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should send notification when SLACK_WEBHOOK_URL is set', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/test'
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

    await notifySlackDeploy(params)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://hooks.slack.com/services/test',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('should never throw even when webhook fails', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/test'
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))

    await expect(notifySlackDeploy(params)).resolves.toBeUndefined()
  })

  it('should never throw on non-ok response', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/test'
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    await expect(notifySlackDeploy(params)).resolves.toBeUndefined()
  })
})
