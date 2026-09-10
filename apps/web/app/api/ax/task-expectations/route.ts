import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@gpters/lib/security'
import { expectationCommandSchema, ExpectationConflict, ExpectationInputError, readOwnTaskExpectation, saveTaskExpectation } from '@/lib/features/ax'
import { reportBody } from '../agent-reports/shared'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const failure = (message: string, status: number) => NextResponse.json({ message }, { status, headers })
async function principal(request: NextRequest) {
  if (process.env.AX_TASK_EXPECTATIONS_ENABLED !== 'true' || process.env.AX_MONITOR_ENABLED !== 'true' || !process.env.AX_INCIDENT_ORG_ID) return { error: failure('Task expectations are not configured', 503) } as const
  const token = request.headers.get('authorization') ?? ''
  if (!/^Bearer aia_[a-f0-9]{64}$/.test(token)) return { error: failure('Agent authentication required', 401) } as const
  const agent = await authenticateAgent(token.slice(7))
  if (!agent) return { error: failure('Agent authentication required', 401) } as const
  const allowed = (process.env.AX_TASK_EXPECTATIONS_AGENT_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean)
  const monitored = (process.env.AX_MONITOR_AGENT_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean)
  if (agent.orgId !== process.env.AX_INCIDENT_ORG_ID || !allowed.includes(agent.agentId) || !monitored.includes(agent.agentId)) return { error: failure('Expectation scope is not authorized', 403) } as const
  return { agent } as const
}
export async function POST(request: NextRequest) {
  try {
    const limited = withRateLimit(request, RateLimitPresets.standard); if (limited) return limited
    const auth = await principal(request); if (auth.error) return auth.error
    let raw: unknown
    try { raw = await reportBody(request) } catch { return failure('A bounded JSON request is required', 400) }
    const parsed = expectationCommandSchema.safeParse(raw)
    if (!parsed.success) return failure('Invalid expectation command', 400)
    const result = await saveTaskExpectation(auth.agent, parsed.data)
    return result ? NextResponse.json(result, { status: parsed.data.action === 'register' && !result.replayed ? 201 : 200, headers }) : failure('Expectation not found', 404)
  } catch (error) {
    if (error instanceof ExpectationConflict) return failure(error.message, 409)
    if (error instanceof ExpectationInputError) return failure(error.message, 400)
    return failure('Expectation request failed', 500)
  }
}
export async function GET(request: NextRequest) {
  try {
    const limited = withRateLimit(request, RateLimitPresets.standard); if (limited) return limited
    const auth = await principal(request); if (auth.error) return auth.error
    const params = request.nextUrl.searchParams, id = params.get('id') ?? ''
    if ([...params.keys()].some(key => key !== 'id') || params.getAll('id').length !== 1 || !/^expect_[a-f0-9]{64}$/.test(id)) return failure('One expectation ID is required', 400)
    const record = await readOwnTaskExpectation(auth.agent, id)
    return record ? NextResponse.json({ record }, { headers }) : failure('Expectation not found', 404)
  } catch { return failure('Expectation lookup failed', 500) }
}
