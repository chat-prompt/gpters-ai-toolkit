import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const recordAgentTelemetryBatch = vi.fn()
vi.mock('@/lib/analytics', () => ({ recordAgentTelemetryBatch }))

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
    recordAgentTelemetryBatch.mockResolvedValue({ inserted: true })
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

  it('잘못된 scoped token 설정은 fail-closed로 막는다', async () => {
    delete process.env.AX_AGENT_TELEMETRY_TOKEN
    process.env.AX_AGENT_TELEMETRY_TOKEN_HASHES = '{invalid-json'

    expect((await POST(request(fixture))).status).toBe(503)
  })

  it('PII가 포함된 payload는 저장하지 않는다', async () => {
    const response = await POST(request({ ...fixture, agentId: 'owner@example.com' }))
    expect(response.status).toBe(400)
    expect(recordAgentTelemetryBatch).not.toHaveBeenCalled()
  })
})
