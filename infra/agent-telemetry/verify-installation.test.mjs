import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseOptions, verify, saveReceipt } from './verify-installation.mjs'
const sha = 'a'.repeat(40)
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'telemetry-protocol-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const options = { cli: join(root, 'aitk.js'), node: '/stable/node', agent: 'example-agent', source: 'codex', revision: sha, output: join(root, 'receipt.json'), send: false }
  writeFileSync(options.cli, '// local fixture')
  writeFileSync(join(root, 'manifest.json'), JSON.stringify({ sourceCommit: sha, sourceDirty: false, version: '0.7.13' }))
  const doctor = { ok: true, agentId: options.agent, source: options.source, collectorId: 'collector-example', checks: {
    installedCollectorVersion: '0.7.13', scheduledNodePath: options.node, collectionHealth: 'healthy', healthWarnings: [],
    sourceExists: true, cliExists: true, cliUpToDate: true, scheduleMatchesRecord: true, credentialAvailable: true,
    scheduleConfigured: true, scheduleLoaded: true, recordsRead: 4, parseFailures: 0,
  } }
  const calls = []
  const run = (_node, _cli, args) => {
    calls.push(args)
    if (args[0] === '--version') return 'aitk v0.7.13\n'
    if (args[1] === 'doctor') return JSON.stringify(doctor)
    return JSON.stringify({ ok: true, agentId: options.agent, batchId: '12345678-1234-1234-1234-123456789abc', inserted: false, sessions: 1, turns: 2, secret: 'must-not-copy' })
  }
  return { options, doctor, run, calls, root }
}
test('default verification never uploads and writes only safe evidence', t => {
  const f = fixture(t); const receipt = verify(f.options, f.run)
  assert.equal(f.calls.some(args => args[1] === 'run'), false)
  assert.equal(receipt.uploadAcknowledged, false)
  saveReceipt(f.options.output, receipt)
  assert.equal(statSync(f.options.output).mode & 0o777, 0o600)
  assert.equal(JSON.parse(readFileSync(f.options.output)).serverIndependentlyVerified, false)
})
test('idempotent acknowledgment is accepted but is not independent server proof', t => {
  const f = fixture(t); const receipt = verify({ ...f.options, send: true }, f.run)
  assert.equal(receipt.uploadAcknowledged, true); assert.equal(receipt.inserted, false)
  assert.equal(receipt.serverIndependentlyVerified, false)
  assert.equal(JSON.stringify(receipt).includes('must-not-copy'), false)
})
test('does not upload when doctor returns false despite a successful process exit', t => {
  const f = fixture(t); f.doctor.ok = false
  assert.throws(() => verify({ ...f.options, send: true }, f.run))
  assert.equal(f.calls.some(args => args[1] === 'run'), false)
})
test('rejects a wrong source, stale version, missing schedule and unapproved artifact', t => {
  for (const mutate of [f => f.doctor.source = 'hermes', f => f.doctor.checks.cliUpToDate = false,
    f => f.doctor.checks.scheduleLoaded = false, f => f.options.revision = 'b'.repeat(40)]) {
    const f = fixture(t); mutate(f); assert.throws(() => verify(f.options, f.run))
  }
})
test('requires explicit scope and a full revision, and rejects unknown flags', () => {
  const args = ['--cli', '/bin/aitk.js', '--node', '/bin/node', '--agent', 'example-agent', '--source', 'hermes', '--revision', sha, '--output', '/private/receipt.json']
  assert.equal(parseOptions(args).send, false)
  assert.throws(() => parseOptions([...args, '--token', 'secret']))
  assert.throws(() => parseOptions(args.map(x => x === sha ? 'main' : x)))
  assert.throws(() => parseOptions(args.map(x => x === 'example-agent' ? '../other' : x)))
})

// The real CLI info() writes --version to stderr, whereas JSON commands use stdout.
test('accepts the real CLI stderr version convention without treating stderr as JSON', t => {
  const f = fixture(t)
  f.options.node = process.execPath
  f.doctor.checks.scheduledNodePath = process.execPath
  writeFileSync(f.options.cli, `if (process.argv[2] === '--version') console.error('aitk v0.7.13'); else console.log(${JSON.stringify(JSON.stringify(f.doctor))});`)
  const result = spawnSync(process.execPath, ['infra/agent-telemetry/verify-installation.mjs', '--cli', f.options.cli, '--node', process.execPath,
    '--agent', f.options.agent, '--source', 'codex', '--revision', sha, '--output', f.options.output], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).localVerified, true)
})

test('ignores Node warnings around the version line and rejects ambiguous versions', t => {
  for (const ambiguous of [false, true]) {
    const f = fixture(t)
    f.doctor.checks.scheduledNodePath = process.execPath
    writeFileSync(f.options.cli, `console.error('(node:123) [MODULE_TYPELESS_PACKAGE_JSON] Warning: module type is not specified.');
      if (process.argv[2] === '--version') { console.error('aitk v0.7.13'); ${ambiguous ? "console.log('aitk v0.7.12');" : ''} }
      else console.log(${JSON.stringify(JSON.stringify(f.doctor))});
      console.error('(Use node --trace-warnings to show where the warning was created)');`)
    const result = spawnSync(process.execPath, ['infra/agent-telemetry/verify-installation.mjs', '--cli', f.options.cli, '--node', process.execPath,
      '--agent', f.options.agent, '--source', 'codex', '--revision', sha, '--output', f.options.output], { encoding: 'utf8' })
    assert.equal(result.status, ambiguous ? 1 : 0, result.stderr)
    if (!ambiguous) assert.equal(JSON.parse(result.stdout).localVerified, true)
  }
})
