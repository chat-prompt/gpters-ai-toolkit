import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AxAgentActivityData,
  AxOverviewData,
  AxPanelMeta,
  AxPanelResult,
  AxSkillUsageData,
} from '../../../../packages/lib/src/features/ax/types'
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
    expect(fetchMock).toHaveBeenCalledWith('/api/ax/overview?days=7', expect.any(Object))
    expect(fetchMock).toHaveBeenCalledWith('/api/ax/shared-skills?days=7', expect.any(Object))
    expect(screen.getByRole('button', { name: '7일' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: '30일' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(fetchMock).toHaveBeenLastCalledWith('/api/ax/overview?days=30', expect.any(Object))
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(
      '/api/ax/shared-skills?days=30'
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

  it('요약은 팀 스킬 활동 잔디를 보여주되 장황한 설명과 내부 데이터 출처는 숨긴다', async () => {
    const overview = { ...PANELS[0], source: 'aitk DB (skill_events)' }
    const data: AxOverviewData = {
      totalParticipants: 1,
      catalogSkills: 1,
      grassDaily: [
        { date: '2026-08-30', events: 2, loads: 4, directApplied: 1, appliedAfterLoad: 1 },
        { date: '2026-08-31', events: 1, loads: 5, directApplied: 1, appliedAfterLoad: 0 },
      ],
      agentGrassDaily: [
        { date: '2026-08-30', events: 12, agents: 1 },
        { date: '2026-08-31', events: 24, agents: 2 },
      ],
      dailySkillFlow: [],
      skillFlowSummary: {
        directApplied: 0,
        loaded: 0,
        linkableLoaded: 0,
        appliedAfterLoad: 0,
      },
      hourlyDensity: [],
      memberUsage: null,
    }
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        meta: overview,
        status: 'ok',
        data,
        highlights: [],
        generatedAt: '2026-08-31T00:00:00.000Z',
      } satisfies AxPanelResult<AxOverviewData>),
    })))

    render(<AxDashboard panels={[overview]} isAdmin />)

    await screen.findByRole('tabpanel', { name: '요약' })
    expect(screen.getByRole('region', { name: '일별 구성원 스킬 활동 · 최근 365일' })).toBeTruthy()
    expect(screen.getByRole('region', { name: '일별 에이전트 사용량 · 최근 365일' })).toBeTruthy()
    expect(screen.getByRole('button', {
      name: '2026-08-30 · 활동 2건 · 로드 없이 적용 1건 · 로드 후 적용 1건',
    })).toBeTruthy()
    const agentGrassCell = screen.getByRole('button', {
      name: '2026-08-31 · 턴 24건 · 활동 에이전트 2개',
    })
    fireEvent.mouseEnter(agentGrassCell)
    // 셀 aria-label이 같은 문구를 이미 제공하므로 툴팁은 live region이 아니라 장식이다.
    const grassTooltip = document.querySelector<HTMLElement>('[data-grass-tooltip]')
    expect(grassTooltip?.textContent).toContain('턴 24건')
    expect(grassTooltip?.getAttribute('aria-hidden')).toBe('true')
    fireEvent.mouseLeave(agentGrassCell.parentElement!)
    expect(document.querySelector('[data-grass-tooltip]')).toBeNull()
    expect(screen.queryByText('장기 활동')).toBeNull()
    expect(screen.queryByText('aitk DB (skill_events)')).toBeNull()
  })

  it('요약은 구성원 활동을, 스킬 탭은 일별 스킬 이벤트를 보여준다', async () => {
    const activityPanels: AxPanelMeta[] = [
      {
        id: 'overview', title: '요약', description: '구성원의 AX 활동', source: 'test',
        visibility: 'org', usesPeriod: true,
      },
      {
        id: 'skill-usage', title: '스킬', description: 'aitk 서버에서 관측된 검색·콘텐츠 로드·적용 보고 현황', source: 'aitk DB (skill_events · mcp_sessions)',
        visibility: 'org', usesPeriod: true,
      },
      {
        id: 'agent-activity', title: '에이전트 활동', description: '에이전트 사용', source: 'test',
        visibility: 'org', parentId: 'skill-usage', usesPeriod: true,
      },
    ]
    const overviewData: AxOverviewData = {
      totalParticipants: 6,
      catalogSkills: 1,
      grassDaily: [
        { date: '2026-08-30', events: 3, loads: 20, linkableLoads: 8, directApplied: 2, appliedAfterLoad: 1 },
        { date: '2026-08-31', events: 8, loads: 45, linkableLoads: 40, directApplied: 5, appliedAfterLoad: 3 },
      ],
      agentGrassDaily: [
        { date: '2026-08-30', events: 30, agents: 1 },
        { date: '2026-08-31', events: 45, agents: 2 },
      ],
      dailySkillFlow: [
        { date: '2026-08-30', directApplied: 1, loaded: 4, linkableLoaded: 3, appliedAfterLoad: 2 },
        { date: '2026-08-31', directApplied: 2, loaded: 5, linkableLoaded: 4, appliedAfterLoad: 3 },
      ],
      skillFlowSummary: {
        directApplied: 3,
        loaded: 9,
        linkableLoaded: 7,
        appliedAfterLoad: 5,
      },
      hourlyDensity: [],
      memberUsage: null,
    }
    const skillData: AxSkillUsageData = {
      totalEvents: 100,
      meaningfulUses: 65,
      activeUsers: 6,
      sessions: 5,
      actionTotals: { search: 10, load: 20, apply: 65, skip: 4, deploy: 1 },
      skills: [],
      daily: [
        { date: '2026-08-30', events: 20 },
        { date: '2026-08-31', events: 45 },
      ],
      totalUnusedSkills: 0,
      unusedSkills: [],
    }
    const zeroUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      thinkingTokens: 0,
      thinkingTokensRelation: 'unknown' as const,
    }
    const agentData: AxAgentActivityData = {
      syncedAt: '2026-08-31T00:00:00.000Z',
      windowStart: '2026-08-24T00:00:00.000Z',
      windowEnd: '2026-08-31T00:00:00.000Z',
      totalUsage: zeroUsage,
      totalProcessedTokens: 1000,
      sessions: 30,
      turns: 3830,
      toolCalls: 100,
      toolFailures: 0,
      agents: ['bbodoong', 'bbokeoter'].map((agentId) => ({
        agentId,
        totalUsage: zeroUsage,
        totalProcessedTokens: 500,
        sessions: 15,
        turns: 1915,
        toolCalls: 50,
        toolFailures: 0,
        models: [],
        tools: [],
        skills: [],
        uniqueLoadedSkills: 0,
        skillLoadsObserved: false,
        observedExecutionReports: [],
        verifiedExecutions: { attempts: 0, success: 0, partial: 0, failed: 0, abandoned: 0, running: 0, withEvidence: 0, uniqueSkills: 0, verifiedSkills: 0, linkedLoads: 0, linkedVerifiedSuccesses: 0 },
        collection: { batches: 1, recordsRead: 1, parseFailures: 0, unsupportedRecordsSkipped: 0 },
      })),
      reporters: [],
      sourceCoverage: [],
      models: [],
      tools: [],
      skills: [],
      uniqueLoadedSkills: 0,
      skillLoadsObserved: false,
      observedExecutionReports: [],
      verifiedExecutions: { attempts: 0, success: 0, partial: 0, failed: 0, abandoned: 0, running: 0, withEvidence: 0, uniqueSkills: 0, verifiedSkills: 0, linkedLoads: 0, linkedVerifiedSuccesses: 0 },
      collection: { batches: 2, recordsRead: 2, parseFailures: 0, unsupportedRecordsSkipped: 0 },
      insights: [],
    }

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const meta = activityPanels.find((panel) => url.includes(`/api/ax/${panel.id}?`))!
      return {
        ok: true,
        json: async () => ({
          meta,
          status: 'ok',
          data: meta.id === 'overview'
            ? overviewData
            : meta.id === 'skill-usage'
              ? skillData
              : agentData,
          // 예전 전역 타일의 원천 데이터가 응답에 남아 있어도 상단에는 노출하지 않는다.
          highlights: [
            { label: '전체 구성원', value: '21', hint: '명' },
            { label: '주간 활성', value: '2', hint: '명' },
          ],
          generatedAt: '2026-08-31T00:00:00.000Z',
        } satisfies AxPanelResult),
      }
    }))

    render(<AxDashboard panels={activityPanels} isAdmin />)

    expect(await screen.findByText('활성 구성원')).toBeTruthy()
    expect(screen.getByText('실제 적용 호출')).toBeTruthy()
    expect(screen.getByText('1인당 적용')).toBeTruthy()
    expect(screen.queryByText('활동일')).toBeNull()
    expect(screen.queryByText('구성원 AX 활동')).toBeNull()
    expect(screen.queryByText('구성원의 AX 활동')).toBeNull()
    expect(screen.queryByText('활성 에이전트')).toBeNull()
    expect(screen.queryByText('에이전트 턴')).toBeNull()
    expect(screen.queryByText(/7일 활성 구성원/)).toBeNull()
    expect(screen.getByRole('tooltip', { name: '적용 보고를 남긴 사람' }).className).toContain('inset-x-0')
    expect(screen.getByText('일별 사용 인원').className).toContain('font-mono')
    const quieterDay = screen.getByLabelText('8월 30일 · 사용 인원 3명').firstElementChild as HTMLElement
    const peakDay = screen.getByLabelText('8월 31일 · 사용 인원 5명').firstElementChild as HTMLElement
    expect(quieterDay.className).toContain('ax-activity-mark')
    expect(quieterDay.dataset.activityFill).toContain('30.0%')
    expect(quieterDay.style.transform).toBe('')
    expect(peakDay.dataset.activityFill).toContain('100.0%')
    fireEvent.mouseEnter(quieterDay.parentElement!)
    expect(quieterDay.style.boxShadow).toContain('var(--brand-secondary)')
    expect(quieterDay.style.transform).toBe('')
    fireEvent.mouseLeave(quieterDay.parentElement!)
    expect(quieterDay.style.boxShadow).toBe('none')
    expect(screen.queryByLabelText('일별 스킬 활동 범례')).toBeNull()
    expect(screen.getByRole('region', { name: '일별 구성원 스킬 활동 · 최근 365일' })).toBeTruthy()
    expect(screen.getByRole('region', { name: '일별 에이전트 사용량 · 최근 365일' })).toBeTruthy()
    expect(screen.queryByText('장기 활동')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: '스킬' }))

    expect(screen.queryByRole('region', { name: '일별 구성원 스킬 활동 · 최근 365일' })).toBeNull()
    expect(screen.queryByRole('region', { name: '일별 에이전트 사용량 · 최근 365일' })).toBeNull()
    expect(screen.getByLabelText('일별 스킬 활동 범례')).toBeTruthy()
    const eventSummary = screen.getByLabelText('검색 노출 10건 · 전체 이벤트 중 10.0%')
    const dailyChartTitle = screen.getByText('일별 스킬 활동')
    expect(eventSummary.compareDocumentPosition(dailyChartTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 전환율 분모는 전체 로드가 아니라 연결 가능한 로드이고, 그 몫을 차트 위에 먼저 적는다.
    expect(screen.getByLabelText('로드 후 적용 전환율 분모').textContent).toBe(
      '로드 65건 중 연결 가능 48건 (73.8%) · 로드 후 적용 4건은 연결 가능 로드의 8.3%',
    )
    const flowDay = screen.getByLabelText(
      '8월 31일 · 로드 없이 적용 5건 · 로드 45건 · 로드 후 적용 3건 · 연결 가능 로드 40건 중 7.5%',
    )
    const flowBar = flowDay.querySelector<HTMLElement>('[data-flow-total]')
    expect(flowBar?.dataset.flowTotal).toBe('50')
    expect(flowBar?.style.transform).toBe('')
    expect(flowBar?.style.filter).toBe('')
    expect(flowBar?.style.opacity).toBe('')
    expect(flowDay.querySelector<HTMLElement>('[data-flow-segment="direct"]')?.dataset.flowColor).toBe(
      'color-mix(in srgb, var(--brand-secondary) 62%, var(--bg-tertiary))',
    )
    const loadSegment = flowDay.querySelector<HTMLElement>('[data-flow-segment="load"]')
    const convertedSegment = flowDay.querySelector<HTMLElement>('[data-flow-segment="converted"]')
    expect(loadSegment?.dataset.flowColor).toBe(
      'color-mix(in srgb, var(--text-muted) 58%, var(--bg-primary))',
    )
    expect(loadSegment?.style.boxShadow).toBe('')
    expect(convertedSegment?.dataset.flowColor).toBe(
      'var(--accent-orange)',
    )
    expect(convertedSegment?.style.boxShadow).toBe('')
    const selectedTooltipText = '8월 31일 · 로드 없이 적용 5 · 로드 45 · 로드 후 적용 3 · 연결 가능 로드 40건 중 7.5%'
    // 분모가 10건 미만인 날은 백분율 대신 분수를 참고 수치로 보여준다.
    const otherTooltipText = '8월 30일 · 로드 없이 적용 2 · 로드 20 · 로드 후 적용 1 · 연결 가능 로드 8건 중 1/8 · 참고'
    expect(screen.queryByText(selectedTooltipText)).toBeNull()
    expect(screen.queryByText(otherTooltipText)).toBeNull()
    fireEvent.mouseEnter(flowDay)
    expect(screen.getByText(selectedTooltipText)).toBeTruthy()
    expect(screen.queryByText(otherTooltipText)).toBeNull()
    fireEvent.mouseLeave(flowDay)
    expect(screen.queryByText(selectedTooltipText)).toBeNull()
    expect(screen.queryByText('aitk 서버에서 관측된 검색·콘텐츠 로드·적용 보고 현황')).toBeNull()
    expect(screen.queryByText('aitk DB (skill_events · mcp_sessions)')).toBeNull()
    expect(screen.queryByText('장기 활동')).toBeNull()
    expect(screen.queryByText('전체 구성원')).toBeNull()
    expect(screen.queryByText('주간 활성')).toBeNull()
  })

  it('연결 가능 로드가 없는 구형 응답이면 전체 로드 분모임을 밝히고 추정하지 않는다', async () => {
    const legacyPanels: AxPanelMeta[] = [
      { id: 'overview', title: '요약', description: '요약', source: 'test', visibility: 'org', usesPeriod: true },
      { id: 'skill-usage', title: '스킬', description: '스킬', source: 'test', visibility: 'org', usesPeriod: true },
    ]
    const legacyOverview: AxOverviewData = {
      totalParticipants: 1,
      catalogSkills: 1,
      grassDaily: [
        { date: '2026-08-30', events: 3, loads: 20, directApplied: 2, appliedAfterLoad: 1 },
        { date: '2026-08-31', events: 8, loads: 40, directApplied: 5, appliedAfterLoad: 3 },
      ],
      agentGrassDaily: [],
      dailySkillFlow: [],
      skillFlowSummary: { directApplied: 0, loaded: 0, linkableLoaded: 0, appliedAfterLoad: 0 },
      hourlyDensity: [],
      memberUsage: null,
    }
    const legacySkill: AxSkillUsageData = {
      totalEvents: 10, meaningfulUses: 4, activeUsers: 2, sessions: 1,
      actionTotals: { search: 4, load: 2, apply: 4, skip: 0, deploy: 0 },
      skills: [], daily: [], totalUnusedSkills: 0, unusedSkills: [],
    }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const meta = legacyPanels.find((panel) => url.includes(`/api/ax/${panel.id}?`))!
      return {
        ok: true,
        json: async () => ({
          meta,
          status: 'ok',
          data: meta.id === 'overview' ? legacyOverview : legacySkill,
          highlights: [],
          generatedAt: '2026-08-31T00:00:00.000Z',
        } satisfies AxPanelResult),
      }
    }))

    render(<AxDashboard panels={legacyPanels} isAdmin={false} />)
    await screen.findByText('활성 구성원')
    fireEvent.click(screen.getByRole('tab', { name: '스킬' }))

    expect(screen.getByRole('note', { name: '로드 후 적용 전환율 분모' }).textContent).toBe(
      '로드 60건 · 연결 가능 여부 미관측 · 로드 후 적용 4건은 전체 로드의 6.7%',
    )
    expect(screen.getByLabelText(
      '8월 31일 · 로드 없이 적용 5건 · 로드 40건 · 로드 후 적용 3건 · 전체 로드 40건 중 7.5%',
    )).toBeTruthy()
  })
})
