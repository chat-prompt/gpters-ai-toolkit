import {cleanup,fireEvent,render,screen,waitFor}from'@testing-library/react'
import {afterEach,describe,expect,it,vi}from'vitest'
import {AgentObservationPanel}from'../../components/ax/panels/AgentObservationPanel'
import type {AgentObservationData,ObservationSummary}from'../../../../packages/lib/src/features/ax/observation-trends'
const summary:ObservationSummary={startUtc:'2026-01-01T00:00:00.000Z',endUtc:'2026-01-08T00:00:00.000Z',windows:0,coveredMs:0,completeWindow:false,
 metrics:{firstTurnTokens:null,peakContextTokens:null,toolResultChars:null,compactionEvents:null,readGuardAllow:null,readGuardDeny:null},metricCapabilities:{firstTurnTokens:'uncollected',peakContextTokens:'uncollected',toolResultChars:'uncollected',compactionEvents:'uncollected',readGuardAllow:'unsupported',readGuardDeny:'unsupported'}}
const data:AgentObservationData={startUtc:summary.startUtc,endUtc:summary.endUtc,generatedAt:summary.endUtc,streams:[{agentId:'example-agent',source:'codex',adapterVersion:'1',latestAt:summary.endUtc,summary,points:[],pointsTruncated:false,excludedOverlaps:0,conflictingWindows:0}],comparison:null,
 coverage:{streamLimit:50,totalStreams:1,truncated:false,rowLimit:20000,rowsTruncated:false,invalidRows:0,legacyRows:0,duplicateWindows:0,excludedBoundaryWindows:0}}
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('observation panel scope and missingness',()=>{
 it('shows missing and unsupported as words rather than zero',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json(data)));render(<AgentObservationPanel days={7}/>)
  await waitFor(()=>expect(screen.getByText('첫 턴 입력')).toBeTruthy())
  expect(screen.getAllByText('미수집').length).toBeGreaterThan(0);expect(screen.getAllByText('미지원').length).toBeGreaterThan(0)
  expect(screen.queryByText('0 토큰')).toBeNull();expect(screen.getByText(/인과|입증하지는 않습니다/)).toBeTruthy()
 })
 it('submits the chosen exact stream, local time converted to UTC and duration without writes',async()=>{
  const fetch=vi.fn().mockImplementation(()=>Promise.resolve(Response.json(data)));vi.stubGlobal('fetch',fetch);render(<AgentObservationPanel days={7}/>)
  await waitFor(()=>expect(screen.getByLabelText('관측 비교 에이전트·소스')).toBeTruthy())
  fireEvent.change(screen.getByLabelText('관측 비교 에이전트·소스'),{target:{value:JSON.stringify(['example-agent','codex'])}})
  fireEvent.change(screen.getByLabelText('관측 변경 시각'),{target:{value:'2026-01-04T12:00'}})
  fireEvent.change(screen.getByLabelText('관측 비교 구간 시간'),{target:{value:'24'}})
  fireEvent.click(screen.getByRole('button',{name:'비교 조회'}))
  await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2))
  const url=new URL(fetch.mock.calls[1][0],'http://localhost')
  expect(url.searchParams.get('agentId')).toBe('example-agent');expect(url.searchParams.get('source')).toBe('codex')
  expect(url.searchParams.get('changeAt')).toBe(new Date('2026-01-04T12:00').toISOString());expect(url.searchParams.get('comparisonHours')).toBe('24')
  expect(fetch.mock.calls[1][1].method).toBeUndefined()
 })
 it('clears old metrics when a new period fails and explains truncation',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(Response.json({...data,coverage:{...data.coverage,truncated:true,totalStreams:51}})).mockResolvedValueOnce(Response.json({},{status:500}));vi.stubGlobal('fetch',fetch)
  const view=render(<AgentObservationPanel days={7}/>);await waitFor(()=>expect(screen.getByText(/조회 한도에 도달했습니다/)).toBeTruthy())
  view.rerender(<AgentObservationPanel days={30}/>);await waitFor(()=>expect(screen.getByRole('alert')).toBeTruthy())
  expect(screen.queryByText('첫 턴 입력')).toBeNull()
 })
 it('can recover from a failed comparison without reloading the page',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(Response.json(data)).mockResolvedValueOnce(Response.json({},{status:400})).mockResolvedValue(Response.json(data));vi.stubGlobal('fetch',fetch)
  render(<AgentObservationPanel days={7}/>);await screen.findByLabelText('관측 비교 에이전트·소스')
  fireEvent.change(screen.getByLabelText('관측 비교 에이전트·소스'),{target:{value:JSON.stringify(['example-agent','codex'])}})
  fireEvent.change(screen.getByLabelText('관측 변경 시각'),{target:{value:'2026-01-04T12:00'}})
  fireEvent.change(screen.getByLabelText('관측 비교 구간 시간'),{target:{value:'24'}})
  fireEvent.click(screen.getByRole('button',{name:'비교 조회'}));await screen.findByRole('alert')
  expect(screen.getByRole('button',{name:'다시 시도'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'비교 해제'}));await screen.findByText('첫 턴 입력')
  expect(fetch.mock.calls[2][0]).toBe('/api/ax/agent-observations?days=7')
  expect(screen.queryByRole('alert')).toBeNull()
 })
 it('retries the same failed overview request',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(Response.json({},{status:500})).mockResolvedValueOnce(Response.json(data));vi.stubGlobal('fetch',fetch)
  render(<AgentObservationPanel days={7}/>);await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button',{name:'다시 시도'}));await screen.findByText('첫 턴 입력')
  expect(fetch.mock.calls.map(call=>call[0])).toEqual(['/api/ax/agent-observations?days=7','/api/ax/agent-observations?days=7'])
 })
})
