import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AxPanelMeta, AxPanelResult } from '../../../../packages/lib/src/features/ax/types'
import { AxDashboard } from '../../components/ax/AxDashboard'

const PANELS: AxPanelMeta[] = [
  {
    id: 'overview',
    title: '성과 요약',
    description: '기간 연동 패널',
    source: 'test',
    visibility: 'org',
    usesPeriod: true,
  },
  {
    id: 'shared-skills',
    title: '에이전트 스킬',
    description: '고정 패널',
    source: 'test',
    visibility: 'org',
    usesPeriod: false,
  },
]

function responseFor(url: string): AxPanelResult {
  const panel = PANELS.find((item) => url.includes(`/api/ax/${item.id}?`))!
  return {
    meta: panel,
    status: 'not_configured',
    message: '테스트 응답',
    data: null,
    highlights: [],
    generatedAt: '2026-08-24T00:00:00.000Z',
  }
}

describe('AxDashboard 패널 요청', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('기간을 바꿀 때 usesPeriod=true 패널만 다시 요청한다', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => ({
      ok: true,
      json: async () => responseFor(String(input)),
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(<AxDashboard panels={PANELS} isAdmin={false} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenCalledWith('/api/ax/overview?days=30', expect.any(Object))
    expect(fetchMock).toHaveBeenCalledWith('/api/ax/shared-skills?days=30', expect.any(Object))

    fireEvent.click(screen.getByRole('button', { name: '7일' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(fetchMock).toHaveBeenLastCalledWith('/api/ax/overview?days=7', expect.any(Object))
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(
      '/api/ax/shared-skills?days=7'
    )
  })
})
