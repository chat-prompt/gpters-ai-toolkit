/**
 * 크론 감시 판정 테스트.
 *
 * 이 장치가 잡아야 하는 것은 실제로 일어났던 세 가지 무증상 실패다 —
 * 라우트가 404라 아예 안 불린 경우, 며칠째 조용한 경우, 그리고 **성공하는데 산출이 계속 0인 경우**.
 * 마지막 것이 가장 오래 숨었다(커뮤니티 임포트 6개월).
 *
 * 미관측을 0으로 읽지 않는 것도 함께 못 박는다 — 기록이 없으면 "0건 처리"가 아니라 "기록 없음"이다.
 */

import { describe, expect, it } from 'vitest'
import {
  CRON_EXPECTATIONS,
  countZeroStreak,
  diagnose,
  findCronExpectation,
  type CronExpectation,
} from '../../../../packages/lib/src/ops'

const NOW = new Date('2026-09-07T05:00:00.000Z')

/** 산출량을 감시하는 잡의 기대치 */
const WATCHED: CronExpectation = {
  jobName: 'catalog-health-snapshot',
  label: '카탈로그 위생 스냅숏',
  maxSilentHours: 30,
  outputKeys: ['totalItems'],
  zeroStreakLimit: 1,
}

/** 산출량을 감시하지 않는 잡의 기대치 (0이 정상) */
const UNWATCHED: CronExpectation = {
  jobName: 'redact-skill-text',
  label: '자유 텍스트 보관 기한',
  maxSilentHours: 30,
  outputKeys: [],
  zeroStreakLimit: 0,
}

/**
 * `hoursAgo`시간 전에 성공한 관측값
 *
 * @param hoursAgo - 마지막 성공이 몇 시간 전인지
 * @param stats - 최근 것부터 정렬된 산출량
 */
function observed(hoursAgo: number, stats: Array<Record<string, number>> = [{ totalItems: 466 }]) {
  return {
    lastSuccessAt: new Date(NOW.getTime() - hoursAgo * 3_600_000),
    recentSuccessStats: stats,
  }
}

describe('diagnose', () => {
  it('한 번도 안 돌았으면 "기록 없음"이라고 한다 — 0건 처리가 아니다', () => {
    const issue = diagnose(WATCHED, { lastSuccessAt: null, recentSuccessStats: [] }, NOW)
    expect(issue).toMatchObject({ kind: 'never' })
    expect(issue?.detail).toContain('한 번도 없다')
  })

  it('기대 주기 안에 성공했으면 문제로 보지 않는다', () => {
    expect(diagnose(WATCHED, observed(20), NOW)).toBeNull()
  })

  it('기대 주기를 넘겨 조용하면 몇 시간째인지 알린다', () => {
    const issue = diagnose(WATCHED, observed(40), NOW)
    expect(issue).toMatchObject({ kind: 'silent' })
    expect(issue?.detail).toContain('40시간 전')
  })

  it('성공했지만 산출이 0이면 잡는다 — 커뮤니티 임포트가 이 모양으로 6개월 숨었다', () => {
    const issue = diagnose(WATCHED, observed(2, [{ totalItems: 0 }]), NOW)
    expect(issue).toMatchObject({ kind: 'zero_output' })
    expect(issue?.detail).toContain('1회 연속 0')
  })

  it('0이 정상인 잡은 산출량으로 문제 삼지 않는다', () => {
    expect(diagnose(UNWATCHED, observed(2, [{ queries: 0 }, { queries: 0 }]), NOW)).toBeNull()
  })

  it('멈춤이 산출 0보다 먼저다 — 안 돌고 있으면 산출량은 볼 필요가 없다', () => {
    const issue = diagnose(WATCHED, observed(100, [{ totalItems: 0 }]), NOW)
    expect(issue?.kind).toBe('silent')
  })
})

describe('countZeroStreak', () => {
  it('최근부터 이어지는 0만 센다', () => {
    expect(countZeroStreak([{ n: 0 }, { n: 0 }, { n: 5 }, { n: 0 }], ['n'])).toBe(2)
  })

  it('가장 최근이 0이 아니면 연속이 아니다', () => {
    expect(countZeroStreak([{ n: 3 }, { n: 0 }, { n: 0 }], ['n'])).toBe(0)
  })

  it('키 여러 개는 합이 0일 때만 0으로 본다', () => {
    expect(countZeroStreak([{ a: 0, b: 1 }], ['a', 'b'])).toBe(0)
    expect(countZeroStreak([{ a: 0, b: 0 }], ['a', 'b'])).toBe(1)
  })

  it('감시 키가 없으면 세지 않는다', () => {
    expect(countZeroStreak([{ n: 0 }, { n: 0 }], [])).toBe(0)
  })

  it('없는 키는 0으로 읽되 기록 자체가 없는 것과 구분은 diagnose가 한다', () => {
    expect(countZeroStreak([{}], ['n'])).toBe(1)
  })
})

describe('CRON_EXPECTATIONS', () => {
  it('이름이 겹치지 않는다', () => {
    const names = CRON_EXPECTATIONS.map((entry) => entry.jobName)
    expect(new Set(names).size).toBe(names.length)
  })

  it('산출량을 감시하는 잡은 한계값이 1 이상이다 — 0이면 항상 걸린다', () => {
    for (const entry of CRON_EXPECTATIONS) {
      if (entry.outputKeys.length > 0) expect(entry.zeroStreakLimit).toBeGreaterThan(0)
    }
  })

  it('이름으로 찾을 수 있다', () => {
    expect(findCronExpectation('catalog-health-snapshot')?.label).toBe('카탈로그 위생 스냅숏')
    expect(findCronExpectation('없는-잡')).toBeUndefined()
  })
})
