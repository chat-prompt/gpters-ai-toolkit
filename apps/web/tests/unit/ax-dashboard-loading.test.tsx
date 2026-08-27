import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AxPanelMeta, AxPanelResult } from '../../../../packages/lib/src/features/ax/types'
import { AxDashboard } from '../../components/ax/AxDashboard'

const PANELS: AxPanelMeta[] = [
  {
    id: 'overview',
    title: '요약',
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
    parentId: 'overview',
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

  it('데이터 패널을 네 업무 영역의 세부 보기로 묶고 키보드로 이동한다', async () => {
    const nestedPanels: AxPanelMeta[] = [
      {
        id: 'overview', title: '요약', description: '요약 설명', source: 'test',
        visibility: 'org', usesPeriod: true,
      },
      {
        id: 'skill-usage', title: '스킬', description: '사용 현황 설명', source: 'test',
        visibility: 'org', usesPeriod: true,
      },
      {
        id: 'journey-insights', title: '탐색·결과 분석', description: '탐색 설명', source: 'test',
        visibility: 'org', parentId: 'skill-usage', usesPeriod: true,
      },
      {
        id: 'agent-activity', title: '에이전트 활동', description: '활동 설명', source: 'test',
        visibility: 'org', parentId: 'skill-usage', usesPeriod: true,
      },
      {
        id: 'shared-skills', title: '에이전트 스킬', description: '목록 설명', source: 'test',
        visibility: 'org', parentId: 'skill-usage', usesPeriod: false,
      },
      {
        id: 'skill-diff', title: '팀 스킬과 비교', description: '비교 설명', source: 'test',
        visibility: 'org', parentId: 'skill-usage', usesPeriod: false,
      },
      {
        id: 'client-usage', title: '클라이언트', description: '사용량 설명', source: 'test',
        visibility: 'org', usesPeriod: false,
      },
      {
        id: 'subscriptions', title: '구독 현황', description: '구독 설명', source: 'test',
        visibility: 'org', parentId: 'client-usage', usesPeriod: false,
      },
      {
        id: 'vercel-deployments', title: '배포 사이트', description: '사이트 설명', source: 'test',
        visibility: 'org', usesPeriod: false,
      },
    ]
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const panel = nestedPanels.find((item) => url.includes(`/api/ax/${item.id}?`))!
      return {
        ok: true,
        json: async () => ({
          meta: panel,
          status: 'not_configured',
          message: '테스트 응답',
          data: null,
          highlights: [],
          generatedAt: '2026-08-24T00:00:00.000Z',
        } satisfies AxPanelResult),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AxDashboard panels={nestedPanels} isAdmin />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(9))

    const topTabs = within(screen.getByRole('tablist', { name: '대시보드 영역' }))
    expect(topTabs.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '요약', '스킬', '클라이언트', '배포 사이트',
    ])

    fireEvent.click(topTabs.getByRole('tab', { name: '스킬' }))
    const skillViews = within(screen.getByRole('tablist', { name: '스킬 세부 보기' }))
    expect(skillViews.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '구성원 사용', '탐색·결과 분석', '에이전트 활동', '에이전트 스킬', '팀 스킬과 비교',
    ])

    const agentTab = skillViews.getByRole('tab', { name: '에이전트 활동' })
    agentTab.focus()
    fireEvent.keyDown(agentTab, { key: 'ArrowLeft' })
    expect(skillViews.getByRole('tab', { name: '탐색·결과 분석' }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(skillViews.getByRole('tab', { name: '탐색·결과 분석' }))

    const topLevelSkills = topTabs.getByRole('tab', { name: '스킬' })
    topLevelSkills.focus()
    fireEvent.keyDown(topLevelSkills, { key: 'End' })
    expect(topTabs.getByRole('tab', { name: '배포 사이트' }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(topTabs.getByRole('tab', { name: '배포 사이트' }))

    fireEvent.click(topTabs.getByRole('tab', { name: '클라이언트' }))
    const clientViews = within(screen.getByRole('tablist', { name: '클라이언트 세부 보기' }))
    expect(clientViews.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '구성원별 사용량', '구독 현황',
    ])

    const ids = Array.from(document.querySelectorAll<HTMLElement>('[id]')).map((element) => element.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
