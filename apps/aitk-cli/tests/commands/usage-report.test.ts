/**
 * aitk usage report 명령어 테스트 — 수집 결과를 어떻게 다루는지만 본다
 * (집계 규칙 자체는 tests/usage/collectors.test.ts가 검증한다)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UsageRecord } from '../../src/usage/types.js'

const collected = vi.hoisted(() => ({ claude: null as UsageRecord | null, codex: null as UsageRecord | null }))

vi.mock('../../src/usage/claude-code.js', () => ({ collectClaudeCode: async () => collected.claude }))
vi.mock('../../src/usage/codex.js', () => ({ collectCodex: async () => collected.codex }))
vi.mock('../../src/client.js', () => ({ jsonRpcCall: vi.fn().mockResolvedValue({ ok: true, data: { ok: true } }) }))
vi.mock('../../src/auth.js', () => ({ resolveToken: vi.fn(() => 'tok') }))
vi.mock('../../src/output.js', () => ({
  jsonOut: vi.fn(),
  info: vi.fn(),
  error: vi.fn(() => {
    throw new Error('exit')
  }),
}))

import { runUsageReport } from '../../src/commands/usage-report.js'
import { jsonRpcCall } from '../../src/client.js'
import { resolveToken } from '../../src/auth.js'
import { jsonOut, error } from '../../src/output.js'

const RECORD: UsageRecord = {
  client: 'claude-code',
  planRaw: 'default_claude_max_20x',
  plan: 'Claude Max 20x',
  periodStart: '2026-07-31T00:00:00.000Z',
  periodEnd: '2026-08-07T00:00:00.000Z',
  inputTokens: 10,
  outputTokens: 5,
  cachedTokens: 40,
  sessions: 1,
  models: { 'claude-opus-5': 55 },
  limitUsedPercent: null,
  limitResetsAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  collected.claude = RECORD
  collected.codex = null
})

describe('aitk usage report', () => {
  it('수집한 레코드를 report_usage 툴로 보낸다', async () => {
    await runUsageReport({ days: 7, dryRun: false })

    expect(jsonRpcCall).toHaveBeenCalledWith(
      'tools/call',
      { name: 'report_usage', arguments: { records: [RECORD] } },
      'tok'
    )
  })

  it('--dry-run은 전송하지 않고 인증도 요구하지 않는다', async () => {
    await runUsageReport({ days: 7, dryRun: true })

    expect(jsonRpcCall).not.toHaveBeenCalled()
    expect(resolveToken).not.toHaveBeenCalled()
    expect(jsonOut).toHaveBeenCalledWith({ records: [RECORD] })
  })

  it('집계 구간이 계약 상한(90일)을 넘으면 보내기 전에 막는다', async () => {
    await expect(runUsageReport({ days: 120, dryRun: true })).rejects.toThrow('exit')

    expect(error).toHaveBeenCalledWith(expect.stringContaining('90'))
  })

  it('수집기가 null을 준 클라이언트는 payload에서 빠진다', async () => {
    collected.claude = null
    collected.codex = { ...RECORD, client: 'codex' }

    await runUsageReport({ days: 7, dryRun: true })

    expect(jsonOut).toHaveBeenCalledWith({ records: [{ ...RECORD, client: 'codex' }] })
  })
})
