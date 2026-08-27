/** AX 대시보드 — 개선 인사이트 패널 집계 테스트 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@gpters/db', () => ({
  db: { execute: vi.fn() },
}))

vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const { journeyInsightsPanel } = await import(
  '../../../../packages/lib/src/features/ax/journey-insights'
)
const { db } = await import('@gpters/db')

/** 패널의 7개 raw SQL 결과를 실행 순서대로 넣는다 */
function queueRows(results: Array<Record<string, unknown>[]>) {
  const execute = vi.mocked(db.execute)
  execute.mockReset()
  for (const rows of results) execute.mockResolvedValueOnce({ rows } as never)
}

describe('journeyInsightsPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('검색어·사유가 있어 관리자 패널로만 등록된다', () => {
    expect(journeyInsightsPanel.meta.id).toBe('journey-insights')
    expect(journeyInsightsPanel.meta.visibility).toBe('admin')
    expect(journeyInsightsPanel.meta.parentId).toBe('skill-usage')
    expect(journeyInsightsPanel.meta.usesPeriod).toBe(true)
  })

  it('검색 후보를 같은 세션×스킬의 상세 확인과 적용 판단까지 연결한다', async () => {
    queueRows([
      [{ observed_searches: '120', unobserved_searches: '3', zero_result_searches: '18' }],
      [{
        total_exposures: '260',
        exposed_pairs: '200',
        loaded_from_search_pairs: '50',
        applied_from_search_pairs: '24',
        not_applied_from_search_pairs: '6',
        unreported_from_search_pairs: '20',
      }],
      [
        { text: '슬랙 요약', count: '7', last_seen_at: '2026-08-23T01:00:00.000Z' },
        { text: '긴 문구', count: 2, last_seen_at: null },
      ],
      [
        {
          skill_id: 'skill-a',
          name: '스킬 A',
          loaded_pairs: '10',
          applied_pairs: '4',
          not_applied_pairs: '2',
          unreported_pairs: '4',
          total_loaded_pairs: '14',
          total_applied_pairs: '5',
          total_not_applied_pairs: '3',
          total_unreported_pairs: '6',
        },
        {
          skill_id: 'skill-b',
          name: '스킬 B',
          loaded_pairs: 4,
          applied_pairs: 1,
          not_applied_pairs: 1,
          unreported_pairs: 2,
          total_loaded_pairs: 14,
          total_applied_pairs: 5,
          total_not_applied_pairs: 3,
          total_unreported_pairs: 6,
        },
      ],
      [{ text: '원하는 결과가 아님', count: '3' }],
      [{ text: '의존성이 맞지 않음', count: 2 }],
      [{
        attempts: '8',
        started_attempts: '6',
        completed_attempts: '7',
        in_progress_attempts: '1',
        unreported_attempts: '0',
        completion_without_start: '1',
        missing_version: '2',
        unvalidated_completed: '1',
        average_duration_seconds: '75',
        success: '4',
        partial: '2',
        failed: '1',
        abandoned: '1',
        verified_attempts: '5',
        verified_successes: '3',
      }],
      [{
        agent_id: 'codex-reviewer',
        agent: 'codex',
        attempts: '8',
        completed: '7',
        success: '4',
        partial: '2',
        failed: '1',
        abandoned: '0',
        in_progress: '1',
        unreported: '0',
        verified_attempts: '5',
        verified_successes: '3',
        last_reported_at: '2026-08-25T00:00:00.000Z',
      }],
    ])

    const result = await journeyInsightsPanel.load({ days: 30, isAdmin: true })

    expect(result.status).toBe('ok')
    expect(result.data?.exploration).toEqual({
      observedSearches: 120,
      unobservedSearches: 3,
      zeroResultSearches: 18,
      zeroResultRate: 15,
      totalExposures: 260,
      exposedPairs: 200,
      loadedFromSearchPairs: 50,
      appliedFromSearchPairs: 24,
      notAppliedFromSearchPairs: 6,
      unreportedFromSearchPairs: 20,
      searchToLoadRate: 25,
      loadToDecisionRate: 60,
      sampleIsSignificant: true,
    })
    expect(result.data?.zeroResultQueries[0]).toEqual({
      text: '슬랙 요약',
      count: 7,
      lastSeenAt: '2026-08-23T01:00:00.000Z',
    })
    expect(result.data?.execution).toEqual({
      attempts: 8,
      startedAttempts: 6,
      completedAttempts: 7,
      inProgressAttempts: 1,
      unreportedAttempts: 0,
      completionWithoutStart: 1,
      missingVersion: 2,
      unvalidatedCompleted: 1,
      averageDurationSeconds: 75,
      success: 4,
      partial: 2,
      failed: 1,
      abandoned: 1,
      verifiedAttempts: 5,
      verifiedSuccesses: 3,
      verifiedSuccessRate: 60,
      selfReportedSuccessRate: 57.14,
      agents: [{
        agentId: 'codex-reviewer',
        runtime: 'codex',
        attempts: 8,
        completed: 7,
        success: 4,
        partial: 2,
        failed: 1,
        abandoned: 0,
        inProgress: 1,
        unreported: 0,
        verifiedAttempts: 5,
        verifiedSuccessRate: 60,
        lastReportedAt: '2026-08-25T00:00:00.000Z',
      }],
    })
    expect(result.data?.outcomes).toEqual({
      loadedPairs: 14,
      appliedPairs: 5,
      notAppliedPairs: 3,
      unreportedPairs: 6,
      outcomeCoverageRate: 57.14,
      confirmedApplyRate: 62.5,
    })
    expect(result.data?.skillOutcomes[0]).toEqual({
      skillId: 'skill-a',
      name: '스킬 A',
      loadedPairs: 10,
      appliedPairs: 4,
      notAppliedPairs: 2,
      unreportedPairs: 4,
      outcomeCoverageRate: 60,
    })
    expect(result.data?.searchSkipReasons).toEqual([
      { text: '원하는 결과가 아님', count: 3 },
    ])
    expect(result.data?.notAppliedReasons).toEqual([
      { text: '의존성이 맞지 않음', count: 2 },
    ])
  })

  it('표본이나 로드가 없으면 비율을 0으로 꾸미지 않는다', async () => {
    queueRows([[{}], [{}], [], [], [], [], [{}], []])

    const result = await journeyInsightsPanel.load({ days: 7, isAdmin: true })

    expect(result.status).toBe('ok')
    expect(result.data?.exploration.zeroResultRate).toBeNull()
    expect(result.data?.exploration.searchToLoadRate).toBeNull()
    expect(result.data?.exploration.loadToDecisionRate).toBeNull()
    expect(result.data?.outcomes.outcomeCoverageRate).toBeNull()
    expect(result.data?.outcomes.confirmedApplyRate).toBeNull()
    expect(result.data?.execution).toBeNull()
  })

  it('DB 조회 실패를 패널 오류 상태로 돌려준다', async () => {
    vi.mocked(db.execute).mockRejectedValueOnce(new Error('db unavailable'))

    const result = await journeyInsightsPanel.load({ days: 30, isAdmin: true })

    expect(result.status).toBe('error')
    expect(result.data).toBeNull()
  })
})
