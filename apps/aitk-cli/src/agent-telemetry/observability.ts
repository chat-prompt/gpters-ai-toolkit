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
  bootstrapReports?: { path: string }
  bootProbe?: { channel: string; marker: string }
}
export interface ObservationScope { sessionsDir: string; projectSlugs?: string[]; codexThreadSource?: string }
/** Fixed timing reasons the pinned helper may report with exit code 75. Anything else fails closed. */
export const OBSERVATION_TIMING_REASONS = ['source-changed', 'partial-tail'] as const
/** A timing reason: a source file changed or was still being written while the helper scanned it. */
export type ObservationTimingReason = typeof OBSERVATION_TIMING_REASONS[number]
/** Result when the window is sent without observability because of a timing failure. */
export interface ObservationSkipped { skipped: ObservationTimingReason }
class ObservationTimingError extends Error { constructor(readonly reason: ObservationTimingReason) { super('Observation timing failure') } }
/**
 * Fixed codes a fail-closed observation failure is reported with. They never carry a path, record or helper
 * stderr, so an operator can tell a timeout from an integrity or config failure without exposing sources.
 */
export const OBSERVATION_FAILURE_CODES = ['node-version', 'already-enriched', 'config', 'artifact', 'helper-timeout', 'helper-output',
  'helper-failed', 'unexpected-observation',
  // Helper inventory reasons (see infra/agent-observability/bridge.mjs)
  'source-consistency', 'entry-limit', 'candidate-limit', 'file-limit', 'scan-limit', 'invalid-header', 'header-limit',
  'invalid-record', 'session-identity', 'invalid-timestamp', 'line-limit', 'stale-tail', 'selection-limit', 'validation'] as const
/** Fixed reason code for a fail-closed observation failure */
export type ObservationFailureCode = typeof OBSERVATION_FAILURE_CODES[number]
class ObservationFailure extends Error { constructor(readonly code: ObservationFailureCode) { super(code) } }
const failWith = (code: ObservationFailureCode): never => { throw new ObservationFailure(code) }
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
function readObservationConfig(path: string, batch: AgentTelemetryBatch, scope: ObservationScope): { config: ObservationConfig; helper: Buffer; bootstrapIdentity?: string } {
  const config = JSON.parse(readOwned(path, 240000, true).toString('utf8')) as ObservationConfig
  const keys = ['version', 'agentId', 'source', 'helperPath', 'helperSha256', 'cliFiles', 'cliInventory', 'readGuardFiles', 'runtimeBindings', 'runtimeRecords', 'bootstrapReports', 'bootProbe']
  if (!config || typeof config !== 'object' || Object.keys(config).some(key => !keys.includes(key)) || config.version !== 1
    || config.agentId !== batch.agentId || config.source !== batch.collection.source || typeof config.helperPath !== 'string'
    || !/^[a-f0-9]{64}$/.test(config.helperSha256)) throw new Error('Bridge scope mismatch')
  for (const key of ['cliFiles', 'readGuardFiles', 'runtimeBindings', 'runtimeRecords'] as const) {
    if (config[key] !== undefined && (!Array.isArray(config[key]) || config[key]!.length > 500)) throw new Error('Invalid bridge inventory')
  }
  if (config.cliInventory !== undefined && (config.cliInventory !== 'installed-scope' || (config.cliFiles?.length ?? 0) > 0 || !['claude-code', 'codex'].includes(batch.collection.source))) throw new Error('Invalid dynamic inventory')
  for (const value of [...(config.cliFiles ?? []), ...(config.readGuardFiles ?? [])]) {
    const file = value as { path?: unknown; sessionKey?: unknown; completeFromStart?: unknown; agentExclusive?: unknown; sessionFilter?: unknown }
    if (!file || typeof file !== 'object' || Object.keys(file).some(key => !['path', 'sessionKey', 'completeFromStart', 'agentExclusive', 'sessionFilter'].includes(key))
      || typeof file.path !== 'string' || !isAbsolute(file.path) || typeof file.sessionKey !== 'string' || !file.sessionKey || file.sessionKey.length > 255
      || (file.completeFromStart !== undefined && typeof file.completeFromStart !== 'boolean')) throw new Error('Explicit source files required')
    if ((config.readGuardFiles ?? []).includes(value)) {
      // Either attested exclusive to this agent, or a shared log filtered to the sessions discovered in this
      // collector's own installed scope (Claude only: its guard rows carry the Claude session ID).
      const filtered = file.sessionFilter === 'installed-scope' && file.agentExclusive === undefined && file.completeFromStart === undefined
        && config.cliInventory === 'installed-scope' && batch.collection.source === 'claude-code'
      if (file.agentExclusive !== true && !filtered) throw new Error('Shared guard logs are not eligible')
      if (file.agentExclusive === true && file.sessionFilter !== undefined) throw new Error('Shared guard logs are not eligible')
    } else if (file.agentExclusive !== undefined || file.sessionFilter !== undefined) {
      throw new Error('Explicit source files required')
    } else {
      if (!['claude-code', 'codex'].includes(batch.collection.source)) throw new Error('Native runtime CLI metrics unsupported')
      const root = realpathSync(scope.sessionsDir), target = realpathSync(file.path)
      const local = relative(root, target)
      if (!local || local === '..' || local.startsWith('../') || isAbsolute(local)) throw new Error('CLI file outside existing collector scope')
      if (batch.collection.source === 'claude-code' && !scope.projectSlugs?.includes(local.split('/')[0])) throw new Error('CLI project outside existing collector scope')
    }
  }
  let bootstrapIdentity: string | undefined
  if (config.bootstrapReports !== undefined) {
    // OpenClaw boot reports: one owned regular file, read by the helper in read-only mode. Claude only.
    const reports = config.bootstrapReports as { path?: unknown }
    if (!reports || typeof reports !== 'object' || Object.keys(reports).some(key => key !== 'path') || typeof reports.path !== 'string'
      || !isAbsolute(reports.path) || batch.collection.source !== 'claude-code') throw new Error('Invalid boot report source')
    const stat = lstatSync(reports.path)
    if (!stat.isFile() || stat.uid !== process.getuid?.() || realpathSync(reports.path) !== reports.path) throw new Error('Invalid boot report source')
    // The helper must read exactly this file: it re-checks device, inode and owner before and after its query.
    bootstrapIdentity = `${stat.dev}:${stat.ino}:${stat.uid}`
  }
  if (config.bootProbe !== undefined) {
    // The daily fixed boot probe: Claude sessions whose first message is the marker line in one Slack channel,
    // recognized from the transcripts of the Claude dynamic inventory.
    const probe = config.bootProbe as { channel?: unknown; marker?: unknown }
    if (!probe || typeof probe !== 'object' || Object.keys(probe).some(key => !['channel', 'marker'].includes(key))
      || typeof probe.channel !== 'string' || !/^[A-Z0-9]{9,12}$/.test(probe.channel)
      || typeof probe.marker !== 'string' || !/^\[[A-Z0-9-]{3,32}\]$/.test(probe.marker)
      || config.cliInventory !== 'installed-scope' || batch.collection.source !== 'claude-code') throw new Error('Invalid boot probe')
  }
  let helper: Buffer
  try { helper = readOwned(config.helperPath, 2000000, false) } catch { return failWith('artifact') }
  if (createHash('sha256').update(helper).digest('hex') !== config.helperSha256) failWith('artifact')
  return { config, helper, bootstrapIdentity }
}
async function runHelper(config: ObservationConfig, helper: Buffer, batch: AgentTelemetryBatch, scope: ObservationScope, bootstrapIdentity?: string): Promise<string> {
  const input = JSON.stringify({ agentId: batch.agentId, source: batch.collection.source, window: batch.window,
    cliFiles: config.cliFiles ?? [], cliInventory: config.cliInventory, readGuardFiles: config.readGuardFiles ?? [], runtimeBindings: config.runtimeBindings ?? [], runtimeRecords: config.runtimeRecords ?? [],
    ...(config.bootstrapReports ? { bootstrapReports: { path: config.bootstrapReports.path, identity: bootstrapIdentity } } : {}),
    ...(config.bootProbe ? { bootProbe: config.bootProbe } : {}),
    scope: { sessionsDir: realpathSync(scope.sessionsDir), projectSlugs: scope.projectSlugs, codexThreadSource: scope.codexThreadSource } })
  return new Promise((resolve, reject) => {
    // Do not inherit collector credentials, HOME, NODE_OPTIONS or runtime agent settings.
    // Execute the exact hashed bytes via stdin; never reopen the mutable helper pathname.
    const child = spawn(process.execPath, ['--input-type=module'], { env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', AITK_OBSERVATION_INPUT_FD: '3' }, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] })
    const output: Buffer[] = []
    let size = 0, errorSize = 0, stopped: ObservationFailureCode | null = null
    const stop = (code: ObservationFailureCode) => { stopped ??= code; child.kill('SIGKILL') }
    // If the collector exits (a signal, an error exit) while the helper runs, the helper does not outlive it.
    const killOnExit = () => { child.kill('SIGKILL') }
    process.once('exit', killOnExit)
    const timer = setTimeout(() => stop('helper-timeout'), 30000)
    child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 512000) stop('helper-output'); else output.push(chunk) })
    child.stderr.on('data', (chunk: Buffer) => { errorSize += chunk.length; if (errorSize > 64000) stop('helper-output') })
    child.on('error', () => { clearTimeout(timer); process.off('exit', killOnExit); reject(new ObservationFailure('helper-failed')) })
    child.on('close', code => {
      clearTimeout(timer)
      process.off('exit', killOnExit)
      const text = Buffer.concat(output).toString('utf8')
      if (stopped) reject(new ObservationFailure(stopped))
      else if (code === 75) {
        // Only the exact fixed reason is trusted; any other stdout on exit 75 is a helper failure.
        const reason = OBSERVATION_TIMING_REASONS.find(value => text === JSON.stringify({ observationUnavailable: value }))
        reject(reason ? new ObservationTimingError(reason) : new ObservationFailure('helper-failed'))
      } else if (code !== 0) {
        // A failing helper may name one fixed reason; anything else is reported as a generic helper failure.
        const reason = OBSERVATION_FAILURE_CODES.find(value => text === JSON.stringify({ observationFailed: value }))
        reject(new ObservationFailure(reason ?? 'helper-failed'))
      } else resolve(text)
    })
    child.stdin.on('error', () => { /* close event owns the failure */ })
    const inputPipe = child.stdio[3] as Writable
    inputPipe.on('error', () => { /* close event owns the failure */ })
    inputPipe.end(input)
    child.stdin.end(helper)
  })
}
/**
 * Canonical schema validation happens inside the pinned, reviewed self-contained helper.
 *
 * Config, hash and scope checks run before the helper, so a timing result can only come from a
 * verified helper. A timing failure (a source file changed during the scan) returns `{ skipped }`, tags the
 * batch with `collection.observabilityFailure` and the caller sends the window without observability; every
 * other failure still throws (fail closed) with a fixed reason code in its message.
 *
 * @param batch - New batch to enrich in place
 * @param configPath - Private observation config path
 * @param scope - Existing collector scope
 * @returns `{ skipped }` when this window's observation was omitted for a timing reason, otherwise undefined
 */
export async function attachAgentObservability(batch: AgentTelemetryBatch, configPath: string, scope: ObservationScope): Promise<ObservationSkipped | undefined> {
  try {
    if (Number(process.versions.node.split('.')[0]) < 24) failWith('node-version')
    if (batch.collection.observability !== undefined || batch.collection.observabilityFailure !== undefined) failWith('already-enriched')
    let checked: { config: ObservationConfig; helper: Buffer; bootstrapIdentity?: string }
    try { checked = readObservationConfig(configPath, batch, scope) } catch (cause) { if (cause instanceof ObservationFailure) throw cause; return failWith('config') }
    const { config, helper, bootstrapIdentity } = checked
    const text = await runHelper(config, helper, batch, scope, bootstrapIdentity)
    let observation: Record<string, unknown>
    try { observation = JSON.parse(text) as Record<string, unknown> } catch { return failWith('unexpected-observation') }
    const keys = ['schemaVersion', 'agentId', 'source', 'window', 'capabilities', 'receipts', 'metrics', 'metricCapabilities', 'provenance']
    const window = observation.window as AgentTelemetryBatch['window']
    if (Object.keys(observation).length !== keys.length || Object.keys(observation).some(key => !keys.includes(key))
      || observation.schemaVersion !== 1 || observation.agentId !== batch.agentId || observation.source !== batch.collection.source
      || window?.startUtc !== batch.window.startUtc || window.endUtc !== batch.window.endUtc) failWith('unexpected-observation')
    batch.collection.observability = observation
    return undefined
  } catch (cause) {
    if (cause instanceof ObservationTimingError) {
      // The server records only the fixed reason, so the window is visible as omitted rather than missing.
      batch.collection.observabilityFailure = cause.reason
      return { skipped: cause.reason }
    }
    // Never include a private source path, helper stderr, raw record or credentials in CLI output: only a fixed code.
    const code = cause instanceof ObservationFailure ? cause.code : 'helper-failed'
    throw new Error(`Observation bridge failed (${code}); check Node24+, private config, artifact hash and source scope. No new batch was sent or checkpoint advanced.`)
  }
}
