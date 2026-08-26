import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appendFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectOpenClawAgent } from '../../src/agent-telemetry/openclaw.js'
import type { AgentTelemetryCommittedState } from '../../src/agent-telemetry/types.js'

const START = new Date('2026-08-20T00:00:00.000Z')
const END = new Date('2026-08-27T00:00:00.000Z')
const IN_WINDOW = '2026-08-26T10:00:00.000Z'

let root = ''

function writeSession(name: string, lines: string[], finalNewline = true): string {
  const path = join(root, name)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, lines.join('\n') + (finalNewline ? '\n' : ''))
  return path
}

function entry(value: unknown): string {
  return JSON.stringify(value)
}

function assistant(options: {
  id: string
  model?: string
  provider?: string
  timestamp?: string
  content?: unknown[]
  usage?: Record<string, number>
}): string {
  return entry({
    type: 'message',
    id: options.id,
    timestamp: options.timestamp ?? IN_WINDOW,
    message: {
      role: 'assistant',
      provider: options.provider ?? 'anthropic',
      model: options.model ?? 'claude-opus-5',
      content: options.content ?? [{ type: 'text', text: '원문은 집계 결과에 포함되면 안 된다' }],
      usage: options.usage ?? { input: 10, output: 20, cacheRead: 100, cacheWrite: 5 },
    },
  })
}

function toolResult(id: string, isError = false): string {
  return entry({
    type: 'message',
    id: `result-${id}`,
    timestamp: IN_WINDOW,
    message: { role: 'toolResult', toolCallId: id, toolName: 'Read', isError, content: [] },
  })
}

function committed(): AgentTelemetryCommittedState {
  return { lastWindowEndUtc: null, files: {}, seenMessages: [] }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aitk-openclaw-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('collectOpenClawAgent', () => {
  it('토큰·모델·도구·스킬 로드를 집계하고 원문과 경로를 출력하지 않는다', async () => {
    writeSession('a.jsonl', [
      entry({ type: 'session', id: 'session-a', timestamp: '2026-08-19T00:00:00Z', cwd: '/Users/person/secret-project' }),
      assistant({
        id: 'm1',
        usage: { input: 10, output: 20, cacheRead: 100, cacheWrite: 5, thinking: 3 },
        content: [{
          type: 'toolCall',
          id: 'tool-1',
          name: 'Read',
          arguments: { path: '/Users/person/.openclaw/skills/browse/SKILL.md' },
        }],
      }),
      toolResult('tool-1'),
      assistant({ id: 'm2', usage: { input_tokens: 2, output_tokens: 4, cache_read_input_tokens: 8 } }),
    ])

    const result = await collectOpenClawAgent({
      sessionsDir: root,
      window: { start: START, end: END },
      committed: committed(),
      category: 'qa-verify',
      source: 'openclaw',
    })

    expect(result.usage).toEqual({
      inputTokens: 12,
      outputTokens: 24,
      cacheCreationInputTokens: 5,
      cacheReadInputTokens: 108,
      thinkingTokens: 3,
      thinkingTokensRelation: 'included-in-output',
    })
    expect(result.sessions).toBe(1)
    expect(result.turns).toBe(2)
    expect(result.models).toEqual([{ model: 'claude-opus-5', turns: 2, usage: result.usage }])
    expect(result.tools).toEqual([{ name: 'Read', calls: 1, failures: 0 }])
    expect(result.skillLoads).toEqual([{ skillId: 'browse', loaded: 1, failed: 0, interrupted: 0 }])
    expect(result.taskCategories[0]).toMatchObject({ category: 'qa-verify', sessions: 1, turns: 2 })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('/Users/person')
    expect(serialized).not.toContain('secret-project')
    expect(serialized).not.toContain('원문은')
    expect(serialized).not.toContain('session-a')
  })

  it('sessionId+message.id 해시로 중복을 제거하고 synthetic을 별도 센다', async () => {
    const duplicate = assistant({ id: 'same' })
    writeSession('one.jsonl', [entry({ type: 'session', id: 'shared-session' }), duplicate])
    writeSession('two.jsonl', [entry({ type: 'session', id: 'shared-session' }), duplicate])
    writeSession('synthetic.jsonl', [
      entry({ type: 'session', id: 'synthetic-session' }),
      assistant({ id: 'synthetic', model: '<synthetic>', provider: 'openclaw' }),
    ])

    const result = await collectOpenClawAgent({
      sessionsDir: root,
      window: { start: START, end: END },
      committed: committed(),
      category: 'unclassified',
      source: 'openclaw',
    })

    expect(result.turns).toBe(1)
    expect(result.collection.duplicatesSkipped).toBe(1)
    expect(result.collection.syntheticSkipped).toBe(1)
    expect(result.models).toHaveLength(1)
  })

  it('checkpoint offset 이후만 읽고 마지막 미완성 줄은 다음 실행으로 미룬다', async () => {
    const path = writeSession('incremental.jsonl', [
      entry({ type: 'session', id: 'incremental-session' }),
      assistant({ id: 'first' }),
      assistant({ id: 'partial' }),
    ], false)

    const first = await collectOpenClawAgent({
      sessionsDir: root,
      window: { start: START, end: END },
      committed: committed(),
      category: 'unclassified',
      source: 'openclaw',
    })
    expect(first.turns).toBe(1)

    appendFileSync(path, '\n')
    const second = await collectOpenClawAgent({
      sessionsDir: root,
      window: { start: START, end: END },
      committed: first.nextCommitted,
      category: 'unclassified',
      source: 'openclaw',
    })
    expect(second.turns).toBe(1)
    expect(second.collection.duplicatesSkipped).toBe(0)
  })

  it('malformed·기간 밖 레코드와 실패한 스킬 로드를 건강도에 반영한다', async () => {
    writeSession('health.jsonl', [
      '{broken-json',
      assistant({ id: 'old', timestamp: '2026-08-01T00:00:00.000Z' }),
      assistant({
        id: 'skill-call',
        content: [{ type: 'tool_use', id: 'tool-fail', name: 'Skill', input: { skill: 'session-cleanup' } }],
      }),
      toolResult('tool-fail', true),
    ])

    const result = await collectOpenClawAgent({
      sessionsDir: root,
      window: { start: START, end: END },
      committed: committed(),
      category: 'session-cleanup',
      source: 'openclaw',
    })

    expect(result.collection.malformedSkipped).toBe(1)
    expect(result.collection.outsideWindowSkipped).toBe(1)
    expect(result.tools).toEqual([{ name: 'Skill', calls: 1, failures: 1 }])
    expect(result.skillLoads).toEqual([{ skillId: 'session-cleanup', loaded: 0, failed: 1, interrupted: 0 }])
  })

  it('파일 inode가 교체되면 처음부터 다시 읽되 seen hash로 이중 계상하지 않는다', async () => {
    const path = writeSession('rotated.jsonl', [
      entry({ type: 'session', id: 'rotated-session' }),
      assistant({ id: 'before-rotate' }),
    ])
    const first = await collectOpenClawAgent({
      sessionsDir: root,
      window: { start: START, end: END },
      committed: committed(),
      category: 'unclassified',
      source: 'openclaw',
    })

    renameSync(path, `${path}.old`)
    writeSession('rotated.jsonl', [
      entry({ type: 'session', id: 'rotated-session' }),
      assistant({ id: 'before-rotate' }),
      assistant({ id: 'after-rotate' }),
    ])
    const second = await collectOpenClawAgent({
      sessionsDir: root,
      window: { start: START, end: END },
      committed: first.nextCommitted,
      category: 'unclassified',
      source: 'openclaw',
    })

    expect(second.collection.filesReset).toBe(1)
    expect(second.collection.duplicatesSkipped).toBe(1)
    expect(second.turns).toBe(1)
  })

  it('Claude Code assistant와 tool_result를 집계하고 조용한 탈락을 건강도에 반영한다', async () => {
    const claudeAssistant = (id: string | undefined, content: unknown[]) => entry({
      type: 'assistant',
      uuid: id,
      sessionId: 'claude-session-secret',
      timestamp: IN_WINDOW,
      message: {
        role: 'assistant',
        model: 'claude-opus-5',
        content,
        usage: { input_tokens: 20, output_tokens: 10, cache_read_input_tokens: 30 },
      },
    })
    writeSession('claude.jsonl', [
      claudeAssistant('assistant-1', [{
        type: 'tool_use', id: 'call-1', name: 'Read',
        input: { file_path: '/Users/person/.claude/skills/qa-verify/SKILL.md' },
      }]),
      entry({
        type: 'user', uuid: 'result-1', sessionId: 'claude-session-secret', timestamp: IN_WINDOW,
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', is_error: false }] },
      }),
      entry({
        type: 'user', uuid: 'orphan', sessionId: 'claude-session-secret', timestamp: IN_WINDOW,
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'missing-call' }] },
      }),
      entry({
        type: 'user', uuid: 'plain-user', sessionId: 'claude-session-secret', timestamp: IN_WINDOW,
        message: { role: 'user', content: [{ type: 'text', text: 'private' }] },
      }),
      entry({ type: 'progress', uuid: 'unsupported', timestamp: IN_WINDOW }),
      claudeAssistant(undefined, [{ type: 'text', text: 'missing identity' }]),
    ])

    const result = await collectOpenClawAgent({
      sessionsDir: root,
      window: { start: START, end: END },
      committed: committed(),
      category: 'qa-verify',
      source: 'claude-code',
    })

    expect(result.turns).toBe(1)
    expect(result.usage.inputTokens).toBe(20)
    expect(result.tools).toEqual([{ name: 'Read', calls: 1, failures: 0 }])
    expect(result.skillLoads).toEqual([{ skillId: 'qa-verify', loaded: 1, failed: 0, interrupted: 0 }])
    expect(result.collection).toMatchObject({
      source: 'claude-code', includedRecords: 2, nonAssistantSkipped: 1,
      unsupportedRecordsSkipped: 1, missingIdentitySkipped: 1, orphanToolResultsSkipped: 1,
      healthStatus: 'healthy',
    })
    expect(result.collection.recordsRead).toBe(
      result.collection.includedRecords + result.collection.metadataSkipped +
      result.collection.nonAssistantSkipped + result.collection.duplicatesSkipped +
      result.collection.syntheticSkipped + result.collection.malformedSkipped +
      result.collection.outsideWindowSkipped + result.collection.unsupportedRecordsSkipped +
      result.collection.missingIdentitySkipped + result.collection.orphanToolResultsSkipped
    )
    expect(JSON.stringify(result)).not.toContain('claude-session-secret')
    expect(JSON.stringify(result)).not.toContain('/Users/person')
  })

  it('대량의 미지원 Claude Code 레코드를 빈 성공으로 표시하지 않는다', async () => {
    writeSession('unsupported.jsonl', Array.from({ length: 20 }, (_, index) => entry({
      type: 'progress', uuid: `unsupported-${index}`, timestamp: IN_WINDOW,
    })))

    const result = await collectOpenClawAgent({
      sessionsDir: root,
      window: { start: START, end: END },
      committed: committed(),
      category: 'unclassified',
      source: 'claude-code',
    })

    expect(result.collection.healthStatus).toBe('blocked')
    expect(result.collection.healthWarnings).toEqual([
      'no-turns-from-records',
      'high-unsupported-rate',
      'claude-code-tools-missing',
    ])
  })
})
