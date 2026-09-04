import { describe, expect, it } from 'vitest'
import { validateSkillExecutionReport } from '../../../../packages/lib/src/features/ax/execution-report'

const VALID = {
  eventId: '22222222-2222-4222-8222-222222222222',
  attemptId: '11111111-1111-4111-8111-111111111111',
  source: 'aitk',
  skillId: 'review-helper',
  skillVersion: '1.2.0',
  agent: 'codex',
  agentId: 'codex-reviewer',
  status: 'success',
  failureStage: null,
  errorCode: null,
  validation: { method: 'test', passed: true, summary: '단위 테스트 통과' },
  userAccepted: null,
  occurredAt: '2026-08-25T00:00:00.000Z',
}

describe('validateSkillExecutionReport', () => {
  it('검증 가능한 성공 시도를 정규화한다', () => {
    const result = validateSkillExecutionReport(VALID)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.occurredAt).toBe('2026-08-25T00:00:00.000Z')
  })

  it('검증 실패를 success로 보고하지 못하게 한다', () => {
    const result = validateSkillExecutionReport({
      ...VALID,
      validation: { method: 'test', passed: false, summary: '실패' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toContain('success cannot have failed validation')
  })

  it('인증정보나 연결 문자열로 보이는 요약을 거부한다', () => {
    const result = validateSkillExecutionReport({
      ...VALID,
      validation: { method: 'command', passed: true, summary: 'postgresql://user:password@host/db' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(' ')).toContain('credentials')
  })

  it('멱등 식별자는 UUID만 허용한다', () => {
    const result = validateSkillExecutionReport({ ...VALID, eventId: 'retry-1' })
    expect(result.ok).toBe(false)
  })

  it('journeyId는 선택값이지만 전달되면 UUID여야 한다', () => {
    const legacy = validateSkillExecutionReport(VALID)
    expect(legacy.ok && legacy.data.journeyId).toBeNull()

    const linked = validateSkillExecutionReport({
      ...VALID,
      journeyId: '33333333-3333-4333-8333-333333333333',
    })
    expect(linked.ok && linked.data.journeyId).toBe('33333333-3333-4333-8333-333333333333')
    expect(validateSkillExecutionReport({ ...VALID, journeyId: 'not-a-uuid' }).ok).toBe(false)
  })

  it('격리 테스트 에이전트 런타임을 명시적으로 구분한다', () => {
    const result = validateSkillExecutionReport({ ...VALID, agent: 'test-agent' })
    expect(result.ok).toBe(true)
  })

  it('Hermes 런타임의 실행 결과를 별도 소스로 받는다', () => {
    const result = validateSkillExecutionReport({ ...VALID, agent: 'hermes', agentId: 'bbokeoter' })
    expect(result.ok).toBe(true)
  })

  it('모델은 선택값이고, 미보고는 추정하지 않고 null로 남는다', () => {
    const unreported = validateSkillExecutionReport(VALID)
    expect(unreported.ok && unreported.data.model).toBeNull()

    const reported = validateSkillExecutionReport({ ...VALID, model: 'Claude-Opus-5' })
    // 대소문자만 정규화한다. 값 자체는 보고된 그대로 남겨야 나중에 대조가 된다.
    expect(reported.ok && reported.data.model).toBe('claude-opus-5')

    const namespaced = validateSkillExecutionReport({ ...VALID, model: 'anthropic/claude-sonnet-4-5-20250929' })
    expect(namespaced.ok && namespaced.data.model).toBe('anthropic/claude-sonnet-4-5-20250929')
  })

  it('모델 자리에 자유 문장이나 과도하게 긴 값을 받지 않는다', () => {
    const prose = validateSkillExecutionReport({ ...VALID, model: '아마 오퍼스일 것 같음' })
    expect(prose.ok).toBe(false)
    if (!prose.ok) expect(prose.errors.join(' ')).toContain('model must be a model identifier')

    const tooLong = validateSkillExecutionReport({ ...VALID, model: 'a'.repeat(65) })
    expect(tooLong.ok).toBe(false)
  })

  it('실행 시작 payload를 완료와 같은 attemptId 계약으로 검증한다', async () => {
    const { validateSkillExecutionStart } = await import(
      '../../../../packages/lib/src/features/ax/execution-report'
    )
    const result = validateSkillExecutionStart({
      eventId: VALID.eventId,
      attemptId: VALID.attemptId,
      source: VALID.source,
      skillId: VALID.skillId,
      skillVersion: VALID.skillVersion,
      agent: VALID.agent,
      agentId: VALID.agentId,
      model: 'gpt-5-codex',
      occurredAt: VALID.occurredAt,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.model).toBe('gpt-5-codex')
  })
})
