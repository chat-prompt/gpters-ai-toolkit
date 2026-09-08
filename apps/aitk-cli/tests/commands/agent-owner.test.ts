import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../src/auth.js', () => ({ resolveToken: vi.fn(() => 'mcp_owner_fixture') }))
vi.mock('../../src/config.js', () => ({ readConfig: () => ({ serverUrl: 'https://toolkit.test' }) }))
vi.mock('../../src/agent-auth.js', () => ({ readAgentConfig: vi.fn(() => null), importAgentCredential: vi.fn(), disconnectAgent: vi.fn() }))
vi.mock('../../src/output.js', () => ({ jsonOut: vi.fn() }))
import { runAgent } from '../../src/commands/agent.js'
import { jsonOut } from '../../src/output.js'
import { readAgentConfig } from '../../src/agent-auth.js'
let root: string
beforeEach(() => {
  vi.clearAllMocks()
  root = mkdtempSync(join(tmpdir(), 'aitk-owner-test-'))
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, agents: [], revoked: 2 }))))
})
afterEach(() => { vi.unstubAllGlobals(); rmSync(root, { recursive: true, force: true }) })
describe('owner credential administration', () => {
  it('lists without an agent ID and revokes all using an explicit flag', async () => {
    await runAgent('list', {})
    expect(fetch).toHaveBeenLastCalledWith('https://toolkit.test/api/agents/credentials', expect.objectContaining({ method: 'GET' }))
    expect(jsonOut).toHaveBeenLastCalledWith({ ok: true, agents: [] })
    await runAgent('revoke', { all: 'true' })
    const init = vi.mocked(fetch).mock.calls[1][1]!
    expect(init.method).toBe('DELETE')
    expect(JSON.parse(init.body as string)).toEqual({ all: true })
    expect(jsonOut).toHaveBeenLastCalledWith({ ok: true, revoked: 2 })
  })
  it('rejects ambiguous revocation and missing output values without network calls', async () => {
    await expect(runAgent('revoke', { all: 'true', agent: 'test-agent' })).rejects.toThrow()
    await expect(runAgent('authorize', { agent: 'test-agent', output: 'true' })).rejects.toThrow('absolute')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('includes only the scoped credential and organization in the private grant', async () => {
    const token = `aia_${'c'.repeat(64)}`
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, agentId: 'test-agent', orgId: 'test-org', token, allowDeploy: false, expiresAt: '2099-01-01T00:00:00Z' })))
    const output = join(root, 'grant.json')
    await runAgent('authorize', { agent: 'test-agent', org: 'test-org', output })
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).orgId).toBe('test-org')
    const content = readFileSync(output, 'utf8')
    expect(content).toContain('test-org')
    expect(content).not.toContain('mcp_owner_fixture')
    expect(JSON.stringify(vi.mocked(jsonOut).mock.calls)).not.toContain(token)
  })
  it('does not allow the agent machine to enumerate or revoke owner credentials', async () => {
    vi.mocked(readAgentConfig).mockReturnValueOnce({ version: 1, agentId: 'test-agent', serverUrl: 'https://toolkit.test' } as never)
    await expect(runAgent('list', {})).rejects.toThrow('personal machine')
    expect(fetch).not.toHaveBeenCalled()
  })
})
