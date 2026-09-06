/**
 * 사람 대 에이전트 로드 비교의 집계 규칙 테스트.
 *
 * 이 비교가 지켜야 하는 것은 세 가지다 — 배치를 하루에 쪼개 배분하지 않을 것,
 * 스킬을 못 보는 수집기의 배치를 0으로 세지 않을 것, 관측 못 한 날과 0건인 날을 구분할 것.
 */

import { describe, expect, it } from 'vitest'
import { aggregateAgentLoads } from '../../../../packages/lib/src/features/ax/skills'

function batch(overrides: Partial<Parameters<typeof aggregateAgentLoads>[0][number]> = {}) {
  return {
    source: 'hermes',
    runtime: { collectorVersion: '0.7.8' },
    windowStart: new Date('2026-09-03T01:00:00Z'),
    windowEnd: new Date('2026-09-03T03:00:00Z'),
    skillLoads: [{ skillId: 'browse', loaded: 2 }],
    ...overrides,
  }
}

const DAYS = ['2026-09-02', '2026-09-03', '2026-09-04']

describe('aggregateAgentLoads', () => {
  it('하루 안에 들어오는 배치의 로드를 그날에 더한다', () => {
    const result = aggregateAgentLoads([batch(), batch({ skillLoads: [{ skillId: 'humanizer', loaded: 3 }] })], DAYS)
    expect(result.byDay.get('2026-09-03')).toBe(5)
    expect(result.excludedBatches).toBe(0)
  })

  it('하루 경계를 걸친 배치는 통째로 뺀다', () => {
    // 배치는 내부 시간 분포를 보존하지 않는다. 절반씩 나눠 넣는 순간 실측이 아니라 추정이 된다.
    const result = aggregateAgentLoads(
      [batch({ windowStart: new Date('2026-09-03T23:00:00Z'), windowEnd: new Date('2026-09-04T01:00:00Z') })],
      DAYS
    )
    expect(result.excludedBatches).toBe(1)
    expect(result.byDay.get('2026-09-03')).toBeUndefined()
    expect(result.byDay.get('2026-09-04')).toBeUndefined()
  })

  it('스킬을 못 보는 수집기의 배치는 0이 아니라 미관측이다', () => {
    // codex는 스킬 신호를 담지 못한다. 0으로 세면 "안 썼다"로 읽힌다.
    const result = aggregateAgentLoads([batch({ source: 'codex', skillLoads: [] })], DAYS)
    expect(result.unobservedBatches).toBe(1)
    expect(result.observedDays.size).toBe(0)
  })

  it('최소 버전에 못 미치는 수집기도 미관측으로 센다', () => {
    const result = aggregateAgentLoads([batch({ runtime: { collectorVersion: '0.7.4' } })], DAYS)
    expect(result.unobservedBatches).toBe(1)
    expect(result.observedDays.size).toBe(0)
  })

  it('모르는 소스는 미관측이다 — 새 소스가 조용히 0으로 섞이면 안 된다', () => {
    const result = aggregateAgentLoads([batch({ source: 'brand-new-runtime' })], DAYS)
    expect(result.unobservedBatches).toBe(1)
    expect(result.observedDays.size).toBe(0)
  })

  it('관측은 했는데 로드가 없던 날은 0으로 채운다 (미관측과 갈린다)', () => {
    const result = aggregateAgentLoads([batch({ skillLoads: [] })], DAYS)
    expect(result.observedDays.has('2026-09-03')).toBe(true)
    expect(result.byDay.get('2026-09-03')).toBe(0)
    // 배치가 아예 없던 날은 채우지 않는다 — 화면에서 null(미관측)로 나간다
    expect(result.byDay.has('2026-09-02')).toBe(false)
  })

  it('loaded가 없거나 숫자가 아니면 0으로 본다', () => {
    const result = aggregateAgentLoads(
      [batch({ skillLoads: [{ skillId: 'a' }, { skillId: 'b', loaded: 'many' }, { skillId: 'c', loaded: 4 }] })],
      DAYS
    )
    expect(result.byDay.get('2026-09-03')).toBe(4)
  })
})
