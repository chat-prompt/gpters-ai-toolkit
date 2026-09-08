import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readAgentTelemetryCheckpoint, writeAgentTelemetryCheckpoint } from '../../src/agent-telemetry/checkpoint.js'
import { emptyAgentUsage, type AgentTelemetryCheckpoint } from '../../src/agent-telemetry/types.js'

let directory: string
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'aitk-checkpoint-')) })
afterEach(() => rmSync(directory, { recursive: true, force: true }))
const state = (): AgentTelemetryCheckpoint => ({
  version: 1, agentId: 'fixture', collectorInstanceId: 'fixture', committed: {
    lastWindowEndUtc: null, files: {}, seenMessages: [{ hash: 'hashed', atUtc: '2026-09-08T00:00:00Z' }],
  },
})

it('기존 체크포인트와 새 사용량 스냅샷을 모두 읽고 보존한다', async () => {
  const path = join(directory, 'state.json')
  const old = state()
  await writeAgentTelemetryCheckpoint(path, old)
  expect(await readAgentTelemetryCheckpoint(path)).toEqual(old)
  old.committed.seenMessages[0].usageSnapshot = { model: 'fixture-model', usage: { ...emptyAgentUsage(), outputTokens: 2 } }
  await writeAgentTelemetryCheckpoint(path, old)
  expect(await readAgentTelemetryCheckpoint(path)).toEqual(old)
})

it('손상된 스냅샷을 새 집계의 기준으로 사용하지 않는다', async () => {
  const path = join(directory, 'state.json')
  const value = state()
  value.committed.seenMessages[0].usageSnapshot = { model: 'fixture-model', usage: { ...emptyAgentUsage(), outputTokens: -1 } }
  writeFileSync(path, JSON.stringify(value))
  await expect(readAgentTelemetryCheckpoint(path)).rejects.toThrow('refusing to rescan and double count')
})
