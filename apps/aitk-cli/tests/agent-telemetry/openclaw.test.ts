import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appendFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
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

function createOpenClawDatabase(
  path: string,
  agentId: string,
  events: Array<{ sessionId: string; event: string; createdAt?: string }>,
): void {
  mkdirSync(join(path, '..'), { recursive: true })
  const database = new DatabaseSync(path)
  database.exec(`
    CREATE TABLE schema_meta (
      meta_key TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      app_version TEXT
    );
    CREATE TABLE transcript_events (
      session_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      event_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)
  database.prepare(`
    INSERT INTO schema_meta (meta_key, role, agent_id, schema_version, app_version)
    VALUES ('primary', 'agent', ?, 4, '2026.7.2')
  `).run(agentId)
  const insert = database.prepare(`
    INSERT INTO transcript_events (session_id, seq, event_json, created_at)
    VALUES (?, ?, ?, ?)
  `)
  events.forEach((row, index) => insert.run(
    row.sessionId,
    index + 1,
    row.event,
    row.createdAt ?? IN_WINDOW,
  ))
  database.close()
}

function createUnrelatedOpenClawDatabase(path: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  const database = new DatabaseSync(path)
  database.exec(`
    CREATE TABLE memory_index (
      id TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
  database.close()
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aitk-openclaw-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('collectOpenClawAgent', () => {
  it('최신 agent SQLite를 JSONL과 같은 계약으로 집계한다', async () => {
    const databasePath = join(root, 'openclaw-agent.sqlite')
    createOpenClawDatabase(databasePath, 'main', [
      {
        sessionId: 'sqlite-session',
        event: assistant({
          id: 'sqlite-message',
          usage: { input: 7, output: 11, cacheRead: 13, cacheWrite: 5, thinking: 3 },
          content: [{
            type: 'toolCall', id: 'sqlite-tool', name: 'Read',
            arguments: { path: '/Users/person/.openclaw/skills/browse/SKILL.md' },
          }],
        }),
      },
      { sessionId: 'sqlite-session', event: toolResult('sqlite-tool') },
    ])

    const result = await collectOpenClawAgent({
      sessionsDir: databasePath,
      openclawAgent: 'main',
      window: { start: START, end: END },
      committed: committed(),
      category: 'qa-verify',
      source: 'openclaw',
    })

    expect(result).toMatchObject({ sessions: 1, turns: 1 })
    expect(result.usage).toMatchObject({
      inputTokens: 7, outputTokens: 11, cacheCreationInputTokens: 5,
      cacheReadInputTokens: 13, thinkingTokens: 3,
    })
    expect(result.tools).toEqual([{ name: 'Read', calls: 1, failures: 0 }])
    expect(result.skillLoads).toEqual([{ skillId: 'browse', loaded: 1, failed: 0, interrupted: 0 }])
    expect(result.collection).toMatchObject({ filesDiscovered: 1, filesRead: 1, recordsRead: 2 })
    expect(result.nextCommitted.files).toEqual({})
    expect(result.nextCommitted.openclawSource).toEqual({
      agentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      backend: 'sqlite',
    })
    expect(JSON.stringify(result)).not.toContain('sqlite-session')
    expect(JSON.stringify(result)).not.toContain('/Users/person')
  })

  it('agent 루트나 legacy sessions 경로에서 SQLite를 우선해 archive 이중 집계를 막는다', async () => {
    const agentRoot = join(root, 'main')
    writeSession('main/sessions/archive.jsonl', [assistant({ id: 'legacy-message' })])
    createOpenClawDatabase(join(agentRoot, 'agent', 'openclaw-agent.sqlite'), 'main', [{
      sessionId: 'sqlite-session', event: assistant({ id: 'sqlite-message', usage: { input: 1, output: 2 } }),
    }])

    for (const sessionsDir of [agentRoot, join(agentRoot, 'sessions')]) {
      const result = await collectOpenClawAgent({
        sessionsDir,
        openclawAgent: 'main',
        window: { start: START, end: END },
        committed: committed(),
        category: 'unclassified',
        source: 'openclaw',
      })
      expect(result.turns).toBe(1)
      expect(result.usage.inputTokens).toBe(1)
      expect(result.nextCommitted.openclawSource?.backend).toBe('sqlite')
    }
  })

  it('자동 탐지한 비-transcript SQLite를 건너뛰고 legacy JSONL로 폴백한다', async () => {
    const agentRoot = join(root, 'main')
    writeSession('main/sessions/current.jsonl', [assistant({
      id: 'jsonl-message', usage: { input: 3, output: 5 },
    })])
    createUnrelatedOpenClawDatabase(join(agentRoot, 'agent', 'openclaw-agent.sqlite'))

    for (const sessionsDir of [agentRoot, join(agentRoot, 'sessions')]) {
      const result = await collectOpenClawAgent({
        sessionsDir,
        openclawAgent: 'main',
        window: { start: START, end: END },
        committed: committed(),
        category: 'unclassified',
        source: 'openclaw',
      })

      expect(result.turns).toBe(1)
      expect(result.usage).toMatchObject({ inputTokens: 3, outputTokens: 5 })
      expect(result.nextCommitted.openclawSource?.backend).toBe('jsonl')
    }
  })

  it('비-transcript 후보 뒤에 지원하는 SQLite가 있으면 JSONL보다 우선한다', async () => {
    const agentRoot = join(root, 'main')
    writeSession('main/sessions/archive.jsonl', [assistant({ id: 'legacy-message' })])
    createUnrelatedOpenClawDatabase(join(agentRoot, 'openclaw-agent.sqlite'))
    createOpenClawDatabase(join(agentRoot, 'agent', 'openclaw-agent.sqlite'), 'main', [{
      sessionId: 'sqlite-session',
      event: assistant({ id: 'sqlite-message', usage: { input: 7, output: 9 } }),
    }])

    const result = await collectOpenClawAgent({
      sessionsDir: agentRoot,
      openclawAgent: 'main',
      window: { start: START, end: END },
      committed: committed(),
      category: 'unclassified',
      source: 'openclaw',
    })

    expect(result.turns).toBe(1)
    expect(result.usage).toMatchObject({ inputTokens: 7, outputTokens: 9 })
    expect(result.nextCommitted.openclawSource?.backend).toBe('sqlite')
  })

  it('비호환 SQLite 파일을 직접 지정하면 JSONL 탐색 없이 fail-closed한다', async () => {
    const databasePath = join(root, 'openclaw-agent.sqlite')
    createUnrelatedOpenClawDatabase(databasePath)

    await expect(collectOpenClawAgent({
      sessionsDir: databasePath,
      openclawAgent: 'main',
      window: { start: START, end: END },
      committed: committed(),
      category: 'unclassified',
      source: 'openclaw',
    })).rejects.toThrow('OpenClaw SQLite schema is not supported')
  })

  it('내부 agent 불일치와 여러 agent가 섞인 상위 경로를 fail-closed한다', async () => {
    const databasePath = join(root, 'agent.sqlite')
    createOpenClawDatabase(databasePath, 'main', [{
      sessionId: 'session', event: assistant({ id: 'message' }),
    }])
    await expect(collectOpenClawAgent({
      sessionsDir: databasePath,
      openclawAgent: 'work',
      window: { start: START, end: END },
      committed: committed(),
      category: 'unclassified',
      source: 'openclaw',
    })).rejects.toThrow('does not match --openclaw-agent')

    writeSession('agents/main/sessions/a.jsonl', [assistant({ id: 'a' })])
    writeSession('agents/work/sessions/b.jsonl', [assistant({ id: 'b' })])
    await expect(collectOpenClawAgent({
      sessionsDir: join(root, 'agents'),
      window: { start: START, end: END },
      committed: committed(),
      category: 'unclassified',
      source: 'openclaw',
    })).rejects.toThrow('contains multiple agents')
  })

  it('legacy JSONL에서 SQLite로 전환해도 agent 범위와 seen hash를 이어받는다', async () => {
    const agentRoot = join(root, 'main')
    const sessionsDir = join(agentRoot, 'sessions')
    const event = assistant({ id: 'same-message', usage: { input: 2, output: 4 } })
    writeSession('main/sessions/session.jsonl', [event])
    const first = await collectOpenClawAgent({
      sessionsDir,
      openclawAgent: 'main',
      window: { start: START, end: END },
      committed: committed(),
      category: 'unclassified',
      source: 'openclaw',
    })
    expect(first.nextCommitted.openclawSource?.backend).toBe('jsonl')

    createOpenClawDatabase(join(agentRoot, 'agent', 'openclaw-agent.sqlite'), 'main', [{
      sessionId: 'session.jsonl', event,
    }])
    const second = await collectOpenClawAgent({
      sessionsDir,
      openclawAgent: 'main',
      window: { start: START, end: END },
      committed: first.nextCommitted,
      category: 'unclassified',
      source: 'openclaw',
    })
    expect(second.turns).toBe(0)
    expect(second.collection.duplicatesSkipped).toBe(1)
    expect(second.nextCommitted.files).toEqual({})
    expect(second.nextCommitted.openclawSource?.backend).toBe('sqlite')
  })

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
    const claudeAssistant = (id: string | undefined, content: unknown[], thinkingTokens = 0) => entry({
      type: 'assistant',
      uuid: id,
      sessionId: 'claude-session-secret',
      timestamp: IN_WINDOW,
      message: {
        id: id ? 'response-1' : undefined,
        role: 'assistant',
        model: 'claude-opus-5',
        content,
        usage: {
          input_tokens: 20,
          output_tokens: 10,
          cache_read_input_tokens: 30,
          output_tokens_details: { thinking_tokens: thinkingTokens },
        },
      },
    })
    writeSession('claude.jsonl', [
      claudeAssistant('assistant-1', [{ type: 'text', text: 'first response fragment' }]),
      claudeAssistant('assistant-duplicate', [{
        type: 'tool_use', id: 'call-1', name: 'Read',
        input: { file_path: '/Users/person/.claude/skills/qa-verify/SKILL.md' },
      }], 7),
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
      entry({ type: 'attachment', uuid: 'attachment-metadata' }),
      entry({ type: 'last-prompt', uuid: 'prompt-metadata' }),
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
    expect(result.usage.thinkingTokens).toBe(7)
    expect(result.usage.thinkingTokensRelation).toBe('included-in-output')
    expect(result.models).toEqual([{
      model: 'claude-opus-5', turns: 1, usage: result.usage,
    }])
    expect(result.tools).toEqual([{ name: 'Read', calls: 1, failures: 0 }])
    expect(result.skillLoads).toEqual([{ skillId: 'qa-verify', loaded: 1, failed: 0, interrupted: 0 }])
    expect(result.collection).toMatchObject({
      source: 'claude-code', includedRecords: 2, metadataSkipped: 2, nonAssistantSkipped: 1,
      duplicatesSkipped: 1,
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

  it('Claude Code 루트에서 허용한 프로젝트 디렉터리만 읽는다', async () => {
    writeSession('project-a/a.jsonl', [assistant({ id: 'a' })])
    writeSession('project-b/b.jsonl', [assistant({ id: 'b' })])

    const result = await collectOpenClawAgent({
      sessionsDir: root,
      window: { start: START, end: END },
      committed: committed(),
      category: 'unclassified',
      source: 'openclaw',
      projectSlugs: ['project-a'],
    })

    expect(result.turns).toBe(1)
    expect(result.collection).toMatchObject({ filesDiscovered: 2, filesExcludedByScope: 1, filesRead: 1 })

    const emptyScope = await collectOpenClawAgent({
      sessionsDir: root,
      window: { start: START, end: END },
      committed: committed(),
      category: 'unclassified',
      source: 'claude-code',
      projectSlugs: ['missing-project'],
    })
    expect(emptyScope.collection.healthStatus).toBe('blocked')
    expect(emptyScope.collection.healthWarnings).toContain('no-files-in-scope')
  })
})
