import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const authenticateOAuthRequest = vi.fn()
const issueAgentCredential = vi.fn()
const revokeAgentCredential = vi.fn()
const listAgentCredentials = vi.fn()
const revokeAllAgentCredentials = vi.fn()
vi.mock('@/lib/security/oauth-tokens', () => ({ authenticateOAuthRequest }))
vi.mock('@gpters/lib/security', () => ({ AGENT_ID_PATTERN: /^[a-z0-9][a-z0-9._:-]{0,99}$/, issueAgentCredential, revokeAgentCredential, listAgentCredentials, revokeAllAgentCredentials }))
vi.mock('@/lib/utils/rate-limit', () => ({ withRateLimit: () => null, RateLimitPresets: { auth: {} } }))
const { GET, POST, DELETE } = await import('../../app/api/agents/credentials/route')
const request = (body: unknown, method = 'POST', agentToken = false) => new NextRequest('https://toolkit.test/api/agents/credentials?ownerUserId=impersonated', {
  method, ...(method !== 'GET' && { body: JSON.stringify(body) }),
  ...(agentToken && { headers: { authorization: `Bearer aia_${'a'.repeat(64)}` } }),
})
describe('agent credential owner boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateOAuthRequest.mockResolvedValue({ authenticated: true, userId: 'owner' })
    issueAgentCredential.mockResolvedValue({ agentId: 'example-agent', token: 'aia_test', orgId: 'org' })
    listAgentCredentials.mockResolvedValue([{ agentId: 'example-agent', orgId: 'org', isActive: true }])
    revokeAllAgentCredentials.mockResolvedValue(2)
  })
  it('takes ownership only from authenticated user and defaults to no deployment', async () => {
    const result = await POST(request({ agentId: 'example-agent', ownerUserId: 'impersonated' }))
    expect(result.status).toBe(201)
    expect(issueAgentCredential).toHaveBeenCalledWith('owner', 'example-agent', false, undefined)
    expect(await result.json()).toMatchObject({ ok: true, orgId: 'org' })
    expect(result.headers.get('cache-control')).toBe('private, no-store')
  })
  it('passes an explicit organization to the membership-checked issuer', async () => {
    expect((await POST(request({ agentId: 'example-agent', orgId: 'selected-org' }))).status).toBe(201)
    expect(issueAgentCredential).toHaveBeenCalledWith('owner', 'example-agent', false, 'selected-org')
    expect((await POST(request({ agentId: 'example-agent', orgId: '' }))).status).toBe(400)
    expect((await POST(request({ agentId: 'example-agent', orgId: 5 }))).status).toBe(400)
  })
  it('denies invalid authentication, IDs and capability types', async () => {
    authenticateOAuthRequest.mockResolvedValueOnce({ authenticated: false })
    expect((await POST(request({ agentId: 'example-agent' }))).status).toBe(401)
    expect((await POST(request({ agentId: '../someone' }))).status).toBe(400)
    expect((await POST(request({ agentId: 'example-agent', allowDeploy: 'true' }))).status).toBe(400)
    expect(issueAgentCredential).not.toHaveBeenCalled()
  })
  it('reports ownership conflicts and revokes only within the owner scope', async () => {
    issueAgentCredential.mockRejectedValueOnce(new Error('another owner'))
    expect((await POST(request({ agentId: 'example-agent' }))).status).toBe(409)
    revokeAgentCredential.mockResolvedValueOnce(false)
    expect((await DELETE(request({ agentId: 'example-agent', ownerUserId: 'other' }, 'DELETE'))).status).toBe(404)
    expect(revokeAgentCredential).toHaveBeenCalledWith('owner', 'example-agent')
  })
  it('lists credentials only for the authenticated owner with no cache', async () => {
    const result = await GET(request(undefined, 'GET'))
    expect(listAgentCredentials).toHaveBeenCalledWith('owner')
    expect(await result.json()).toEqual({ ok: true, agents: [{ agentId: 'example-agent', orgId: 'org', isActive: true }] })
    expect(result.headers.get('cache-control')).toBe('private, no-store')
  })
  it('revokes all credentials only within the authenticated owner scope', async () => {
    const result = await DELETE(request({ all: true, ownerUserId: 'other' }, 'DELETE'))
    expect(await result.json()).toEqual({ ok: true, revoked: 2 })
    expect(revokeAllAgentCredentials).toHaveBeenCalledWith('owner')
    expect(revokeAgentCredential).not.toHaveBeenCalled()
    expect((await DELETE(request({ all: true, agentId: 'example-agent' }, 'DELETE'))).status).toBe(400)
    expect((await DELETE(request({ all: 'true' }, 'DELETE'))).status).toBe(400)
  })
  it.each(['GET', 'POST', 'DELETE'])('denies agent credentials for %s even before OAuth lookup', async method => {
    const handler = method === 'GET' ? GET : method === 'POST' ? POST : DELETE
    expect((await handler(request({ agentId: 'example-agent' }, method, true))).status).toBe(401)
    expect(authenticateOAuthRequest).not.toHaveBeenCalled()
    expect(issueAgentCredential).not.toHaveBeenCalled()
    expect(listAgentCredentials).not.toHaveBeenCalled()
    expect(revokeAgentCredential).not.toHaveBeenCalled()
    expect(revokeAllAgentCredentials).not.toHaveBeenCalled()
  })
  it.each(['GET', 'DELETE'])('denies unauthenticated %s administration', async method => {
    authenticateOAuthRequest.mockResolvedValueOnce(null)
    const handler = method === 'GET' ? GET : DELETE
    expect((await handler(request({ all: true }, method))).status).toBe(401)
    expect(listAgentCredentials).not.toHaveBeenCalled()
    expect(revokeAllAgentCredentials).not.toHaveBeenCalled()
  })
})
