/**
 * 봇 수집기의 구독 계정 주간 한도 스냅샷 검증 (EDU-11519)
 *
 * 계정 키는 sha256 hex 만 받고, 출처마다 보낼 수 있는 클라이언트가 정해져 있다.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@gpters/db', () => ({ db: {}, axAccountLimitWindows: {} }))

const { agentLimitClientForSource, validateAgentLimitSnapshot } = await import('../../../../packages/lib/src/analytics/agent-limits')

const NOW = new Date('2026-10-22T03:00:00Z')
const valid = {
  agentId: 'bbojjak',
  collectorInstanceId: 'collector-1',
  client: 'claude-code',
  accountKey: 'a'.repeat(64),
  usedPercent: 65,
  resetsAt: '2026-10-24T16:00:00.000Z',
  observedAt: '2026-10-22T02:59:00.000Z',
}

describe('계정 한도 스냅샷 검증', () => {
  it('올바른 스냅샷은 통과한다', () => {
    expect(validateAgentLimitSnapshot(valid, NOW)).toEqual({ ok: true, data: valid })
  })

  it('원문 이메일·범위 밖 사용률·미래 관측·지난 회차는 거부한다', () => {
    const errors = (patch: object) => {
      const result = validateAgentLimitSnapshot({ ...valid, ...patch }, NOW)
      return result.ok ? [] : result.errors
    }
    expect(errors({ accountKey: 'bot@example.com' })).toContain('accountKey must be a sha256 hex digest')
    expect(errors({ usedPercent: 101 })).toContain('usedPercent must be a number between 0 and 100')
    expect(errors({ observedAt: '2026-10-22T04:00:00.000Z' })).toContain('observedAt cannot be in the future')
    expect(errors({ resetsAt: '2026-10-22T02:00:00.000Z' })).toContain('resetsAt must be after observedAt')
    expect(errors({ client: 'gemini' })).toContain('client must be claude-code or codex')
    expect(errors({ resetsAt: '9999-01-01T00:00:00.000Z' })).toContain('resetsAt must be within 8 days of observedAt')
  })

  it('OpenClaw 봇은 Claude Code 한도를, Hermes 는 아직 아무것도 보내지 못한다', () => {
    expect(agentLimitClientForSource('openclaw')).toBe('claude-code')
    expect(agentLimitClientForSource('claude-code')).toBe('claude-code')
    expect(agentLimitClientForSource('codex')).toBe('codex')
    expect(agentLimitClientForSource('hermes')).toBeNull()
  })
})
