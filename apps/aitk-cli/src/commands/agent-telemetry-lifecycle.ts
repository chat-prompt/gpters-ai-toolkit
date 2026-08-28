/** 설치형 agent telemetry collector의 install/doctor/status/run/uninstall 명령. */

import { existsSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { resolve } from 'node:path'
import { resolveToken } from '../auth.js'
import { readConfig } from '../config.js'
import {
  createInstallation,
  defaultCommandRunner,
  deleteAgentTelemetryInstallation,
  deleteMacOSKeychainCredential,
  installLaunchdSchedule,
  launchdScheduleLoaded,
  readAgentTelemetryInstallation,
  readMacOSKeychainCredential,
  removeLaunchdSchedule,
  storeMacOSKeychainCredential,
  writeAgentTelemetryInstallation,
  type AgentTelemetryInstallation,
  type CommandRunner,
} from '../agent-telemetry/installation.js'
import type { AgentTelemetrySource } from '../agent-telemetry/types.js'
import { error, jsonOut } from '../output.js'
import { runAgentTelemetryCollect } from './agent-telemetry.js'

const SOURCES = new Set<AgentTelemetrySource>(['openclaw', 'claude-code', 'codex', 'hermes'])
const COLLECTOR_TOKEN = /^agt_[a-f0-9]{64}$/

interface EnrollmentResponse {
  ok?: boolean
  collectorToken?: string
  error?: string
}

interface RevokeResponse {
  ok?: boolean
  error?: string
}

export interface AgentTelemetryInstallOptions {
  agentId: string
  source: string
  sessionsDir?: string
  projectSlugs?: string
  hermesProfile?: string
  checkpointDir?: string
  category?: string
  serverUrl?: string
  days: number
  intervalSeconds?: number
  collectorVersion: string
  collectorId?: string
  cliScriptPath?: string
  nodePath?: string
  noSchedule?: boolean
  home?: string
  platform?: NodeJS.Platform
  keychainAccount?: string
  runner?: CommandRunner
  uid?: number
  now?: Date
}

export interface AgentTelemetryLifecycleOptions {
  agentId: string
  source: string
  home?: string
  runner?: CommandRunner
  uid?: number
  now?: Date
}

function source(value: string): AgentTelemetrySource {
  if (!SOURCES.has(value as AgentTelemetrySource)) {
    error('--source must be one of: openclaw, claude-code, codex, hermes')
  }
  return value as AgentTelemetrySource
}

function enrollmentUrl(serverUrl: string): string {
  return `${serverUrl.replace(/\/+$/, '')}/api/ax/agent-telemetry/enroll`
}

async function parseResponse<T extends { error?: string }>(response: Response): Promise<T> {
  try {
    return await response.json() as T
  } catch {
    return {} as T
  }
}

async function enrollCollector(installation: AgentTelemetryInstallation, userToken: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(enrollmentUrl(installation.serverUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: installation.agentId,
        collectorId: installation.collectorId,
        source: installation.source,
        intervalSeconds: installation.schedule.intervalSeconds,
      }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'network error'
    throw new Error(`Collector enrollment failed: ${message}`)
  }
  const body = await parseResponse<EnrollmentResponse>(response)
  if (!response.ok || body.ok !== true || !body.collectorToken || !COLLECTOR_TOKEN.test(body.collectorToken)) {
    if (response.status === 401) throw new Error('Collector enrollment requires `aitk login --device`')
    throw new Error(body.error ?? `Collector enrollment HTTP ${response.status}`)
  }
  return body.collectorToken
}

async function revokeCollector(installation: AgentTelemetryInstallation, userToken: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(enrollmentUrl(installation.serverUrl), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ collectorId: installation.collectorId }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'network error'
    throw new Error(`Collector revocation failed: ${message}`)
  }
  const body = await parseResponse<RevokeResponse>(response)
  if (!response.ok || body.ok !== true) throw new Error(body.error ?? `Collector revocation HTTP ${response.status}`)
}

function collectOptions(installation: AgentTelemetryInstallation, dryRun: boolean, token?: string, now?: Date) {
  return {
    agentId: installation.agentId,
    source: installation.source,
    days: installation.backfillDays,
    dryRun,
    collectorVersion: installation.cli.collectorVersion,
    sessionsDir: installation.sessionsDir,
    projectSlugs: installation.projectSlugs,
    hermesProfile: installation.hermesProfile,
    checkpointDir: installation.checkpointDir,
    collectorInstanceId: installation.collectorId,
    category: installation.category,
    serverUrl: installation.serverUrl,
    telemetryToken: token,
    emitOutput: false,
    now,
  }
}

export async function runAgentTelemetryInstall(options: AgentTelemetryInstallOptions): Promise<void> {
  const selectedSource = source(options.source)
  if (!options.sessionsDir) error('--sessions-dir is required')
  const home = options.home ?? homedir()
  const runner = options.runner ?? defaultCommandRunner
  const platform = options.platform ?? process.platform
  if (platform !== 'darwin') error('Automatic telemetry installation currently supports macOS only')

  const scriptPath = resolve(options.cliScriptPath ?? process.argv[1] ?? '')
  if (!scriptPath || !existsSync(scriptPath) || scriptPath.endsWith('.ts')) {
    error('Telemetry installation requires a packaged or built aitk JavaScript CLI')
  }
  const nodePath = resolve(options.nodePath ?? process.execPath)
  if (!existsSync(nodePath)) error('Node.js executable does not exist')

  try {
    readAgentTelemetryInstallation(options.agentId, selectedSource, home)
    error('This agent/source collector is already installed; uninstall it before reinstalling')
  } catch (cause) {
    if (cause instanceof Error && !cause.message.includes('missing or unreadable')) throw cause
  }

  const serverUrl = (options.serverUrl ?? readConfig().serverUrl).replace(/\/+$/, '')
  // 기존 pilot checkpoint가 있으면 그 collector ID를 먼저 읽어 승계한다.
  // 새 ID를 먼저 만들면 동일 scope의 유효 checkpoint가 오히려 mismatch로 막힌다.
  const dryRun = await runAgentTelemetryCollect({
    agentId: options.agentId,
    source: selectedSource,
    days: options.days,
    dryRun: true,
    collectorVersion: options.collectorVersion,
    sessionsDir: options.sessionsDir,
    projectSlugs: options.projectSlugs,
    hermesProfile: options.hermesProfile,
    checkpointDir: options.checkpointDir,
    collectorInstanceId: options.collectorId,
    category: options.category,
    serverUrl,
    emitOutput: false,
    now: options.now,
  })
  if (dryRun.batch.collection.healthStatus !== 'healthy') {
    error(`Telemetry source validation is blocked: ${dryRun.batch.collection.healthWarnings.join(', ')}`)
  }

  const installation = createInstallation({
    agentId: options.agentId,
    collectorId: dryRun.batch.collectorInstanceId,
    source: selectedSource,
    sessionsDir: options.sessionsDir,
    projectSlugs: options.projectSlugs,
    hermesProfile: options.hermesProfile,
    checkpointDir: options.checkpointDir,
    category: options.category,
    serverUrl,
    backfillDays: options.days,
    intervalSeconds: options.intervalSeconds,
    nodePath,
    scriptPath,
    collectorVersion: options.collectorVersion,
    account: options.keychainAccount ?? userInfo().username,
    schedule: options.noSchedule ? 'none' : 'launchd',
    home,
    now: options.now,
  })

  const userToken = resolveToken()
  if (!userToken) error('Collector enrollment requires `aitk login --device`', 2)

  let collectorToken: string | undefined
  let credentialStored = false
  let configStored = false
  let scheduleAttempted = false
  try {
    collectorToken = await enrollCollector(installation, userToken!)
    storeMacOSKeychainCredential(installation, collectorToken, runner)
    credentialStored = true
    writeAgentTelemetryInstallation(installation, home)
    configStored = true
    if (installation.schedule.provider === 'launchd') {
      scheduleAttempted = true
      installLaunchdSchedule(installation, runner, options.uid)
    }
  } catch (cause) {
    if (scheduleAttempted) removeLaunchdSchedule(installation, runner, options.uid)
    if (configStored) deleteAgentTelemetryInstallation(installation.agentId, installation.source, home)
    if (credentialStored) deleteMacOSKeychainCredential(installation, runner)
    if (collectorToken) await revokeCollector(installation, userToken!).catch(() => undefined)
    throw cause
  }

  jsonOut({
    ok: true,
    installed: true,
    agentId: installation.agentId,
    collectorId: installation.collectorId,
    source: installation.source,
    schedule: installation.schedule.provider,
    intervalSeconds: installation.schedule.intervalSeconds,
    dryRun: {
      healthStatus: dryRun.batch.collection.healthStatus,
      healthWarnings: dryRun.batch.collection.healthWarnings,
      sessions: dryRun.batch.sessions,
      turns: dryRun.batch.turns,
      recordsRead: dryRun.batch.collection.recordsRead,
    },
  })
}

export async function runAgentTelemetryRun(options: AgentTelemetryLifecycleOptions): Promise<void> {
  const installation = readAgentTelemetryInstallation(options.agentId, source(options.source), options.home)
  const token = readMacOSKeychainCredential(installation, options.runner ?? defaultCommandRunner)
  const result = await runAgentTelemetryCollect({
    ...collectOptions(installation, false, token, options.now),
    emitOutput: true,
  })
  if (result.dryRun) error('Installed telemetry runner unexpectedly used dry-run mode')
}

export async function runAgentTelemetryDoctor(options: AgentTelemetryLifecycleOptions): Promise<void> {
  const installation = readAgentTelemetryInstallation(options.agentId, source(options.source), options.home)
  const runner = options.runner ?? defaultCommandRunner
  const sourceExists = existsSync(installation.sessionsDir)
  const cliExists = existsSync(installation.cli.scriptPath) && existsSync(installation.cli.nodePath)
  let credentialAvailable = false
  try {
    credentialAvailable = readMacOSKeychainCredential(installation, runner).length > 0
  } catch {
    credentialAvailable = false
  }
  const scheduleLoaded = installation.schedule.provider === 'none'
    ? null
    : launchdScheduleLoaded(installation, runner, options.uid)
  const dryRun = sourceExists && cliExists
    ? await runAgentTelemetryCollect(collectOptions(installation, true, undefined, options.now))
    : null
  const healthy = sourceExists && cliExists && credentialAvailable && scheduleLoaded !== false &&
    dryRun?.batch.collection.healthStatus === 'healthy'

  jsonOut({
    ok: healthy,
    agentId: installation.agentId,
    collectorId: installation.collectorId,
    source: installation.source,
    checks: {
      sourceExists,
      cliExists,
      credentialAvailable,
      scheduleConfigured: installation.schedule.provider !== 'none',
      scheduleLoaded,
      collectionHealth: dryRun?.batch.collection.healthStatus ?? 'not-run',
      healthWarnings: dryRun?.batch.collection.healthWarnings ?? [],
      recordsRead: dryRun?.batch.collection.recordsRead ?? 0,
      parseFailures: dryRun?.batch.collection.parseFailures ?? 0,
    },
  })
  if (!healthy) process.exitCode = 1
}

export function runAgentTelemetryStatus(options: AgentTelemetryLifecycleOptions): void {
  const installation = readAgentTelemetryInstallation(options.agentId, source(options.source), options.home)
  const runner = options.runner ?? defaultCommandRunner
  let credentialAvailable = false
  try {
    credentialAvailable = readMacOSKeychainCredential(installation, runner).length > 0
  } catch {
    credentialAvailable = false
  }
  jsonOut({
    installed: true,
    agentId: installation.agentId,
    collectorId: installation.collectorId,
    source: installation.source,
    installedAtUtc: installation.installedAtUtc,
    sourceExists: existsSync(installation.sessionsDir),
    credentialAvailable,
    schedule: installation.schedule.provider,
    intervalSeconds: installation.schedule.intervalSeconds,
    scheduleLoaded: installation.schedule.provider === 'launchd'
      ? launchdScheduleLoaded(installation, runner, options.uid)
      : null,
  })
}

export async function runAgentTelemetryUninstall(options: AgentTelemetryLifecycleOptions): Promise<void> {
  const selectedSource = source(options.source)
  const installation = readAgentTelemetryInstallation(options.agentId, selectedSource, options.home)
  const userToken = resolveToken()
  if (!userToken) error('Collector revocation requires `aitk login --device`', 2)

  const runner = options.runner ?? defaultCommandRunner
  // 서버가 일시적으로 닫혀 있어도 먼저 로컬 timer를 멈춰 추가 전송을 막는다.
  // revoke가 실패하면 config와 Keychain은 보존되어 같은 명령으로 재시도할 수 있다.
  const scheduleRemoved = removeLaunchdSchedule(installation, runner, options.uid)
  await revokeCollector(installation, userToken!)
  const credentialRemoved = deleteMacOSKeychainCredential(installation, runner)
  const configRemoved = deleteAgentTelemetryInstallation(installation.agentId, installation.source, options.home)
  jsonOut({
    ok: true,
    uninstalled: true,
    agentId: installation.agentId,
    collectorId: installation.collectorId,
    source: installation.source,
    revoked: true,
    scheduleRemoved,
    credentialRemoved,
    configRemoved,
    checkpointPreserved: true,
  })
}
