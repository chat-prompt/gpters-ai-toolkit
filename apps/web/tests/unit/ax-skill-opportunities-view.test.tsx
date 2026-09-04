import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AxSkillOpportunitiesData } from '../../../../packages/lib/src/features/ax/types'
import { SkillOpportunitiesPanel } from '../../components/ax/panels/SkillOpportunitiesPanel'

const DATA: AxSkillOpportunitiesData = {
  groups: [
    {
      category: 'low_load',
      total: 12,
      skills: [
        { skillId: 'quiet', name: '조용한 스킬', shown: 194, loaded: 5, applied: 0, skipped: 5, appliers: 0 },
      ],
    },
    { category: 'low_apply', total: 0, skills: [] },
    { category: 'no_outcome', total: 0, skills: [] },
    {
      category: 'single_user',
      total: 1,
      skills: [
        { skillId: 'solo', name: '혼자 쓰는 스킬', shown: 12, loaded: 9, applied: 5, skipped: 0, appliers: 1 },
      ],
    },
  ],
  searchRequests: 1219,
  zeroResultSearches: 5,
  thresholds: { minShown: 30, minLoaded: 5, minApplied: 3, loadRate: 0.1, applyRate: 1 / 3 },
}

describe('AX 스킬 개선 기회 화면', () => {
  it('후보가 있는 분류만 기준·근거 수치와 함께 보여준다', () => {
    render(<SkillOpportunitiesPanel data={DATA} days={30} />)

    // 후보가 0건인 분류는 렌더링하지 않는다
    expect(screen.queryByText('열어 보고도 쓰지 않음')).toBeNull()
    expect(screen.queryByText('결과가 남지 않음')).toBeNull()

    expect(screen.getByText('검색에는 뜨는데 열리지 않음')).toBeTruthy()
    // 전체 수와 보여준 수를 함께 밝힌다
    expect(screen.getByText('12개 중 상위 1개')).toBeTruthy()
    // 어떤 기준으로 걸렀는지 화면에 남긴다
    expect(screen.getByText('기준 · 노출 30건 이상이면서 로드가 노출의 10% 미만')).toBeTruthy()
    expect(screen.getByText('기준 · 적용 3건 이상이면서 적용한 사람이 1명')).toBeTruthy()

    // 노출·로드·적용·건너뜀이 한 줄에 그대로 실린다
    const quietCells = [...screen.getByText('조용한 스킬').closest('tr')!.querySelectorAll('td')]
      .map((cell) => cell.textContent)
    expect(quietCells).toEqual(['조용한 스킬', '194', '5', '0', '5'])

    // 한 사람만 쓰는 분류는 마지막 칸이 건너뜀 대신 사람 수다
    const soloCells = [...screen.getByText('혼자 쓰는 스킬').closest('tr')!.querySelectorAll('td')]
      .map((cell) => cell.textContent)
    expect(soloCells).toEqual(['혼자 쓰는 스킬', '12', '9', '5', '1명'])

    // 결과 0건 검색은 전체 대비로 적는다
    const zeroResult = screen.getByText(/전체 검색 1,219건/)
    expect(zeroResult.parentElement?.textContent).toContain('5')
  })

  it('기준을 넘은 스킬이 없으면 그렇게 말한다', () => {
    render(
      <SkillOpportunitiesPanel
        data={{ ...DATA, groups: DATA.groups.map((group) => ({ ...group, total: 0, skills: [] })) }}
        days={7}
      />
    )

    expect(screen.getByText('이 기간에는 기준을 넘은 스킬이 없습니다.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
