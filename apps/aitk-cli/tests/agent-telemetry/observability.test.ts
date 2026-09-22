import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { attachAgentObservability } from '../../src/agent-telemetry/observability.js'
import type { AgentTelemetryBatch } from '../../src/agent-telemetry/types.js'
const processHook = vi.hoisted(() => ({ beforeSpawn: undefined as (() => void) | undefined }))
vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, spawn: (...args: Parameters<typeof actual.spawn>) => { processHook.beforeSpawn?.(); return actual.spawn(...args) } }
})
vi.mock('../../src/output.js', () => ({ jsonOut: vi.fn(), error: (message: string) => { throw new Error(message) } }))
import { createInstallation, writeAgentTelemetryInstallation, readAgentTelemetryInstallation } from '../../src/agent-telemetry/installation.js'
import { runAgentTelemetryUpgrade } from '../../src/commands/agent-telemetry-lifecycle.js'
import { observationLock, runAgentTelemetryCollect, staleLockContent } from '../../src/commands/agent-telemetry.js'
const now = new Date('2026-01-03T00:00:00.000Z')
let root: string, sessions: string, checkpoints: string, configPath: string, helperPath: string, built: string, bundle: Buffer
const originalNode = process.versions.node
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
function config(extra: Record<string, unknown> = {}) { writeFileSync(configPath, JSON.stringify({ version: 1, agentId: 'example-agent', source: 'openclaw', helperPath, helperSha256: sha(readFileSync(helperPath)), ...extra }), { mode: 0o600 }) }
function opts() { return { agentId: 'example-agent', source: 'openclaw', days: 1, dryRun: false, collectorVersion: '1.0.0', sessionsDir: sessions, checkpointDir: checkpoints, now, emitOutput: false, telemetryToken: 'anonymous-fixture', serverUrl: 'https://example.invalid', observabilityConfig: configPath } }
function batch(source = 'openclaw'): AgentTelemetryBatch { return { agentId: 'example-agent', collection: { source }, window: { startUtc: '2026-01-02T00:00:00.000Z', endUtc: now.toISOString() } } as AgentTelemetryBatch }
function statePath() { return join(checkpoints, 'example-agent-openclaw.json') }
function state() { return JSON.parse(readFileSync(statePath(), 'utf8')) }
function response(ok = true) { return new Response(JSON.stringify(ok ? { ok: true, inserted: true } : { error: 'fixture failure' }), { status: ok ? 200 : 500 }) }
function fakeHelper(code: string) { writeFileSync(helperPath, code, { mode: 0o600 }); config() }
// Legacy Node22 collectors are covered by the other suites; executable bridge coverage requires Node24.
describe.skipIf(Number(originalNode.split('.')[0]) < 24)('managed observation bridge with the actual bundled helper', () => {
beforeAll(() => { built = realpathSync(mkdtempSync(join(tmpdir(), 'observation-build-'))); execFileSync('bun', ['build', resolve('../../infra/agent-observability/bridge.mjs'), '--target', 'node', '--format', 'esm', '--outfile', join(built, 'bridge.mjs')], { stdio: 'pipe' }); bundle = readFileSync(join(built, 'bridge.mjs')) })
afterAll(() => rmSync(built, { recursive: true, force: true }))
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'observation-fixture-'))); sessions = join(root, 'sessions'); checkpoints = join(root, 'checkpoint'); mkdirSync(sessions, { mode: 0o700 })
  writeFileSync(join(sessions, 'session.jsonl'), JSON.stringify({ type: 'session', id: 'anonymous', timestamp: '2026-01-02T01:00:00Z' }) + '\n' + JSON.stringify({ type: 'message', id: 'anonymous-message', timestamp: '2026-01-02T02:00:00Z', message: { role: 'assistant', model: 'example-model', usage: { input: 10, output: 2 }, content: [{ type: 'text', text: 'fixture raw content must stay local' }] } }) + '\n')
  configPath = join(root, 'config.json'); helperPath = join(root, 'bridge.mjs'); writeFileSync(helperPath, bundle, { mode: 0o600 }); config(); vi.stubGlobal('fetch', vi.fn(async () => response()))
})
afterEach(() => { processHook.beforeSpawn = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); Object.defineProperty(process.versions, 'node', { value: originalNode }); rmSync(root, { recursive: true, force: true }) })
  it('discovers new scoped sessions each batch and retries dynamic pending without touching config/helper/source', async () => {
    const project = join(sessions, 'project-a'); mkdirSync(project)
    const record = (id: string, at: string) => JSON.stringify({ type: 'assistant', timestamp: at, message: { id, role: 'assistant', model: 'example', stop_reason: 'end_turn', usage: { input_tokens: 42, output_tokens: 1 } } }) + '\n'
    writeFileSync(join(project, 'old.jsonl'), record('old', '2026-01-01T12:00:00Z'))
    config({ source: 'claude-code', cliInventory: 'installed-scope' })
    const first = batch('claude-code'); await attachAgentObservability(first, configPath, { sessionsDir: sessions, projectSlugs: ['project-a'] })
    expect(first.collection.observability).toMatchObject({ capabilities: { cliMetrics: 'uncollected' } })
    writeFileSync(join(project, 'new.jsonl'), record('new', '2026-01-02T12:00:00Z'))
    const next = batch('claude-code'); await attachAgentObservability(next, configPath, { sessionsDir: sessions, projectSlugs: ['project-a'] })
    expect(next.collection.observability).toMatchObject({ metrics: { peakContextTokens: { count: 1, sum: 42 } } })
    const sent: string[] = []; vi.stubGlobal('fetch', vi.fn(async (_url, init) => { sent.push(init.body); return response(sent.length > 1) }))
    const options = { ...opts(), source: 'claude-code', projectSlugs: 'project-a' }
    await expect(runAgentTelemetryCollect(options)).rejects.toThrow('Pending batch was preserved')
    rmSync(configPath); rmSync(helperPath); rmSync(project, { recursive: true }); Object.defineProperty(process.versions, 'node', { value: '22.0.0' })
    await runAgentTelemetryCollect(options); expect(sent[1]).toBe(sent[0]); expect(JSON.parse(sent[0]).collection.observability.metrics.peakContextTokens.sum).toBe(42)
  })
  it('freezes validated aggregates and replays unchanged after config/helper/source disappear', async () => {
    const guard = join(root, 'guard.jsonl'); writeFileSync(guard, JSON.stringify({ ts: '2026-01-02T01:00:00.000Z', decision: 'deny' }) + '\n'); config({ readGuardFiles: [{ path: guard, sessionKey: 'private-session', agentExclusive: true }] })
    const sent: string[] = []; vi.stubGlobal('fetch', vi.fn(async (_url, init) => { sent.push(init.body); return response(sent.length > 1) }))
    await expect(runAgentTelemetryCollect(opts())).rejects.toThrow('Pending batch was preserved')
    expect(state().committed.lastWindowEndUtc).toBeNull(); expect(state().pending.batch.collection.observability.capabilities.cliMetrics).toBe('unsupported'); expect(state().pending.batch.collection.observability).toMatchObject({ capabilities: { readGuard: 'supported' }, metrics: { readGuardDeny: 1 } })
    expect(sent[0]).not.toContain(root); expect(sent[0]).not.toContain('private-session'); expect(sent[0]).not.toContain('fixture raw content')
    rmSync(configPath); rmSync(helperPath); rmSync(guard); Object.defineProperty(process.versions, 'node', { value: '22.0.0' })
    await runAgentTelemetryCollect(opts()); expect(sent[1]).toBe(sent[0]); expect(state().pending).toBeUndefined(); expect(state().committed.lastWindowEndUtc).toBe(now.toISOString()); expect(existsSync(statePath() + '.observation.lock')).toBe(false)
  })
  it('executes pinned bytes when the helper pathname is replaced immediately before spawn', async () => {
    const marker = join(root, 'must-not-execute')
    processHook.beforeSpawn = () => { writeFileSync(helperPath, `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)},'changed')`); processHook.beforeSpawn = undefined }
    const value = batch(); await attachAgentObservability(value, configPath, { sessionsDir: sessions })
    expect(value.collection.observability).toBeDefined(); expect(existsSync(marker)).toBe(false)
  })
  it('decodes multibyte input split across pipe writes without corrupting source paths', async () => {
    const guard = join(root, '익명-guard.jsonl'); writeFileSync(guard, JSON.stringify({ ts: '2026-01-02T01:00:00.000Z', decision: 'deny' }) + '\n')
    const input = Buffer.from(JSON.stringify({ agentId: 'example-agent', source: 'openclaw', window: batch().window, readGuardFiles: [{ path: guard, sessionKey: '익명-session' }] }))
    const child = spawn(process.execPath, [helperPath], { stdio: ['pipe', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []; child.stdout.on('data', chunk => chunks.push(chunk))
    const complete = new Promise<number | null>((resolve, reject) => { child.on('close', resolve); child.on('error', reject) })
    for (let i = 0; i < input.length; i++) { child.stdin.write(input.subarray(i, i + 1)); await new Promise<void>(resolve => setImmediate(resolve)) }
    child.stdin.end(); expect(await complete).toBe(0)
    expect(JSON.parse(Buffer.concat(chunks).toString())).toMatchObject({ provenance: { readGuard: { filesRead: 1 } }, capabilities: { readGuard: 'supported' }, metrics: { readGuardDeny: 1 } })
  })
  it('explicitly enables and disables managed configuration without changing identity or uploading', async () => {
    const scriptPath = join(root, 'aitk.js'); writeFileSync(scriptPath, '')
    const installation = createInstallation({ agentId: 'example-agent', collectorId: 'example-collector', source: 'openclaw', sessionsDir: sessions, checkpointDir: checkpoints, serverUrl: 'https://example.invalid', backfillDays: 1, nodePath: process.execPath, scriptPath, collectorVersion: '1.0.0', account: 'example', schedule: 'none', home: root, now })
    writeAgentTelemetryInstallation(installation, root)
    const options = { agentId: 'example-agent', source: 'openclaw', platform: 'darwin' as const, home: root, now, nodePath: process.execPath, cliScriptPath: scriptPath, collectorVersion: '1.0.0', runner: () => ({ status: 0, stdout: 'v24.0.0', stderr: '' }) }
    await runAgentTelemetryUpgrade({ ...options, observabilityConfig: configPath })
    expect(readAgentTelemetryInstallation('example-agent', 'openclaw', root)).toMatchObject({ observabilityConfig: configPath, collectorId: 'example-collector' })
    rmSync(configPath); await runAgentTelemetryUpgrade({ ...options, disableObservability: true })
    const disabled = readAgentTelemetryInstallation('example-agent', 'openclaw', root)
    expect(disabled.observabilityConfig).toBeUndefined(); expect(disabled.collectorId).toBe('example-collector'); expect(fetch).not.toHaveBeenCalled()
  })
  it('does not enrich older pending even when opting in with absent config', async () => {
    const sent: string[] = []; vi.stubGlobal('fetch', vi.fn(async (_url, init) => { sent.push(init.body); return response(sent.length > 1) }))
    await expect(runAgentTelemetryCollect({ ...opts(), observabilityConfig: undefined })).rejects.toThrow(); rmSync(configPath); await runAgentTelemetryCollect(opts())
    expect(sent[1]).toBe(sent[0]); expect(JSON.parse(sent[1]).collection.observability).toBeUndefined()
  })
  it.each(['config-mode', 'config-symlink', 'helper-hash', 'wrong-agent', 'guard-not-exclusive', 'node22'])('fails closed with no POST/checkpoint for %s', async reason => {
    if (reason === 'config-mode') chmodSync(configPath, 0o644)
    if (reason === 'config-symlink') { const content = readFileSync(configPath); rmSync(configPath); writeFileSync(join(root, 'other.json'), content, { mode: 0o600 }); symlinkSync(join(root, 'other.json'), configPath) }
    if (reason === 'helper-hash') writeFileSync(helperPath, 'changed')
    if (reason === 'wrong-agent') config({ agentId: 'another-agent' })
    if (reason === 'guard-not-exclusive') config({ readGuardFiles: [{ path: join(root, 'shared.jsonl'), sessionKey: 'shared' }] })
    if (reason === 'node22') Object.defineProperty(process.versions, 'node', { value: '22.0.0' })
    await expect(runAgentTelemetryCollect(opts())).rejects.toThrow('Observation bridge failed'); expect(fetch).not.toHaveBeenCalled(); expect(existsSync(statePath())).toBe(false)
  })
  it.each(['source-changed', 'partial-tail'])('sends the window without observability when a verified helper reports timing reason %s', async reason => {
    fakeHelper(`process.stdout.write(JSON.stringify({observationUnavailable:'${reason}'})); process.exitCode=75`)
    const sent: string[] = []; vi.stubGlobal('fetch', vi.fn(async (_url, init) => { sent.push(init.body); return response() }))
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const result = await runAgentTelemetryCollect(opts())
    expect(sent).toHaveLength(1); expect(JSON.parse(sent[0]).collection.observability).toBeUndefined(); expect(JSON.parse(sent[0]).collection.observabilityFailure).toBe(reason)
    expect(result.dryRun).toBe(false); expect(state().pending).toBeUndefined(); expect(state().committed.lastWindowEndUtc).toBe(now.toISOString())
    expect(stderr.mock.calls.map(call => String(call[0])).join('')).toContain(`observation omitted for this window (${reason})`)
  })
  it('the actual bundled helper turns a still-being-written transcript into a timing skip, not a lost batch', async () => {
    const project = join(sessions, 'project-a'); mkdirSync(project)
    const record = JSON.stringify({ type: 'assistant', timestamp: '2026-01-02T12:00:00Z', message: { id: 'live', role: 'assistant', model: 'example', stop_reason: 'end_turn', usage: { input_tokens: 42, output_tokens: 1 } } })
    writeFileSync(join(project, 'live.jsonl'), record + '\n' + record.slice(0, 20))
    config({ source: 'claude-code', cliInventory: 'installed-scope' })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const sent: string[] = []; vi.stubGlobal('fetch', vi.fn(async (_url, init) => { sent.push(init.body); return response() }))
    await runAgentTelemetryCollect({ ...opts(), source: 'claude-code', projectSlugs: 'project-a' })
    expect(sent).toHaveLength(1); expect(JSON.parse(sent[0]).collection.observability).toBeUndefined(); expect(sent[0]).not.toContain(root)
  })
  it.each([
    ['unknown reason', "process.stdout.write(JSON.stringify({observationUnavailable:'config'})); process.exitCode=75"],
    ['extra stdout', "process.stdout.write(JSON.stringify({observationUnavailable:'source-changed', path:'/private/x'.repeat(30)})); process.exitCode=75"],
    ['short extra key', "process.stdout.write(JSON.stringify({observationUnavailable:'source-changed', path:'/x'})); process.exitCode=75"],
    ['integrity reason', "process.stdout.write(JSON.stringify({observationUnavailable:'stale-tail'})); process.exitCode=75"],
    ['non-json stdout', "process.stdout.write('source-changed'); process.exitCode=75"],
  ])('fails closed with no POST/checkpoint on exit 75 with %s', async (_label, code) => {
    fakeHelper(code)
    await expect(runAgentTelemetryCollect(opts())).rejects.toThrow('Observation bridge failed'); expect(fetch).not.toHaveBeenCalled(); expect(existsSync(statePath())).toBe(false)
  })
  it('keeps a timing-skipped batch pending and replays it unchanged after an upload failure', async () => {
    fakeHelper("process.stdout.write(JSON.stringify({observationUnavailable:'source-changed'})); process.exitCode=75")
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const sent: string[] = []; vi.stubGlobal('fetch', vi.fn(async (_url, init) => { sent.push(init.body); return response(sent.length > 1) }))
    await expect(runAgentTelemetryCollect(opts())).rejects.toThrow('Pending batch was preserved')
    expect(state().committed.lastWindowEndUtc).toBeNull(); expect(state().pending.batch.collection.observability).toBeUndefined()
    await runAgentTelemetryCollect(opts()); expect(sent[1]).toBe(sent[0]); expect(state().pending).toBeUndefined()
  })
  it.each([['exit', 'helper-failed'], ['stdout', 'helper-output'], ['stderr', 'helper-output']])('bounds helper %s failure and never exposes stderr', async (kind, code) => {
    fakeHelper(kind === 'stdout' ? "process.stdout.write('x'.repeat(512001))" : kind === 'stderr' ? "process.stderr.write('x'.repeat(64001))" : "process.stderr.write('/private/secret-fixture/raw-record'); process.exitCode=1")
    const failure = await runAgentTelemetryCollect(opts()).then(() => null, (cause: Error) => cause.message)
    expect(failure).toMatch(new RegExp(`^Observation bridge failed \\(${code}\\); check`)); expect(failure).not.toContain('secret-fixture')
    expect(fetch).not.toHaveBeenCalled(); expect(existsSync(statePath())).toBe(false)
  })
  it.each([
    ['config-mode', 'config'], ['helper-hash', 'artifact'], ['node22', 'node-version'],
    ['fixed helper reason', 'scan-limit'], ['unknown helper reason', 'helper-failed'], ['helper reason with extra keys', 'helper-failed'],
  ])('reports fail-closed %s with only the fixed code %s', async (label, code) => {
    if (label === 'config-mode') chmodSync(configPath, 0o644)
    if (label === 'helper-hash') writeFileSync(helperPath, 'changed')
    if (label === 'node22') Object.defineProperty(process.versions, 'node', { value: '22.0.0' })
    if (label === 'fixed helper reason') fakeHelper("process.stdout.write(JSON.stringify({observationFailed:'scan-limit'})); process.exitCode=1")
    if (label === 'unknown helper reason') fakeHelper("process.stdout.write(JSON.stringify({observationFailed:'/private/path'})); process.exitCode=1")
    if (label === 'helper reason with extra keys') fakeHelper("process.stdout.write(JSON.stringify({observationFailed:'scan-limit',path:'/x'})); process.exitCode=1")
    await expect(runAgentTelemetryCollect(opts())).rejects.toThrow(`Observation bridge failed (${code});`); expect(fetch).not.toHaveBeenCalled(); expect(existsSync(statePath())).toBe(false)
  })
  it('the actual bundled helper names a fixed reason when it fails closed', async () => {
    const project = join(sessions, 'project-a'); mkdirSync(project)
    writeFileSync(join(project, 'broken.jsonl'), '{not json\n')
    config({ source: 'claude-code', cliInventory: 'installed-scope' })
    await expect(attachAgentObservability(batch('claude-code'), configPath, { sessionsDir: sessions, projectSlugs: ['project-a'] })).rejects.toThrow('Observation bridge failed (invalid-record);')
  })
  it('kills a helper after its 30 second deadline', async () => {
    fakeHelper('setInterval(() => {}, 1000)'); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const rejected = expect(attachAgentObservability(batch(), configPath, { sessionsDir: sessions })).rejects.toThrow('Observation bridge failed (helper-timeout);')
    await vi.advanceTimersByTimeAsync(30001); vi.useRealTimers(); await rejected; expect(fetch).not.toHaveBeenCalled(); expect(existsSync(statePath())).toBe(false)
  })
  it('blocks concurrent writers until the first request acknowledges pending', async () => {
    let accept!: (value: Response) => void, entered!: () => void
    const ready = new Promise<void>(resolve => { entered = resolve }); vi.stubGlobal('fetch', vi.fn(() => { entered(); return new Promise<Response>(resolve => { accept = resolve }) }))
    const first = runAgentTelemetryCollect(opts()); await ready; const before = readFileSync(statePath(), 'utf8')
    await expect(runAgentTelemetryCollect(opts())).rejects.toThrow('lock unavailable'); expect(fetch).toHaveBeenCalledTimes(1); expect(readFileSync(statePath(), 'utf8')).toBe(before)
    accept(response()); await first; expect(state().pending).toBeUndefined()
  })
  it('reclaims only a lock left by a collector that is gone and older than 10 minutes', async () => {
    mkdirSync(checkpoints, { mode: 0o700 }); const lock = statePath() + '.observation.lock'
    const gone = await new Promise<number>(resolve => { const child = spawn(process.execPath, ['-e', '0']); child.on('exit', () => resolve(child.pid!)) })
    const old = new Date(Date.now() - 11 * 60 * 1000).toISOString(), recent = new Date(Date.now() - 60 * 1000).toISOString()
    // A live process (this test's parent) or a recent lock is never taken.
    for (const content of [{ pid: process.ppid, createdAt: old }, { pid: gone, createdAt: recent }]) {
      writeFileSync(lock, JSON.stringify(content), { mode: 0o600 })
      await expect(runAgentTelemetryCollect(opts())).rejects.toThrow('lock unavailable'); expect(fetch).not.toHaveBeenCalled()
      expect(JSON.parse(readFileSync(lock, 'utf8'))).toEqual(content)
    }
    writeFileSync(lock, JSON.stringify({ pid: gone, createdAt: old }), { mode: 0o600 })
    await runAgentTelemetryCollect(opts()); expect(fetch).toHaveBeenCalledTimes(1); expect(existsSync(lock)).toBe(false)
    expect(readdirSync(checkpoints).filter(name => name.includes('.stale-'))).toEqual([])
  })
  it('releases the lock on every way out: a signal, and an error exit from inside the run', async () => {
    mkdirSync(checkpoints, { mode: 0o700 }); const state = join(checkpoints, 'signal-state.json'), lock = state + '.observation.lock'
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    let release = observationLock(state, checkpoints)
    process.emit('SIGTERM', 'SIGTERM'); expect(exit).toHaveBeenCalledWith(143)
    // process.exit (mocked here) emits 'exit'; the lock is released there, for signals and error() alike.
    process.emit('exit', 143); expect(existsSync(lock)).toBe(false)
    release(); expect(process.listenerCount('SIGTERM')).toBe(0)
    release = observationLock(state, checkpoints); process.emit('exit', 1); expect(existsSync(lock)).toBe(false); release()
  })
  it('never removes a lock that is not its own, and lets only one process reclaim at a time', async () => {
    mkdirSync(checkpoints, { mode: 0o700 }); const state = join(checkpoints, 'own-state.json'), lock = state + '.observation.lock'
    const release = observationLock(state, checkpoints)
    const theirs = JSON.stringify({ pid: process.ppid, createdAt: new Date().toISOString() })
    rmSync(lock); writeFileSync(lock, theirs, { mode: 0o600 }); release()
    expect(readFileSync(lock, 'utf8')).toBe(theirs)
    // A reclaim guard held by someone else stops this run instead of racing it.
    const gone = await new Promise<number>(resolve => { const child = spawn(process.execPath, ['-e', '0']); child.on('exit', () => resolve(child.pid!)) })
    writeFileSync(lock, JSON.stringify({ pid: gone, createdAt: new Date(Date.now() - 11 * 60 * 1000).toISOString() }), { mode: 0o600 })
    writeFileSync(lock + '.reclaim', '', { mode: 0o600 })
    expect(() => observationLock(state, checkpoints)).toThrow('lock unavailable'); expect(existsSync(lock)).toBe(true)
    rmSync(lock + '.reclaim'); const reclaimed = observationLock(state, checkpoints); reclaimed(); expect(existsSync(lock)).toBe(false)
  })
  it('treats a lock created before the last boot as stale, whatever process reused its pid', () => {
    const now = Date.parse('2026-09-22T12:00:00Z'), bootAt = Date.parse('2026-09-22T11:00:00Z')
    expect(staleLockContent(JSON.stringify({ pid: process.ppid, createdAt: '2026-09-22T10:00:00.000Z' }), now, bootAt)).toBe(true)
    expect(staleLockContent(JSON.stringify({ pid: process.ppid, createdAt: '2026-09-22T11:30:00.000Z' }), now, bootAt)).toBe(false)
    expect(staleLockContent('stale-fixture', now, bootAt)).toBe(false)
    expect(staleLockContent(JSON.stringify({ pid: process.ppid, createdAt: '2026-09-22T13:00:00.000Z' }), now, bootAt)).toBe(false)
  })
  it('does not steal stale lock or touch checkpoint', async () => {
    mkdirSync(checkpoints, { mode: 0o700 }); const lock = statePath() + '.observation.lock'; writeFileSync(lock, 'stale-fixture', { mode: 0o600 })
    await expect(runAgentTelemetryCollect(opts())).rejects.toThrow('lock unavailable'); expect(fetch).not.toHaveBeenCalled(); expect(readFileSync(lock, 'utf8')).toBe('stale-fixture'); expect(existsSync(statePath())).toBe(false)
  })
  it('validates canonical nested histogram values inside actual helper bundle', async () => {
    const project = join(sessions, 'project-a'); mkdirSync(project)
    const files = [1, 2].map(i => { const path = join(project, `${i}.jsonl`); writeFileSync(path, JSON.stringify({ type: 'assistant', timestamp: '2026-01-02T01:00:00Z', message: { id: `message-${i}`, stop_reason: 'end_turn', usage: { input_tokens: Number.MAX_SAFE_INTEGER } } }) + '\n'); return { path, sessionKey: `session-${i}`, completeFromStart: true } })
    config({ source: 'claude-code', cliFiles: files }); await expect(attachAgentObservability(batch('claude-code'), configPath, { sessionsDir: sessions, projectSlugs: ['project-a'] })).rejects.toThrow('Observation bridge failed')
  })
  it('rejects Codex header or later turn from another scope', async () => {
    const path = join(sessions, 'codex.jsonl'); const meta = { type: 'session_meta', payload: { thread_source: 'aitk-agent:example-agent', cwd: '/anonymous/project-a' } }
    config({ source: 'codex', cliFiles: [{ path, sessionKey: 'session-a' }] })
    for (const rows of [[{ ...meta, payload: { ...meta.payload, thread_source: 'human' } }], [meta, { type: 'turn_context', payload: { cwd: '/anonymous/another-project' } }]]) {
      writeFileSync(path, rows.map(row => JSON.stringify(row)).join('\n') + '\n'); await expect(attachAgentObservability(batch('codex'), configPath, { sessionsDir: sessions, projectSlugs: ['project-a'], codexThreadSource: 'aitk-agent:example-agent' })).rejects.toThrow('Observation bridge failed')
    }
  })
  it('validates every approved Codex part before deduplication and merges its scoped samples', async () => {
    const header = { type: 'session_meta', payload: { thread_source: 'aitk-agent:example-agent', cwd: '/anonymous/project-a' } }
    const files = [42, 80].map((tokens, index) => {
      const path = join(sessions, `codex-${index}.jsonl`)
      writeFileSync(path, [header, { type: 'event_msg', timestamp: `2026-01-02T0${index + 1}:00:00Z`, payload: { type: 'token_count', info: { last_token_usage: { input_tokens: tokens } } } }].map(row => JSON.stringify(row)).join('\n') + '\n')
      return { path, sessionKey: 'same-approved-session', completeFromStart: true }
    })
    config({ source: 'codex', cliFiles: files }); const value = batch('codex')
    await attachAgentObservability(value, configPath, { sessionsDir: sessions, projectSlugs: ['project-a'], codexThreadSource: 'aitk-agent:example-agent' })
    expect(value.collection.observability).toMatchObject({ capabilities: { cliMetrics: 'supported' }, metrics: { peakContextTokens: { count: 1, sum: 80 } }, provenance: { cli: { filesRead: 2, duplicates: 1 } } })
  })
  it('rejects a headerless second Codex file even when it borrows an approved sessionKey', async () => {
    const first = join(sessions, 'approved.jsonl'), second = join(sessions, 'unidentified.jsonl')
    writeFileSync(first, JSON.stringify({ type: 'session_meta', payload: { thread_source: 'aitk-agent:example-agent', cwd: '/anonymous/project-a' } }) + '\n')
    writeFileSync(second, JSON.stringify({ type: 'event_msg', timestamp: '2026-01-02T02:00:00Z', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 42 } } } }) + '\n')
    config({ source: 'codex', cliFiles: [first, second].map(path => ({ path, sessionKey: 'same-key' })) })
    await expect(runAgentTelemetryCollect({ ...opts(), source: 'codex', projectSlugs: 'project-a', codexThreadSource: 'aitk-agent:example-agent' })).rejects.toThrow('Observation bridge failed')
    expect(fetch).not.toHaveBeenCalled(); expect(readdirSync(checkpoints)).toEqual([])
  })
  it('requires metadata first and never authorizes preceding usage with a later header', async () => {
    const path = join(sessions, 'late-header.jsonl')
    const header = { type: 'session_meta', payload: { thread_source: 'aitk-agent:example-agent', cwd: '/anonymous/project-a' } }
    writeFileSync(path, [{ type: 'event_msg', timestamp: '2026-01-02T02:00:00Z', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 999 } } } }, header].map(row => JSON.stringify(row)).join('\n') + '\n')
    config({ source: 'codex', cliFiles: [{ path, sessionKey: 'session-a' }] })
    await expect(attachAgentObservability(batch('codex'), configPath, { sessionsDir: sessions, projectSlugs: ['project-a'], codexThreadSource: 'aitk-agent:example-agent' })).rejects.toThrow('Observation bridge failed')
  })
  it('counts only this agent\'s sessions from a shared guard log and its rotated copy, inside the actual helper', async () => {
    const project = join(sessions, 'project-a'); mkdirSync(project)
    const usage = (sessionId: string) => JSON.stringify({ type: 'assistant', sessionId, timestamp: '2026-01-02T12:00:00Z', message: { id: `m-${sessionId}`, stop_reason: 'end_turn', usage: { input_tokens: 42 } } }) + '\n'
    writeFileSync(join(project, 'own.jsonl'), usage('own-session'))
    const guard = join(root, 'shared-guard.jsonl'), row = (session: string, decision: string) => JSON.stringify({ ts: '2026-01-02T01:00:00.000Z', decision, session, path: '/private/guarded' }) + '\n'
    writeFileSync(guard + '.1', row('own-session', 'deny') + row('foreign-session', 'deny'))
    writeFileSync(guard, row('own-session', 'allow') + row('foreign-session', 'allow') + row('foreign-session', 'deny'))
    config({ source: 'claude-code', cliInventory: 'installed-scope', readGuardFiles: [{ path: guard, sessionKey: 'shared-guard', sessionFilter: 'installed-scope' }] })
    const value = batch('claude-code'); await attachAgentObservability(value, configPath, { sessionsDir: sessions, projectSlugs: ['project-a'] })
    expect(value.collection.observability).toMatchObject({ capabilities: { readGuard: 'supported' }, metrics: { readGuardAllow: 1, readGuardDeny: 1 }, provenance: { readGuard: { filesExpected: 2, filesRead: 2 } } })
    expect(JSON.stringify(value)).not.toContain('own-session'); expect(JSON.stringify(value)).not.toContain('/private/guarded')
  })
  it.each([
    ['another source', { source: 'openclaw', readGuardFiles: [{ path: '/tmp/guard.jsonl', sessionKey: 'g', sessionFilter: 'installed-scope' }] }],
    ['static inventory', { source: 'claude-code', cliFiles: [], readGuardFiles: [{ path: '/tmp/guard.jsonl', sessionKey: 'g', sessionFilter: 'installed-scope' }] }],
    ['both attestations', { source: 'claude-code', cliInventory: 'installed-scope', readGuardFiles: [{ path: '/tmp/guard.jsonl', sessionKey: 'g', sessionFilter: 'installed-scope', agentExclusive: true }] }],
    ['unknown filter', { source: 'claude-code', cliInventory: 'installed-scope', readGuardFiles: [{ path: '/tmp/guard.jsonl', sessionKey: 'g', sessionFilter: 'all' }] }],
    ['filter on a CLI file', { source: 'claude-code', cliFiles: [{ path: '/tmp/a.jsonl', sessionKey: 'a', sessionFilter: 'installed-scope' }] }],
    ['boot reports for Codex', { source: 'codex', bootstrapReports: { path: '/tmp/agent.sqlite' } }],
    ['boot reports with extra keys', { source: 'claude-code', bootstrapReports: { path: '/tmp/agent.sqlite', agent: 'x' } }],
    ['relative boot reports', { source: 'claude-code', bootstrapReports: { path: 'agent.sqlite' } }],
    ['boot probe without the dynamic inventory', { source: 'claude-code', cliFiles: [], bootProbe: { channel: 'C0BUF7RC2SD', marker: '[BOOT-PROBE]' } }],
    ['boot probe with a lowercase channel', { source: 'claude-code', cliInventory: 'installed-scope', bootProbe: { channel: 'c0buf7rc2sd', marker: '[BOOT-PROBE]' } }],
    ['boot probe with a free-text marker', { source: 'claude-code', cliInventory: 'installed-scope', bootProbe: { channel: 'C0BUF7RC2SD', marker: 'ok' } }],
    ['boot probe with extra keys', { source: 'claude-code', cliInventory: 'installed-scope', bootProbe: { channel: 'C0BUF7RC2SD', marker: '[BOOT-PROBE]', text: 'x' } }],
    ['missing boot report database', { source: 'claude-code', cliInventory: 'installed-scope', bootstrapReports: { path: '/nonexistent-aitk-fixture/agent.sqlite' } }],
  ])('rejects shared-source config for %s as a config failure', async (_label, extra) => {
    config(extra as Record<string, unknown>)
    const source = (extra as { source: string }).source
    await expect(attachAgentObservability(batch(source), configPath, { sessionsDir: sessions, projectSlugs: ['project-a'], codexThreadSource: 'aitk-agent:example-agent' })).rejects.toThrow('Observation bridge failed (config);')
  })
  it('rejects a boot report database reached through a symlink', async () => {
    const real = join(root, 'real.sqlite'), link = join(root, 'link.sqlite'); writeFileSync(real, ''); symlinkSync(real, link)
    config({ source: 'claude-code', cliInventory: 'installed-scope', bootstrapReports: { path: link } }); mkdirSync(join(sessions, 'project-a'))
    await expect(attachAgentObservability(batch('claude-code'), configPath, { sessionsDir: sessions, projectSlugs: ['project-a'] })).rejects.toThrow('Observation bridge failed (config);')
  })
  it('reads OpenClaw boot reports read-only inside the actual bundled helper (node:sqlite stays external)', async () => {
    const { DatabaseSync } = await import('node:sqlite')
    const path = join(root, 'agent.sqlite'), db = new DatabaseSync(path)
    db.exec('create table session_nodes (session_key text primary key, entry_json text not null)')
    const report = (at: number, rawChars: number, near: number) => JSON.stringify({ systemPromptReport: { generatedAt: at, provider: 'claude-cli', systemPrompt: { chars: rawChars + 15000, projectContextChars: rawChars + 7000 }, tools: { schemaChars: 22842 }, bootstrapMaxChars: 32000,
      bootstrapTruncation: { warningShown: false, truncatedFiles: 0, nearLimitFiles: near }, injectedWorkspaceFiles: [{ name: 'AGENTS.md', path: '/private/ws/AGENTS.md', missing: false, rawChars, injectedChars: rawChars, truncated: false }] } })
    const insert = db.prepare('insert into session_nodes values (?, ?)')
    insert.run('a', report(Date.parse('2026-01-02T01:00:00Z'), 29000, 1)); insert.run('b', report(Date.parse('2026-01-02T05:00:00Z'), 27482, 1))
    insert.run('old', report(Date.parse('2026-01-01T05:00:00Z'), 40000, 1))
    insert.run('codex', JSON.stringify({ systemPromptReport: { generatedAt: Date.parse('2026-01-02T06:00:00Z'), provider: 'codex' } }))
    db.close(); const before = sha(readFileSync(path))
    mkdirSync(join(sessions, 'project-a')); config({ source: 'claude-code', cliInventory: 'installed-scope', bootstrapReports: { path } })
    const value = batch('claude-code'); await attachAgentObservability(value, configPath, { sessionsDir: sessions, projectSlugs: ['project-a'] })
    expect(value.collection.observability).toMatchObject({ metricCapabilities: { bootstrap: 'supported' }, provenance: { adapterVersion: '3' },
      metrics: { bootstrap: { sessions: 2, truncatedSessions: 0, nearLimitSessions: 2, warningSessions: 0, largestFileCharsMax: 29000, largestFileCharsLatest: 27482, fileCharsLimit: 32000,
        promptCharsLatest: 42482, promptCharsMax: 44000, promptCharsSum: 86482, projectContextCharsLatest: 34482, toolSchemaCharsLatest: 22842 } } })
    expect(JSON.stringify(value)).not.toContain('AGENTS.md'); expect(sha(readFileSync(path))).toBe(before)
    expect(readFileSync(join(built, 'bridge.mjs'), 'utf8')).toMatch(/import\(["']node:sqlite["']\)/)
  })
  it('measures the daily boot probe inside the actual bundled helper and uploads only numbers', async () => {
    const project = join(sessions, 'project-a'); mkdirSync(project)
    const text = ['Conversation info: ⟦openclaw:ctx⟧', '```json', JSON.stringify({ chat_id: 'channel:C0BUF7RC2SD', message_id: '1' }), '```', '', 'System: [2026-01-02 11:30:00 GMT+9] Slack message', '', '<@U0AGV1N6YDP> (뽀짝이) [BOOT-PROBE] private probe text'].join('\n')
    writeFileSync(join(project, 'probe-session.jsonl'), [
      { type: 'user', sessionId: 'probe-session', uuid: 'u0', parentUuid: null, timestamp: '2026-01-02T02:30:00Z', message: { role: 'user', content: text } },
      { type: 'assistant', sessionId: 'probe-session', uuid: 'a1', parentUuid: 'u0', timestamp: '2026-01-02T02:30:05Z', message: { id: 'm1', stop_reason: 'end_turn', usage: { input_tokens: 2, cache_creation_input_tokens: 70240, cache_read_input_tokens: 31826 } } },
    ].map(row => JSON.stringify(row)).join('\n') + '\n')
    config({ source: 'claude-code', cliInventory: 'installed-scope', bootProbe: { channel: 'C0BUF7RC2SD', marker: '[BOOT-PROBE]' } })
    const value = batch('claude-code'); await attachAgentObservability(value, configPath, { sessionsDir: sessions, projectSlugs: ['project-a'] })
    expect(value.collection.observability).toMatchObject({ metricCapabilities: { probeFirstTurnTokens: 'supported' }, metrics: { probeFirstTurnTokens: { count: 1, sum: 102068 } } })
    const sent = JSON.stringify(value)
    for (const secret of ['probe-session', 'private probe text', 'C0BUF7RC2SD', 'U0AGV1N6YDP', root]) expect(sent).not.toContain(secret)
  })
  it('retains explicit incomplete provenance for missing approved guard source', async () => {
    config({ readGuardFiles: [{ path: join(root, 'absent.jsonl'), sessionKey: 'exclusive', agentExclusive: true }] }); const value = batch(); await attachAgentObservability(value, configPath, { sessionsDir: sessions })
    expect(value.collection.observability).toMatchObject({ capabilities: { readGuard: 'incomplete' }, provenance: { readGuard: { filesExpected: 1, filesRead: 0 } } })
  })
})
