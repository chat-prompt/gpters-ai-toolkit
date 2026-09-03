import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AxSkillUsageData } from '../../../../packages/lib/src/features/ax/types'
import {
  SkillEventSummary,
  SkillUsagePanel,
} from '../../components/ax/panels/SkillUsagePanel'

const DATA: AxSkillUsageData = {
  totalEvents: 100,
  meaningfulUses: 10,
  activeUsers: 4,
  sessions: 3,
  actionTotals: { search: 60, load: 20, apply: 10, skip: 8, deploy: 2 },
  origins: {
    searchRequests: 12,
    loads: { fromSearch: 5, direct: 3, unlinkable: 12 },
    applies: { fromSearch: 2, afterDirectLoad: 1, withoutLoad: 3, unlinkable: 4 },
  },
  skills: [
    {
      skillId: 'alpha',
      name: '알파 스킬',
      searched: 20,
      loaded: 8,
      applied: 6,
      skipped: 1,
      deployed: 0,
      users: 2,
      lastUsedAt: '2026-09-01T00:00:00.000Z',
    },
    {
      skillId: 'beta',
      name: '베타 스킬',
      searched: 10,
      loaded: 4,
      applied: 2,
      skipped: 2,
      deployed: 0,
      users: 1,
      lastUsedAt: '2026-08-31T00:00:00.000Z',
    },
  ],
  daily: [],
  totalUnusedSkills: 0,
  unusedSkills: [],
}

describe('AX 스킬 사용 패널 화면', () => {
  it('이벤트 비율은 호버할 때만, 스킬은 전체 적용 비중과 활성 사용자 비율로 보여준다', () => {
    render(
      <>
        <SkillEventSummary origins={DATA.origins} totals={DATA.actionTotals} />
        <SkillUsagePanel data={DATA} days={7} />
      </>
    )

    // 검색 경로: 검색 요청 12 → 로드 5 → 적용 2. 직접 경로: 검색 없는 로드 3 → 적용 1. 비율은 직전 단계 대비.
    expect(screen.getByLabelText('검색 경로 · 검색 요청 12건 · 평균 검색 결과 5개')).toBeTruthy()
    const searchLoad = screen.getByLabelText('검색 경로 · 로드 5건 · 직전 검색 요청 12건 중 41.7%')
    expect(screen.getByLabelText('검색 경로 · 적용 보고 2건 · 직전 로드 5건 중 2/5 · 참고')).toBeTruthy()
    expect(screen.getByLabelText('직접 경로 · 검색 없는 로드 3건')).toBeTruthy()
    expect(screen.getByLabelText('직접 경로 · 적용 보고 1건 · 직전 검색 없는 로드 3건 중 1/3 · 참고')).toBeTruthy()
    // 연결 불가는 막대 없이 따로 적고 비율에서 뺀다
    const unlinkable = screen.getByRole('note', { name: '연결 불가' }).textContent
    expect(unlinkable).toContain('로드 12건 · 적용 4건 · 로드 없이 적용 3건')
    // 호버하면 직전 단계 대비 행이 세로로 뜬다
    expect(document.querySelector('[data-funnel-tooltip]')).toBeNull()
    fireEvent.mouseEnter(searchLoad)
    expect(Array.from(document.querySelectorAll('[data-funnel-tooltip] dt')).map((dt) => dt.textContent)).toEqual([
      '직전 검색 요청 12건 중',
    ])
    expect(document.querySelector('[data-funnel-tooltip] dd')?.textContent).toBe('41.7%')
    fireEvent.mouseLeave(searchLoad)
    expect(document.querySelector('[data-funnel-tooltip]')).toBeNull()

    expect(screen.queryByRole('columnheader', { name: '적용 보고' })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: '전체 적용 중' })).toBeNull()
    expect(screen.getByRole('columnheader', { name: '활성 사용자 중 적용' })).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: '검색 노출' })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: '로드' })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: '스킵 보고' })).toBeNull()

    const coverageHelp = screen.getByLabelText('스킬 적용 집계 범위 안내')
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.mouseEnter(coverageHelp)
    expect(screen.getByRole('tooltip').textContent).toContain('0이 아니라 미관측')
    fireEvent.mouseLeave(coverageHelp)
    expect(screen.queryByRole('tooltip')).toBeNull()

    const alphaRow = screen.getByText('알파 스킬').closest('tr')!
    expect(alphaRow.textContent).not.toContain('60.0%')
    expect(alphaRow.textContent).toContain('2/4명 · 50.0%')
    fireEvent.mouseEnter(alphaRow)
    expect(screen.getByText('적용 6건 · 전체 적용 중 60.0%')).toBeTruthy()
    fireEvent.mouseLeave(alphaRow)
    expect(screen.queryByText('적용 6건 · 전체 적용 중 60.0%')).toBeNull()

    const alphaBar = alphaRow.querySelector<HTMLElement>('[data-activity-fill]')
    const betaBar = screen.getByText('베타 스킬').closest('tr')
      ?.querySelector<HTMLElement>('[data-activity-fill]')
    expect(alphaBar?.dataset.activityFill).toContain('100.0%')
    expect(betaBar?.dataset.activityFill).toContain('30.0%')
  })
})
