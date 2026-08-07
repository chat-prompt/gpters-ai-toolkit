/**
 * CLI ↔ 서버 계약 드리프트 가드
 *
 * aitk는 의존성 0개로 npm에 배포되므로 `src/usage/types.ts`가 서버 계약
 * (`packages/lib/src/features/ax/usage-report.ts`)의 사본이다. 사본은 조용히 낡는다.
 *
 * 그래서 여기서는 타입을 비교하지 않고, **CLI가 실제로 전송하는 payload를 가로채
 * 서버의 진짜 검증기에 넣는다.** 한쪽이 필드를 바꾸면 이 테스트가 깨진다.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateUsageReport } from '../../../packages/lib/src/features/ax/usage-report'
import type { UsageRecord } from '../src/usage/types.js'

const collected = vi.hoisted(() => ({
  claude: null as UsageRecord | null,
  codex: null as UsageRecord | null,
}))

vi.mock('../src/usage/claude-code.js', () => ({ collectClaudeCode: async () => collected.claude }))
vi.mock('../src/usage/codex.js', () => ({ collectCodex: async () => collected.codex }))
vi.mock('../src/client.js', () => ({
  jsonRpcCall: vi.fn().mockResolvedValue({ ok: true, data: { ok: true } }),
}))
vi.mock('../src/auth.js', () => ({ resolveToken: vi.fn(() => 'tok') }))
vi.mock('../src/output.js', () => ({
  jsonOut: vi.fn(),
  info: vi.fn(),
  error: vi.fn(() => {
    throw new Error('exit')
  }),
}))

import { runUsageReport } from '../src/commands/usage-report.js'
import { jsonRpcCall } from '../src/client.js'

/** 한도를 보고하지 않는 클라이언트 (Claude Code) */
const CLAUDE: UsageRecord = {
  client: 'claude-code',
  planRaw: 'default_claude_max_20x',
  plan: 'Claude Max 20x',
  periodStart: '2026-07-31T00:00:00.000Z',
  periodEnd: '2026-08-07T00:00:00.000Z',
  inputTokens: 168_998_104,
  outputTokens: 8_196_226,
  cachedTokens: 4_266_344_437,
  sessions: 136,
  models: { 'claude-opus-5': 2_553_477_115 },
  limitUsedPercent: null,
  limitResetsAt: null,
}

/** 한도를 보고하는 클라이언트 (Codex) */
const CODEX: UsageRecord = {
  client: 'codex',
  planRaw: 'prolite',
  plan: 'ChatGPT Pro (lite)',
  periodStart: '2026-07-31T00:00:00.000Z',
  periodEnd: '2026-08-07T00:00:00.000Z',
  inputTokens: 34_267_843,
  outputTokens: 2_869_278,
  cachedTokens: 1_063_643_392,
  sessions: 61,
  models: { 'gpt-5.6-sol': 982_488_965 },
  limitUsedPercent: 34,
  limitResetsAt: '2026-08-13T00:48:51.000Z',
}

/** runUsageReport가 실제로 전송한 arguments를 꺼낸다 */
function sentArguments(): unknown {
  const call = vi.mocked(jsonRpcCall).mock.calls.at(-1)
  expect(call, 'jsonRpcCall이 호출되지 않았습니다').toBeDefined()
  const [method, params] = call as [string, { name: string; arguments: unknown }]
  expect(method).toBe('tools/call')
  expect(params.name).toBe('report_usage')
  return params.arguments
}

beforeEach(() => {
  vi.clearAllMocks()
  collected.claude = null
  collected.codex = null
})

describe('CLI가 보내는 payload는 서버 검증기를 통과한다', () => {
  it('두 클라이언트를 함께 보낼 때', async () => {
    collected.claude = CLAUDE
    collected.codex = CODEX

    await runUsageReport({ days: 7, dryRun: false })
    const result = validateUsageReport(sentArguments())

    expect(result.ok, result.ok ? '' : result.errors.join(' / ')).toBe(true)
  })

  it('한도를 보고하지 않는 클라이언트만 있을 때', async () => {
    // limitUsedPercent를 0으로 채우면 "한도를 안 썼다"와 구분되지 않는다.
    // null이 계약을 통과하는지가 이 패널 전체의 전제다.
    collected.claude = CLAUDE

    await runUsageReport({ days: 7, dryRun: false })
    const result = validateUsageReport(sentArguments())

    expect(result.ok, result.ok ? '' : result.errors.join(' / ')).toBe(true)
  })

  it('서버가 required로 요구하는 12개 키를 값이 없어도 모두 싣는다', async () => {
    // 키를 빼면 서버 툴 스키마가 거부한다 (undefined ≠ null)
    collected.claude = CLAUDE

    await runUsageReport({ days: 7, dryRun: false })
    const args = sentArguments() as { records: Record<string, unknown>[] }

    expect(Object.keys(args.records[0]).sort()).toEqual(
      [
        'cachedTokens',
        'client',
        'inputTokens',
        'limitResetsAt',
        'limitUsedPercent',
        'models',
        'outputTokens',
        'periodEnd',
        'periodStart',
        'plan',
        'planRaw',
        'sessions',
      ].sort()
    )
  })
})
