/**
 * Tests for recordAutoSkipEvents
 *
 * Verifies that unreported skills get auto-skip events recorded
 * on session end, while already-reported skills are excluded.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the database before importing the module under test
vi.mock('@gpters/db', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
  skillEvents: { name: 'skill_events' },
}))

import { recordAutoSkipEvents } from '@gpters/lib/analytics'
import { db } from '@gpters/db'

describe('recordAutoSkipEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('records skip events for loaded-but-unreported skills', async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined)
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as never)

    await recordAutoSkipEvents({
      sessionId: 'sess-1',
      userId: 'user-1',
      loadedSkillIds: ['skill-a', 'skill-b', 'skill-c'],
      reportedSkillIds: ['skill-b'],
    })

    expect(db.insert).toHaveBeenCalledOnce()
    expect(mockValues).toHaveBeenCalledWith([
      {
        sessionId: 'sess-1',
        userId: 'user-1',
        skillId: 'skill-a',
        action: 'skip',
        context: 'auto: 세션 종료까지 명시적 보고 없음',
      },
      {
        sessionId: 'sess-1',
        userId: 'user-1',
        skillId: 'skill-c',
        action: 'skip',
        context: 'auto: 세션 종료까지 명시적 보고 없음',
      },
    ])
  })

  it('does nothing when all loaded skills are reported', async () => {
    await recordAutoSkipEvents({
      sessionId: 'sess-2',
      loadedSkillIds: ['skill-a', 'skill-b'],
      reportedSkillIds: ['skill-a', 'skill-b'],
    })

    expect(db.insert).not.toHaveBeenCalled()
  })

  it('does nothing when no skills were loaded', async () => {
    await recordAutoSkipEvents({
      sessionId: 'sess-3',
      loadedSkillIds: [],
      reportedSkillIds: [],
    })

    expect(db.insert).not.toHaveBeenCalled()
  })

  it('records all skills as skip when none are reported', async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined)
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as never)

    await recordAutoSkipEvents({
      sessionId: 'sess-4',
      loadedSkillIds: ['skill-x', 'skill-y'],
      reportedSkillIds: [],
    })

    expect(db.insert).toHaveBeenCalledOnce()
    expect(mockValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ skillId: 'skill-x', action: 'skip' }),
        expect.objectContaining({ skillId: 'skill-y', action: 'skip' }),
      ])
    )
  })

  it('does not throw on database error', async () => {
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('DB error')),
    } as never)

    await expect(
      recordAutoSkipEvents({
        sessionId: 'sess-5',
        loadedSkillIds: ['skill-a'],
        reportedSkillIds: [],
      })
    ).resolves.not.toThrow()
  })

  it('passes userId as undefined when not provided', async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined)
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as never)

    await recordAutoSkipEvents({
      sessionId: 'sess-6',
      loadedSkillIds: ['skill-a'],
      reportedSkillIds: [],
    })

    expect(mockValues).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: undefined,
        skillId: 'skill-a',
      }),
    ])
  })
})
