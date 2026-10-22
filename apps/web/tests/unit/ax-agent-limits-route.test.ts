/**
 * POST /api/ax/agent-telemetry/limits — 수집기 토큰만 받고, 다른 봇·출처로 위장한 스냅샷은 거부한다 (EDU-11519)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const authenticateAgentTelemetryCollector = vi.fn()
const recordAgentLimitSnapshot = vi.fn()
vi.mock('@/lib/analytics', async () => {
  const limits = await vi.importActual<typeof import('../../../../packages/lib/src/analytics/agent-limits')>(
    '../../../../packages/lib/src/analytics/agent-limits'
  )
  return {
    authenticateAgentTelemetryCollector,
    recordAgentLimitSnapshot,
    isAgentTelemetryCollectorToken: (value: string) => /^agt_[a-f0-9]{64}$/.test(value),
    agentLimitClientForSource: limits.agentLimitClientForSource,
    validateAgentLimitSnapshot: limits.validateAgentLimitSnapshot,
  }
})
vi.mock('@gpters/db', () => ({ db: {}, axAccountLimitWindows: {} }))

const { POST } = await import('../../app/api/ax/agent-telemetry/limits/route')

const TOKEN = `agt_${'b'.repeat(64)}`
const now = Date.now()
const snapshot = {
  agentId: 'bbojjak',
  collectorInstanceId: 'collector-1',
  client: 'claude-code',
  accountKey: 'a'.repeat(64),
  usedPercent: 65,
  resetsAt: new Date(now + 2 * 86_400_000).toISOString(),
  observedAt: new Date(now - 60_000).toISOString(),
}

function request(body: unknown, token = TOKEN) {
  return new NextRequest('http://localhost/api/ax/agent-telemetry/limits', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/ax/agent-telemetry/limits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateAgentTelemetryCollector.mockResolvedValue({ collectorId: 'collector-1', agentId: 'bbojjak', source: 'openclaw', userId: 'u1' })
    recordAgentLimitSnapshot.mockResolvedValue(true)
  })

  it('등록된 수집기의 스냅샷을 회차에 반영한다', async () => {
    const response = await POST(request(snapshot))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, recorded: true })
    expect(recordAgentLimitSnapshot).toHaveBeenCalledWith(snapshot)
  })

  it('수집기 토큰이 아니거나 폐기된 토큰은 401', async () => {
    expect((await POST(request(snapshot, 'aia_personal'))).status).toBe(401)
    authenticateAgentTelemetryCollector.mockResolvedValueOnce(null)
    expect((await POST(request(snapshot))).status).toBe(401)
    expect(recordAgentLimitSnapshot).not.toHaveBeenCalled()
  })

  it('다른 봇·수집기·출처로 위장하면 403', async () => {
    expect((await POST(request({ ...snapshot, agentId: 'other-bot' }))).status).toBe(403)
    expect((await POST(request({ ...snapshot, collectorInstanceId: 'collector-2' }))).status).toBe(403)
    // OpenClaw 수집기는 Codex 한도를 보낼 수 없다
    expect((await POST(request({ ...snapshot, client: 'codex' }))).status).toBe(403)
    expect(recordAgentLimitSnapshot).not.toHaveBeenCalled()
  })

  it('원문 이메일을 계정 키로 보내면 400', async () => {
    const response = await POST(request({ ...snapshot, accountKey: 'bot@example.com' }))
    expect(response.status).toBe(400)
  })
})
