import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/client.js', () => ({
  jsonRpcCall: vi.fn().mockResolvedValue({ ok: true, data: { success: true } }),
}))
vi.mock('../../src/auth.js', () => ({ resolveToken: vi.fn(() => 'token') }))
vi.mock('../../src/output.js', () => ({
  jsonOut: vi.fn(),
  info: vi.fn(),
  error: vi.fn((message: string) => { throw new Error(message) }),
}))
vi.mock('../../src/journey.js', () => ({
  resolveJourneyForSkill: vi.fn().mockResolvedValue('44444444-4444-4444-8444-444444444444'),
  markJourneyReported: vi.fn().mockResolvedValue(undefined),
}))

import { jsonRpcCall } from '../../src/client.js'
import { markJourneyReported } from '../../src/journey.js'
import { runReportOutcome } from '../../src/commands/report-outcome.js'

describe('aitk report-outcome journey linkage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('로드에서 찾은 journeyId를 결과 보고에 전달한다', async () => {
    await runReportOutcome({ skillId: 'eli5-visual', applied: true, summary: '설명 생성' })

    expect(jsonRpcCall).toHaveBeenCalledWith(
      'tools/call',
      {
        name: 'report_skill_outcome',
        arguments: expect.objectContaining({
          skillId: 'eli5-visual',
          journeyId: '44444444-4444-4444-8444-444444444444',
        }),
      },
      'token',
    )
    expect(markJourneyReported).toHaveBeenCalledWith('44444444-4444-4444-8444-444444444444')
  })

  it('HTTP 200 안의 MCP tool 오류를 성공으로 처리하지 않는다', async () => {
    vi.mocked(jsonRpcCall).mockResolvedValueOnce({
      ok: true,
      data: { isError: true, content: [{ text: 'invalid journey' }] },
    })

    await expect(runReportOutcome({
      skillId: 'eli5-visual',
      applied: true,
      summary: '설명 생성',
    })).rejects.toThrow('invalid journey')
    expect(markJourneyReported).not.toHaveBeenCalled()
  })
})
