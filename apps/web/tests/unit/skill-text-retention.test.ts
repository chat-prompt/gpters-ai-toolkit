/**
 * 자유 텍스트 보관 기한 적용 테스트.
 *
 * 지켜야 하는 것은 셋이다 — 기한이 지난 원문만 지울 것, `auto:` 표식은 남길 것,
 * dryRun에서는 아무것도 바꾸지 않을 것.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@gpters/db', () => ({
  db: { select: vi.fn(), update: vi.fn() },
  skillEvents: {
    query: 'skill_events.query',
    context: 'skill_events.context',
    createdAt: 'skill_events.created_at',
  },
}))

vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

const { redactOldSkillText, AUTO_CONTEXT_MARKER, SKILL_TEXT_RETENTION_DAYS } = await import(
  '../../../../packages/lib/src/analytics/skill-text-retention'
)
const { db } = await import('@gpters/db')

/** update 체이닝을 받아 set 값과 rowCount를 기록하는 스텁 */
function updateStub(rowCounts: number[]) {
  const setValues: Array<Record<string, unknown>> = []
  let call = 0
  vi.mocked(db.update).mockImplementation(() => {
    const stub: Record<string, unknown> = {}
    stub.set = vi.fn((values: Record<string, unknown>) => {
      setValues.push(values)
      return stub
    })
    stub.where = vi.fn(() => Promise.resolve({ rowCount: rowCounts[call++] ?? 0 }))
    return stub as never
  })
  return setValues
}

describe('redactOldSkillText', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('검색어는 비우고, 자동 스킵은 표식만 남기고, 사람이 쓴 사유는 비운다', async () => {
    const setValues = updateStub([12, 3, 5])

    const result = await redactOldSkillText()

    expect(result.dryRun).toBe(false)
    expect(result.queries).toBe(12)
    expect(result.autoMarkers).toBe(3)
    expect(result.contexts).toBe(5)
    // 순서와 값이 곧 계약이다 — auto는 NULL이 아니라 표식으로 줄어야 한다
    expect(setValues).toEqual([
      { query: null },
      { context: AUTO_CONTEXT_MARKER },
      { context: null },
    ])
  })

  it('기본 보관 기간은 90일이고 그만큼 이전이 잘림선이다', async () => {
    updateStub([0, 0, 0])
    const before = Date.now()

    const result = await redactOldSkillText()

    const cutoff = new Date(result.cutoff).getTime()
    const expected = before - SKILL_TEXT_RETENTION_DAYS * 24 * 60 * 60 * 1000
    expect(SKILL_TEXT_RETENTION_DAYS).toBe(90)
    expect(Math.abs(cutoff - expected)).toBeLessThan(5_000)
  })

  it('보관 기간을 줄이면 잘림선도 따라 움직인다', async () => {
    updateStub([0, 0, 0])
    const result = await redactOldSkillText({ retentionDays: 7 })
    const days = (Date.now() - new Date(result.cutoff).getTime()) / (24 * 60 * 60 * 1000)
    expect(Math.round(days)).toBe(7)
  })

  it('dryRun은 세기만 하고 한 줄도 바꾸지 않는다', async () => {
    const setValues = updateStub([99, 99, 99])
    vi.mocked(db.select).mockReturnValue({
      from: () => ({ where: () => Promise.resolve([{ queries: 4, contexts: 2, autoMarkers: 1 }]) }),
    } as never)

    const result = await redactOldSkillText({ dryRun: true })

    expect(result).toMatchObject({ dryRun: true, queries: 4, contexts: 2, autoMarkers: 1 })
    expect(db.update).not.toHaveBeenCalled()
    expect(setValues).toEqual([])
  })

  it('셀 것이 없으면 0으로 돌려준다 — 빈 결과에 터지지 않는다', async () => {
    vi.mocked(db.select).mockReturnValue({
      from: () => ({ where: () => Promise.resolve([]) }),
    } as never)

    const result = await redactOldSkillText({ dryRun: true })

    expect(result).toMatchObject({ queries: 0, contexts: 0, autoMarkers: 0 })
  })
})
