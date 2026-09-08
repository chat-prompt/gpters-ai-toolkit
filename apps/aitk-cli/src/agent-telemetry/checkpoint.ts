/** 에이전트 telemetry checkpoint의 fail-closed 읽기와 원자적 쓰기 */

import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AgentTelemetryCheckpoint } from './types.js'

/** Old checkpoints have no usage snapshot. A corrupt new baseline must never trigger a recount. */
function validSnapshots(state: AgentTelemetryCheckpoint['committed']): boolean {
  return Array.isArray(state.seenMessages) && state.seenMessages.every(seen => {
    const snapshot = seen?.usageSnapshot
    if (snapshot === undefined) return true
    if (!snapshot || typeof snapshot.model !== 'string' || !snapshot.usage) return false
    const usage = snapshot.usage
    return ['inputTokens', 'outputTokens', 'cacheCreationInputTokens', 'cacheReadInputTokens', 'thinkingTokens']
      .every(key => Number.isSafeInteger(usage[key as keyof typeof usage]) && (usage[key as keyof typeof usage] as number) >= 0)
      && ['unknown', 'included-in-output', 'separate-from-output'].includes(usage.thinkingTokensRelation)
  })
}

function isCheckpoint(value: unknown): value is AgentTelemetryCheckpoint {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<AgentTelemetryCheckpoint>
  return row.version === 1 && typeof row.agentId === 'string' &&
    typeof row.collectorInstanceId === 'string' && !!row.committed &&
    typeof row.committed === 'object' && typeof row.committed.lastWindowEndUtc !== 'undefined' &&
    !!row.committed.files && validSnapshots(row.committed) &&
    (!row.pending || (!!row.pending.nextCommitted && validSnapshots(row.pending.nextCommitted)))
}

export async function readAgentTelemetryCheckpoint(path: string): Promise<AgentTelemetryCheckpoint | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown
    if (!isCheckpoint(parsed)) throw new Error('invalid checkpoint schema')
    return parsed
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return null
    throw new Error('Agent telemetry checkpoint is unreadable; refusing to rescan and double count', { cause })
  }
}

export async function writeAgentTelemetryCheckpoint(path: string, state: AgentTelemetryCheckpoint): Promise<void> {
  const directory = dirname(path)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, path)
  await chmod(path, 0o600)
}
