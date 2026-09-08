import { NextRequest, NextResponse } from 'next/server'
import { authenticateOAuthRequest } from '@/lib/security/oauth-tokens'
import { AGENT_ID_PATTERN, issueAgentCredential, listAgentCredentials, revokeAgentCredential, revokeAllAgentCredentials } from '@gpters/lib/security'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })

async function ownerContext(request: NextRequest) {
  const limited = withRateLimit(request, RateLimitPresets.auth)
  if (limited) return { error: limited }
  // Credential administration never accepts delegated agent tokens.
  if (request.headers.get('authorization')?.startsWith('Bearer aia_')) {
    return { error: response({ error: 'Owner authentication required' }, 401) }
  }
  const auth = await authenticateOAuthRequest(request)
  if (!auth?.authenticated || !auth.userId) return { error: response({ error: 'Owner authentication required' }, 401) }
  return { ownerUserId: auth.userId }
}

async function readInput(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw) > 4096) return null
    const body: unknown = JSON.parse(raw)
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
  } catch { return null }
}

export async function GET(request: NextRequest) {
  const context = await ownerContext(request)
  if (context.error) return context.error
  return response({ ok: true, agents: await listAgentCredentials(context.ownerUserId!) })
}

export async function POST(request: NextRequest) {
  const context = await ownerContext(request)
  if (context.error) return context.error
  const input = await readInput(request)
  if (!input || typeof input.agentId !== 'string' || !AGENT_ID_PATTERN.test(input.agentId) ||
    (input.allowDeploy !== undefined && typeof input.allowDeploy !== 'boolean') ||
    (input.orgId !== undefined && (typeof input.orgId !== 'string' || !input.orgId.trim() || input.orgId.length > 200))) {
    return response({ error: 'Invalid agent identity request' }, 400)
  }
  try {
    const credential = await issueAgentCredential(context.ownerUserId!, input.agentId, input.allowDeploy === true, input.orgId as string | undefined)
    return response({ ok: true, ...credential }, 201)
  } catch {
    return response({ error: 'Agent ownership conflict or owner access denied; select an active organization explicitly when you belong to several' }, 409)
  }
}

export async function DELETE(request: NextRequest) {
  const context = await ownerContext(request)
  if (context.error) return context.error
  const input = await readInput(request)
  if (!input || (input.all !== undefined && typeof input.all !== 'boolean') ||
    (input.all === true ? input.agentId !== undefined : typeof input.agentId !== 'string' || !AGENT_ID_PATTERN.test(input.agentId))) {
    return response({ error: 'Specify either one agentId or all: true' }, 400)
  }
  if (input.all === true) return response({ ok: true, revoked: await revokeAllAgentCredentials(context.ownerUserId!) })
  const revoked = await revokeAgentCredential(context.ownerUserId!, input.agentId as string)
  return response(revoked ? { ok: true } : { error: 'Agent not found' }, revoked ? 200 : 404)
}
