// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { resolveAxViewer } from '../../../../packages/lib/src/features/ax/access'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn() }))
vi.mock('@/lib/core/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/features/ax', () => ({ resolveAxViewer }))
vi.mock('@/lib/utils/rate-limit', () => ({ withRateLimit: () => null, RateLimitPresets: { standard: {} } }))
vi.mock('../../../../packages/lib/src/features/ax/incident-history', async importOriginal => ({ ...await importOriginal<typeof import('../../../../packages/lib/src/features/ax/incident-history')>(), readIncidentHistory: mocks.read }))
const { GET } = await import('../../app/api/ax/incident-history/route')
const request = (query = '') => new NextRequest(`https://toolkit.example.org/api/ax/incident-history${query}`)
describe('incident history authorization', () => {
  beforeEach(() => {
    vi.stubEnv('INTERNAL_ORGANIZATION_DOMAIN', 'example.org'); vi.stubEnv('AX_INCIDENT_REVIEW_ENABLED', 'true')
    mocks.auth.mockResolvedValue({ user: { id: 'operator', email: 'operator@example.org', role: 'admin' } })
    mocks.read.mockReset(); mocks.read.mockResolvedValue({ items: [], nextCursor: null, pageSize: 50 })
  })
  afterEach(() => vi.unstubAllEnvs())
  it('serves internal admin reads with no cache and forwards only validated filters', async () => {
    const response = await GET(request('?source=codex&state=needs-info'))
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.read).toHaveBeenCalledWith({ source: 'codex', state: 'needs-info' })
  })
  it.each([null, { id: 'x', email: 'admin@outside.org', role: 'admin' }, { id: 'x', email: 'member@example.org', role: 'viewer' }])('does not query rows for unauthorized identity %s', async user => {
    mocks.auth.mockResolvedValue({ user })
    const req = request(); req.headers.set('authorization', 'Bearer aia_' + 'a'.repeat(64))
    expect((await GET(req)).status).toBe(403); expect(mocks.read).not.toHaveBeenCalled()
  })
  it('rejects duplicate, unknown and malformed query fields before database access', async () => {
    for (const query of ['?source=codex&source=hermes', '?limit=10000', '?state=unrecognized', '?cursor=bad']) expect((await GET(request(query))).status).toBe(400)
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('closes when storage is disabled and hides database failure details', async () => {
    vi.stubEnv('AX_INCIDENT_REVIEW_ENABLED', 'false')
    expect((await GET(request())).status).toBe(503); expect(mocks.read).not.toHaveBeenCalled()
    vi.stubEnv('AX_INCIDENT_REVIEW_ENABLED', 'true'); mocks.read.mockRejectedValue(new Error('private database path and credentials'))
    const response = await GET(request())
    expect(response.status).toBe(500); expect(await response.text()).not.toContain('credentials')
  })
})
