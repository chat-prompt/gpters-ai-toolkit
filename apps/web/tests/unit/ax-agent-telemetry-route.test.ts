import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const recordAgentTelemetryBatch = vi.fn()
const authenticateAgentTelemetryCollector = vi.fn()
const recordAgentTelemetryCollectorSuccess = vi.fn()
vi.mock('@/lib/analytics', () => ({
  recordAgentTelemetryBatch,
  authenticateAgentTelemetryCollector,
  recordAgentTelemetryCollectorSuccess,
  isAgentTelemetryCollectorToken: (value: string) => /^agt_[a-f0-9]{64}$/.test(value),
}))

const { POST } = await import('../../app/api/ax/agent-telemetry/route')
const fixture = JSON.parse(readFileSync(resolve(
  process.cwd(), '../../infra/ax-local/fixtures/agent-telemetry-bbodoong.json'
), 'utf8'))

function request(body: unknown, token = 'local-token') {
  return new NextRequest('http://localhost/api/ax/agent-telemetry', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

describe('POST /api/ax/agent-telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AX_AGENT_TELEMETRY_TOKEN = 'local-token'
    delete process.env.AX_AGENT_TELEMETRY_TOKEN_HASHES
    delete process.env.AX_AGENT_TELEMETRY_TOKEN_HASH_CODEX
    delete process.env.AX_AGENT_TELEMETRY_TOKEN_HASH_HERMES
    recordAgentTelemetryBatch.mockResolvedValue({ inserted: true })
    authenticateAgentTelemetryCollector.mockResolvedValue(null)
    recordAgentTelemetryCollectorSuccess.mockResolvedValue(undefined)
  })

  it('인증된 유효 batch를 저장한다', async () => {
    const response = await POST(request(fixture))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, inserted: true })
    expect(recordAgentTelemetryBatch).toHaveBeenCalledTimes(1)
  })

  it('같은 batchId 재전송은 성공 응답하되 inserted=false로 알린다', async () => {
    recordAgentTelemetryBatch.mockResolvedValue({ inserted: false })
    const response = await POST(request(fixture))
    expect(await response.json()).toEqual({ ok: true, inserted: false })
  })

  it('토큰 누락·불일치와 설정 누락을 구분한다', async () => {
    expect((await POST(request(fixture, 'wrong'))).status).toBe(401)
    delete process.env.AX_AGENT_TELEMETRY_TOKEN
    expect((await POST(request(fixture))).status).toBe(503)
  })

  it('에이전트별 해시 토큰은 지정된 agentId에만 쓸 수 있다', async () => {
    delete process.env.AX_AGENT_TELEMETRY_TOKEN
    process.env.AX_AGENT_TELEMETRY_TOKEN_HASHES = JSON.stringify({
      bbodoong: sha256('bbodoong-token'),
      hermes: sha256('hermes-token'),
    })

    expect((await POST(request(fixture, 'bbodoong-token'))).status).toBe(200)
    expect((await POST(request({ ...fixture, agentId: 'hermes' }, 'bbodoong-token'))).status).toBe(403)
    expect((await POST(request(fixture, 'wrong'))).status).toBe(401)
  })

  it('scoped 설정이 존재하면 기존 공용 토큰은 비활성화된다', async () => {
    process.env.AX_AGENT_TELEMETRY_TOKEN_HASHES = JSON.stringify({
      bbodoong: sha256('bbodoong-token'),
    })

    expect((await POST(request(fixture, 'local-token'))).status).toBe(401)
    expect((await POST(request(fixture, 'bbodoong-token'))).status).toBe(200)
  })

  it('기존 JSON을 읽거나 덮어쓰지 않고 agent별 hash를 추가한다', async () => {
    delete process.env.AX_AGENT_TELEMETRY_TOKEN
    process.env.AX_AGENT_TELEMETRY_TOKEN_HASHES = JSON.stringify({
      bbodoong: sha256('bbodoong-token'),
    })
    process.env.AX_AGENT_TELEMETRY_TOKEN_HASH_CODEX = sha256('codex-token')

    expect((await POST(request(fixture, 'bbodoong-token'))).status).toBe(200)
    expect((await POST(request({ ...fixture, agentId: 'codex' }, 'codex-token'))).status).toBe(200)
    expect((await POST(request(fixture, 'codex-token'))).status).toBe(403)
  })

  it('enrollment credential은 agentId·collectorId·source 세 범위에만 쓸 수 있다', async () => {
    const token = `agt_${'a'.repeat(64)}`
    authenticateAgentTelemetryCollector.mockResolvedValue({
      collectorId: fixture.collectorInstanceId,
      agentId: fixture.agentId,
      source: fixture.collection.source,
      userId: 'user-1',
    })

    expect((await POST(request(fixture, token))).status).toBe(200)
    expect(recordAgentTelemetryCollectorSuccess).toHaveBeenCalledTimes(1)
    expect((await POST(request({ ...fixture, collectorInstanceId: 'collector-other' }, token))).status).toBe(403)
    expect((await POST(request({
      ...fixture,
      collection: { ...fixture.collection, source: 'codex' },
    }, token))).status).toBe(403)
  })

  it('agent별 hash가 기존 JSON과 충돌하면 fail-closed로 막는다', async () => {
    delete process.env.AX_AGENT_TELEMETRY_TOKEN
    process.env.AX_AGENT_TELEMETRY_TOKEN_HASHES = JSON.stringify({
      codex: sha256('first-token'),
    })
    process.env.AX_AGENT_TELEMETRY_TOKEN_HASH_CODEX = sha256('second-token')

    expect((await POST(request({ ...fixture, agentId: 'codex' }, 'first-token'))).status).toBe(503)
    expect((await POST(request({ ...fixture, agentId: 'codex' }, 'second-token'))).status).toBe(503)
  })

  it('잘못된 scoped token 설정은 fail-closed로 막는다', async () => {
    delete process.env.AX_AGENT_TELEMETRY_TOKEN
    process.env.AX_AGENT_TELEMETRY_TOKEN_HASHES = '{invalid-json'

    expect((await POST(request(fixture))).status).toBe(503)
  })

  it('잘못된 agent별 hash도 fail-closed로 막는다', async () => {
    delete process.env.AX_AGENT_TELEMETRY_TOKEN
    process.env.AX_AGENT_TELEMETRY_TOKEN_HASH_CODEX = 'not-a-sha256'

    expect((await POST(request({ ...fixture, agentId: 'codex' }, 'any-token'))).status).toBe(503)
  })

  it('PII가 포함된 payload는 저장하지 않는다', async () => {
    const response = await POST(request({ ...fixture, agentId: 'owner@example.com' }))
    expect(response.status).toBe(400)
    expect(recordAgentTelemetryBatch).not.toHaveBeenCalled()
  })
})
