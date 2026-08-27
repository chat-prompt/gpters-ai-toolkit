/**
 * 사용량 수집기 테스트
 *
 * 가짜 홈 디렉터리에 실제와 같은 모양의 트랜스크립트를 깔고 집계 결과를 확인한다.
 * 마지막 케이스는 서버 수신 계약의 진짜 `validateUsageReport`로 CLI 출력을 검증한다 —
 * CLI가 들고 있는 타입 사본이 계약과 어긋나면 여기서 깨진다.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const state = vi.hoisted(() => ({ home: '' }))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: () => state.home }
})

import { collectClaudeCode } from '../../src/usage/claude-code.js'
import { collectCodex } from '../../src/usage/codex.js'
import { validateUsageReport } from '../../../../packages/lib/src/features/ax/usage-report'

const NOW = new Date('2026-08-07T00:00:00.000Z')
const WINDOW = { start: new Date('2026-07-31T00:00:00.000Z'), end: NOW }
const IN_WINDOW = '2026-08-05T10:00:00.000Z'
const BEFORE_WINDOW = '2026-07-01T10:00:00.000Z'

/** assistant 트랜스크립트 한 줄을 만든다 */
function assistantLine(opts: {
  id: string
  sessionId: string
  timestamp: string
  model?: string
  input?: number
  cacheCreation?: number
  cacheRead?: number
  output?: number
  /** 없으면 스트리밍 도중 기록된 미완성 줄이다 */
  stopReason?: string | null
}): string {
  return JSON.stringify({
    type: 'assistant',
    sessionId: opts.sessionId,
    timestamp: opts.timestamp,
    message: {
      id: opts.id,
      model: opts.model ?? 'claude-opus-5',
      stop_reason: opts.stopReason === undefined ? 'end_turn' : opts.stopReason,
      usage: {
        input_tokens: opts.input ?? 0,
        cache_creation_input_tokens: opts.cacheCreation ?? 0,
        cache_read_input_tokens: opts.cacheRead ?? 0,
        output_tokens: opts.output ?? 0,
      },
    },
  })
}

/** Codex token_count 롤아웃 한 줄을 만든다 */
function tokenCountLine(opts: {
  timestamp: string
  input: number
  cached: number
  output: number
  /** 누적 값 — 수집기가 이걸 더하면 안 된다 */
  totalInput?: number
  usedPercent?: number
  resetsAt?: number
}): string {
  return JSON.stringify({
    timestamp: opts.timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: opts.totalInput ?? opts.input * 10,
          cached_input_tokens: 0,
          output_tokens: 999_999,
        },
        last_token_usage: {
          input_tokens: opts.input,
          cached_input_tokens: opts.cached,
          cache_write_input_tokens: 0,
          output_tokens: opts.output,
        },
      },
      rate_limits:
        opts.usedPercent === undefined
          ? null
          : { primary: { used_percent: opts.usedPercent, resets_at: opts.resetsAt ?? 1_786_582_131 } },
    },
  })
}

/** Codex 모델 지정 줄을 만든다 */
function threadSettingsLine(model: string): string {
  return JSON.stringify({
    timestamp: IN_WINDOW,
    type: 'event_msg',
    payload: { type: 'thread_settings_applied', thread_settings: { model } },
  })
}

/** Codex 턴 시작 줄 — thread_settings보다 앞서 모델을 담는다 */
function turnContextLine(model: string): string {
  return JSON.stringify({
    timestamp: IN_WINDOW,
    type: 'turn_context',
    payload: { turn_id: 't1', model },
  })
}

/** ChatGPT 플랜 코드를 담은 가짜 id_token */
function fakeIdToken(planType: string): string {
  const payload = Buffer.from(
    JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_plan_type: planType } })
  ).toString('base64url')
  return `header.${payload}.signature`
}

/** 가짜 홈에 파일을 쓴다 (상위 디렉터리 자동 생성) */
function write(relativePath: string, content: string): string {
  const path = join(state.home, relativePath)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
  return path
}

beforeEach(() => {
  state.home = mkdtempSync(join(tmpdir(), 'aitk-usage-'))
})

afterEach(() => {
  vi.useRealTimers()
  rmSync(state.home, { recursive: true, force: true })
})

describe('collectClaudeCode', () => {
  it('입력·캐시·출력을 나눠 합산하고 세션을 distinct로 센다', async () => {
    write(
      '.claude/projects/proj-a/session-1.jsonl',
      [
        assistantLine({ id: 'm1', sessionId: 's1', timestamp: IN_WINDOW, input: 10, cacheCreation: 5, cacheRead: 100, output: 20 }),
        assistantLine({ id: 'm2', sessionId: 's1', timestamp: IN_WINDOW, input: 1, cacheRead: 50, output: 2 }),
      ].join('\n')
    )
    write(
      '.claude/projects/proj-b/session-2.jsonl',
      assistantLine({ id: 'm3', sessionId: 's2', timestamp: IN_WINDOW, input: 4, output: 8 })
    )

    const record = await collectClaudeCode(WINDOW)

    expect(record).not.toBeNull()
    // 입력은 input_tokens + cache_creation_input_tokens
    expect(record!.inputTokens).toBe(10 + 5 + 1 + 4)
    expect(record!.cachedTokens).toBe(100 + 50)
    expect(record!.outputTokens).toBe(20 + 2 + 8)
    expect(record!.sessions).toBe(2)
    expect(record!.client).toBe('claude-code')
  })

  it('컴팩션으로 복제된 같은 message.id는 한 번만 센다', async () => {
    const duplicated = assistantLine({ id: 'dup', sessionId: 's1', timestamp: IN_WINDOW, input: 100, output: 10, stopReason: 'end_turn' })
    write('.claude/projects/proj-a/original.jsonl', duplicated)
    write('.claude/projects/proj-a/compacted.jsonl', duplicated)

    const record = await collectClaudeCode(WINDOW)

    expect(record!.inputTokens).toBe(100)
    expect(record!.outputTokens).toBe(10)
  })

  // 실제 트랜스크립트의 중복은 값이 똑같지 않다. 스트리밍 중인 응답이 같은 message.id로
  // 여러 번 기록되고 뒤로 갈수록 값이 커진다. 첫 줄만 채택하면 미완성 값을 세게 된다.
  // (260820 Deletion Test에서 출력 토큰 32.5% 과소집계로 드러난 케이스)
  it('스트리밍으로 같은 id가 여러 번 기록되면 완성된 값을 센다', async () => {
    write(
      '.claude/projects/proj-a/streaming.jsonl',
      [
        assistantLine({ id: 'm1', sessionId: 's1', timestamp: IN_WINDOW, input: 59, output: 2, stopReason: null }),
        assistantLine({ id: 'm1', sessionId: 's1', timestamp: IN_WINDOW, input: 59, output: 676, stopReason: 'end_turn' }),
      ].join('\n')
    )

    const record = await collectClaudeCode(WINDOW)

    // 미완성 줄의 2가 아니라 완성된 676. 입력은 늘지 않았으므로 59 그대로 (두 번 세지 않는다)
    expect(record!.outputTokens).toBe(676)
    expect(record!.inputTokens).toBe(59)
    expect(record!.models).toEqual({ 'claude-opus-5': 59 + 676 })
  })

  // 완료된 줄이 미완성 줄보다 작은 값을 들고 올 수도 있다. 이때 필드별로 최댓값을 따로
  // 취하면 어느 줄에도 없던 조합이 만들어진다 — 완료된 줄을 통째로 채택해야 한다.
  it('완료된 줄의 값이 더 작아도 줄 단위로 통째 채택한다', async () => {
    write(
      '.claude/projects/proj-a/shrink.jsonl',
      [
        assistantLine({ id: 'm1', sessionId: 's1', timestamp: IN_WINDOW, input: 100, cacheRead: 0, output: 50, stopReason: null }),
        assistantLine({ id: 'm1', sessionId: 's1', timestamp: IN_WINDOW, input: 80, cacheRead: 10, output: 40, stopReason: 'end_turn' }),
      ].join('\n')
    )

    const record = await collectClaudeCode(WINDOW)

    // 필드별 최댓값을 섞으면 100/10/50이 되지만, 그런 줄은 존재한 적이 없다
    expect(record!.inputTokens).toBe(80)
    expect(record!.cachedTokens).toBe(10)
    expect(record!.outputTokens).toBe(40)
  })

  // 미완성 줄과 완료 줄의 모델명이 다르면, 한 응답의 토큰이 두 모델로 쪼개져선 안 된다.
  it('같은 응답의 토큰을 두 모델로 쪼개지 않는다', async () => {
    write(
      '.claude/projects/proj-a/model-switch.jsonl',
      [
        assistantLine({ id: 'm1', sessionId: 's1', timestamp: IN_WINDOW, model: 'partial-model', input: 100, output: 2, stopReason: null }),
        assistantLine({ id: 'm1', sessionId: 's1', timestamp: IN_WINDOW, model: 'final-model', input: 100, output: 50, stopReason: 'end_turn' }),
      ].join('\n')
    )

    const record = await collectClaudeCode(WINDOW)

    expect(record!.models).toEqual({ 'final-model': 150 })
  })

  // 복제본이 다른 세션에 실려 오더라도 세션 수는 응답을 처음 본 곳에서만 센다.
  // 토큰 집계를 고치면서 세션 계산까지 같이 바뀌지 않도록 고정해 둔다.
  it('다른 세션에 복제된 사본은 세션 수를 늘리지 않는다', async () => {
    const line = (sessionId: string) =>
      assistantLine({ id: 'dup', sessionId, timestamp: IN_WINDOW, input: 100, output: 10, stopReason: 'end_turn' })
    write('.claude/projects/proj-a/original.jsonl', line('s1'))
    write('.claude/projects/proj-a/compacted.jsonl', line('s2'))

    const record = await collectClaudeCode(WINDOW)

    expect(record!.sessions).toBe(1)
    expect(record!.outputTokens).toBe(10)
  })

  it('집계 구간 밖의 줄은 빼고, 구간 전에 멈춘 파일은 아예 열지 않는다', async () => {
    write(
      '.claude/projects/proj-a/mixed.jsonl',
      [
        assistantLine({ id: 'old', sessionId: 's1', timestamp: BEFORE_WINDOW, input: 999, output: 999 }),
        assistantLine({ id: 'new', sessionId: 's1', timestamp: IN_WINDOW, input: 7, output: 3 }),
      ].join('\n')
    )

    // mtime이 구간보다 이른 파일은 구간 안의 줄을 가질 수 없다
    const stale = write(
      '.claude/projects/proj-a/stale.jsonl',
      assistantLine({ id: 'stale', sessionId: 's9', timestamp: IN_WINDOW, input: 500, output: 500 })
    )
    const staleTime = new Date('2026-07-01T00:00:00.000Z')
    utimesSync(stale, staleTime, staleTime)

    const record = await collectClaudeCode(WINDOW)

    expect(record!.inputTokens).toBe(7)
    expect(record!.outputTokens).toBe(3)
    expect(record!.sessions).toBe(1)
  })

  it('모델별 토큰을 나누고 티어를 플랜명으로 바꾼다', async () => {
    write('.claude.json', JSON.stringify({ oauthAccount: { organizationRateLimitTier: 'default_claude_max_20x' } }))
    write(
      '.claude/projects/proj-a/s.jsonl',
      [
        assistantLine({ id: 'a', sessionId: 's1', timestamp: IN_WINDOW, model: 'claude-opus-5', input: 10, output: 5 }),
        assistantLine({ id: 'b', sessionId: 's1', timestamp: IN_WINDOW, model: 'claude-haiku-4-5', input: 2, output: 1 }),
      ].join('\n')
    )

    const record = await collectClaudeCode(WINDOW)

    expect(record!.models).toEqual({ 'claude-opus-5': 15, 'claude-haiku-4-5': 3 })
    expect(record!.planRaw).toBe('default_claude_max_20x')
    expect(record!.plan).toBe('Claude Max 20x')
  })

  it('토큰을 안 쓴 응답은 모델별 집계에 줄을 만들지 않는다', async () => {
    write(
      '.claude/projects/p/s.jsonl',
      [
        assistantLine({ id: 'a', sessionId: 's1', timestamp: IN_WINDOW, model: 'claude-opus-5', input: 10, output: 5 }),
        assistantLine({ id: 'b', sessionId: 's1', timestamp: IN_WINDOW, model: '<synthetic>' }),
      ].join('\n')
    )

    const record = await collectClaudeCode(WINDOW)

    expect(record!.models).toEqual({ 'claude-opus-5': 15 })
  })

  it('최신 statusline usage cache에서 Claude 주간 한도와 리셋 시각을 읽는다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    write('.claude/projects/p/s.jsonl', assistantLine({ id: 'a', sessionId: 's1', timestamp: IN_WINDOW, input: 1, output: 1 }))
    const cache = write(
      '.claude/statusline-usage-cache.json',
      JSON.stringify({
        seven_day: {
          utilization: 63,
          resets_at: '2026-08-10T12:00:00.000Z',
        },
      })
    )
    utimesSync(cache, NOW, NOW)

    const record = await collectClaudeCode(WINDOW)

    expect(record!.limitUsedPercent).toBe(63)
    expect(record!.limitResetsAt).toBe('2026-08-10T12:00:00.000Z')
  })

  it('오래된 Claude usage cache는 현재 한도로 보고하지 않는다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    write('.claude/projects/p/s.jsonl', assistantLine({ id: 'a', sessionId: 's1', timestamp: IN_WINDOW, input: 1, output: 1 }))
    const cache = write(
      '.claude/statusline-usage-cache.json',
      JSON.stringify({
        seven_day: {
          utilization: 63,
          resets_at: '2026-08-10T12:00:00.000Z',
        },
      })
    )
    const stale = new Date(NOW.getTime() - 60 * 60 * 1000)
    utimesSync(cache, stale, stale)

    const record = await collectClaudeCode(WINDOW)

    expect(record!.limitUsedPercent).toBeNull()
    expect(record!.limitResetsAt).toBeNull()
  })

  it('한도 스냅샷이 없으면 0이 아니라 null을 보낸다', async () => {
    write('.claude/projects/p/s.jsonl', assistantLine({ id: 'a', sessionId: 's1', timestamp: IN_WINDOW, input: 1, output: 1 }))

    const record = await collectClaudeCode(WINDOW)

    expect(record!.limitUsedPercent).toBeNull()
    expect(record!.limitResetsAt).toBeNull()
  })

  it('트랜스크립트가 없으면 null을 돌려준다', async () => {
    expect(await collectClaudeCode(WINDOW)).toBeNull()
  })

  it('미완성 스트리밍 응답은 다음 구간의 완성본과 중복되지 않도록 세지 않는다', async () => {
    write(
      '.claude/projects/p/s.jsonl',
      assistantLine({
        id: 'streaming',
        sessionId: 's1',
        timestamp: IN_WINDOW,
        input: 10,
        output: 2,
        stopReason: null,
      })
    )

    expect(await collectClaudeCode(WINDOW)).toBeNull()
  })

  it('구간 끝과 정확히 같은 Claude 응답은 다음 구간에만 포함한다', async () => {
    write(
      '.claude/projects/p/s.jsonl',
      assistantLine({ id: 'at-end', sessionId: 's1', timestamp: NOW.toISOString(), input: 10, output: 2 })
    )

    expect(await collectClaudeCode(WINDOW)).toBeNull()
    const next = await collectClaudeCode({
      start: NOW,
      end: new Date(NOW.getTime() + 86_400_000),
    })
    expect(next?.inputTokens).toBe(10)
  })
})

describe('collectCodex', () => {
  it('누적(total_token_usage)이 아니라 증분(last_token_usage)만 더한다', async () => {
    write(
      '.codex/sessions/2026/08/05/rollout-a.jsonl',
      [
        tokenCountLine({ timestamp: IN_WINDOW, input: 100, cached: 30, output: 10 }),
        tokenCountLine({ timestamp: IN_WINDOW, input: 50, cached: 20, output: 5 }),
      ].join('\n')
    )

    const record = await collectCodex(WINDOW)

    // input_tokens는 cached를 포함하므로 캐시분을 빼야 두 번 세지 않는다
    expect(record!.inputTokens).toBe(70 + 30)
    expect(record!.cachedTokens).toBe(30 + 20)
    expect(record!.outputTokens).toBe(15)
  })

  it('앞선 thread_settings의 모델에 이후 토큰을 귀속시킨다', async () => {
    write(
      '.codex/sessions/2026/08/05/rollout-a.jsonl',
      [
        threadSettingsLine('gpt-5.6-sol'),
        tokenCountLine({ timestamp: IN_WINDOW, input: 100, cached: 0, output: 10 }),
        threadSettingsLine('gpt-5.6-codex'),
        tokenCountLine({ timestamp: IN_WINDOW, input: 20, cached: 0, output: 2 }),
      ].join('\n')
    )

    const record = await collectCodex(WINDOW)

    expect(record!.models).toEqual({ 'gpt-5.6-sol': 110, 'gpt-5.6-codex': 22 })
  })

  it('첫 턴 토큰은 thread_settings보다 앞선 turn_context의 모델에 붙는다', async () => {
    write(
      '.codex/sessions/2026/08/05/rollout-a.jsonl',
      [
        turnContextLine('gpt-5.6-sol'),
        tokenCountLine({ timestamp: IN_WINDOW, input: 100, cached: 0, output: 10 }),
        threadSettingsLine('gpt-5.6-sol'),
        tokenCountLine({ timestamp: IN_WINDOW, input: 20, cached: 0, output: 2 }),
      ].join('\n')
    )

    const record = await collectCodex(WINDOW)

    expect(record!.models).toEqual({ 'gpt-5.6-sol': 132 })
  })

  it('가장 최근 한도 스냅샷을 쓰고 resets_at을 ISO로 바꾼다', async () => {
    write(
      '.codex/sessions/2026/08/05/rollout-a.jsonl',
      [
        tokenCountLine({ timestamp: '2026-08-02T00:00:00.000Z', input: 10, cached: 0, output: 1, usedPercent: 12, resetsAt: 1_786_000_000 }),
        tokenCountLine({ timestamp: '2026-08-06T00:00:00.000Z', input: 10, cached: 0, output: 1, usedPercent: 44, resetsAt: 1_786_582_131 }),
      ].join('\n')
    )

    const record = await collectCodex(WINDOW)

    expect(record!.limitUsedPercent).toBe(44)
    expect(record!.limitResetsAt).toBe(new Date(1_786_582_131 * 1000).toISOString())
  })

  it('세션은 롤아웃 파일 단위로 세고 rollout-이 아닌 파일은 무시한다', async () => {
    const line = tokenCountLine({ timestamp: IN_WINDOW, input: 10, cached: 0, output: 1 })
    write('.codex/sessions/2026/08/05/rollout-a.jsonl', line)
    write('.codex/sessions/2026/08/06/rollout-b.jsonl', line)
    write('.codex/sessions/2026/08/06/archive.jsonl', line)

    const record = await collectCodex(WINDOW)

    expect(record!.sessions).toBe(2)
    expect(record!.outputTokens).toBe(2)
  })

  it('id_token에서 플랜만 꺼내고 토큰 원문은 어디에도 담지 않는다', async () => {
    const idToken = fakeIdToken('prolite')
    write('.codex/auth.json', JSON.stringify({ tokens: { id_token: idToken, access_token: 'secret-access' } }))
    write('.codex/sessions/2026/08/05/rollout-a.jsonl', tokenCountLine({ timestamp: IN_WINDOW, input: 10, cached: 0, output: 1 }))

    const record = await collectCodex(WINDOW)

    expect(record!.planRaw).toBe('prolite')
    expect(record!.plan).toBe('ChatGPT Pro (lite)')

    const serialized = JSON.stringify(record)
    expect(serialized).not.toContain(idToken)
    expect(serialized).not.toContain('secret-access')
  })

  it('롤아웃이 없으면 null을 돌려준다', async () => {
    expect(await collectCodex(WINDOW)).toBeNull()
  })

  it('구간 끝과 정확히 같은 Codex 이벤트는 다음 구간에만 포함한다', async () => {
    write(
      '.codex/sessions/2026/08/07/rollout-boundary.jsonl',
      tokenCountLine({ timestamp: NOW.toISOString(), input: 10, cached: 0, output: 2 })
    )

    expect(await collectCodex(WINDOW)).toBeNull()
    const next = await collectCodex({
      start: NOW,
      end: new Date(NOW.getTime() + 86_400_000),
    })
    expect(next?.inputTokens).toBe(10)
  })
})

describe('서버 수신 계약 적합성', () => {
  it('두 수집기의 출력이 validateUsageReport를 그대로 통과한다', async () => {
    write('.claude.json', JSON.stringify({ oauthAccount: { organizationRateLimitTier: 'default_claude_max_20x' } }))
    write(
      '.claude/projects/p/s.jsonl',
      assistantLine({ id: 'a', sessionId: 's1', timestamp: IN_WINDOW, input: 10, cacheCreation: 2, cacheRead: 40, output: 5 })
    )
    write('.codex/auth.json', JSON.stringify({ tokens: { id_token: fakeIdToken('prolite') } }))
    write(
      '.codex/sessions/2026/08/05/rollout-a.jsonl',
      [
        threadSettingsLine('gpt-5.6-sol'),
        tokenCountLine({ timestamp: IN_WINDOW, input: 100, cached: 30, output: 10, usedPercent: 44 }),
      ].join('\n')
    )

    const records = [await collectClaudeCode(WINDOW), await collectCodex(WINDOW)].filter((r) => r !== null)
    expect(records).toHaveLength(2)

    const result = validateUsageReport({ records })
    expect(result.ok ? [] : result.errors).toEqual([])
  })
})
