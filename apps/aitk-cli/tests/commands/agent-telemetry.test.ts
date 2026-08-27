import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentTelemetryBatch, AgentTelemetryCheckpoint } from '../../src/agent-telemetry/types.js'
import { validateAgentTelemetryBatch } from '../../../../packages/lib/src/features/ax/agent-telemetry-contract'

vi.mock('../../src/output.js', () => ({
  jsonOut: vi.fn(),
  error: vi.fn((message: string) => { throw new Error(message) }),
}))

import { runAgentTelemetryCollect } from '../../src/commands/agent-telemetry.js'
import { jsonOut } from '../../src/output.js'

const NOW = new Date('2026-08-27T00:00:00.000Z')
let root = ''
let sessionsDir = ''
let checkpointDir = ''

function setupTranscript(): void {
  mkdirSync(sessionsDir, { recursive: true })
  writeFileSync(join(sessionsDir, 'session.jsonl'), [
    JSON.stringify({ type: 'session', id: 'session-secret', timestamp: '2026-08-26T00:00:00Z' }),
    JSON.stringify({
      type: 'message', id: 'message-secret', timestamp: '2026-08-26T10:00:00Z',
      message: {
        role: 'assistant', provider: 'anthropic', model: 'claude-opus-5',
        content: [{ type: 'text', text: 'private prompt and response' }],
        usage: { input: 3, output: 7, cacheRead: 11, cacheWrite: 5 },
      },
    }),
  ].join('\n') + '\n')
}

function options(dryRun: boolean) {
  return {
    agentId: 'bbodoong',
    days: 7,
    dryRun,
    collectorVersion: '0.6.2',
    sessionsDir,
    checkpointDir,
    serverUrl: 'http://127.0.0.1:3002',
    now: NOW,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  root = mkdtempSync(join(tmpdir(), 'aitk-agent-command-'))
  sessionsDir = join(root, 'sessions')
  checkpointDir = join(root, 'checkpoint')
  setupTranscript()
  process.env.AX_AGENT_TELEMETRY_TOKEN = 'local-token'
})

afterEach(() => {
  delete process.env.AX_AGENT_TELEMETRY_TOKEN
  vi.unstubAllGlobals()
  rmSync(root, { recursive: true, force: true })
})

describe('aitk agent-telemetry collect', () => {
  it('--dry-run은 계약에 맞는 PII-free batch를 출력하고 checkpoint를 쓰지 않는다', async () => {
    await runAgentTelemetryCollect(options(true))

    const output = vi.mocked(jsonOut).mock.calls[0][0] as { batch: AgentTelemetryBatch }
    expect(validateAgentTelemetryBatch(output.batch)).toMatchObject({ ok: true })
    expect(output.batch).toMatchObject({ agentId: 'bbodoong', sessions: 1, turns: 1 })
    expect(JSON.stringify(output)).not.toContain('session-secret')
    expect(JSON.stringify(output)).not.toContain('private prompt')
    expect(() => readFileSync(join(checkpointDir, 'bbodoong-openclaw.json'))).toThrow()
  })

  it('실패 전에 pending batch를 보존하고 재시도할 때 같은 batchId를 보낸다', async () => {
    const sent: AgentTelemetryBatch[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)) as AgentTelemetryBatch)
      if (sent.length === 1) return new Response(JSON.stringify({ error: 'temporary failure' }), { status: 500 })
      return new Response(JSON.stringify({ ok: true, inserted: false }), { status: 200 })
    }))

    await expect(runAgentTelemetryCollect(options(false))).rejects.toThrow('Pending batch was preserved')
    const stateAfterFailure = JSON.parse(
      readFileSync(join(checkpointDir, 'bbodoong-openclaw.json'), 'utf8')
    ) as AgentTelemetryCheckpoint
    expect(stateAfterFailure.pending?.batch.batchId).toBe(sent[0].batchId)
    expect(stateAfterFailure.committed.lastWindowEndUtc).toBeNull()

    await runAgentTelemetryCollect(options(false))
    expect(sent[1].batchId).toBe(sent[0].batchId)
    const stateAfterSuccess = JSON.parse(
      readFileSync(join(checkpointDir, 'bbodoong-openclaw.json'), 'utf8')
    ) as AgentTelemetryCheckpoint
    expect(stateAfterSuccess.pending).toBeUndefined()
    expect(stateAfterSuccess.committed.lastWindowEndUtc).toBe(NOW.toISOString())
  })

  it('토큰 없는 실제 전송과 존재하지 않는 sessions 경로를 fail-closed로 막는다', async () => {
    delete process.env.AX_AGENT_TELEMETRY_TOKEN
    await expect(runAgentTelemetryCollect(options(false))).rejects.toThrow('AX_AGENT_TELEMETRY_TOKEN')

    await expect(runAgentTelemetryCollect({
      ...options(true),
      sessionsDir: join(root, 'missing'),
    })).rejects.toThrow('sessions directory does not exist')
  })

  it('runtime label에 경로나 민감 문자열을 넣지 못하게 막는다', async () => {
    await expect(runAgentTelemetryCollect({
      ...options(true),
      openclawVersion: '/Users/person/private',
    })).rejects.toThrow('sensitive characters')
  })

  it('claude-code 소스는 명시적인 transcript 경로를 요구한다', async () => {
    await expect(runAgentTelemetryCollect({
      ...options(true),
      source: 'claude-code',
      sessionsDir: undefined,
    })).rejects.toThrow('--sessions-dir is required for every telemetry source')

    await expect(runAgentTelemetryCollect({
      ...options(true),
      source: 'claude-code',
    })).rejects.toThrow('--project-slugs is required')
  })

  it('openclaw도 agentId에서 경로를 추정하지 않고 명시적인 transcript 경로를 요구한다', async () => {
    await expect(runAgentTelemetryCollect({
      ...options(true),
      sessionsDir: undefined,
    })).rejects.toThrow('--sessions-dir is required for every telemetry source')
  })

  it('건강도가 blocked인 빈 집계를 실제 서버로 전송하지 않는다', async () => {
    writeFileSync(join(sessionsDir, 'session.jsonl'), Array.from({ length: 20 }, (_, index) => JSON.stringify({
      type: 'progress', uuid: `unsupported-${index}`, timestamp: '2026-08-26T10:00:00Z',
    })).join('\n') + '\n')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(runAgentTelemetryCollect({
      ...options(false),
    })).rejects.toThrow('collection health is blocked')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(() => readFileSync(join(checkpointDir, 'bbodoong-openclaw.json'))).toThrow()
  })
})
