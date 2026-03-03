/**
 * Tests for search-metrics constants and ZERO_RESULT_SKILL_ID sentinel
 *
 * Validates the zero-result rate measurement definitions, constants,
 * and the recordSearchEvents behavior for zero-result searches.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the database before importing the module under test
vi.mock('@gpters/db', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    execute: vi.fn(),
  },
  skillEvents: { name: 'skill_events' },
  mcpSessions: { name: 'mcp_sessions' },
}))

import {
  ZERO_RESULT_SKILL_ID,
  SCOPE_B_CLIENT_TYPES,
  MIN_SAMPLE_SIZE,
  ZERO_RESULT_TARGET_PCT,
} from '@gpters/lib/analytics'
import { recordSearchEvents } from '@gpters/lib/analytics'
import { db, skillEvents } from '@gpters/db'

describe('search-metrics constants', () => {
  it('should define ZERO_RESULT_SKILL_ID as __zero_result__', () => {
    expect(ZERO_RESULT_SKILL_ID).toBe('__zero_result__')
  })

  it('should include all expected client types in SCOPE_B', () => {
    expect(SCOPE_B_CLIENT_TYPES).toContain('claude_code')
    expect(SCOPE_B_CLIENT_TYPES).toContain('opencode')
    expect(SCOPE_B_CLIENT_TYPES).toContain('codex')
    expect(SCOPE_B_CLIENT_TYPES).toHaveLength(3)
  })

  it('should set minimum sample size to 100', () => {
    expect(MIN_SAMPLE_SIZE).toBe(100)
  })

  it('should set zero-result target to 10%', () => {
    expect(ZERO_RESULT_TARGET_PCT).toBe(10)
  })
})

describe('recordSearchEvents — zero-result handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should record zero-result event when results array is empty', async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined)
    ;(db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues })

    await recordSearchEvents({
      sessionId: 'test-session',
      userId: 'user-1',
      query: 'nonexistent skill',
      results: [],
    })

    expect(db.insert).toHaveBeenCalledWith(skillEvents)
    expect(mockValues).toHaveBeenCalledWith({
      sessionId: 'test-session',
      userId: 'user-1',
      skillId: '__zero_result__',
      action: 'search',
      query: 'nonexistent skill',
      rank: 0,
      score: 0,
    })
  })

  it('should record normal search events when results exist', async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined)
    ;(db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues })

    await recordSearchEvents({
      sessionId: 'test-session',
      query: 'code review',
      results: [
        { itemId: 'code-reviewer', rank: 1, score: 0.85 },
        { itemId: 'lint-helper', rank: 2, score: 0.60 },
      ],
    })

    expect(db.insert).toHaveBeenCalledWith(skillEvents)
    expect(mockValues).toHaveBeenCalledWith([
      {
        sessionId: 'test-session',
        userId: undefined,
        skillId: 'code-reviewer',
        action: 'search',
        query: 'code review',
        rank: 1,
        score: 85,
      },
      {
        sessionId: 'test-session',
        userId: undefined,
        skillId: 'lint-helper',
        action: 'search',
        query: 'code review',
        rank: 2,
        score: 60,
      },
    ])
  })

  it('should not throw on DB error (fire-and-forget)', async () => {
    ;(db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('DB connection failed')),
    })

    // Should not throw
    await expect(
      recordSearchEvents({
        sessionId: 'test-session',
        query: 'test',
        results: [],
      })
    ).resolves.toBeUndefined()
  })
})
