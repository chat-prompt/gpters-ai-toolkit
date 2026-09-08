import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const authenticateAgent = vi.fn()
const recordAgentRequest = vi.fn()
const executeTool = vi.fn()
const recordSkillExecutionStart = vi.fn()
vi.mock('@/lib/analytics', () => ({ recordSkillExecutionStart, recordSkillExecutionAttempt: vi.fn() }))
vi.mock('@gpters/lib/security', async (original) => {
  const actual = await original<typeof import('@gpters/lib/security')>()
  return { ...actual, authenticateAgent, recordAgentRequest }
})
vi.mock('@/lib/mcp', () => ({ executeTool, MCP_TOOLS: [
  { name: 'semantic_search' }, { name: 'deploy_skill' }, { name: 'report_usage' }, { name: 'report_session_event' },
] }))
vi.mock('@/lib/utils/rate-limit', () => ({ withRateLimit: () => null, RateLimitPresets: { authenticated: {} } }))
const { POST } = await import('../../app/api/agents/mcp/route')
function request(body: unknown, action?: string) {
  return new NextRequest(`https://toolkit.test/api/agents/mcp${action ? '?action=' + action : ''}`, {
    method: 'POST', headers: { authorization: `Bearer aia_${'a'.repeat(64)}` }, body: JSON.stringify(body),
  })
}
const rpc = (tool: string, args: object = {}) => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: args } })
describe('agent MCP boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateAgent.mockResolvedValue({ agentId: 'example-agent', ownerUserId: 'owner', orgId: 'org', allowDeploy: false })
    recordAgentRequest.mockResolvedValue(undefined)
    executeTool.mockResolvedValue({ content: [{ type: 'text', text: '{"ok":true}' }] })
  })
  it.each(['report_usage', 'report_session_event', 'undeploy_skill', 'create_plugin', 'delete_plugin', 'add_files'])('denies %s before executing or recording a human event', async (tool) => {
    expect((await POST(request(rpc(tool)))).status).toBe(403)
    expect(executeTool).not.toHaveBeenCalled()
    expect(recordAgentRequest).not.toHaveBeenCalled()
  })
  it('binds the actor from credentials and clamps privileges while retaining asset ownership', async () => {
    expect((await POST(request(rpc('semantic_search', { query: 'test', agentId: 'impersonated', userId: 'other' })))).status).toBe(200)
    expect(executeTool).toHaveBeenCalledWith('semantic_search', expect.objectContaining({ agentId: 'example-agent' }), 'owner', 'viewer', 'org', 'agent')
    expect(recordAgentRequest).toHaveBeenCalledWith('example-agent', 'semantic_search', 'success', undefined, expect.any(String))
  })
  it.each([
    ['report_skill_outcome', { skillId: 'skill', applied: true, summary: 'Used successfully' }, { skillOutcome: { skillId: 'skill', applied: true, summary: 'Used successfully' } }],
    ['report_search_skip', { query: 'testing', resultIds: ['skill'], reason: 'not applicable' }, { searchSkip: { query: 'testing', resultIds: ['skill'], reason: 'not applicable' } }],
  ])('persists %s details in the agent receipt', async (tool, args, metadata) => {
    executeTool.mockResolvedValueOnce({ content: [{ type: 'text', text: '{}' }], _meta: metadata })
    expect((await POST(request(rpc(tool as string, args as object)))).status).toBe(200)
    expect(recordAgentRequest).toHaveBeenLastCalledWith('example-agent', tool, 'success', tool === 'report_skill_outcome' ? 'skill' : undefined, expect.any(String), metadata)
  })
  it('rejects malformed outcome before executing a tool', async () => {
    expect((await POST(request(rpc('report_skill_outcome', { skillId: 'skill', applied: 'yes', summary: 'x' })))).status).toBe(400)
    expect(executeTool).not.toHaveBeenCalled()
  })
  it('requires explicit deployment capability', async () => {
    expect((await POST(request(rpc('deploy_skill')))).status).toBe(403)
    authenticateAgent.mockResolvedValue({ agentId: 'example-agent', ownerUserId: 'owner', orgId: 'org', allowDeploy: true })
    expect((await POST(request(rpc('deploy_skill', { id: 'skill' })))).status).toBe(200)
    expect(recordAgentRequest).toHaveBeenCalledWith('example-agent', 'deploy_skill', 'started', 'skill', expect.any(String))
  })
  it('records execution evidence without attributing it to the owner user', async () => {
    const report = { agentId: 'example-agent', attemptId: 'attempt' }
    executeTool.mockResolvedValueOnce({ content: [{ type: 'text', text: '{}' }], _meta: { skillExecutionStart: report } })
    await POST(request(rpc('report_skill_execution_started')))
    expect(recordSkillExecutionStart).toHaveBeenCalledWith({ report })
  })
  it('does not expose the owner as the acting user in whoami', async () => {
    const response = await POST(request({}, 'whoami'))
    expect(await response.json()).toEqual({ success: true, actor: { type: 'agent', id: 'example-agent', allowDeploy: false, orgId: 'org' } })
  })
  it('does not advertise disallowed personal tools', async () => {
    const response = await POST(request({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))
    expect((await response.json()).result.tools).toEqual([{ name: 'semantic_search' }])
  })
  it('rejects invalid credentials and JSON-RPC batches', async () => {
    authenticateAgent.mockResolvedValueOnce(null)
    expect((await POST(request(rpc('semantic_search')))).status).toBe(401)
    expect((await POST(request([rpc('semantic_search'), rpc('report_usage')]))).status).toBe(400)
    expect(executeTool).not.toHaveBeenCalled()
  })
})
