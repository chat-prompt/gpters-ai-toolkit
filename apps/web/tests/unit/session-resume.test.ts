/**
 * 마감된 세션에 다시 활동이 오면 되살아나는지 검증한다.
 *
 * 30분 무활동으로 마감하는 것은 "끝났다고 치자"는 **추정**이지 사실이 아니다. 실제로 이어서 쓰면
 * 그 추정이 틀린 것이므로 되돌려야 한다.
 *
 * 되살리지 않으면 `finalizeStaleSessions`가 `status='active'`만 고르기 때문에 다시 마감되지 않고,
 * 마감 시점에 계산한 지속 시간·전환 플래그가 **그 뒤 활동을 반영하지 못한 채 굳는다.**
 * 2026-09-07 운영 실측으로 그런 세션 69건, 최대 어긋남 4.1일을 확인했다.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

/** `onConflictDoUpdate`에 넘어간 인자를 붙잡아 둔다 */
const captured: { set?: Record<string, unknown> } = {}

vi.mock('@gpters/db', async () => {
  const actual = await vi.importActual<typeof import('@gpters/db')>('@gpters/db')
  return {
    ...actual,
    db: {
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: (arg: { set: Record<string, unknown> }) => {
            captured.set = arg.set
            return Promise.resolve()
          },
        }),
      }),
    },
  }
})

const { upsertSessionSummary } = await import('@gpters/lib/analytics')

describe('세션 재활동', () => {
  beforeEach(() => {
    captured.set = undefined
  })

  it('마감된 세션에 요청이 오면 status를 active로 되돌린다', async () => {
    await upsertSessionSummary({
      sessionId: 'sess-1',
      tool: 'semantic_search',
      isSuccess: true,
    } as Parameters<typeof upsertSessionSummary>[0])

    expect(captured.set).toBeDefined()
    expect(captured.set?.status).toBe('active')
  })

  it('마지막 활동 시각도 함께 앞당긴다 — 되살리기만 하고 시각을 안 고치면 바로 다시 마감된다', async () => {
    await upsertSessionSummary({
      sessionId: 'sess-2',
      tool: 'get_plugin_content',
      isSuccess: true,
    } as Parameters<typeof upsertSessionSummary>[0])

    expect(captured.set?.lastActivityAt).toBeInstanceOf(Date)
  })
})
