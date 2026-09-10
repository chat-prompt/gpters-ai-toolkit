// @vitest-environment node
import {afterEach,beforeEach,describe,expect,it,vi}from'vitest'
import {NextRequest}from'next/server'
import {resolveAxViewer}from'../../../../packages/lib/src/features/ax/access'
import {observationQuerySchema,observationRange}from'../../../../packages/lib/src/features/ax/observation-trends'
const mocks=vi.hoisted(()=>({auth:vi.fn(),load:vi.fn()}))
vi.mock('@/lib/core/auth',()=>({auth:mocks.auth}))
vi.mock('@/lib/features/ax',()=>({resolveAxViewer,observationQuerySchema,observationRange,loadAgentObservations:mocks.load}))
vi.mock('@/lib/utils/rate-limit',()=>({withRateLimit:()=>null,RateLimitPresets:{standard:{}}}))
const {GET}=await import('../../app/api/ax/agent-observations/route')
const request=(query='days=7')=>new NextRequest(`http://localhost/api/ax/agent-observations?${query}`)
describe('admin-only readonly observation API',()=>{
 beforeEach(()=>{vi.stubEnv('INTERNAL_ORGANIZATION_DOMAIN','example.org');mocks.auth.mockResolvedValue({user:{email:'operator@example.org',role:'admin'}});mocks.load.mockReset();mocks.load.mockResolvedValue({streams:[]})})
 afterEach(()=>vi.unstubAllEnvs())
 it('returns no-store authenticated data',async()=>{const response=await GET(request());expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(mocks.load).toHaveBeenCalledWith({days:'7'},expect.any(Date))})
 it.each([null,{email:'member@example.org',role:'viewer'},{email:'outside@elsewhere.org',role:'admin'}])('rejects nonadmin or outside viewer %s',async user=>{mocks.auth.mockResolvedValue({user});expect((await GET(request())).status).toBe(403);expect(mocks.load).not.toHaveBeenCalled()})
 it.each(['days=7&days=30','days=1','days=7&raw=true','source=unknown','changeAt=2026-01-01T00:00:00Z','endUtc=2999-01-01T00:00:00Z'])('rejects invalid or duplicate filters %s',async value=>{expect((await GET(request(value))).status).toBe(400);expect(mocks.load).not.toHaveBeenCalled()})
 it('hides private database errors',async()=>{mocks.load.mockRejectedValue(new Error('private database secret'));const response=await GET(request());expect(response.status).toBe(500);expect(await response.text()).not.toContain('secret')})
})
