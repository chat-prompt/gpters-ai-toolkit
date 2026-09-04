import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/client.js', () => ({
  jsonRpcCall: vi.fn().mockResolvedValue({ ok: true, data: { success: true } }),
}))
vi.mock('../../src/auth.js', () => ({ resolveToken: vi.fn(() => 'token') }))
vi.mock('../../src/config.js', () => ({
  readConfig: vi.fn(() => ({ serverUrl: 'https://test.example.com', searchMethod: 'cli' })),
}))
vi.mock('../../src/output.js', () => ({
  jsonOut: vi.fn(),
  info: vi.fn(),
  error: vi.fn((message: string) => { throw new Error(message) }),
}))
vi.mock('../../src/journey.js', () => ({
  resolveJourneyForSkill: vi.fn().mockResolvedValue('44444444-4444-4444-8444-444444444444'),
  resolveJourneyForAttempt: vi.fn().mockResolvedValue('44444444-4444-4444-8444-444444444444'),
  rememberExecutionAttempt: vi.fn().mockResolvedValue(undefined),
  markJourneyReported: vi.fn().mockResolvedValue(undefined),
}))

import { jsonRpcCall } from '../../src/client.js'
import { readConfig } from '../../src/config.js'
import { runReportExecution, runReportExecutionStart } from '../../src/commands/report-execution.js'

describe('aitk report-execution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.AITK_AGENT_ID
    vi.mocked(readConfig).mockReturnValue({ serverUrl: 'https://test.example.com', searchMethod: 'cli' })
  })

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

    expect(jsonRpcCall).toHaveBeenCalledWith(
      'tools/call',
      {
        name: 'report_skill_execution',
        arguments: expect.objectContaining({
          skillId: 'review-helper',
          status: 'success',
          agentId: 'codex-reviewer',
          journeyId: '44444444-4444-4444-8444-444444444444',
          validation: {
            method: 'test',
            passed: true,
            summary: '단위 테스트 통과',
          },
        }),
      },
      'token'
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

    const args = vi.mocked(jsonRpcCall).mock.calls[0][1] as {
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

    const args = vi.mocked(jsonRpcCall).mock.calls[0][1] as {
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
    const args = vi.mocked(jsonRpcCall).mock.calls[0][1] as {
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

    const args = vi.mocked(jsonRpcCall).mock.calls[0][1] as {
      arguments: { agent: string; agentId: string }
    }
    expect(args.arguments).toEqual(expect.objectContaining({
      agent: 'hermes',
      agentId: 'hermes',
    }))
    expect(vi.mocked(jsonRpcCall).mock.calls[0]).toHaveLength(3)
  })

  it('agent ID를 생략하면 설정의 안정 ID를 runtime 이름보다 우선한다', async () => {
    vi.mocked(readConfig).mockReturnValue({
      serverUrl: 'https://test.example.com',
      searchMethod: 'cli',
      agentId: 'bbodoong',
    })

    await runReportExecutionStart({ skillId: 'review-helper', agent: 'openclaw' })

    const args = vi.mocked(jsonRpcCall).mock.calls[0][1] as { arguments: { agentId: string } }
    expect(args.arguments.agentId).toBe('bbodoong')
  })

  it('모델은 밝힌 그대로 보내고, 생략하면 null로 보낸다', async () => {
    await runReportExecutionStart({ skillId: 'review-helper', agent: 'codex', model: 'gpt-5-codex' })
    const started = vi.mocked(jsonRpcCall).mock.calls[0][1] as { arguments: { model: string | null } }
    expect(started.arguments.model).toBe('gpt-5-codex')

    vi.clearAllMocks()
    // 모델을 모르는 에이전트는 자리를 비운다. 여기에 런타임 이름을 대신 넣으면 추정이 된다.
    await runReportExecutionStart({ skillId: 'review-helper', agent: 'codex' })
    const anonymous = vi.mocked(jsonRpcCall).mock.calls[0][1] as { arguments: { model: string | null } }
    expect(anonymous.arguments.model).toBeNull()

    vi.clearAllMocks()
    await runReportExecution({ skillId: 'review-helper', status: 'success', agent: 'codex', model: 'claude-opus-5' })
    const completed = vi.mocked(jsonRpcCall).mock.calls[0][1] as { arguments: { model: string | null } }
    expect(completed.arguments.model).toBe('claude-opus-5')
  })

  it('환경변수의 안정 ID를 로컬 설정보다 우선한다', async () => {
    process.env.AITK_AGENT_ID = 'bbokeoter'
    vi.mocked(readConfig).mockReturnValue({
      serverUrl: 'https://test.example.com',
      searchMethod: 'cli',
      agentId: 'shared-default',
    })

    await runReportExecutionStart({ skillId: 'review-helper', agent: 'hermes' })

    const args = vi.mocked(jsonRpcCall).mock.calls[0][1] as { arguments: { agentId: string } }
    expect(args.arguments.agentId).toBe('bbokeoter')
  })

  it('빈 환경변수는 무시하고 로컬 설정의 안정 ID를 사용한다', async () => {
    process.env.AITK_AGENT_ID = '  '
    vi.mocked(readConfig).mockReturnValue({
      serverUrl: 'https://test.example.com',
      searchMethod: 'cli',
      agentId: 'bbodoong',
    })

    await runReportExecutionStart({ skillId: 'review-helper', agent: 'openclaw' })

    const args = vi.mocked(jsonRpcCall).mock.calls[0][1] as { arguments: { agentId: string } }
    expect(args.arguments.agentId).toBe('bbodoong')
  })
})
