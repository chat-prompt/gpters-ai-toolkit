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
        <SkillEventSummary totals={DATA.actionTotals} totalEvents={DATA.totalEvents} />
        <SkillUsagePanel data={DATA} days={7} />
      </>
    )

    expect(screen.queryByText('전체 이벤트 중 60.0%')).toBeNull()
    const searchSummary = screen.getByLabelText('검색 노출 60건 · 전체 이벤트 중 60.0%')
    fireEvent.mouseEnter(searchSummary)
    expect(screen.getByText('전체 이벤트 중 60.0%')).toBeTruthy()
    expect(screen.queryByText('전체 이벤트 중 20.0%')).toBeNull()
    fireEvent.mouseLeave(searchSummary)
    expect(screen.queryByText('전체 이벤트 중 60.0%')).toBeNull()
    expect(screen.queryByText(/같은 세션의 순차 전환율/)).toBeNull()

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
