import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
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


describe('Codex explicit agent attribution', () => {
  function session(name: string, tag?: string, tools = false) {
    writeFileSync(join(root, `${name}.jsonl`), [
      line('2026-08-26T01:00:00Z', 'session_meta', { cwd: '/workspace/shared', thread_source: tag }),
      line('2026-08-26T01:00:01Z', 'turn_context', { cwd: '/tmp', model: 'gpt-5.6-codex' }),
      line('2026-08-26T01:00:02Z', 'event_msg', { type: 'token_count', info: { last_token_usage: { input_tokens: 12, output_tokens: 3 } } }),
      ...(tools ? [line('2026-08-26T01:00:03Z', 'response_item', { type: 'function_call', name: 'exec', arguments: 'private' })] : []),
      line('2026-08-26T01:00:04Z', 'event_msg', { type: 'task_complete', turn_id: name }),
    ].join('\n') + '\n')
  }
  const opts = () => ({ sessionsDir: root, window: { start: START, end: END }, committed: committed(),
    category: 'unclassified' as const, source: 'codex' as const, codexThreadSource: 'aitk-agent:test-agent' })

  it('only includes the tagged agent, even when humans and other agents share its cwd', async () => {
    session('agent', 'aitk-agent:test-agent')
    session('human')
    session('other', 'aitk-agent:other')
    const result = await collectCodexAgent(opts())
    expect(result).toMatchObject({ sessions: 1, turns: 1, usage: { inputTokens: 12, outputTokens: 3 },
      collection: { filesExcludedByScope: 2, healthStatus: 'healthy', healthWarnings: [] } })
    expect(JSON.stringify(result)).not.toContain('aitk-agent:')
    expect(JSON.stringify(result.nextCommitted.files)).not.toContain('human')
    const again = await collectCodexAgent({ ...opts(), committed: result.nextCommitted })
    expect(again).toMatchObject({ turns: 0, usage: { inputTokens: 0 }, collection: { healthStatus: 'healthy' } })
  })

  it('requires both filters when a directory restriction is also specified', async () => {
    session('agent', 'aitk-agent:test-agent')
    const result = await collectCodexAgent({ ...opts(), projectSlugs: ['shared'] })
    expect(result.turns).toBe(0) // tagged session moved outside the additional cwd restriction
    const excluded = await collectCodexAgent({ ...opts(), projectSlugs: ['elsewhere'] })
    expect(excluded.collection.healthWarnings).toContain('no-files-in-scope')
  })

  it('does not silently collect the whole home when neither scope is supplied', async () => {
    session('human')
    const result = await collectCodexAgent({ ...opts(), codexThreadSource: undefined })
    expect(result.collection.healthWarnings).toContain('no-files-in-scope')
    expect(result.turns).toBe(0)
  })

  it('does not block a live tool call before its turn completes', async () => {
    session('agent', 'aitk-agent:test-agent', true)
    const path = join(root, 'agent.jsonl')
    const lines = readFileSync(path, 'utf8').trimEnd().split('\n')
    writeFileSync(path, lines.slice(0, -1).join('\n') + '\n')
    const result = await collectCodexAgent(opts())
    expect(result).toMatchObject({ turns: 0, collection: { healthStatus: 'healthy', healthWarnings: [] } })
  })

  it('does not use an earlier completed turn to judge a later live tool call', async () => {
    session('agent', 'aitk-agent:test-agent')
    const path = join(root, 'agent.jsonl')
    writeFileSync(path, readFileSync(path, 'utf8') + [
      line('2026-08-26T01:00:05Z', 'event_msg', { type: 'task_started', turn_id: 'next' }),
      line('2026-08-26T01:00:06Z', 'response_item', { type: 'custom_tool_call', name: 'exec' }),
    ].join('\n') + '\n')
    const result = await collectCodexAgent(opts())
    expect(result).toMatchObject({ turns: 1, collection: { healthStatus: 'healthy', healthWarnings: [] } })
  })

  it('keeps the missing-tools guard for a real tool call without parsed tool evidence', async () => {
    session('agent', 'aitk-agent:test-agent', true)
    const result = await collectCodexAgent(opts())
    expect(result.collection.healthWarnings).toContain('codex-tools-missing')
    expect(result.collection.healthStatus).toBe('blocked')
  })
})

it.each([false, true])('restores model, hashed turn and out-of-scope state across offsets (legacy=%s)', async legacy => {
  const path = join(root, 'resume.jsonl')
  const prefix = [line('2026-08-26T01:00:00Z', 'session_meta', { cwd: '/workspace/allowed' }),
    line('2026-08-26T01:00:01Z', 'turn_context', { cwd: '/workspace/allowed', model: 'gpt-test' }),
    line('2026-08-26T01:00:02Z', 'event_msg', { type: 'task_started', turn_id: 'private-turn' })].join('\n') + '\n'
  writeFileSync(path, prefix)
  const options = { sessionsDir: root, source: 'codex' as const, category: 'qa-verify' as const, projectSlugs: ['allowed'] }
  const first = await collectCodexAgent({ ...options, committed: committed(), window: { start: START, end: new Date('2026-08-26T02:00:00Z') } })
  expect(JSON.stringify(first.nextCommitted)).not.toContain('private-turn')
  if (legacy) for (const file of Object.values(first.nextCommitted.files)) delete file.codexContext
  writeFileSync(path, prefix + [line('2026-08-26T03:00:00Z', 'event_msg', { type: 'token_count', info: { last_token_usage: { input_tokens: 42 } } }),
    line('2026-08-26T03:00:01Z', 'event_msg', { type: 'task_complete' }),
    line('2026-08-26T03:00:02Z', 'turn_context', { cwd: '/private/other', model: 'private-model' })].join('\n') + '\n')
  const second = await collectCodexAgent({ ...options, committed: first.nextCommitted, window: { start: new Date('2026-08-26T02:00:00Z'), end: new Date('2026-08-26T04:00:00Z') } })
  expect(second.models).toMatchObject([{ model: 'gpt-test', turns: 1, usage: { inputTokens: 42 } }])
  writeFileSync(path, readFileSync(path, 'utf8') + line('2026-08-26T05:00:00Z', 'event_msg', { type: 'token_count', info: { last_token_usage: { input_tokens: 999 } } }) + '\n')
  const third = await collectCodexAgent({ ...options, committed: second.nextCommitted, window: { start: new Date('2026-08-26T04:00:00Z'), end: END } })
  expect(third.usage.inputTokens).toBe(0)
})

it('does not consume a complete line appended after the collection boundary', async()=>{
 const path=join(root,'future.jsonl')
 writeFileSync(path,[line('2026-08-26T01:00:00Z','session_meta',{cwd:'/workspace/allowed'}),line('2026-08-26T03:00:00Z','event_msg',{type:'token_count',info:{last_token_usage:{input_tokens:77}}})].join('\n')+'\n')
 const options={sessionsDir:root,source:'codex' as const,category:'qa-verify' as const,projectSlugs:['allowed']}
 const first=await collectCodexAgent({...options,committed:committed(),window:{start:START,end:new Date('2026-08-26T02:00:00Z')}})
 expect(first.usage.inputTokens).toBe(0)
 const second=await collectCodexAgent({...options,committed:first.nextCommitted,window:{start:new Date('2026-08-26T02:00:00Z'),end:END}})
 expect(second.usage.inputTokens).toBe(77)
})
