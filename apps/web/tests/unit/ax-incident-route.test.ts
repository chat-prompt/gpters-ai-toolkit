// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { incidentActionSchema } from '../../../../packages/lib/src/features/ax/incident-review'
import { isIncidentReviewer } from '../../../../packages/lib/src/features/ax/incident-report'
import { resolveAxViewer } from '../../../../packages/lib/src/features/ax/access'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), save: vi.fn() }))
class IncidentConflict extends Error {}
class IncidentValidationError extends Error {}
vi.mock('@/lib/core/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/features/ax', () => ({ incidentActionSchema, resolveAxViewer, isIncidentReviewer, saveIncidentReview: mocks.save, IncidentConflict, IncidentValidationError }))
vi.mock('@/lib/utils/rate-limit', () => ({ withRateLimit: () => null, RateLimitPresets: { standard: {} } }))
const { POST } = await import('../../app/api/ax/incident-review/route')
const payload = { id:'candidate',revision:0,days:7,action:'confirmed',reason:'Reviewed',evidenceRef:'private:receipt' }
function request(body: unknown = payload, origin = 'http://localhost') {
  return new NextRequest('http://localhost/api/ax/incident-review', { method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body) })
}
describe('incident review authorization and input', () => {
  beforeEach(() => {
    vi.stubEnv('AX_INCIDENT_REVIEWER_IDS','operator-1'); vi.stubEnv('INTERNAL_ORGANIZATION_DOMAIN','example.org'); vi.stubEnv('AX_INCIDENT_REVIEW_ENABLED','true')
    mocks.auth.mockResolvedValue({user:{id:'operator-1',email:'operator@example.org',role:'admin'}})
    mocks.save.mockReset(); mocks.save.mockResolvedValue({revision:1})
  })
  afterEach(() => vi.unstubAllEnvs())
  it('takes reviewer identity from the authenticated session',async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.save).toHaveBeenCalledWith(payload,'operator-1')
  })
  it.each([null,{id:'x',email:'outside@other.org',role:'admin'},{id:'x',email:'member@example.org',role:'viewer'}])('rejects unauthorized viewer %s',async user => {
    mocks.auth.mockResolvedValue({user})
    expect((await POST(request())).status).toBe(403); expect(mocks.save).not.toHaveBeenCalled()
  })
  it('blocks cross-origin requests, spoofed actors and malformed bodies',async () => {
    expect((await POST(request(payload,'https://outside.example'))).status).toBe(403)
    expect((await POST(request({...payload,actor:'someone-else'}))).status).toBe(400)
    expect((await POST(request({...payload,reason:''}))).status).toBe(400)
    expect((await POST(request({...payload,reason:'x'.repeat(17000)}))).status).toBe(413)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('returns conflict without overwriting and hides database errors',async () => {
    mocks.save.mockRejectedValueOnce(new IncidentConflict('refresh'))
    expect((await POST(request())).status).toBe(409)
    mocks.save.mockRejectedValueOnce(new Error('private database credentials'))
    const response = await POST(request())
    expect(response.status).toBe(500); expect(await response.text()).not.toContain('credentials')
  })
  it('does not write before storage is enabled',async () => {
    vi.stubEnv('AX_INCIDENT_REVIEW_ENABLED','false')
    expect((await POST(request())).status).toBe(503); expect(mocks.save).not.toHaveBeenCalled()
  })
  it('does not grant final review to another internal admin or an agent bearer token',async () => {
    vi.stubEnv('AX_INCIDENT_REVIEWER_IDS','other-operator')
    expect((await POST(request())).status).toBe(403)
    mocks.auth.mockResolvedValue(null)
    const req=request();req.headers.set('authorization','Bearer aia_'+'a'.repeat(64))
    expect((await POST(req)).status).toBe(403);expect(mocks.save).not.toHaveBeenCalled()
  })
})
