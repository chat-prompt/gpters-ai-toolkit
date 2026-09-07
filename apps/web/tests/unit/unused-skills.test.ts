/**
 * 정리 후보 선별 테스트.
 *
 * 이 목록이 신뢰를 잃는 경로는 둘이다 — 새 스킬을 후보로 올리는 것, 중복을 두 번 세는 것.
 * 둘 다 여기서 막는다.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@gpters/db', () => ({
  db: { select: vi.fn() },
  catalogItems: { id: 'c.id', name: 'c.name', type: 'c.type', status: 'c.status', authorId: 'c.author_id', createdAt: 'c.created_at' },
  skillEvents: { skillId: 'e.skill_id', action: 'e.action' },
  users: { id: 'u.id', name: 'u.name' },
}))
vi.mock('../../../../packages/lib/src/core/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

const { computeUnusedSkills, NEW_SKILL_GRACE_DAYS } = await import(
  '../../../../packages/lib/src/features/ax/unused-skills'
)
const { db } = await import('@gpters/db')

const DAY = 24 * 60 * 60 * 1000

function row(overrides: Record<string, unknown>) {
  return {
    id: 'skill', name: 'skill', authorName: '누군가',
    createdAt: new Date(Date.now() - 200 * DAY), loads: 0, shown: 0,
    ...overrides,
  }
}

function queue(rows: unknown[]) {
  vi.mocked(db.select).mockReturnValue({
    from: () => ({ leftJoin: () => ({ where: () => Promise.resolve(rows) }) }),
  } as never)
}

describe('computeUnusedSkills', () => {
  beforeEach(() => vi.clearAllMocks())

  it('로드가 있는 스킬은 후보가 아니다', async () => {
    queue([row({ id: 'used', loads: 3 }), row({ id: 'unused' })])
    const data = await computeUnusedSkills(new Set())
    expect(data.neverLoaded).toBe(1)
    expect(data.rows.map((r) => r.id)).toEqual(['unused'])
  })

  it('만든 지 유예 기간이 안 된 스킬은 뺀다 — 안 쓰인 게 당연하다', async () => {
    queue([
      row({ id: 'brand-new', createdAt: new Date(Date.now() - 3 * DAY) }),
      row({ id: 'old-enough', createdAt: new Date(Date.now() - (NEW_SKILL_GRACE_DAYS + 1) * DAY) }),
    ])
    const data = await computeUnusedSkills(new Set())
    expect(data.neverLoaded).toBe(2)
    expect(data.candidates).toBe(1)
    expect(data.rows.map((r) => r.id)).toEqual(['old-enough'])
  })

  it('중복 묶음에 걸린 것은 여기서 빼고 따로 센다 — 두 번 처리하지 않게', async () => {
    queue([row({ id: 'dupe' }), row({ id: 'plain' })])
    const data = await computeUnusedSkills(new Set(['dupe']))
    expect(data.excludedAsDuplicate).toBe(1)
    expect(data.rows.map((r) => r.id)).toEqual(['plain'])
  })

  it('검색에 뜨는 것부터 보여준다 — 검색 자리를 차지하고 있다', async () => {
    queue([
      row({ id: 'quiet', shown: 0 }),
      row({ id: 'noisy', shown: 130 }),
      row({ id: 'middle', shown: 20 }),
    ])
    const data = await computeUnusedSkills(new Set())
    expect(data.rows.map((r) => r.id)).toEqual(['noisy', 'middle', 'quiet'])
    expect(data.shownButUnused).toBe(2)
  })

  it('노출이 같으면 오래된 것부터', async () => {
    queue([
      row({ id: 'newer', shown: 5, createdAt: new Date(Date.now() - 40 * DAY) }),
      row({ id: 'older', shown: 5, createdAt: new Date(Date.now() - 300 * DAY) }),
    ])
    const data = await computeUnusedSkills(new Set())
    expect(data.rows.map((r) => r.id)).toEqual(['older', 'newer'])
  })

  it('등록자별로 묶어 센다 — 한 사람에게 한꺼번에 묻지 않기 위한 근거', async () => {
    queue([
      row({ id: 'a', authorName: '현진우' }),
      row({ id: 'b', authorName: '현진우' }),
      row({ id: 'c', authorName: null }),
    ])
    const data = await computeUnusedSkills(new Set())
    expect(data.byAuthor[0]).toEqual({ authorName: '현진우', count: 2 })
    expect(data.byAuthor).toContainEqual({ authorName: null, count: 1 })
  })

  it('후보가 없어도 터지지 않는다', async () => {
    queue([])
    const data = await computeUnusedSkills(new Set())
    expect(data).toMatchObject({ totalItems: 0, neverLoaded: 0, candidates: 0, rows: [], byAuthor: [] })
  })
})
