// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { resolveAxViewer } from '../../../../packages/lib/src/features/ax/access'
import { isIncidentReviewer } from '../../../../packages/lib/src/features/ax/incident-report'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), enroll: vi.fn() }))
vi.mock('@/lib/core/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/features/ax', () => ({ resolveAxViewer, isIncidentReviewer }))
vi.mock('@/lib/utils/rate-limit', () => ({ withRateLimit: () => null, RateLimitPresets: { standard: {} } }))
vi.mock('../../../../packages/lib/src/features/ax/report-inbox-store', async importOriginal => ({ ...await importOriginal<typeof import('../../../../packages/lib/src/features/ax/report-inbox-store')>(), enrollStoredReportInbox: mocks.enroll }))
const { POST } = await import('../../app/api/ax/report-inbox/route')
const body = { reportId: 'report_' + 'a'.repeat(32), channelId: 'C000000001', threadTs: '1767229200.000001', expiresAt: '2026-01-20T00:00:00Z', threadConfirmed: true }
const request = (input: unknown = body, origin = 'https://toolkit.example.org') => new NextRequest('https://toolkit.example.org/api/ax/report-inbox', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(input) })
beforeEach(() => {
  vi.stubEnv('INTERNAL_ORGANIZATION_DOMAIN', 'example.org'); vi.stubEnv('AX_INCIDENT_REVIEWER_IDS', 'operator')
  vi.stubEnv('AX_INCIDENT_REVIEW_ENABLED', 'true'); vi.stubEnv('AX_REPORT_INBOX_ENABLED', 'true')
  mocks.auth.mockResolvedValue({ user: { id: 'operator', email: 'operator@example.org', role: 'admin' } }); mocks.enroll.mockReset(); mocks.enroll.mockResolvedValue({ id: body.reportId, status: 'watching' })
})
afterEach(() => vi.unstubAllEnvs())
describe('explicit reviewer-only inbox enrollment route', () => {
  it('takes reviewer identity and server origin only from the authenticated request', async () => {
    const response = await POST(request())
    expect(response.status).toBe(201)
    expect(mocks.enroll).toHaveBeenCalledWith(body, 'https://toolkit.example.org', 'operator')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it.each([null, { id: 'other', email: 'other@example.org', role: 'admin' }, { id: 'operator', email: 'operator@outside.org', role: 'admin' }])('rejects unauthorized identities %s', async user => {
    mocks.auth.mockResolvedValue({ user }); expect((await POST(request())).status).toBe(403); expect(mocks.enroll).not.toHaveBeenCalled()
  })
  it('requires same origin and explicit root confirmation, rejecting injected recipients', async () => {
    expect((await POST(request(body, 'https://outside.org'))).status).toBe(403)
    expect((await POST(request({ ...body, threadConfirmed: false }))).status).toBe(400)
    expect((await POST(request({ ...body, recipient: 'other' }))).status).toBe(400)
    expect(mocks.enroll).not.toHaveBeenCalled()
  })
  it('is closed by default and hides operational error details', async () => {
    vi.stubEnv('AX_REPORT_INBOX_ENABLED', 'false'); expect((await POST(request())).status).toBe(503)
    vi.stubEnv('AX_REPORT_INBOX_ENABLED', 'true'); mocks.enroll.mockRejectedValue(new Error('private database connection'))
    const response = await POST(request()); expect(response.status).toBe(500); expect(await response.text()).not.toContain('connection')
  })
})
