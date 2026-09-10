// @vitest-environment node
import {describe,it,expect,vi,afterEach} from 'vitest'
import {NextRequest} from 'next/server'
const mocks=vi.hoisted(()=>({run:vi.fn(),read:vi.fn(),config:vi.fn(),flush:vi.fn(),inboxes:vi.fn()}))
vi.mock('@/lib/features/ax',()=>({runAgentMonitor:mocks.run,readAgentMonitor:mocks.read,monitorConfiguration:mocks.config,flushMonitorOutbox:mocks.flush}))
vi.mock('../../../../packages/lib/src/features/ax/report-inbox-store',()=>({processReportInboxes:mocks.inboxes}))
const {GET}=await import('../../app/api/cron/agent-monitor/route')
const secret='x'.repeat(40)
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks()})
describe('monitor cron authorization',()=>{
 it('fails closed when secret absent, even outside middleware',async()=>{vi.stubEnv('CRON_SECRET','');expect((await GET(new NextRequest('https://example.test/api/cron/agent-monitor'))).status).toBe(401);expect(mocks.run).not.toHaveBeenCalled()})
 it('health-only credential cannot run the monitor',async()=>{vi.stubEnv('CRON_SECRET',secret);vi.stubEnv('AX_MONITOR_HEALTH_SECRET','y'.repeat(40));expect((await GET(new NextRequest('https://example.test/api/cron/agent-monitor',{headers:{authorization:'Bearer '+'y'.repeat(40)}}))).status).toBe(401)})
 it('heartbeat reads only and never sends',async()=>{vi.stubEnv('AX_MONITOR_HEALTH_SECRET',secret);mocks.config.mockReturnValue({});mocks.read.mockResolvedValue({lastSuccessAt:new Date().toISOString(),backlog:0});const res=await GET(new NextRequest('https://example.test/api/cron/agent-monitor?heartbeat=1',{headers:{authorization:'Bearer '+secret}}));expect(res.status).toBe(200);expect(mocks.run).not.toHaveBeenCalled();expect(mocks.flush).not.toHaveBeenCalled();expect(mocks.inboxes).not.toHaveBeenCalled()})
 it.each([{oldestAge:60000,deferredBacklog:0,healthy:true},{oldestAge:900001,deferredBacklog:0,healthy:false},{oldestAge:60000,deferredBacklog:1,healthy:false}])('distinguishes normal arrivals from stuck/deferred pending work: %j',async scenario=>{
  vi.stubEnv('AX_MONITOR_HEALTH_SECRET',secret);mocks.config.mockReturnValue({})
  const at=Date.now(),oldestUnprocessedAt=new Date(at-scenario.oldestAge).toISOString()
  mocks.read.mockResolvedValue({lastSuccessAt:new Date(at-60000).toISOString(),backlog:1,oldestUnprocessedAt,deferredBacklog:scenario.deferredBacklog})
  const response=await GET(new NextRequest('https://example.test/api/cron/agent-monitor?heartbeat=1',{headers:{authorization:'Bearer '+secret}}))
  expect(await response.json()).toMatchObject({healthy:scenario.healthy,backlog:1,oldestUnprocessedAt,deferredBacklog:scenario.deferredBacklog})
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(mocks.run).not.toHaveBeenCalled();expect(mocks.flush).not.toHaveBeenCalled();expect(mocks.inboxes).not.toHaveBeenCalled()
 })
 it('authenticated invocation runs before outbox and exposes no exception detail',async()=>{vi.stubEnv('CRON_SECRET',secret);mocks.config.mockReturnValue({});mocks.run.mockRejectedValue(new Error('private failure'));const res=await GET(new NextRequest('https://example.test/api/cron/agent-monitor',{headers:{authorization:'Bearer '+secret}}));expect(res.status).toBe(500);expect(await res.json()).toEqual({message:'Monitor run failed'});expect(mocks.flush).not.toHaveBeenCalled()})
})
