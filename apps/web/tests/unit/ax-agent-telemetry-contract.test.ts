import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateAgentTelemetryBatch } from '../../../../packages/lib/src/features/ax/agent-telemetry-contract'

const fixture = JSON.parse(readFileSync(resolve(
  process.cwd(), '../../infra/ax-local/fixtures/agent-telemetry-bbodoong.json'
), 'utf8'))

describe('validateAgentTelemetryBatch', () => {
  it('PII 없는 delta batch fixture를 승인한다', () => {
    const result = validateAgentTelemetryBatch(fixture)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.collection.syntheticSkipped).toBe(17)
      expect(result.data.models.map((row) => row.model)).not.toContain('<synthetic>')
    }
  })

  it('선언하지 않은 raw session/message 식별자를 fail-closed로 거부한다', () => {
    for (const extra of [{ sessionId: 'session-1' }, { messageId: 'msg-1' }, { cwd: '/tmp/repo' }]) {
      const result = validateAgentTelemetryBatch({ ...fixture, ...extra })
      expect(result.ok).toBe(false)
    }
  })

  it('synthetic 모델을 집계에 포함하지 못하게 한다', () => {
    const result = validateAgentTelemetryBatch({
      ...fixture,
      models: [...fixture.models, { ...fixture.models[0], model: '<synthetic>', turns: 0 }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(' ')).toContain('synthetic')
  })

  it('이메일·절대경로·토큰처럼 보이는 값을 거부한다', () => {
    for (const collectorInstanceId of ['owner@example.com', '/Users/person/repo', 'ghp_1234567890abcdef']) {
      const result = validateAgentTelemetryBatch({ ...fixture, collectorInstanceId })
      expect(result.ok).toBe(false)
    }
  })

  it('끝이 시작보다 빠르거나 수집 시각 뒤인 window를 거부한다', () => {
    const reversed = validateAgentTelemetryBatch({
      ...fixture,
      window: { startUtc: fixture.window.endUtc, endUtc: fixture.window.startUtc },
    })
    const future = validateAgentTelemetryBatch({
      ...fixture,
      window: { ...fixture.window, endUtc: '2026-08-27T00:00:00.000Z' },
    })
    expect(reversed.ok).toBe(false)
    expect(future.ok).toBe(false)
  })

  it('thinking token의 output 포함 관계를 반드시 명시한다', () => {
    const usage = { ...fixture.usage }
    delete usage.thinkingTokensRelation
    const result = validateAgentTelemetryBatch({ ...fixture, usage })
    expect(result.ok).toBe(false)
  })

  it('검증된 codex source를 허용하고 아직 미구현인 hermes source는 거부한다', () => {
    expect(validateAgentTelemetryBatch({
      ...fixture,
      collection: { ...fixture.collection, source: 'codex' },
    }).ok).toBe(true)
    expect(validateAgentTelemetryBatch({
      ...fixture,
      collection: { ...fixture.collection, source: 'hermes' },
    }).ok).toBe(false)
  })

  it('카운터 합계가 맞지 않거나 건강도가 blocked인 batch를 거부한다', () => {
    const mismatched = validateAgentTelemetryBatch({
      ...fixture,
      collection: { ...fixture.collection, includedRecords: fixture.collection.includedRecords + 1 },
    })
    const blocked = validateAgentTelemetryBatch({
      ...fixture,
      collection: {
        ...fixture.collection,
        healthStatus: 'blocked',
        healthWarnings: ['high-unsupported-rate'],
      },
    })
    expect(mismatched.ok).toBe(false)
    expect(blocked.ok).toBe(false)
  })
})
