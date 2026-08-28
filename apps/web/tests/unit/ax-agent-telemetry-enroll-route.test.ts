import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const enrollAgentTelemetryCollector = vi.fn()
const revokeAgentTelemetryCollector = vi.fn()
const authenticateOAuthRequest = vi.fn()

class AgentTelemetryCollectorConflictError extends Error {}

vi.mock('@/lib/analytics', () => ({
  AgentTelemetryCollectorConflictError,
  enrollAgentTelemetryCollector,
  revokeAgentTelemetryCollector,
}))
vi.mock('@/lib/security/oauth-tokens', () => ({
  authenticateOAuthRequest,
  oauthAuthError: (message: string) => Response.json({ error: message }, { status: 401 }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  withRateLimit: () => null,
  RateLimitPresets: { auth: { limit: 10, windowSec: 60 } },
}))

const { POST, DELETE } = await import('../../app/api/ax/agent-telemetry/enroll/route')

function request(method: 'POST' | 'DELETE', body: unknown) {
  return new NextRequest('http://localhost/api/ax/agent-telemetry/enroll', {
    method,
    headers: { authorization: 'Bearer mcp_test', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('agent telemetry collector enrollment API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateOAuthRequest.mockResolvedValue({ authenticated: true, userId: 'user-1' })
    enrollAgentTelemetryCollector.mockResolvedValue({ collectorToken: `agt_${'a'.repeat(64)}` })
    revokeAgentTelemetryCollector.mockResolvedValue(true)
  })

  it('OAuth 사용자에게 scope-bound collector credential을 한 번만 반환한다', async () => {
    const response = await POST(request('POST', {
      agentId: 'codex-hayoung',
      collectorId: 'collector-1234',
      source: 'codex',
      intervalSeconds: 21_600,
    }))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ ok: true, collectorToken: `agt_${'a'.repeat(64)}` })
    expect(enrollAgentTelemetryCollector).toHaveBeenCalledWith({
      userId: 'user-1', agentId: 'codex-hayoung', collectorId: 'collector-1234',
      source: 'codex', intervalSeconds: 21_600,
    })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('미인증·잘못된 범위·이미 소유된 범위를 거부한다', async () => {
    authenticateOAuthRequest.mockResolvedValueOnce(null)
    expect((await POST(request('POST', {}))).status).toBe(401)

    expect((await POST(request('POST', {
      agentId: 'Bad Email@example.com', collectorId: '../collector', source: 'unknown', intervalSeconds: 1,
    }))).status).toBe(400)

    enrollAgentTelemetryCollector.mockRejectedValueOnce(new AgentTelemetryCollectorConflictError('scope conflict'))
    expect((await POST(request('POST', {
      agentId: 'codex', collectorId: 'collector-1', source: 'codex', intervalSeconds: 21_600,
    }))).status).toBe(409)
  })

  it('소유한 collector credential을 서버에서 먼저 폐기한다', async () => {
    const response = await DELETE(request('DELETE', { collectorId: 'collector-1234' }))
    expect(response.status).toBe(200)
    expect(revokeAgentTelemetryCollector).toHaveBeenCalledWith('collector-1234', 'user-1')

    revokeAgentTelemetryCollector.mockResolvedValueOnce(false)
    expect((await DELETE(request('DELETE', { collectorId: 'collector-missing' }))).status).toBe(404)
  })
})
