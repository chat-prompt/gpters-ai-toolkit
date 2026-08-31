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

vi.mock('../src/usage/claude-code.js', () => ({ collectClaudeCode: vi.fn(async () => collected.claude) }))
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
import { collectClaudeCode } from '../src/usage/claude-code.js'

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

describe('집계 구간 경계', () => {
  /** 수집기가 실제로 받은 window를 꺼낸다 */
  function receivedWindow(): { start: Date; end: Date } {
    const call = vi.mocked(collectClaudeCode).mock.calls.at(-1)
    expect(call, 'collectClaudeCode가 호출되지 않았습니다').toBeDefined()
    return (call as [{ start: Date; end: Date }])[0]
  }

  it('같은 날 여러 번 돌려도 구간이 동일하다', async () => {
    // 서버 upsert 키가 (member, client, period_start)다. 경계가 실행 시각이면
    // 초 단위로 매번 달라져 키가 일치하지 않고, 돌릴 때마다 행이 쌓인다.
    collected.claude = CLAUDE

    await runUsageReport({ days: 7, dryRun: true })
    const first = receivedWindow()

    await new Promise((resolve) => setTimeout(resolve, 15))

    await runUsageReport({ days: 7, dryRun: true })
    const second = receivedWindow()

    expect(second.start.getTime()).toBe(first.start.getTime())
    expect(second.end.getTime()).toBe(first.end.getTime())
  })

  it('구간 끝이 오늘을 포함한다', async () => {
    // end를 오늘 0시로 잡으면 오늘 쓴 양이 통째로 빠진다
    collected.claude = CLAUDE

    await runUsageReport({ days: 7, dryRun: true })
    const { start, end } = receivedWindow()

    expect(end.getTime()).toBeGreaterThan(Date.now())
    expect(end.getTime() - start.getTime()).toBe(7 * 86_400_000)
    // UTC 하루 경계에 스냅돼 있어야 한다
    expect(end.toISOString()).toMatch(/T00:00:00\.000Z$/)
  })
})

describe('버전 보고', () => {
  it('--version이 package.json과 같은 값을 답한다', async () => {
    // 하드코딩된 상수를 쓰다가 배포본 0.6.0이 "v0.5.1"이라고 답한 적이 있다.
    // 업그레이드 판정에 쓰이진 않지만, 디버깅할 때 사람을 엉뚱한 데로 보낸다.
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf-8'))
    const source = readFileSync(join(import.meta.dirname, '..', 'bin', 'aitk.ts'), 'utf-8')

    // 상수로 되돌아가면(= 버전 문자열이 소스에 박히면) 실패한다
    expect(source).toMatch(/const VERSION = pkg\.version/)
    expect(source).not.toMatch(/const VERSION = ['"]\d/)
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('npm 11에서도 aitk 실행 파일 매핑을 보존한다', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf-8'))

    // npm 11 publish는 "./dist/..."를 자동 보정하며 경고한다. 정규화된 경로를
    // 소스에 유지해 실제 공개 tarball에서도 aitk bin 링크가 그대로 생성되게 한다.
    expect(pkg.bin).toEqual({ aitk: 'dist/bin/aitk.js' })
  })
})
