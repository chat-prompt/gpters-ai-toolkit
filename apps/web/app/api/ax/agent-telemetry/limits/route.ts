/**
 * 봇 수집기의 구독 계정 주간 한도 스냅샷 수신 API (EDU-11519)
 *
 * 등록된 수집기 토큰(`agt_`)만 받는다 — 스냅샷을 보낸 봇·출처가 토큰의 등록 정보와 같아야 한다.
 * 사용량 batch(`/api/ax/agent-telemetry`)와 따로 둔다. 측정이 실패하거나 이 API가 없어도 사용량 수집은 그대로 돈다.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  agentLimitClientForSource,
  authenticateAgentTelemetryCollector,
  isAgentTelemetryCollectorToken,
  recordAgentLimitSnapshot,
  validateAgentLimitSnapshot,
} from '@/lib/analytics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 4 * 1024
const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null
  if (!bearer || !isAgentTelemetryCollectorToken(bearer)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }
  let collector: Awaited<ReturnType<typeof authenticateAgentTelemetryCollector>>
  try {
    collector = await authenticateAgentTelemetryCollector(bearer)
  } catch {
    return NextResponse.json({ error: 'Agent telemetry ingestion is not configured' }, { status: 503, headers: NO_STORE })
  }
  if (!collector) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })

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

  const validation = validateAgentLimitSnapshot(input)
  if (!validation.ok) {
    return NextResponse.json({ error: 'Invalid limit snapshot', details: validation.errors }, { status: 400, headers: NO_STORE })
  }
  const snapshot = validation.data
  if (snapshot.agentId !== collector.agentId || snapshot.collectorInstanceId !== collector.collectorId) {
    return NextResponse.json({ error: 'Token is not authorized for this collector' }, { status: 403, headers: NO_STORE })
  }
  if (agentLimitClientForSource(collector.source) !== snapshot.client) {
    return NextResponse.json({ error: 'Token is not authorized for this client' }, { status: 403, headers: NO_STORE })
  }

  try {
    const recorded = await recordAgentLimitSnapshot(snapshot)
    return NextResponse.json({ ok: true, recorded }, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'Failed to store limit snapshot' }, { status: 500, headers: NO_STORE })
  }
}
