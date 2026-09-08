#!/usr/bin/env node
/** Local evidence only. Server/database confirmation remains an independent step. */
import { readFileSync, mkdirSync, writeFileSync, renameSync, statSync } from 'node:fs'
import { dirname, isAbsolute, resolve, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const ID = /^[a-z0-9][a-z0-9._:-]{0,99}$/
const SOURCES = new Set(['openclaw', 'hermes', 'claude-code', 'codex'])
export function parseOptions(args) {
  const options = { send: false }
  const names = new Set(['cli', 'node', 'agent', 'source', 'revision', 'output'])
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--send') { options.send = true; continue }
    const key = args[i].slice(2)
    if (!args[i].startsWith('--') || !names.has(key) || options[key] !== undefined || !args[i + 1]) {
      throw new Error('Expected --cli --node --agent --source --revision --output, optionally --send')
    }
    options[key] = args[++i]
  }
  for (const key of names) if (!options[key]) throw new Error(`Missing --${key}`)
  if (!ID.test(options.agent) || !SOURCES.has(options.source)) throw new Error('Invalid agent or source')
  if (!/^[0-9a-f]{40}$/.test(options.revision)) throw new Error('Revision must be a full commit SHA')
  for (const key of ['cli', 'node', 'output']) if (!isAbsolute(options[key])) throw new Error(`--${key} must be absolute`)
  if (options.output === options.cli || options.output === options.node || options.output === join(dirname(options.cli), 'manifest.json')) {
    throw new Error('Receipt must not overwrite an executable or manifest')
  }
  return options
}
function execute(node, cli, args) {
  const result = spawnSync(node, [cli, ...args], { encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 })
  // Do not echo arbitrary CLI stdout/stderr into Slack-ready evidence.
  if (result.error || result.status !== 0) throw new Error(`CLI step failed: ${args[1] ?? args[0]}`)
  return result.stdout
}
function jsonStep(options, run, action) {
  let result
  try { result = JSON.parse(run(options.node, options.cli, ['agent-telemetry', action, '--agent', options.agent, '--source', options.source])) }
  catch { throw new Error(`Invalid or failed ${action} response`) }
  if (result.ok !== true || result.agentId !== options.agent) throw new Error(`${action} did not verify the requested agent`)
  return result
}
export function verify(options, run = execute) {
  const manifest = JSON.parse(readFileSync(join(dirname(options.cli), 'manifest.json'), 'utf8'))
  if (manifest.sourceCommit !== options.revision || manifest.sourceDirty !== false) {
    throw new Error('Installed manifest must match the approved clean commit')
  }
  const version = run(options.node, options.cli, ['--version']).trim()
  if (version !== `aitk v${manifest.version}`) throw new Error('Installed version differs from manifest')
  const doctor = jsonStep(options, run, 'doctor')
  const checks = doctor.checks ?? {}
  if (doctor.source !== options.source || !ID.test(doctor.collectorId ?? '') ||
      checks.installedCollectorVersion !== manifest.version || checks.scheduledNodePath !== options.node ||
      checks.collectionHealth !== 'healthy' || checks.parseFailures !== 0 ||
      !Number.isSafeInteger(checks.recordsRead) || checks.recordsRead < 0 || !Array.isArray(checks.healthWarnings) || checks.healthWarnings.length ||
      ['sourceExists', 'cliExists', 'cliUpToDate', 'scheduleMatchesRecord', 'credentialAvailable', 'scheduleConfigured', 'scheduleLoaded']
        .some(key => checks[key] !== true)) throw new Error('Collector identity, health or schedule does not match')
  const receipt = {
    protocolVersion: 1, checkedAtUtc: new Date().toISOString(),
    agentId: options.agent, source: options.source, collectorId: doctor.collectorId,
    revision: manifest.sourceCommit, collectorVersion: manifest.version,
    binarySha256: createHash('sha256').update(readFileSync(options.cli)).digest('hex'),
    localVerified: true, collectionHealth: checks.collectionHealth, scheduleLoaded: true,
    recordsRead: checks.recordsRead, parseFailures: checks.parseFailures,
    uploadAcknowledged: false, serverIndependentlyVerified: false,
  }
  if (options.send) {
    const sent = jsonStep(options, run, 'run')
    if (typeof sent.batchId !== 'string' || !/^[0-9a-f-]{36}$/i.test(sent.batchId) ||
        typeof sent.inserted !== 'boolean' || !Number.isSafeInteger(sent.turns) || sent.turns < 0 ||
        !Number.isSafeInteger(sent.sessions) || sent.sessions < 0) throw new Error('Upload acknowledgment lacks batch evidence')
    Object.assign(receipt, { uploadAcknowledged: true, batchId: sent.batchId, inserted: sent.inserted,
      sessions: sent.sessions, turns: sent.turns })
  }
  return receipt
}
export function saveReceipt(path, receipt) {
  const parent = dirname(path)
  mkdirSync(parent, { recursive: true, mode: 0o700 })
  if ((statSync(parent).mode & 0o077) !== 0) throw new Error('Receipt directory must be private (0700)')
  const temporary = join(parent, `.receipt-${randomUUID()}.tmp`)
  writeFileSync(temporary, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  renameSync(temporary, path)
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseOptions(process.argv.slice(2))
    const receipt = verify(options)
    saveReceipt(options.output, receipt)
    console.log(JSON.stringify(receipt, null, 2))
  } catch (error) {
    console.error(error instanceof SyntaxError ? 'Malformed installation metadata' : error.message)
    process.exitCode = 1
  }
}
