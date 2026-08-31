/**
 * 세션 없는 AITK CLI 사건 기록 회귀 테스트.
 *
 * 단발성 REST/JSON-RPC 호출은 mcp_sessions 행이 없어도 감사 로그를 원천 키로 삼아
 * skill_events에 한 번만 기록되어야 한다.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@gpters/db', () => ({
  db: { insert: vi.fn() },
  skillEvents: { name: 'skill_events' },
}))

import {
  recordDeployEvent,
  recordLoadEvent,
  recordOutcomeEvent,
  recordSearchEvents,
} from '@gpters/lib/analytics'
import { db, skillEvents } from '@gpters/db'

function mockIdempotentInsert() {
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined)
  const values = vi.fn().mockReturnValue({ onConflictDoNothing })
  vi.mocked(db.insert).mockReturnValue({ values } as never)
  return { values, onConflictDoNothing }
}

describe('sessionless skill event recording', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('records a REST load with nullable session and audit-log idempotency', async () => {
    const { values, onConflictDoNothing } = mockIdempotentInsert()

    await recordLoadEvent({
      sessionId: null,
      sourceAuditLogId: 'audit-load-1',
      userId: 'user-1',
      skillId: 'eli5-visual',
    })

    expect(db.insert).toHaveBeenCalledWith(skillEvents)
    expect(values).toHaveBeenCalledWith({
      sessionId: null,
      sourceAuditLogId: 'audit-load-1',
      userId: 'user-1',
      skillId: 'eli5-visual',
      action: 'load',
    })
    expect(onConflictDoNothing).toHaveBeenCalledOnce()
  })

  it('records each search result under one audit source without requiring a session', async () => {
    const { values, onConflictDoNothing } = mockIdempotentInsert()

    await recordSearchEvents({
      sourceAuditLogId: 'audit-search-1',
      query: '쉽게 설명',
      results: [{ itemId: 'eli5-visual', rank: 1, score: 0.91 }],
    })

    expect(values).toHaveBeenCalledWith([{
      sessionId: null,
      sourceAuditLogId: 'audit-search-1',
      userId: undefined,
      skillId: 'eli5-visual',
      action: 'search',
      query: '쉽게 설명',
      rank: 1,
      score: 91,
    }])
    expect(onConflictDoNothing).toHaveBeenCalledOnce()
  })

  it('keeps acquisition, application, and deployment as different actions', async () => {
    const { values } = mockIdempotentInsert()

    await recordOutcomeEvent({
      sourceAuditLogId: 'audit-outcome-1',
      skillId: 'eli5-visual',
      applied: true,
      summary: '설명 자료 생성',
    })
    await recordDeployEvent({
      sourceAuditLogId: 'audit-deploy-1',
      skillId: 'eli5-visual',
    })

    expect(values).toHaveBeenNthCalledWith(1, expect.objectContaining({
      sessionId: null,
      action: 'apply',
      sourceAuditLogId: 'audit-outcome-1',
    }))
    expect(values).toHaveBeenNthCalledWith(2, expect.objectContaining({
      sessionId: null,
      action: 'deploy',
      sourceAuditLogId: 'audit-deploy-1',
    }))
  })
})
