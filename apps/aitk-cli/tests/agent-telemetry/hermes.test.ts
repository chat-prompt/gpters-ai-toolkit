import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectHermesAgent } from '../../src/agent-telemetry/hermes.js'
import type { AgentTelemetryCommittedState } from '../../src/agent-telemetry/types.js'

const START = new Date('2026-08-26T00:00:00.000Z')
const END = new Date('2026-08-27T00:00:00.000Z')
let root = ''
let databasePath = ''

function epoch(value: string): number {
  return new Date(value).getTime() / 1000
}

function committed(): AgentTelemetryCommittedState {
  return { lastWindowEndUtc: null, files: {}, seenMessages: [] }
}

function createFixture(): void {
  const database = new DatabaseSync(databasePath)
  database.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      model TEXT,
      last_activity_at REAL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cache_read_tokens INTEGER,
      cache_write_tokens INTEGER,
      reasoning_tokens INTEGER,
      profile_name TEXT,
      private_cwd TEXT
    );
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY,
      session_id TEXT,
      role TEXT,
      content TEXT,
      tool_call_id TEXT,
      tool_calls TEXT,
      tool_name TEXT,
      effect_disposition TEXT,
      timestamp REAL,
      finish_reason TEXT,
      display_kind TEXT
    );
  `)
  database.prepare(`
    INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('session-secret', 'hermes-3', epoch('2026-08-26T06:00:00Z'), 100, 20, 40, 10, 5,
    'bbokeoter-private-profile', '/Users/person/private')
  const insert = database.prepare(`
    INSERT INTO messages (
      id, session_id, role, content, tool_call_id, tool_calls, tool_name,
      effect_disposition, timestamp, finish_reason, display_kind
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  insert.run(1, 'session-secret', 'user', 'old private prompt', null, null, null, null,
    epoch('2026-08-25T23:00:00Z'), null, null)
  insert.run(2, 'session-secret', 'user', 'new private prompt', null, null, null, null,
    epoch('2026-08-26T01:00:00Z'), null, null)
  insert.run(3, 'session-secret', 'assistant', 'private response', null, JSON.stringify([
    { id: 'call-secret-1', function: { name: 'Bash', arguments: { command: 'cat /Users/person/private' } } },
    { id: 'call-secret-2', function: { name: 'Read', arguments: { path: '/Users/person/private' } } },
  ]), null, null, epoch('2026-08-26T01:00:01Z'), null, null)
  insert.run(4, 'session-secret', 'tool', 'private tool result', 'call-secret-1', null, 'Bash', 'failed',
    epoch('2026-08-26T01:00:02Z'), 'error', null)
  insert.run(5, 'session-secret', 'assistant', 'normal private response', null, null, null, null,
    epoch('2026-08-26T01:00:03Z'), 'stop', null)
  insert.run(6, 'session-secret', 'session_meta', 'private metadata', null, null, null, null,
    epoch('2026-08-26T01:00:04Z'), null, null)
  database.close()
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aitk-hermes-'))
  databasePath = join(root, 'hermes.db')
  createFixture()
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('collectHermesAgent', () => {
  it('SQLite의 누적 usage·user turn·tool call을 원문 없이 집계한다', async () => {
    const result = await collectHermesAgent({
      sessionsDir: databasePath,
      profileName: 'bbokeoter-private-profile',
      window: { start: START, end: END },
      committed: committed(),
      category: 'qa-verify',
      source: 'hermes',
    })

    expect(result).toMatchObject({
      sessions: 1,
      turns: 1,
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        cacheCreationInputTokens: 10,
        cacheReadInputTokens: 40,
        thinkingTokens: 5,
        thinkingTokensRelation: 'unknown',
      },
      collection: {
        source: 'hermes',
        filesDiscovered: 1,
        filesRead: 1,
        recordsRead: 7,
        includedRecords: 4,
        metadataSkipped: 2,
        outsideWindowSkipped: 1,
        healthStatus: 'healthy',
        healthWarnings: [],
      },
    })
    expect(result.models).toEqual([{ model: 'hermes-3', turns: 1, usage: result.usage }])
    expect(result.tools).toEqual([
      { name: 'Bash', calls: 1, failures: 1 },
      { name: 'Read', calls: 1, failures: 0 },
    ])
    expect(result.skillLoads).toEqual([])
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('session-secret')
    expect(serialized).not.toContain('call-secret')
    expect(serialized).not.toContain('bbokeoter-private-profile')
    expect(serialized).not.toContain('private prompt')
    expect(serialized).not.toContain('/Users/person')

    const accounted = result.collection.includedRecords + result.collection.metadataSkipped +
      result.collection.nonAssistantSkipped + result.collection.duplicatesSkipped +
      result.collection.syntheticSkipped + result.collection.malformedSkipped +
      result.collection.outsideWindowSkipped + result.collection.unsupportedRecordsSkipped +
      result.collection.missingIdentitySkipped + result.collection.orphanToolResultsSkipped
    expect(accounted).toBe(result.collection.recordsRead)
  })

  function insertMessage(): (row: unknown[]) => void {
    const database = new DatabaseSync(databasePath)
    const insert = database.prepare(`
      INSERT INTO messages (
        id, session_id, role, content, tool_call_id, tool_calls, tool_name,
        effect_disposition, timestamp, finish_reason, display_kind
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    return (row) => {
      insert.run(...(row as Parameters<typeof insert.run>))
    }
  }

  function collectSkills(committedState = committed()) {
    return collectHermesAgent({
      sessionsDir: databasePath,
      profileName: 'bbokeoter-private-profile',
      window: { start: START, end: END },
      committed: committedState,
      category: 'general',
      source: 'hermes',
    })
  }

  it('skill_view가 SKILL.md를 연 호출만 결과가 도착한 시점에 스킬 로드로 세고 다른 인자는 읽지 않는다', async () => {
    const insert = insertMessage()
    insert([10, 'session-secret', 'assistant', 'private', null, JSON.stringify([
      // 본문 로드 — 인자가 객체, plugin:skill 형태
      { id: 'skill-1', function: { name: 'skill_view', arguments: { name: 'openclaw-skills:session-cleanup' } } },
      // 본문 로드 — 인자가 JSON 문자열 (OpenAI 형식), 대문자는 소문자로
      { id: 'skill-2', function: { name: 'skill_view', arguments: '{"name":"Humanizer"}' } },
      // 링크 파일 열람은 로드가 아니다
      { id: 'skill-3', function: { name: 'skill_view', arguments: { name: 'humanizer', file_path: 'references/tone.md' } } },
      // 실패한 로드
      { id: 'skill-4', function: { name: 'skill_view', arguments: { name: 'humanizer' } } },
      // 경로처럼 생긴 이름은 버린다
      { id: 'skill-5', function: { name: 'skill_view', arguments: { name: '/Users/person/private/SKILL.md' } } },
      // skill_view가 아닌 도구의 인자는 스킬로 읽지 않는다
      { id: 'skill-6', function: { name: 'read_file', arguments: { name: 'humanizer', path: '/Users/person/private' } } },
      // Hermes 카테고리 상대 경로는 마지막 조각만 스킬 이름이다
      { id: 'skill-7', function: { name: 'skill_view', arguments: { name: '03-fine-tuning/axolotl' } } },
      // 공백이 섞인 자유 문자열은 카탈로그 식별자가 아니다 (서버 계약 위반, PII 가능)
      { id: 'skill-8', function: { name: 'skill_view', arguments: { name: 'john smith medical record' } } },
      // 깨진 JSON 인자는 조용히 버린다
      { id: 'skill-9', function: { name: 'skill_view', arguments: '{"name":' } },
    ]), null, null, epoch('2026-08-26T02:00:00Z'), null, null])
    let id = 11
    for (const [callId, disposition, finish] of [
      ['skill-1', null, null], ['skill-2', null, null], ['skill-3', null, null], ['skill-4', 'failed', 'error'],
      ['skill-5', null, null], ['skill-6', null, null], ['skill-7', null, null], ['skill-8', null, null], ['skill-9', null, null],
    ] as const) {
      insert([id++, 'session-secret', 'tool', 'private result', callId, null, 'skill_view', disposition,
        epoch('2026-08-26T02:00:01Z'), finish, null])
    }

    const result = await collectSkills()

    // 실패한 로드는 존재하지 않는 스킬일 수 있어 이름 대신 unknown-skill로 센다
    expect(result.skillLoads).toEqual([
      { skillId: 'axolotl', loaded: 1, failed: 0, interrupted: 0 },
      { skillId: 'humanizer', loaded: 1, failed: 0, interrupted: 0 },
      { skillId: 'openclaw-skills:session-cleanup', loaded: 1, failed: 0, interrupted: 0 },
      { skillId: 'unknown-skill', loaded: 0, failed: 1, interrupted: 0 },
    ])
    for (const load of result.skillLoads) expect(load.skillId).toMatch(/^[a-z0-9][a-z0-9._:-]*$/)
    expect(result.tools.find((tool) => tool.name === 'skill_view')).toEqual({ name: 'skill_view', calls: 8, failures: 1 })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('/Users/person')
    expect(serialized).not.toContain('references/tone.md')
    expect(serialized).not.toContain('john')
    expect(serialized).not.toContain('03-fine-tuning')
  })

  it('결과가 없는 skill_view 호출은 보류했다가 결과가 다음 수집 창에 오면 그때 센다', async () => {
    const insert = insertMessage()
    insert([20, 'session-secret', 'assistant', 'private', null, JSON.stringify([
      { id: 'skill-late', function: { name: 'skill_view', arguments: { name: 'browse' } } },
    ]), null, null, epoch('2026-08-26T03:00:00Z'), null, null])

    const first = await collectSkills()
    expect(first.skillLoads).toEqual([])
    expect(first.tools.find((tool) => tool.name === 'skill_view')?.calls).toBe(1)

    insert([21, 'session-secret', 'tool', 'private result', 'skill-late', null, 'skill_view', null,
      epoch('2026-08-26T03:00:05Z'), null, null])
    const second = await collectSkills(first.nextCommitted)
    expect(second.skillLoads).toEqual([{ skillId: 'browse', loaded: 1, failed: 0, interrupted: 0 }])
    // 호출 자체는 첫 수집에서 이미 셌으므로 다시 세지 않는다
    expect(second.tools.find((tool) => tool.name === 'skill_view')).toBeUndefined()

    const third = await collectSkills(second.nextCommitted)
    expect(third.skillLoads).toEqual([])
  })

  it('한 호출에 결과 행이 여러 개 와도 스킬 로드를 한 번만 센다', async () => {
    const insert = insertMessage()
    insert([30, 'session-secret', 'assistant', 'private', null, JSON.stringify([
      { id: 'skill-dup', function: { name: 'skill_view', arguments: { name: 'browse' } } },
    ]), null, null, epoch('2026-08-26T04:00:00Z'), null, null])
    insert([31, 'session-secret', 'tool', 'result one', 'skill-dup', null, 'skill_view', null,
      epoch('2026-08-26T04:00:01Z'), null, null])
    insert([32, 'session-secret', 'tool', 'result two', 'skill-dup', null, 'skill_view', null,
      epoch('2026-08-26T04:00:02Z'), null, null])

    const result = await collectSkills()
    expect(result.skillLoads).toEqual([{ skillId: 'browse', loaded: 1, failed: 0, interrupted: 0 }])
  })

  it('같은 DB의 다른 Hermes 프로필 세션과 메시지를 집계에서 제외한다', async () => {
    const database = new DatabaseSync(databasePath)
    database.prepare(`
      INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('other-session-secret', 'other-model', epoch('2026-08-26T07:00:00Z'), 900, 800, 700, 600, 500,
      'other-private-profile', '/Users/other/private')
    database.prepare(`
      INSERT INTO messages (
        id, session_id, role, content, tool_call_id, tool_calls, tool_name,
        effect_disposition, timestamp, finish_reason, display_kind
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(100, 'other-session-secret', 'user', 'other private prompt', null, null, null, null,
      epoch('2026-08-26T02:00:00Z'), null, null)
    database.close()

    const result = await collectHermesAgent({
      sessionsDir: databasePath,
      profileName: 'bbokeoter-private-profile',
      window: { start: START, end: END },
      committed: committed(),
      category: 'qa-verify',
      source: 'hermes',
    })

    expect(result).toMatchObject({
      sessions: 1,
      turns: 1,
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        cacheCreationInputTokens: 10,
        cacheReadInputTokens: 40,
        thinkingTokens: 5,
      },
      collection: { recordsRead: 7 },
    })
    expect(JSON.stringify(result)).not.toContain('other-private-profile')
    expect(JSON.stringify(result)).not.toContain('other-session-secret')
  })

  it('default 범위는 NULL·빈 문자열·default 세션만 모아 이름 있는 프로필과 분리한다', async () => {
    const database = new DatabaseSync(databasePath)
    const insertSession = database.prepare(`
      INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insertSession.run('default-null', 'default-model', epoch('2026-08-26T08:00:00Z'), 11, 12, 13, 14, 15,
      null, '/Users/default/null')
    insertSession.run('default-empty', 'default-model', epoch('2026-08-26T08:01:00Z'), 21, 22, 23, 24, 25,
      '', '/Users/default/empty')
    insertSession.run('default-explicit', 'default-model', epoch('2026-08-26T08:02:00Z'), 31, 32, 33, 34, 35,
      'default', '/Users/default/explicit')
    insertSession.run('named-session', 'named-model', epoch('2026-08-26T08:03:00Z'), 900, 800, 700, 600, 500,
      'named-profile', '/Users/named/private')
    const insertMessage = database.prepare(`
      INSERT INTO messages (
        id, session_id, role, content, tool_call_id, tool_calls, tool_name,
        effect_disposition, timestamp, finish_reason, display_kind
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insertMessage.run(101, 'default-null', 'user', 'default null prompt', null, null, null, null,
      epoch('2026-08-26T03:00:00Z'), null, null)
    insertMessage.run(102, 'default-empty', 'user', 'default empty prompt', null, null, null, null,
      epoch('2026-08-26T03:01:00Z'), null, null)
    insertMessage.run(103, 'default-explicit', 'user', 'default explicit prompt', null, null, null, null,
      epoch('2026-08-26T03:02:00Z'), null, null)
    insertMessage.run(104, 'named-session', 'user', 'named private prompt', null, null, null, null,
      epoch('2026-08-26T03:03:00Z'), null, null)
    database.close()

    const result = await collectHermesAgent({
      sessionsDir: databasePath,
      profileName: 'default',
      window: { start: START, end: END },
      committed: committed(),
      category: 'qa-verify',
      source: 'hermes',
    })

    expect(result).toMatchObject({
      sessions: 3,
      turns: 3,
      usage: {
        inputTokens: 63,
        outputTokens: 66,
        cacheCreationInputTokens: 72,
        cacheReadInputTokens: 69,
        thinkingTokens: 75,
      },
      collection: { recordsRead: 6, includedRecords: 6 },
    })
    expect(result.models).toEqual([{ model: 'default-model', turns: 3, usage: result.usage }])
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('named-profile')
    expect(serialized).not.toContain('default-null')
  })

  it('이름 있는 프로필은 default 세션을 포함하지 않는다', async () => {
    const database = new DatabaseSync(databasePath)
    database.prepare(`
      INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('default-null', 'default-model', epoch('2026-08-26T08:00:00Z'), 900, 800, 700, 600, 500,
      null, '/Users/default/private')
    database.close()

    const result = await collectHermesAgent({
      sessionsDir: databasePath,
      profileName: 'bbokeoter-private-profile',
      window: { start: START, end: END },
      committed: committed(),
      category: 'qa-verify',
      source: 'hermes',
    })

    expect(result).toMatchObject({ sessions: 1, turns: 1, collection: { recordsRead: 7 } })
    expect(result.usage.inputTokens).toBe(100)
  })

  it('지정한 Hermes 프로필에 세션이 없으면 오타로 보고 실패한다', async () => {
    await expect(collectHermesAgent({
      sessionsDir: databasePath,
      profileName: 'missing-profile',
      window: { start: START, end: END },
      committed: committed(),
      category: 'qa-verify',
      source: 'hermes',
    })).rejects.toThrow('Hermes profile scope does not match any sessions')
  })

  it('다음 실행에서는 세션 누적값의 증가분만 집계한다', async () => {
    const first = await collectHermesAgent({
      sessionsDir: databasePath,
      profileName: 'bbokeoter-private-profile',
      window: { start: START, end: END },
      committed: committed(),
      category: 'qa-verify',
      source: 'hermes',
    })
    const database = new DatabaseSync(databasePath)
    database.prepare(`
      UPDATE sessions SET last_activity_at = ?, input_tokens = ?, output_tokens = ?,
        cache_read_tokens = ?, cache_write_tokens = ?, reasoning_tokens = ? WHERE id = ?
    `).run(epoch('2026-08-27T02:00:00Z'), 130, 28, 55, 12, 7, 'session-secret')
    database.prepare(`
      INSERT INTO messages (
        id, session_id, role, content, tool_call_id, tool_calls, tool_name,
        effect_disposition, timestamp, finish_reason, display_kind
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(7, 'session-secret', 'user', 'another private prompt', null, null, null, null,
      epoch('2026-08-27T02:00:00Z'), null, null)
    database.close()

    const second = await collectHermesAgent({
      sessionsDir: databasePath,
      profileName: 'bbokeoter-private-profile',
      window: { start: END, end: new Date('2026-08-28T00:00:00.000Z') },
      committed: first.nextCommitted,
      category: 'qa-verify',
      source: 'hermes',
    })

    expect(second).toMatchObject({
      sessions: 1,
      turns: 1,
      usage: {
        inputTokens: 30,
        outputTokens: 8,
        cacheCreationInputTokens: 2,
        cacheReadInputTokens: 15,
        thinkingTokens: 2,
        thinkingTokensRelation: 'unknown',
      },
      collection: { recordsRead: 8, includedRecords: 2, outsideWindowSkipped: 6 },
    })
    expect(second.models).toEqual([{ model: 'hermes-3', turns: 1, usage: second.usage }])
    expect(second.tools).toEqual([])

    const unchanged = await collectHermesAgent({
      sessionsDir: databasePath,
      profileName: 'bbokeoter-private-profile',
      window: {
        start: new Date('2026-08-28T00:00:00.000Z'),
        end: new Date('2026-08-29T00:00:00.000Z'),
      },
      committed: second.nextCommitted,
      category: 'qa-verify',
      source: 'hermes',
    })
    expect(unchanged).toMatchObject({
      sessions: 0,
      turns: 0,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        thinkingTokens: 0,
        thinkingTokensRelation: 'unknown',
      },
      collection: {
        recordsRead: 8,
        includedRecords: 0,
        outsideWindowSkipped: 8,
        healthStatus: 'healthy',
        healthWarnings: [],
      },
    })
    expect(unchanged.models).toEqual([])
    expect(unchanged.tools).toEqual([])
  })
})
