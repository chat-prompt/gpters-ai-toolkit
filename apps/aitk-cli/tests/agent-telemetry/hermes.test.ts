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
      profile_name TEXT NOT NULL,
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
