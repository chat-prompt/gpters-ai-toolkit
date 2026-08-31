import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AxOverviewData } from '../../../../packages/lib/src/features/ax/types'
import { OverviewPanel } from '../../components/ax/panels/OverviewPanel'

const DATA: AxOverviewData = {
  totalParticipants: 1,
  catalogSkills: 1,
  grassDaily: [],
  dailyActiveUsers: [],
  hourlyDensity: Array.from({ length: 24 }, (_, hour) => ({ hour, users: 0 })),
  memberUsage: [
    {
      name: '테스트 사용자',
      loaded: 3,
      applied: 2,
      lastActiveAt: '2026-08-31T00:00:00.000Z',
    },
  ],
  unmeasured: [],
}

describe('AX 요약 사용자별 사용량 표', () => {
  it('로드와 적용 보고의 차이 및 검색 노출 제외를 설명한다', () => {
    render(<OverviewPanel data={DATA} days={7} />)

    expect(screen.getByRole('columnheader', { name: '로드' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: '적용 보고' })).toBeTruthy()
    expect(screen.getByText(/로드는 에이전트가 스킬의 전체 지침/).textContent).toContain(
      '검색 결과 노출·성공 여부·서버 호출 없이 로컬에서 재사용한 횟수는 포함하지 않습니다.'
    )
  })
})
