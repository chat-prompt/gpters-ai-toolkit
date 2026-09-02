import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AxJourneyInsightsData } from '../../../../packages/lib/src/features/ax/types'
import { JourneyInsightsPanel } from '../../components/ax/panels/JourneyInsightsPanel'

/** 검색 120건 중 20건은 결과 배열이 없고, 로드 조합 30개 중 12개만 적용 여부가 기록된 상태 */
const DATA: AxJourneyInsightsData = {
  exploration: {
    observedSearches: 100,
    unobservedSearches: 20,
    zeroResultSearches: 10,
    zeroResultRate: 10,
    totalExposures: 300,
    exposedPairs: 50,
    loadedFromSearchPairs: 8,
    appliedFromSearchPairs: 3,
    notAppliedFromSearchPairs: 1,
    unreportedFromSearchPairs: 4,
    searchToLoadRate: 16,
    loadToDecisionRate: 50,
    sampleIsSignificant: true,
  },
  zeroResultQueries: [],
  execution: {
    attempts: 12,
    startedAttempts: 10,
    completedAttempts: 9,
    inProgressAttempts: 1,
    unreportedAttempts: 2,
    completionWithoutStart: 1,
    missingVersion: 0,
    unvalidatedCompleted: 4,
    averageDurationSeconds: 90,
    success: 6,
    partial: 1,
    failed: 2,
    abandoned: 0,
    verifiedAttempts: 5,
    verifiedSuccesses: 4,
    verifiedSuccessRate: 80,
    selfReportedSuccessRate: 66.7,
    agents: [
      {
        agentId: 'bbodoong',
        runtime: 'claude-code',
        attempts: 12,
        completed: 9,
        success: 6,
        partial: 1,
        failed: 2,
        abandoned: 0,
        inProgress: 1,
        unreported: 2,
        verifiedAttempts: 5,
        verifiedSuccesses: 4,
        verifiedSuccessRate: 80,
        lastReportedAt: '2026-09-01T00:00:00.000Z',
      },
    ],
  },
  outcomes: {
    loadedPairs: 30,
    appliedPairs: 9,
    notAppliedPairs: 3,
    unreportedPairs: 18,
    outcomeCoverageRate: 40,
    confirmedApplyRate: 75,
  },
  skillOutcomes: [
    {
      skillId: 'alpha',
      name: '알파 스킬',
      loadedPairs: 4,
      appliedPairs: 1,
      notAppliedPairs: 0,
      unreportedPairs: 3,
      outcomeCoverageRate: 25,
    },
  ],
  searchSkipReasons: [],
  notAppliedReasons: [],
}

describe('JourneyInsightsPanel 분모 신뢰도', () => {
  it('전환율보다 먼저 관측 범위를 보여주고, 수집 공백을 0건과 구분한다', () => {
    render(<JourneyInsightsPanel data={DATA} days={7} />)

    const reliability = within(screen.getByRole('region', { name: '분모 신뢰도' }))
    expect(reliability.getByText('결과 배열 미기록 검색')).toBeTruthy()
    expect(reliability.getByText('16.7%')).toBeTruthy()
    expect(reliability.getByText(/미기록은 0건 검색이 아니라 판정 불가/)).toBeTruthy()
    expect(reliability.getByText('적용 여부 기록 커버리지')).toBeTruthy()
    expect(reliability.getByText('40.0%')).toBeTruthy()
    expect(reliability.getByText(/기록 없음은 미적용이 아니라 관측 공백/)).toBeTruthy()
    expect(reliability.getByText('검증 결과가 있는 판정')).toBeTruthy()
    // 성공·부분·실패 판정 9회 중 검증 5회 — 분모가 10회 미만이라 분수로 남긴다.
    expect(reliability.getByText('5/9 · 참고')).toBeTruthy()
    expect(reliability.getByText(/검색결과 0건 비율만 표본 100건 기준/)).toBeTruthy()
    expect(reliability.getByText('백분율 표시 기준')).toBeTruthy()
    expect(reliability.getByText('10건')).toBeTruthy()

    // 분모 신뢰도가 전환 퍼널보다 먼저 온다.
    const funnel = screen.getByText('검색 후보 → 상세 확인 → 적용 판단 기록')
    expect(
      screen.getByRole('region', { name: '분모 신뢰도' }).compareDocumentPosition(funnel)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('표본이 작은 비율은 백분율 대신 분수와 참고 표시로 보여준다', () => {
    render(<JourneyInsightsPanel data={DATA} days={7} />)

    // 고유 후보 50개 중 8개 → 표본 충분
    expect(screen.getAllByText('16.0%').length).toBeGreaterThan(0)
    // 상세 확인 8개 중 판단 4개 → 표본 부족
    expect(screen.getAllByText('4/8 · 참고').length).toBeGreaterThan(0)
    expect(screen.getByText('직전 단계의 4/8 · 참고')).toBeTruthy()
    // 검증 5회 중 성공 4회 → 표본 부족, 자기보고는 9회 중 6회 → 표본 부족
    expect(screen.getByText(/자기보고 성공률 6\/9 · 참고/)).toBeTruthy()
    expect(screen.getByText(/검증 성공률 4\/5 · 참고/)).toBeTruthy()
    // 에이전트 표도 같은 10건 규칙을 따른다.
    const agentRow = screen.getByText('bbodoong').closest('tr')!
    expect(agentRow.textContent).toContain('4/5 · 참고')
    expect(agentRow.textContent).not.toContain('80%')
    // 스킬별 기록률도 같은 규칙을 따른다.
    expect(screen.getByText('알파 스킬').closest('tr')?.textContent).toContain('1/4 · 참고')
    // 확정 적용률 9/12 → 12개라 백분율
    expect(screen.getByText(/적용 기록 비율은 75\.0%입니다/)).toBeTruthy()
  })

  it('실행 결과 계약이 없으면 0%가 아니라 미관측으로 남긴다', () => {
    render(<JourneyInsightsPanel data={{ ...DATA, execution: null }} days={7} />)

    const reliability = within(screen.getByRole('region', { name: '분모 신뢰도' }))
    expect(reliability.getByText('미관측')).toBeTruthy()
    expect(reliability.getByText(/보고된 시도가 아직 없습니다/)).toBeTruthy()
  })
})
