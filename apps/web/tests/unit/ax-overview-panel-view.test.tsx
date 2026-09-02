import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AxOverviewData } from '../../../../packages/lib/src/features/ax/types'
import { OverviewPanel } from '../../components/ax/panels/OverviewPanel'

const DATA: AxOverviewData = {
  totalParticipants: 1,
  catalogSkills: 1,
  grassDaily: [],
  dailySkillFlow: [
    { date: '2026-08-30', directApplied: 1, loaded: 7, linkableLoaded: 4, appliedAfterLoad: 2 },
  ],
  skillFlowSummary: {
    directApplied: 1,
    loaded: 7,
    linkableLoaded: 4,
    appliedAfterLoad: 2,
  },
  hourlyDensity: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    users: hour === 10 ? 1 : hour === 14 ? 3 : 0,
  })),
  memberUsage: [
    {
      name: '테스트 사용자',
      uniqueSkills: 2,
      loaded: 3,
      applied: 2,
      lastActiveAt: '2026-08-31T00:00:00.000Z',
    },
    {
      name: '보조 사용자',
      uniqueSkills: 5,
      loaded: 2,
      applied: 1,
      lastActiveAt: '2026-08-30T00:00:00.000Z',
    },
  ],
}

describe('AX 요약 사용자별 사용량 표', () => {
  it('시간대 활동과 사용자별 고유 스킬 활용을 보여주고 로드·적용은 호버에서만 드러낸다', () => {
    render(<OverviewPanel data={DATA} days={7} />)

    expect(screen.getByRole('columnheader', { name: '고유 스킬' })).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: '로드' })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: '적용 보고' })).toBeNull()
    expect(screen.queryByText(/일별 사용 인원 \(KST\)/)).toBeNull()
    expect(screen.getAllByText(/시간대별 사용 인원 \(KST\)/).length).toBeGreaterThan(0)
    expect(screen.getByText('2개')).toBeTruthy()
    expect(screen.getByText('5개')).toBeTruthy()
    const memberRow = screen.getByText('테스트 사용자').closest('tr')
    const usageBar = memberRow?.querySelector<HTMLElement>('[aria-hidden="true"]')
    const secondaryBar = screen.getByText('보조 사용자').closest('tr')
      ?.querySelector<HTMLElement>('[aria-hidden="true"]')
    expect(memberRow?.className).toContain('group')
    expect(usageBar?.className).toContain('ax-activity-mark')
    expect(usageBar?.dataset.activityFill).toContain('100.0%')
    expect(secondaryBar?.dataset.activityFill).toContain('25.0%')
    const secondaryRow = screen.getByText('보조 사용자').closest('tr')!
    const hoverDetail = screen.getByText('로드 2 · 적용 1')
    expect(hoverDetail.className).toContain('hidden')
    fireEvent.mouseEnter(secondaryRow)
    expect(secondaryBar?.style.boxShadow).toContain('var(--brand-primary)')
    expect(hoverDetail.className).toContain('block')

    const quietHour = screen.getByLabelText('10시 · 1명').firstElementChild as HTMLElement
    const peakHour = screen.getByLabelText('14시 · 3명').firstElementChild as HTMLElement
    expect(quietHour.dataset.activityFill).toContain('25.0%')
    expect(peakHour.dataset.activityFill).toContain('100.0%')
    fireEvent.mouseEnter(quietHour.parentElement!)
    expect(quietHour.style.boxShadow).toContain('var(--brand-primary)')
  })
})
