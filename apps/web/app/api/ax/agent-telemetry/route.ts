/** PII-free 에이전트 delta telemetry batch 수신 API */

import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { recordAgentTelemetryBatch } from '@/lib/analytics'
import { validateAgentTelemetryBatch } from '@/lib/features/ax'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 512 * 1024
const NO_STORE = { 'Cache-Control': 'private, no-store' }
const SAFE_AGENT_ID = /^[a-z0-9][a-z0-9._:-]{0,99}$/
const MAX_SCOPED_TOKENS = 100

interface TelemetryCredential {
  configured: boolean
  valid: boolean
  agentId: string | null
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

function authenticateTelemetryToken(authorization: string | null): TelemetryCredential {
  const legacyToken = process.env.AX_AGENT_TELEMETRY_TOKEN
  const scopedJson = process.env.AX_AGENT_TELEMETRY_TOKEN_HASHES
  if (!legacyToken && !scopedJson) return { configured: false, valid: false, agentId: null }
  if (!authorization?.startsWith('Bearer ')) return { configured: true, valid: false, agentId: null }

  const token = authorization.slice('Bearer '.length)
  if (scopedJson) {
    let scopedTokens: unknown
    try {
      scopedTokens = JSON.parse(scopedJson)
    } catch {
      return { configured: false, valid: false, agentId: null }
    }
    if (!scopedTokens || typeof scopedTokens !== 'object' || Array.isArray(scopedTokens)) {
      return { configured: false, valid: false, agentId: null }
    }
    const entries = Object.entries(scopedTokens)
    if (entries.length === 0 || entries.length > MAX_SCOPED_TOKENS) {
      return { configured: false, valid: false, agentId: null }
    }
    const actualHash = createHash('sha256').update(token).digest('hex')
    for (const [agentId, expectedHash] of entries) {
      if (!SAFE_AGENT_ID.test(agentId) || typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash)) {
        return { configured: false, valid: false, agentId: null }
      }
      if (constantTimeEqual(actualHash, expectedHash)) {
        return { configured: true, valid: true, agentId }
      }
    }
    return { configured: true, valid: false, agentId: null }
  }

  return {
    configured: true,
    valid: Boolean(legacyToken && constantTimeEqual(token, legacyToken)),
    agentId: null,
  }
}

export async function POST(request: NextRequest) {
  const credential = authenticateTelemetryToken(request.headers.get('authorization'))
  if (!credential.configured) {
    return NextResponse.json({ error: 'Agent telemetry ingestion is not configured' }, { status: 503, headers: NO_STORE })
  }
  if (!credential.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }

  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413, headers: NO_STORE })
  }

  let input: unknown
  try {
    const text = await request.text()
    if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413, headers: NO_STORE })
    }
    input = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: NO_STORE })
  }

  const validation = validateAgentTelemetryBatch(input)
  if (!validation.ok) {
    return NextResponse.json(
      { error: 'Invalid agent telemetry batch', details: validation.errors },
      { status: 400, headers: NO_STORE }
    )
  }
  if (credential.agentId && validation.data.agentId !== credential.agentId) {
    return NextResponse.json({ error: 'Token is not authorized for this agent' }, { status: 403, headers: NO_STORE })
  }

  try {
    const result = await recordAgentTelemetryBatch(validation.data)
    return NextResponse.json({ ok: true, inserted: result.inserted }, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'Failed to store agent telemetry batch' }, { status: 500, headers: NO_STORE })
  }
}
