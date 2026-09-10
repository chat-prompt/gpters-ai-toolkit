/** Opt-in repo-built metrics bridge. Runs only while creating a new pending batch. */
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { Writable } from 'node:stream'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import type { AgentTelemetryBatch } from './types.js'

interface ObservationConfig {
  version: 1
  agentId: string
  source: string
  helperPath: string
  helperSha256: string
  cliFiles?: unknown[]
  cliInventory?: 'installed-scope'
  readGuardFiles?: unknown[]
  runtimeBindings?: unknown[]
  runtimeRecords?: unknown[]
}
export interface ObservationScope { sessionsDir: string; projectSlugs?: string[]; codexThreadSource?: string }
function readOwned(path: string, maximum: number, privateMode: boolean): Buffer {
  if (!isAbsolute(path)) throw new Error('Absolute path required')
  const parent = dirname(path), directory = lstatSync(parent)
  if (!directory.isDirectory() || directory.uid !== process.getuid?.() || (directory.mode & 0o022) !== 0 || realpathSync(parent) !== resolve(parent)) throw new Error('Unsafe bridge directory')
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.uid !== process.getuid?.() || stat.size > maximum
      || (privateMode ? (stat.mode & 0o777) !== 0o600 : (stat.mode & 0o022) !== 0)) throw new Error('Unsafe bridge input')
    const bytes = Buffer.alloc(maximum + 1)
    let length = 0
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, length)
      if (!count) break
      length += count
    }
    const after = fstatSync(fd)
    if (length > maximum || length !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) throw new Error('Bridge input changed during read')
    return bytes.subarray(0, length)
  } finally { closeSync(fd) }
}
function readObservationConfig(path: string, batch: AgentTelemetryBatch, scope: ObservationScope): { config: ObservationConfig; helper: Buffer } {
  const config = JSON.parse(readOwned(path, 240000, true).toString('utf8')) as ObservationConfig
  const keys = ['version', 'agentId', 'source', 'helperPath', 'helperSha256', 'cliFiles', 'cliInventory', 'readGuardFiles', 'runtimeBindings', 'runtimeRecords']
  if (!config || typeof config !== 'object' || Object.keys(config).some(key => !keys.includes(key)) || config.version !== 1
    || config.agentId !== batch.agentId || config.source !== batch.collection.source || typeof config.helperPath !== 'string'
    || !/^[a-f0-9]{64}$/.test(config.helperSha256)) throw new Error('Bridge scope mismatch')
  for (const key of ['cliFiles', 'readGuardFiles', 'runtimeBindings', 'runtimeRecords'] as const) {
    if (config[key] !== undefined && (!Array.isArray(config[key]) || config[key]!.length > 500)) throw new Error('Invalid bridge inventory')
  }
  if (config.cliInventory !== undefined && (config.cliInventory !== 'installed-scope' || (config.cliFiles?.length ?? 0) > 0 || !['claude-code', 'codex'].includes(batch.collection.source))) throw new Error('Invalid dynamic inventory')
  for (const value of [...(config.cliFiles ?? []), ...(config.readGuardFiles ?? [])]) {
    const file = value as { path?: unknown; sessionKey?: unknown; completeFromStart?: unknown; agentExclusive?: unknown }
    if (!file || typeof file !== 'object' || Object.keys(file).some(key => !['path', 'sessionKey', 'completeFromStart', 'agentExclusive'].includes(key))
      || typeof file.path !== 'string' || !isAbsolute(file.path) || typeof file.sessionKey !== 'string' || !file.sessionKey || file.sessionKey.length > 255
      || (file.completeFromStart !== undefined && typeof file.completeFromStart !== 'boolean')) throw new Error('Explicit source files required')
    if ((config.readGuardFiles ?? []).includes(value)) {
      if (file.agentExclusive !== true) throw new Error('Shared guard logs are not eligible')
    } else {
      if (!['claude-code', 'codex'].includes(batch.collection.source)) throw new Error('Native runtime CLI metrics unsupported')
      const root = realpathSync(scope.sessionsDir), target = realpathSync(file.path)
      const local = relative(root, target)
      if (!local || local === '..' || local.startsWith('../') || isAbsolute(local)) throw new Error('CLI file outside existing collector scope')
      if (batch.collection.source === 'claude-code' && !scope.projectSlugs?.includes(local.split('/')[0])) throw new Error('CLI project outside existing collector scope')
    }
  }
  const helper = readOwned(config.helperPath, 2000000, false)
  if (createHash('sha256').update(helper).digest('hex') !== config.helperSha256) throw new Error('Bridge artifact changed')
  return { config, helper }
}
async function runHelper(config: ObservationConfig, helper: Buffer, batch: AgentTelemetryBatch, scope: ObservationScope): Promise<string> {
  const input = JSON.stringify({ agentId: batch.agentId, source: batch.collection.source, window: batch.window,
    cliFiles: config.cliFiles ?? [], cliInventory: config.cliInventory, readGuardFiles: config.readGuardFiles ?? [], runtimeBindings: config.runtimeBindings ?? [], runtimeRecords: config.runtimeRecords ?? [],
    scope: { sessionsDir: realpathSync(scope.sessionsDir), projectSlugs: scope.projectSlugs, codexThreadSource: scope.codexThreadSource } })
  return new Promise((resolve, reject) => {
    // Do not inherit collector credentials, HOME, NODE_OPTIONS or runtime agent settings.
    // Execute the exact hashed bytes via stdin; never reopen the mutable helper pathname.
    const child = spawn(process.execPath, ['--input-type=module'], { env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', AITK_OBSERVATION_INPUT_FD: '3' }, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] })
    const output: Buffer[] = []
    let size = 0, errorSize = 0, failed = false
    const stop = () => { failed = true; child.kill('SIGKILL') }
    const timer = setTimeout(stop, 30000)
    child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 512000) stop(); else output.push(chunk) })
    child.stderr.on('data', (chunk: Buffer) => { errorSize += chunk.length; if (errorSize > 64000) stop() })
    child.on('error', () => { clearTimeout(timer); reject(new Error('Bridge helper failed')) })
    child.on('close', code => { clearTimeout(timer); if (failed || code !== 0) reject(new Error('Bridge helper failed')); else resolve(Buffer.concat(output).toString('utf8')) })
    child.stdin.on('error', () => { /* close event owns the failure */ })
    const inputPipe = child.stdio[3] as Writable
    inputPipe.on('error', () => { /* close event owns the failure */ })
    inputPipe.end(input)
    child.stdin.end(helper)
  })
}
/** Canonical schema validation happens inside the pinned, reviewed self-contained helper. */
export async function attachAgentObservability(batch: AgentTelemetryBatch, configPath: string, scope: ObservationScope): Promise<void> {
  try {
    if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node24 required')
    if (batch.collection.observability !== undefined) throw new Error('Already enriched')
    const { config, helper } = readObservationConfig(configPath, batch, scope)
    const observation = JSON.parse(await runHelper(config, helper, batch, scope)) as Record<string, unknown>
    const keys = ['schemaVersion', 'agentId', 'source', 'window', 'capabilities', 'receipts', 'metrics', 'metricCapabilities', 'provenance']
    const window = observation.window as AgentTelemetryBatch['window']
    if (Object.keys(observation).length !== keys.length || Object.keys(observation).some(key => !keys.includes(key))
      || observation.schemaVersion !== 1 || observation.agentId !== batch.agentId || observation.source !== batch.collection.source
      || window?.startUtc !== batch.window.startUtc || window.endUtc !== batch.window.endUtc) throw new Error('Unexpected observation')
    batch.collection.observability = observation
  } catch {
    // Never include a private source path, helper stderr, raw record or credentials in CLI output.
    throw new Error('Observation bridge failed; check Node24+, private config, artifact hash and source scope. No new batch was sent or checkpoint advanced.')
  }
}
