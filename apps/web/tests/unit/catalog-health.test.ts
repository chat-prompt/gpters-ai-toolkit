/**
 * 카탈로그 위생 추세 판정 테스트.
 *
 * 추세는 "나빠지고 있나"를 말해야 하고, **판정할 수 없을 때 0이라고 말하면 안 된다**.
 * 스냅숏이 하루치뿐이면 아직 아무것도 모르는 상태다.
 */

import { describe, expect, it } from 'vitest'
import {
  summarizeCatalogTrend,
  type CatalogHealthSnapshot,
} from '../../../../packages/lib/src/features/ax/catalog-health'

function snapshot(date: string, overrides: Partial<CatalogHealthSnapshot> = {}): CatalogHealthSnapshot {
  return {
    snapshotDate: date,
    totalItems: 491,
    neverLoaded: 312,
    neverApplied: 391,
    singleUserApplied: 73,
    duplicateGroups: 8,
    duplicateItems: 20,
    nearIdenticalPairs: 12,
    ...overrides,
  }
}

describe('summarizeCatalogTrend', () => {
  it('스냅숏이 두 줄 미만이면 판정하지 않는다 — 0이 아니라 미관측이다', () => {
    expect(summarizeCatalogTrend([])).toBeNull()
    expect(summarizeCatalogTrend([snapshot('2026-09-07')])).toBeNull()
  })

  it('중복 묶음이 늘면 나빠지는 것으로 본다', () => {
    const result = summarizeCatalogTrend([
      snapshot('2026-09-01', { duplicateGroups: 8 }),
      snapshot('2026-09-07', { duplicateGroups: 11 }),
    ])
    expect(result).toMatchObject({ duplicateGroupsDelta: 3, worsening: true, from: '2026-09-01', to: '2026-09-07' })
  })

  it('미사용이 늘어도 나빠지는 것으로 본다', () => {
    const result = summarizeCatalogTrend([
      snapshot('2026-09-01', { neverLoaded: 312 }),
      snapshot('2026-09-07', { neverLoaded: 340 }),
    ])
    expect(result).toMatchObject({ neverLoadedDelta: 28, worsening: true })
  })

  it('둘 다 줄면 나빠지는 것이 아니다', () => {
    const result = summarizeCatalogTrend([
      snapshot('2026-09-01', { duplicateGroups: 11, neverLoaded: 340 }),
      snapshot('2026-09-07', { duplicateGroups: 8, neverLoaded: 312 }),
    ])
    expect(result).toMatchObject({ duplicateGroupsDelta: -3, neverLoadedDelta: -28, worsening: false })
  })

  it('중간이 출렁여도 처음과 마지막으로만 판정한다 — 하루치 흔들림에 반응하지 않는다', () => {
    const result = summarizeCatalogTrend([
      snapshot('2026-09-01', { duplicateGroups: 8 }),
      snapshot('2026-09-02', { duplicateGroups: 20 }),
      snapshot('2026-09-03', { duplicateGroups: 2 }),
      snapshot('2026-09-07', { duplicateGroups: 8 }),
    ])
    expect(result).toMatchObject({ duplicateGroupsDelta: 0, worsening: false })
  })

  it('변화가 없으면 나빠지는 것이 아니다', () => {
    const result = summarizeCatalogTrend([snapshot('2026-09-01'), snapshot('2026-09-07')])
    expect(result?.worsening).toBe(false)
  })
})
