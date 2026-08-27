import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/client.js', () => ({
  jsonRpcSessionCall: vi.fn().mockResolvedValue({ ok: true, data: { success: true } }),
}))
vi.mock('../../src/auth.js', () => ({ resolveToken: vi.fn(() => 'token') }))
vi.mock('../../src/output.js', () => ({
  jsonOut: vi.fn(),
  info: vi.fn(),
  error: vi.fn((message: string) => { throw new Error(message) }),
}))

import { jsonRpcSessionCall } from '../../src/client.js'
import { runReportExecution, runReportExecutionStart } from '../../src/commands/report-execution.js'

describe('aitk report-execution', () => {
  beforeEach(() => vi.clearAllMocks())

  it('검증 결과와 멱등 식별자를 서버 계약 형태로 보낸다', async () => {
    await runReportExecution({
      skillId: 'review-helper',
      skillVersion: '1.2.0',
      status: 'success',
      agent: 'codex',
      agentId: 'codex-reviewer',
      attemptId: '11111111-1111-4111-8111-111111111111',
      eventId: '22222222-2222-4222-8222-222222222222',
      validationMethod: 'test',
      validationPassed: true,
      validationSummary: '단위 테스트 통과',
      userAccepted: true,
      occurredAt: '2026-08-25T00:00:00.000Z',
    })

    expect(jsonRpcSessionCall).toHaveBeenCalledWith(
      'tools/call',
      {
        name: 'report_skill_execution',
        arguments: expect.objectContaining({
          skillId: 'review-helper',
          status: 'success',
          agentId: 'codex-reviewer',
          validation: {
            method: 'test',
            passed: true,
            summary: '단위 테스트 통과',
          },
        }),
      },
      'token',
      { name: 'codex-reviewer', version: '1.2.0' }
    )
  })

  it('검증 방식이 none이면 passed를 null로 고정한다', async () => {
    await runReportExecution({
      skillId: 'draft-helper',
      status: 'partial',
      agent: 'claude-code',
      agentId: 'claude-drafter',
      validationMethod: 'none',
      validationPassed: true,
    })

    const args = vi.mocked(jsonRpcSessionCall).mock.calls[0][1] as {
      arguments: { validation: { passed: boolean | null } }
    }
    expect(args.arguments.validation.passed).toBeNull()
  })

  it('격리 테스트 에이전트와 소스를 구분해 보고한다', async () => {
    await runReportExecution({
      skillId: 'local-skill-60',
      source: 'aitk',
      status: 'success',
      agent: 'test-agent',
      agentId: 'ax-isolated-test-agent',
      validationMethod: 'artifact',
      validationPassed: true,
    })

    const args = vi.mocked(jsonRpcSessionCall).mock.calls[0][1] as {
      arguments: { source: string; agent: string }
    }
    expect(args.arguments).toEqual(expect.objectContaining({ source: 'aitk', agent: 'test-agent' }))
  })

  it('시작 보고는 완료 보고와 공유할 attempt ID를 반환한다', async () => {
    await runReportExecutionStart({
      skillId: 'local-skill-60',
      agent: 'test-agent',
      agentId: 'ax-isolated-test-agent',
      attemptId: '11111111-1111-4111-8111-111111111111',
      eventId: '33333333-3333-4333-8333-333333333333',
      occurredAt: '2026-08-25T00:00:00.000Z',
    })
    const args = vi.mocked(jsonRpcSessionCall).mock.calls[0][1] as {
      name: string
      arguments: { attemptId: string; agentId: string }
    }
    expect(args.name).toBe('report_skill_execution_started')
    expect(args.arguments).toEqual(expect.objectContaining({
      attemptId: '11111111-1111-4111-8111-111111111111',
      agentId: 'ax-isolated-test-agent',
    }))
  })

  it('agent ID를 생략하면 runtime 이름을 안정 식별자로 사용한다', async () => {
    await runReportExecutionStart({
      skillId: 'review-helper',
      agent: 'hermes',
    })

    const args = vi.mocked(jsonRpcSessionCall).mock.calls[0][1] as {
      arguments: { agent: string; agentId: string }
    }
    expect(args.arguments).toEqual(expect.objectContaining({
      agent: 'hermes',
      agentId: 'hermes',
    }))
    expect(vi.mocked(jsonRpcSessionCall).mock.calls[0][3]).toEqual({
      name: 'hermes',
      version: 'local',
    })
  })
})
