/** OAuth 사용자가 자기 agent/source에 collector 전용 credential을 등록·폐기한다. */

import { NextRequest, NextResponse } from 'next/server'
import {
  AgentTelemetryCollectorConflictError,
  enrollAgentTelemetryCollector,
  revokeAgentTelemetryCollector,
} from '@/lib/analytics'
import { authenticateOAuthRequest, oauthAuthError } from '@/lib/security/oauth-tokens'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,99}$/
const SOURCES = new Set(['openclaw', 'claude-code', 'codex', 'hermes'])

async function authenticatedUser(request: NextRequest): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const auth = await authenticateOAuthRequest(request)
  if (!auth?.authenticated || !auth.userId) {
    return { ok: false, response: oauthAuthError(auth?.error ?? 'Authentication required') }
  }
  return { ok: true, userId: auth.userId }
}

async function body(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await request.json()
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const rateLimited = withRateLimit(request, RateLimitPresets.auth)
  if (rateLimited) return rateLimited
  const user = await authenticatedUser(request)
  if (!user.ok) return user.response
  const input = await body(request)
  const agentId = input?.agentId
  const collectorId = input?.collectorId
  const source = input?.source
  const intervalSeconds = input?.intervalSeconds
  if (
    typeof agentId !== 'string' || !SAFE_ID.test(agentId) ||
    typeof collectorId !== 'string' || !SAFE_ID.test(collectorId) ||
    typeof source !== 'string' || !SOURCES.has(source) ||
    typeof intervalSeconds !== 'number' || !Number.isInteger(intervalSeconds) ||
    intervalSeconds < 600 || intervalSeconds > 604_800
  ) {
    return NextResponse.json({ error: 'Invalid collector enrollment request' }, { status: 400, headers: NO_STORE })
  }

  try {
    const enrolled = await enrollAgentTelemetryCollector({
      userId: user.userId,
      agentId,
      collectorId,
      source: source as 'openclaw' | 'claude-code' | 'codex' | 'hermes',
      intervalSeconds,
    })
    return NextResponse.json({ ok: true, collectorToken: enrolled.collectorToken }, { status: 201, headers: NO_STORE })
  } catch (cause) {
    if (cause instanceof AgentTelemetryCollectorConflictError) {
      return NextResponse.json({ error: cause.message }, { status: 409, headers: NO_STORE })
    }
    return NextResponse.json({ error: 'Failed to enroll collector' }, { status: 500, headers: NO_STORE })
  }
}

export async function DELETE(request: NextRequest) {
  const rateLimited = withRateLimit(request, RateLimitPresets.auth)
  if (rateLimited) return rateLimited
  const user = await authenticatedUser(request)
  if (!user.ok) return user.response
  const input = await body(request)
  const collectorId = input?.collectorId
  if (typeof collectorId !== 'string' || !SAFE_ID.test(collectorId)) {
    return NextResponse.json({ error: 'Invalid collector revocation request' }, { status: 400, headers: NO_STORE })
  }

  try {
    const revoked = await revokeAgentTelemetryCollector(collectorId, user.userId)
    if (!revoked) return NextResponse.json({ error: 'Collector not found' }, { status: 404, headers: NO_STORE })
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'Failed to revoke collector' }, { status: 500, headers: NO_STORE })
  }
}
