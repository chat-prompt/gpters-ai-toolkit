/** PII-free 에이전트 delta telemetry batch 수신 API */

import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { recordAgentTelemetryBatch } from '@/lib/analytics'
import { validateAgentTelemetryBatch } from '@/lib/features/ax'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 512 * 1024
const NO_STORE = { 'Cache-Control': 'private, no-store' }

function tokenMatches(actual: string | null, expected: string): boolean {
  if (!actual?.startsWith('Bearer ')) return false
  const actualBytes = Buffer.from(actual.slice('Bearer '.length))
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

export async function POST(request: NextRequest) {
  const expectedToken = process.env.AX_AGENT_TELEMETRY_TOKEN
  if (!expectedToken) {
    return NextResponse.json({ error: 'Agent telemetry ingestion is not configured' }, { status: 503, headers: NO_STORE })
  }
  if (!tokenMatches(request.headers.get('authorization'), expectedToken)) {
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

  try {
    const result = await recordAgentTelemetryBatch(validation.data)
    return NextResponse.json({ ok: true, inserted: result.inserted }, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'Failed to store agent telemetry batch' }, { status: 500, headers: NO_STORE })
  }
}
