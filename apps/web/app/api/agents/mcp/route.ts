/** Agent-only MCP transport. Never goes through human activity/session recording. */
import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent, canAgentCall, recordAgentRequest } from '@gpters/lib/security'
import { executeTool, MCP_TOOLS } from '@/lib/mcp'
import { recordSkillExecutionStart, recordSkillExecutionAttempt } from '@/lib/analytics'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const REST_TOOLS: Record<string, string> = { search: 'search_plugins', get: 'get_plugin_content', list: 'list_plugins', deploy: 'deploy_skill' }

export async function POST(request: NextRequest) {
  const ipLimited = withRateLimit(request, RateLimitPresets.standard)
  if (ipLimited) return ipLimited
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
  const agent = await authenticateAgent(token)
  if (!agent) return response({ error: 'Agent authentication required' }, 401)
  const limited = withRateLimit(request, { ...RateLimitPresets.authenticated, identifier: () => `agent:${agent.agentId}` })
  if (limited) return limited
  const raw = await request.text()
  if (Buffer.byteLength(raw) > 1024 * 1024) return response({ error: 'Request too large' }, 413)
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return response({ error: 'Invalid JSON' }, 400) }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return response({ error: 'Expected one request object' }, 400)
  const body = parsed as Record<string, unknown>
  const action = new URL(request.url).searchParams.get('action')
  if (action === 'whoami') return response({ success: true, actor: { type: 'agent', id: agent.agentId, allowDeploy: agent.allowDeploy, orgId: agent.orgId } })
  const tools = MCP_TOOLS.filter((tool) => canAgentCall(agent, tool.name))
  if (action === 'tools') return response({ success: true, data: { tools } })
  const rpc = !action
  const id = body.id
  if (rpc && (body.jsonrpc !== '2.0' || (id !== undefined && id !== null && typeof id !== 'string' && typeof id !== 'number'))) {
    return response({ error: 'Invalid JSON-RPC request' }, 400)
  }
  if (rpc && body.method === 'notifications/initialized') return new NextResponse(null, { status: 204, headers })
  if (rpc && body.method === 'initialize') return response({ jsonrpc: '2.0', id, result: {
    protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'gpters-aitk-agent', version: '1.0.0' },
  } })
  if (rpc && body.method === 'tools/list') return response({ jsonrpc: '2.0', id, result: { tools } })
  const params = body.params as { name?: unknown; arguments?: unknown } | undefined
  const tool = action ? REST_TOOLS[action] : body.method === 'tools/call' && typeof params?.name === 'string' ? params.name : undefined
  if (!tool || !canAgentCall(agent, tool)) return response({ error: 'This operation is not permitted for agent credentials' }, 403)
  const rawArgs = action ? body : params?.arguments ?? {}
  if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) return response({ error: 'Expected tool arguments' }, 400)
  // Agent identity is server-bound; ignore caller attempts to impersonate a person or another agent.
  const args: Record<string, unknown> = { ...rawArgs as Record<string, unknown>, agentId: agent.agentId }
  delete args.userId
  delete args.ownerUserId
  delete args.authorId
  const shortText = (value: unknown, max = 2000): value is string => typeof value === 'string' && value.length > 0 && value.length <= max
  if (tool === 'report_search_skip' && (!shortText(args.query) || !shortText(args.reason) ||
    !Array.isArray(args.resultIds) || args.resultIds.length > 100 || !args.resultIds.every(id => shortText(id, 200)))) {
    return response({ error: 'Invalid search skip report' }, 400)
  }
  if (tool === 'report_skill_outcome' && (!shortText(args.skillId, 200) || typeof args.applied !== 'boolean' || !shortText(args.summary))) {
    return response({ error: 'Invalid skill outcome report' }, 400)
  }
  const skillId = typeof args.skillId === 'string' ? args.skillId : typeof args.pluginId === 'string' ? args.pluginId : typeof args.id === 'string' ? args.id : undefined
  // A receipt must be durable before a mutation; do not silently execute without agent attribution.
  const requestId = randomUUID()
  await recordAgentRequest(agent.agentId, tool, 'started', skillId, requestId)
  try {
    // Owner is the authorization/asset owner, never the event actor. No inherited admin override.
    const result = await executeTool(tool, args, agent.ownerUserId, 'viewer', agent.orgId, 'agent')
    if (!result.isError && result._meta?.skillExecutionStart) {
      await recordSkillExecutionStart({ report: result._meta.skillExecutionStart })
    }
    if (!result.isError && result._meta?.skillExecution) {
      await recordSkillExecutionAttempt({ report: result._meta.skillExecution })
    }
    const reportDetails = !result.isError && result._meta
      ? { ...(result._meta.searchSkip && { searchSkip: result._meta.searchSkip }),
          ...(result._meta.skillOutcome && { skillOutcome: result._meta.skillOutcome }) }
      : {}
    if (Object.keys(reportDetails).length) {
      await recordAgentRequest(agent.agentId, tool, 'success', skillId, requestId, reportDetails)
    } else {
      await recordAgentRequest(agent.agentId, tool, result.isError ? 'error' : 'success', skillId, requestId)
    }
    if (rpc) {
      if (id === undefined) return new NextResponse(null, { status: 204, headers })
      return response({ jsonrpc: '2.0', id, result })
    }
    return response({ success: !result.isError, data: JSON.parse(result.content[0]?.text ?? '{}') }, result.isError ? 400 : 200)
  } catch {
    await recordAgentRequest(agent.agentId, tool, 'error', skillId, requestId)
    return response({ error: 'Agent operation failed; check its request receipts before retrying a deployment' }, 500)
  }
}
