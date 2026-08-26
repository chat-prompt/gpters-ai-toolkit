import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectCodexAgent } from '../../src/agent-telemetry/codex.js'
import type { AgentTelemetryCommittedState } from '../../src/agent-telemetry/types.js'

const START = new Date('2026-08-26T00:00:00.000Z')
const END = new Date('2026-08-27T00:00:00.000Z')
let root = ''

function committed(): AgentTelemetryCommittedState {
  return { lastWindowEndUtc: null, files: {}, seenMessages: [] }
}

function line(timestamp: string, type: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ timestamp, type, payload })
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aitk-codex-'))
  mkdirSync(join(root, '2026', '08', '26'), { recursive: true })
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('collectCodexAgent', () => {
  it('프로젝트 범위를 지키며 usage·turn·tool·execution을 원문 없이 집계한다', async () => {
    const included = join(root, '2026', '08', '26', 'rollout-included.jsonl')
    writeFileSync(included, [
      line('2026-08-26T01:00:00Z', 'session_meta', { cwd: '/workspace/allowed' }),
      line('2026-08-26T01:00:01Z', 'turn_context', { cwd: '/workspace/allowed', model: 'gpt-5.6-codex', turn_id: 'turn-secret' }),
      line('2026-08-26T01:00:02Z', 'event_msg', { type: 'task_started', turn_id: 'turn-secret' }),
      line('2026-08-26T01:00:03Z', 'event_msg', {
        type: 'token_count',
        info: { last_token_usage: {
          input_tokens: 100, cached_input_tokens: 40, output_tokens: 20,
          reasoning_output_tokens: 5, cache_write_input_tokens: 10, total_tokens: 120,
        }, total_token_usage: {
          input_tokens: 100, cached_input_tokens: 40, output_tokens: 20,
          reasoning_output_tokens: 5, cache_write_input_tokens: 10, total_tokens: 120,
        } },
      }),
      line('2026-08-26T01:00:03.500Z', 'event_msg', {
        type: 'token_count',
        info: { last_token_usage: {
          input_tokens: 100, cached_input_tokens: 40, output_tokens: 20,
          reasoning_output_tokens: 5, cache_write_input_tokens: 10, total_tokens: 120,
        }, total_token_usage: {
          input_tokens: 100, cached_input_tokens: 40, output_tokens: 20,
          reasoning_output_tokens: 5, cache_write_input_tokens: 10, total_tokens: 120,
        } },
      }),
      line('2026-08-26T01:00:04Z', 'event_msg', {
        type: 'item_completed', item: { id: 'tool-secret-1', type: 'CommandExecution', status: 'completed', exit_code: 0, command: 'private command' },
      }),
      line('2026-08-26T01:00:05Z', 'event_msg', {
        type: 'item_completed', item: { id: 'tool-secret-2', type: 'McpToolCall', tool: 'slack_read', status: 'failed', arguments: { private: true } },
      }),
      line('2026-08-26T01:00:06Z', 'response_item', { type: 'custom_tool_call', name: 'exec', input: 'private input' }),
      line('2026-08-26T01:00:07Z', 'event_msg', { type: 'task_complete', turn_id: 'turn-secret' }),
    ].join('\n') + '\n')

    const excluded = join(root, '2026', '08', '26', 'rollout-excluded.jsonl')
    writeFileSync(excluded, [
      line('2026-08-26T02:00:00Z', 'session_meta', { cwd: '/workspace/personal' }),
      line('2026-08-26T02:00:01Z', 'event_msg', { type: 'task_complete', turn_id: 'personal-turn' }),
    ].join('\n') + '\n')

    const result = await collectCodexAgent({
      sessionsDir: root,
      window: { start: START, end: END },
      committed: committed(),
      category: 'code-deploy',
      source: 'codex',
      projectSlugs: ['allowed'],
    })

    expect(result).toMatchObject({
      sessions: 1,
      turns: 1,
      usage: {
        inputTokens: 60,
        outputTokens: 20,
        cacheCreationInputTokens: 10,
        cacheReadInputTokens: 40,
        thinkingTokens: 5,
        thinkingTokensRelation: 'included-in-output',
      },
      collection: {
        source: 'codex',
        filesDiscovered: 2,
        filesExcludedByScope: 1,
        filesRead: 1,
        recordsRead: 9,
        includedRecords: 4,
        metadataSkipped: 4,
        duplicatesSkipped: 1,
        healthStatus: 'healthy',
        healthWarnings: [],
      },
    })
    expect(result.models).toEqual([{
      model: 'gpt-5.6-codex', turns: 1, usage: result.usage,
    }])
    expect(result.tools).toEqual([
      { name: 'CommandExecution', calls: 1, failures: 0 },
      { name: 'slack_read', calls: 1, failures: 1 },
    ])
    expect(result.executions).toEqual([{ status: 'success', evidence: 'verified', count: 1 }])
    expect(JSON.stringify(result)).not.toContain('turn-secret')
    expect(JSON.stringify(result)).not.toContain('private command')
    expect(JSON.stringify(result)).not.toContain('/workspace')

    const again = await collectCodexAgent({
      sessionsDir: root,
      window: { start: END, end: new Date('2026-08-28T00:00:00.000Z') },
      committed: result.nextCommitted,
      category: 'code-deploy',
      source: 'codex',
      projectSlugs: ['allowed'],
    })
    expect(again).toMatchObject({ turns: 0, sessions: 0, collection: { filesRead: 0, recordsRead: 0 } })
  })

  it('범위에 맞는 세션이 없으면 blocked로 진단한다', async () => {
    writeFileSync(join(root, '2026', '08', '26', 'rollout.jsonl'),
      line('2026-08-26T01:00:00Z', 'session_meta', { cwd: '/workspace/personal' }) + '\n')
    const result = await collectCodexAgent({
      sessionsDir: root,
      window: { start: START, end: END },
      committed: committed(),
      category: 'unclassified',
      source: 'codex',
      projectSlugs: ['allowed'],
    })
    expect(result.collection).toMatchObject({
      healthStatus: 'blocked', healthWarnings: ['no-files-in-scope'], filesExcludedByScope: 1,
    })
  })
})
