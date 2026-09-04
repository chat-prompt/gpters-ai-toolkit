/**
 * AX 대시보드 — 반복 사용 패널 테스트
 *
 * db는 모킹하고, 재사용·재방문·신규 판정 규칙과 미관측 처리를 검증한다.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@gpters/db', () => ({
  db: { execute: vi.fn() },
}))

vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { db } from '@gpters/db'
import { buildRetentionData, skillRetentionPanel } from '../../../../packages/lib/src/features/ax/retention'

const DAY = 24 * 60 * 60 * 1000
/** 기간 끝 (UTC 자정, 미포함) — 2026-09-05 00:00Z이면 오늘은 9/4 */
const UNTIL = new Date('2026-09-05T00:00:00.000Z')

function pair(user_id: string, skill_id: string, applies: number, active_days: number, name: string | null = null) {
  return { user_id, skill_id, name, applies, active_days }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buildRetentionData', () => {
  it('재사용은 서로 다른 날 2일 이상만 세고, 같은 날 반복 보고는 세지 않는다', () => {
    const since = new Date(UNTIL.getTime() - 30 * DAY)
    const data = buildRetentionData(
      {
        since,
        until: UNTIL,
        pairs: [
          // 같은 날 두 번 보고 → 하루만, 재사용 아님
          pair('u1', 'same-day', 2, 1, '같은 날'),
          // 다른 날 두 번 → 재사용
          pair('u1', 'two-days', 2, 2, '이틀'),
          // 다른 사람이 하루씩 → 여러 번 적용됐지만 재사용은 아님
          pair('u2', 'same-day', 1, 1, '같은 날'),
          // 사흘 이상
          pair('u3', 'deep', 5, 3, '깊음'),
          // 한 번만
          pair('u3', 'once', 1, 1, '한 번'),
        ],
        weeks: [],
        firstApplies: [
          { user_id: 'u1', first_applied_at: new Date(since.getTime() - 10 * DAY) },
          { user_id: 'u2', first_applied_at: new Date(since.getTime() + 3 * DAY) },
          { user_id: 'u3', first_applied_at: new Date(since.getTime() - 40 * DAY) },
        ],
        anonymousApplies: 1,
      },
      30
    )

    expect(data.users).toEqual({ active: 3, new: 1, returning: 2, reusing: 2 })
    expect(data.pairs).toEqual({ total: 5, oneDay: 3, twoDays: 1, threePlusDays: 1 })
    // same-day: 적용 3회지만 재사용 없음, two-days·deep: 재사용, once: 한 번
    expect(data.skills).toEqual({ applied: 4, single: 1, multipleWithoutReuse: 1, reused: 2 })
    // 다시 쓴 사용자 많은 순 → 같으면 적용 많은 순. 한 번만 적용된 스킬은 표에 없다
    expect(data.topSkills.map((row) => [row.skillId, row.users, row.reusedUsers, row.maxActiveDays])).toEqual([
      ['deep', 1, 1, 3],
      ['two-days', 1, 1, 2],
      ['same-day', 2, 0, 1],
    ])
    expect(data.totalMultiApplySkills).toBe(3)
    expect(data.anonymousApplies).toBe(1)
    // 관측 시작은 가장 이른 최초 적용이다
    expect(data.firstObservedAt).toBe(new Date(since.getTime() - 40 * DAY).toISOString())
    expect(data.thresholds).toEqual({ reuseMinDays: 2, weekDays: 7 })
  })

  it('주간 재방문은 직전 창과의 교집합이고, 관측 시작 전 창은 0이 아니라 미관측이다', () => {
    const since = new Date(UNTIL.getTime() - 30 * DAY)
    const firstObserved = new Date(UNTIL.getTime() - 20 * DAY)
    const data = buildRetentionData(
      {
        since,
        until: UNTIL,
        pairs: [pair('a', 's', 1, 1), pair('b', 's', 1, 1), pair('c', 's', 1, 1)],
        weeks: [
          // 창 0(최근 7일): a, b, c / 창 1: a, b / 창 2: a / 창 3: 없음 / 창 4: 없음
          { user_id: 'a', week: 0 }, { user_id: 'b', week: 0 }, { user_id: 'c', week: 0 },
          { user_id: 'a', week: 1 }, { user_id: 'b', week: 1 },
          { user_id: 'a', week: 2 },
        ],
        firstApplies: [
          { user_id: 'a', first_applied_at: firstObserved },
          { user_id: 'b', first_applied_at: new Date(UNTIL.getTime() - 10 * DAY) },
          { user_id: 'c', first_applied_at: new Date(UNTIL.getTime() - 2 * DAY) },
        ],
        anonymousApplies: 0,
      },
      30
    )

    // 30일 → 7일 창 4개, 오래된 창이 먼저
    expect(data.weeks).toHaveLength(4)
    expect(data.weeks[3]).toMatchObject({
      start: new Date(UNTIL.getTime() - 7 * DAY).toISOString(),
      end: UNTIL.toISOString(),
      activeUsers: 3,
      previousActiveUsers: 2,
      retainedUsers: 2,
      newUsers: 1,
    })
    expect(data.weeks[2]).toMatchObject({ activeUsers: 2, previousActiveUsers: 1, retainedUsers: 1, newUsers: 1 })
    // 창 2(15~21일 전)의 직전 창은 관측 시작(20일 전)보다 앞에서 시작하므로 미관측
    expect(data.weeks[1]).toMatchObject({ activeUsers: 1, previousActiveUsers: null, retainedUsers: null, newUsers: 1 })
    expect(data.weeks[0]).toMatchObject({ activeUsers: 0, previousActiveUsers: null, retainedUsers: null, newUsers: 0 })
  })

  it('적용 보고가 하나도 없으면 관측 시작이 null이고 모든 창이 미관측이다', () => {
    const data = buildRetentionData(
      { since: new Date(UNTIL.getTime() - 7 * DAY), until: UNTIL, pairs: [], weeks: [], firstApplies: [], anonymousApplies: 0 },
      7
    )
    expect(data.firstObservedAt).toBeNull()
    expect(data.users).toEqual({ active: 0, new: 0, returning: 0, reusing: 0 })
    expect(data.weeks).toHaveLength(1)
    expect(data.weeks[0]).toMatchObject({ activeUsers: 0, previousActiveUsers: null, retainedUsers: null })
    expect(data.topSkills).toEqual([])
  })
})

describe('AX 반복 사용 패널', () => {
  it('네 쿼리 결과를 묶어 데이터와 주간 재방문 하이라이트를 돌려준다', async () => {
    vi.mocked(db.execute)
      .mockResolvedValueOnce({ rows: [
        { skill_id: 's1', name: '스킬 1', user_id: 'u1', applies: '3', active_days: '2' },
        { skill_id: 's1', name: '  ', user_id: 'u2', applies: 1, active_days: 1 },
      ] } as never)
      .mockResolvedValueOnce({ rows: [
        { user_id: 'u1', week: 0 }, { user_id: 'u2', week: 0 }, { user_id: 'u1', week: 1 },
      ] } as never)
      .mockResolvedValueOnce({ rows: [
        { user_id: 'u1', first_applied_at: '2026-06-15T00:00:00.000Z' },
        { user_id: 'u2', first_applied_at: '2026-09-03T00:00:00.000Z' },
      ] } as never)
      .mockResolvedValueOnce({ rows: [{ anonymous_applies: '0' }] } as never)

    const result = await skillRetentionPanel.load({ days: 7, isAdmin: false })

    expect(result.status).toBe('ok')
    const data = result.data!
    // 문자열로 온 count도 숫자로 읽는다
    expect(data.topSkills[0]).toMatchObject({ skillId: 's1', name: '스킬 1', applies: 4, users: 2, reusedUsers: 1, maxActiveDays: 2 })
    expect(data.users.reusing).toBe(1)
    expect(data.weeks).toHaveLength(1)
    expect(data.weeks[0]).toMatchObject({ activeUsers: 2, previousActiveUsers: 1, retainedUsers: 1 })
    // 하이라이트는 백분율이 아니라 분수 — 사람 수는 표본이 작다
    expect(result.highlights?.[0]).toMatchObject({ label: '주간 재방문', value: '1/1' })
    expect(db.execute).toHaveBeenCalledTimes(4)
  })

  it('조회가 실패하면 오류 상태를 돌려준다', async () => {
    vi.mocked(db.execute).mockRejectedValue(new Error('boom') as never)
    const failed = await skillRetentionPanel.load({ days: 30, isAdmin: false })
    expect(failed.status).toBe('error')
    expect(failed.data).toBeNull()
  })
})
