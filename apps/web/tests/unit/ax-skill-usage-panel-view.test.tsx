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

    // 분모(진입) = 검색 요청 12 + 검색 없는 로드 3 = 15. 연결 불가는 총량에만 있고 비율에서 빠진다.
    expect(screen.getByRole('note', { name: '깔때기 분모' }).textContent).toContain('진입 15건 = 검색 요청 12 + 검색 없는 로드 3')
    expect(screen.getByRole('note', { name: '깔때기 분모' }).textContent).toContain('연결 불가 로드 12건·적용 4건은 비율에서 제외')
    expect(document.querySelector('[data-funnel-tooltip]')).toBeNull()
    const searchSummary = screen.getByLabelText('검색 요청 12건 · 진입 중 80.0% · 결과 노출 줄 60줄')
    fireEvent.mouseEnter(searchSummary)
    expect(document.querySelector('[data-funnel-tooltip]')?.textContent).toContain('80.0%')
    fireEvent.mouseLeave(searchSummary)
    expect(document.querySelector('[data-funnel-tooltip]')).toBeNull()
    // 로드 20건 = 검색 후 5 + 검색 없는 3 + 연결 불가 12. 비율은 진입 15건 기준.
    const loadSummary = screen.getByLabelText('로드 20건 · 검색 후 로드 5건 · 33.3% · 검색 없는 로드 3건 · 20.0% · 연결 불가 12건 · 제외')
    fireEvent.mouseEnter(loadSummary)
    expect(Array.from(document.querySelectorAll('[data-funnel-tooltip] dt')).map((dt) => dt.textContent)).toEqual([
      '검색 후 로드', '검색 없는 로드', '연결 불가',
    ])
    fireEvent.mouseLeave(loadSummary)
    expect(screen.getByLabelText(/^적용 보고 10건 · 검색 기원 2건/)).toBeTruthy()

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
