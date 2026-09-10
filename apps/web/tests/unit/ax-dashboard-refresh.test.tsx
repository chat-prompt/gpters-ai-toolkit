import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import type { AxPanelMeta, AxPanelResult } from '../../../../packages/lib/src/features/ax/types'
import { AxDashboard } from '../../components/ax/AxDashboard'
vi.mock('../../components/ax/panels', () => ({ getAxPanelView: () => Probe, SkillEventSummary: () => null }))
function Probe({ data, days }: { data: { value: number }; days: number }) {
  const [expanded, setExpanded] = useState(false)
  return <div><p>값 {data.value}</p><p>표시 기간 {days}일</p><button onClick={() => setExpanded(!expanded)}>상세 토글</button>{expanded && <p>열린 상세</p>}</div>
}
const PANELS: AxPanelMeta[] = ['alpha', 'beta'].map(id => ({ id, title: id, description: id, source: 'fixture', visibility: 'org', usesPeriod: false }))
function result(input: RequestInfo | URL, value = 1): AxPanelResult {
  return { meta: PANELS.find(panel => String(input).includes(panel.id))!, status: 'ok', data: { value }, highlights: [], generatedAt: '2026-09-09T00:00:00Z' }
}
async function tick(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
function visible(value: 'visible' | 'hidden') { Object.defineProperty(document, 'visibilityState', { configurable: true, value }) }
function online(value: boolean) { Object.defineProperty(navigator, 'onLine', { configurable: true, value }) }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-10T00:00:00Z')); visible('visible'); online(true) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); visible('visible'); online(true) })
describe('대시보드 자동 갱신', () => {
  it('1분마다 보이는 패널만 갱신하고 상세를 유지한다', async () => {
    let value = 1
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => ({ ok: true, json: async () => result(url, value) }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AxDashboard panels={PANELS} isAdmin />); await tick(2000)
    fireEvent.click(screen.getByText('상세 토글')); fetchMock.mockClear(); value = 2
    await tick(58_000)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/ax/alpha?days=7'])
    expect(screen.getByText('값 2')).toBeTruthy(); expect(screen.getByText('열린 상세')).toBeTruthy()
    expect(screen.getByText(/마지막 서버 조회/).textContent).not.toContain('미완료')
  })
  it('숨김/오프라인 동안 멈추고 복귀 즉시 조회하며 unmount 후 중지한다', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => ({ ok: true, json: async () => result(url) }))
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<AxDashboard panels={[PANELS[0]]} isAdmin />); await tick(2000); fetchMock.mockClear()
    act(() => { visible('hidden'); document.dispatchEvent(new Event('visibilitychange')) })
    await tick(120_000); expect(fetchMock).not.toHaveBeenCalled()
    act(() => { visible('visible'); document.dispatchEvent(new Event('visibilitychange')) })
    await tick(); expect(fetchMock).toHaveBeenCalledTimes(1)
    act(() => { online(false); window.dispatchEvent(new Event('offline')) })
    await tick(120_000); expect(fetchMock).toHaveBeenCalledTimes(1); expect(screen.getByText('네트워크 연결 끊김')).toBeTruthy()
    act(() => { online(true); window.dispatchEvent(new Event('online')) })
    await tick(); expect(fetchMock).toHaveBeenCalledTimes(2)
    view.unmount(); await tick(120_000); expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it.each(['network', 'panel'])('캐시가 있어도 %s 실패를 알리고 마지막 데이터·시각을 유지한다', async kind => {
    let fail = false
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      if (fail && kind === 'network') throw new Error('연결 실패')
      return { ok: true, json: async () => fail ? { ...result(url), status: 'error', message: '조회 실패' } : result(url) }
    }))
    render(<AxDashboard panels={[PANELS[0]]} isAdmin />); await tick(2000)
    const timestamp = screen.getByText(/마지막 서버 조회/).textContent
    fail = true; await tick(58_000)
    expect(screen.getByText('갱신 실패')).toBeTruthy(); expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('값 1')).toBeTruthy(); expect(screen.getByText(/마지막 서버 조회/).textContent).toBe(timestamp)
    fail = false; fireEvent.click(screen.getByText('지금 새로고침')); await tick()
    expect(screen.queryByRole('alert')).toBeNull(); expect(screen.getByText(/마지막 서버 조회/).textContent).not.toBe(timestamp)
  })
  it('응답 시간 초과를 표시하고 다음 주기에 복구한다', async () => {
    let hang = false
    vi.stubGlobal('fetch', vi.fn((url: RequestInfo | URL, options?: RequestInit) => {
      if (hang) return new Promise((_, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
      return Promise.resolve({ ok: true, json: async () => result(url) })
    }))
    render(<AxDashboard panels={[PANELS[0]]} isAdmin />); await tick(2000)
    hang = true; await tick(58_000); expect(screen.getByText('조회 중')).toBeTruthy()
    await tick(30_000); expect(screen.getByRole('alert').textContent).toContain('응답 시간이 초과')
    hang = false; await tick(30_000); expect(screen.queryByRole('alert')).toBeNull()
  })
  it('오래된 탭에 돌아오면 즉시 재조회한다', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => ({ ok: true, json: async () => result(url) }))
    vi.stubGlobal('fetch', fetchMock)
    render(<AxDashboard panels={PANELS} isAdmin />); await tick(62_000)
    fetchMock.mockClear(); fireEvent.click(screen.getByRole('tab', { name: 'beta' })); await tick()
    expect(fetchMock).toHaveBeenCalledWith('/api/ax/beta?days=7', expect.any(Object))
  })
  it('조회 권한 상실 시 이전 데이터를 표시하지 않는다', async () => {
    let denied = false
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => ({ ok: !denied, status: denied ? 403 : 200, json: async () => result(url) })))
    render(<AxDashboard panels={[PANELS[0]]} isAdmin />); await tick(2000)
    denied = true; await tick(58_000)
    expect(screen.queryByText('값 1')).toBeNull(); expect(screen.getByRole('alert').textContent).toContain('조회 권한')
  })
})


it('기간 변경 실패 시 이전 기간임을 표시하고 이전 값을 새 기간으로 표시하지 않는다', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    if (String(url).includes('days=30')) throw new Error('연결 실패')
    return { ok: true, json: async () => result(url) }
  }))
  render(<AxDashboard panels={[{ ...PANELS[0], usesPeriod: true }]} isAdmin />)
  await tick(2000)
  fireEvent.click(screen.getByRole('button', { name: '30일' })); await tick()
  expect(screen.getByText('기간 변경 미완료 · 이전 기간 데이터 포함')).toBeTruthy()
  expect(screen.getByText('표시 기간 7일')).toBeTruthy()
  expect(screen.queryByText('표시 기간 30일')).toBeNull()
})

it('이전 기간의 늦은 응답이 현재 기간을 덮어쓰지 않는다', async () => {
  let release: (() => void) | undefined
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const days = Number(new URL(String(url), 'http://fixture').searchParams.get('days'))
    if (days === 7) await new Promise<void>(resolve => { release = resolve })
    return { ok: true, json: async () => result(url, days) }
  }))
  render(<AxDashboard panels={[{ ...PANELS[0], usesPeriod: true }]} isAdmin />); await tick()
  fireEvent.click(screen.getByRole('button', { name: '30일' })); await tick()
  expect(screen.getByText('값 30')).toBeTruthy()
  await act(async () => { release!() }); await tick()
  expect(screen.getByText('값 30')).toBeTruthy(); expect(screen.queryByText('값 7')).toBeNull()
})


it('화면 이탈 중 선조회가 중단되면 다음 기간 선조회를 시작하지 않는다', async () => {
  const fetchMock = vi.fn((url: RequestInfo | URL, options?: RequestInit) => {
    if (String(url).includes('days=30')) return new Promise((_, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    return Promise.resolve({ ok: true, json: async () => result(url) })
  })
  vi.stubGlobal('fetch', fetchMock)
  const view = render(<AxDashboard panels={[{ ...PANELS[0], usesPeriod: true }]} isAdmin />)
  await tick(2000)
  expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/ax/alpha?days=30')
  view.unmount(); await tick()
  expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain('/api/ax/alpha?days=90')
})
