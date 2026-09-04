/**
 * AX 대시보드 — 반복 사용 화면 테스트
 *
 * 작은 표본은 분수로, 관측 없는 창은 미관측으로, 빈 기간은 안내문으로 보여주는지 검증한다.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AxRetentionData } from '../../../../packages/lib/src/features/ax/types'
import { RetentionPanel } from '../../components/ax/panels/RetentionPanel'

const DATA: AxRetentionData = {
  since: '2026-08-06T00:00:00.000Z',
  until: '2026-09-05T00:00:00.000Z',
  firstObservedAt: '2026-06-15T00:00:00.000Z',
  anonymousApplies: 0,
  users: { active: 10, new: 2, returning: 8, reusing: 6 },
  weeks: [
    { start: '2026-08-08T00:00:00.000Z', end: '2026-08-15T00:00:00.000Z', activeUsers: 1, previousActiveUsers: null, retainedUsers: null, newUsers: 0 },
    { start: '2026-08-29T00:00:00.000Z', end: '2026-09-05T00:00:00.000Z', activeUsers: 9, previousActiveUsers: 8, retainedUsers: 7, newUsers: 1 },
  ],
  skills: { applied: 60, single: 40, multipleWithoutReuse: 8, reused: 12 },
  pairs: { total: 130, oneDay: 100, twoDays: 20, threePlusDays: 10 },
  topSkills: [
    { skillId: 'post', name: '게시글 작성', applies: 14, users: 5, reusedUsers: 4, maxActiveDays: 3 },
    { skillId: 'init', name: 'g-init', applies: 4, users: 3, reusedUsers: 0, maxActiveDays: 1 },
  ],
  totalMultiApplySkills: 20,
  thresholds: { reuseMinDays: 2, weekDays: 7 },
}

describe('AX 반복 사용 화면', () => {
  it('재방문은 표본이 작으면 분수로, 관측 없는 창은 미관측으로 적는다', () => {
    render(<RetentionPanel data={DATA} days={30} />)

    // 사람 수는 10명 미만이라 백분율이 아니다
    expect(screen.getAllByText('7/8 · 참고').length).toBeGreaterThan(0)
    expect(screen.getByText('직전 창 8명 중 7명')).toBeTruthy()
    // 미관측은 0으로 그리지 않는다
    expect(screen.getAllByText('미관측')).toHaveLength(2)

    expect(screen.getByText('신규 2 · 재사용자 8')).toBeTruthy()
    expect(screen.getByText('적용된 60개 중 · 한 번만 40개')).toBeTruthy()
    expect(screen.getByText('사용자×스킬 조합 130개')).toBeTruthy()
    expect(screen.getByText('두 번 이상 적용된 20개 중 상위 2개')).toBeTruthy()

    const postCells = [...screen.getByText('게시글 작성').closest('tr')!.querySelectorAll('th, td')]
      .map((cell) => cell.textContent)
    expect(postCells).toEqual(['게시글 작성', '14', '5', '4', '3일'])
  })

  it('적용 보고가 없으면 표를 그리지 않고 그렇게 말한다', () => {
    render(
      <RetentionPanel
        data={{
          ...DATA,
          firstObservedAt: null,
          users: { active: 0, new: 0, returning: 0, reusing: 0 },
          weeks: [{ start: '2026-08-29T00:00:00.000Z', end: '2026-09-05T00:00:00.000Z', activeUsers: 0, previousActiveUsers: null, retainedUsers: null, newUsers: 0 }],
          topSkills: [],
          totalMultiApplySkills: 0,
        }}
        days={7}
      />
    )
    expect(screen.getByText('이 기간에는 적용 보고가 없습니다.')).toBeTruthy()
    expect(screen.getByText('적용 보고가 아직 관측되지 않았습니다')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
