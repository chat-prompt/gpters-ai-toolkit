/**
 * AX 사용량 리포트 수신 계약 테스트
 *
 * CLI(보내는 쪽)와 API 라우트(받는 쪽)가 공유하는 계약이므로,
 * 이 테스트가 두 구현의 실행 가능한 명세 역할을 한다.
 */

import { describe, it, expect } from 'vitest'
import { validateUsageReport } from '../../../../packages/lib/src/features/ax/usage-report'

/** 통과하는 최소 레코드 */
function record(overrides: Record<string, unknown> = {}) {
  return {
    client: 'codex',
    planRaw: 'prolite',
    plan: 'ChatGPT Pro (lite)',
    periodStart: '2026-07-31T00:00:00.000Z',
    periodEnd: '2026-08-07T00:00:00.000Z',
    inputTokens: 100,
    outputTokens: 50,
    cachedTokens: 850,
    sessions: 3,
    models: { 'gpt-5.6-sol': 1000 },
    limitUsedPercent: 43,
    limitResetsAt: '2026-08-13T00:48:51.000Z',
    ...overrides,
  }
}

function expectErrors(input: unknown): string[] {
  const result = validateUsageReport(input)
  expect(result.ok).toBe(false)
  return result.ok ? [] : result.errors
}

describe('validateUsageReport', () => {
  it('정상 payload를 통과시킨다', () => {
    const result = validateUsageReport({ records: [record()] })
    expect(result.ok).toBe(true)
  })

  it('한도를 보고하지 않는 클라이언트는 null을 허용한다', () => {
    // 최신 한도 스냅샷을 얻지 못했으면 0이 아니라 null이어야 한다.
    const result = validateUsageReport({
      records: [record({ client: 'claude-code', limitUsedPercent: null, limitResetsAt: null })],
    })
    expect(result.ok).toBe(true)
  })

  it('memberName은 계약에 없다 — 보내도 무시하고 서버 세션에서 유도한다', () => {
    const result = validateUsageReport({ records: [record()], memberName: '남의이름' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload).not.toHaveProperty('memberName')
      expect(Object.keys(result.payload)).toEqual(['records'])
    }
  })

  it('알 수 없는 클라이언트를 거부한다', () => {
    expect(expectErrors({ records: [record({ client: 'cursor' })] }).join()).toContain('client')
  })

  it('음수·소수 토큰을 거부한다', () => {
    expect(expectErrors({ records: [record({ inputTokens: -1 })] }).join()).toContain('inputTokens')
    expect(expectErrors({ records: [record({ sessions: 1.5 })] }).join()).toContain('sessions')
  })

  it('한도 범위를 벗어나면 거부한다', () => {
    expect(expectErrors({ records: [record({ limitUsedPercent: 101 })] }).join()).toContain(
      'limitUsedPercent'
    )
  })

  it('구간이 뒤집혔거나 지나치게 길면 거부한다', () => {
    expect(
      expectErrors({
        records: [record({ periodStart: '2026-08-07T00:00:00Z', periodEnd: '2026-07-31T00:00:00Z' })],
      }).join()
    ).toContain('periodEnd')

    expect(
      expectErrors({
        records: [record({ periodStart: '2020-01-01T00:00:00Z', periodEnd: '2026-01-01T00:00:00Z' })],
      }).join()
    ).toContain('90일')
  })

  it('같은 클라이언트·구간이 중복되면 거부한다', () => {
    // 서버가 어느 쪽을 남길지 임의로 정하게 두지 않는다
    expect(expectErrors({ records: [record(), record()] }).join()).toContain('중복')
  })

  it('빈 배열은 수집기 점검 신호로 허용하고 과도한 건수는 거부한다', () => {
    expect(validateUsageReport({ records: [] })).toEqual({ ok: true, payload: { records: [] } })
    const many = Array.from({ length: 21 }, (_, i) =>
      record({ periodStart: `2026-07-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` })
    )
    expect(expectErrors({ records: many }).join()).toContain('20건')
  })

  it('본문이 객체가 아니거나 records가 없으면 거부한다', () => {
    expect(expectErrors(null).join()).toContain('객체')
    expect(expectErrors({}).join()).toContain('records')
  })
})
