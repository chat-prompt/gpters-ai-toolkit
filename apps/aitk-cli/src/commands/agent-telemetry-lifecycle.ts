/** 설치형 agent telemetry collector의 install/upgrade/doctor/status/run/uninstall 명령. */

import { existsSync, realpathSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { join, resolve } from 'node:path'
import { readAgentTelemetryCheckpoint } from '../agent-telemetry/checkpoint.js'
import { resolveToken } from '../auth.js'
import { readConfig } from '../config.js'
import {
  createInstallation,
  defaultCommandRunner,
  deleteAgentTelemetryInstallation,
  deleteMacOSKeychainCredential,
  installLaunchdSchedule,
  launchdPlistMatches,
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
import { checkpointName, runAgentTelemetryCollect } from './agent-telemetry.js'

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
  openclawAgent?: string
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

/** upgrade·doctor가 "지금 실행 중인 CLI"를 알기 위해 받는 정보. 생략하면 process.argv[1]·process.execPath·설치 기록을 쓴다. */
export interface AgentTelemetryCliIdentity {
  collectorVersion?: string
  cliScriptPath?: string
  nodePath?: string
}

/**
 * 같은 파일을 가리키는 두 경로인지. symlink나 경로 별칭으로 실행하면 문자열 비교만으로는 다르게 보인다.
 * 실경로를 못 읽으면 문자열 비교로 되돌린다.
 */
function samePath(left: string, right: string): boolean {
  if (left === right) return true
  try {
    return realpathSync.native(left) === realpathSync.native(right)
  } catch {
    return false
  }
}

/** 설치 기록의 CLI 경로·버전이 지금 실행 중인 CLI와 같은지. 설치 뒤 CLI만 새로 깔면 launchd는 계속 옛 파일을 실행한다. */
function cliMatchesInstallation(installation: AgentTelemetryInstallation, identity: AgentTelemetryCliIdentity): boolean {
  const scriptPath = resolve(identity.cliScriptPath ?? process.argv[1] ?? '')
  const nodePath = resolve(identity.nodePath ?? process.execPath)
  const version = identity.collectorVersion ?? installation.cli.collectorVersion
  return samePath(installation.cli.scriptPath, scriptPath) &&
    samePath(installation.cli.nodePath, nodePath) &&
    installation.cli.collectorVersion === version
}

/** 기록과 실제 예약이 모두 최신인지. 기록만 최신이고 plist가 옛것이면 고칠 것이 남아 있다. */
function installationFullyUpToDate(
  installation: AgentTelemetryInstallation,
  identity: AgentTelemetryCliIdentity
): boolean {
  if (!cliMatchesInstallation(installation, identity)) return false
  return installation.schedule.provider !== 'launchd' || launchdPlistMatches(installation)
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

/**
 * 아직 서버로 보내지 못한 batch가 checkpoint에 남아 있는지.
 *
 * pending이 있으면 collect는 새로 수집하지 않고 그 batch를 그대로 돌려준다. 그래서 upgrade의 health gate가
 * 새 CLI로 source를 실제로 읽었는지 확인할 수 없다.
 */
async function hasPendingBatch(installation: AgentTelemetryInstallation): Promise<boolean> {
  // 파일 이름 규칙은 collect와 같아야 한다 — slug은 중복 제거 후 정렬한다.
  const projectSlugs = installation.projectSlugs
    ? [...new Set(installation.projectSlugs.split(',').map((slug) => slug.trim()))].sort()
    : undefined
  const path = join(
    installation.checkpointDir,
    checkpointName(installation.agentId, installation.source, projectSlugs, installation.hermesProfile)
  )
  const checkpoint = await readAgentTelemetryCheckpoint(path)
  return Boolean(checkpoint?.pending)
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
    openclawAgent: installation.openclawAgent,
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
    openclawAgent: options.openclawAgent,
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
    openclawAgent: options.openclawAgent,
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

/**
 * 등록된 수집기가 실행할 CLI 경로·버전을 지금 실행 중인 CLI로 바꾸고 launchd 예약을 다시 올린다.
 * credential·checkpoint·collector ID·interval은 그대로다. install-from-repo.sh로 새 버전을 깔아도 설치 기록의
 * scriptPath는 옛 버전 파일을 가리키므로, 이 명령을 실행하지 않으면 예약 수집은 계속 옛 바이너리로 돈다.
 */
export async function runAgentTelemetryUpgrade(
  options: AgentTelemetryLifecycleOptions & AgentTelemetryCliIdentity & { platform?: NodeJS.Platform }
): Promise<void> {
  const installation = readAgentTelemetryInstallation(options.agentId, source(options.source), options.home)
  const runner = options.runner ?? defaultCommandRunner
  const platform = options.platform ?? process.platform
  if (platform !== 'darwin') error('Automatic telemetry installation currently supports macOS only')

  const scriptPath = resolve(options.cliScriptPath ?? process.argv[1] ?? '')
  if (!scriptPath || !existsSync(scriptPath) || scriptPath.endsWith('.ts')) {
    error('Telemetry upgrade requires a packaged or built aitk JavaScript CLI')
  }
  const nodePath = resolve(options.nodePath ?? process.execPath)
  if (!existsSync(nodePath)) error('Node.js executable does not exist')
  if (!options.collectorVersion) error('Telemetry upgrade requires the running CLI version')

  const previous = { ...installation.cli }
  const identity = { collectorVersion: options.collectorVersion, cliScriptPath: scriptPath, nodePath }
  // 기록과 plist가 모두 최신일 때만 할 일이 없다. 기록만 최신이면 plist를 다시 써서 중단된 업그레이드를 고친다.
  if (installationFullyUpToDate(installation, identity)) {
    jsonOut({
      ok: true,
      upgraded: false,
      agentId: installation.agentId,
      collectorId: installation.collectorId,
      source: installation.source,
      cli: previous,
      scheduleReloaded: false,
    })
    return
  }

  const upgraded: AgentTelemetryInstallation = {
    ...installation,
    cli: { nodePath, scriptPath, collectorVersion: options.collectorVersion },
  }
  // 미전송 batch가 남아 있으면 dry-run이 그 batch를 그대로 돌려주므로 새 CLI가 source를 읽는지 확인할 수 없다.
  if (await hasPendingBatch(upgraded)) {
    error('A pending telemetry batch exists; run `agent-telemetry run` to flush it before upgrading')
  }

  // 새 CLI로 source를 다시 읽을 수 있는지 먼저 확인한다. 전송·checkpoint 변경은 없다.
  const dryRun = await runAgentTelemetryCollect(collectOptions(upgraded, true, undefined, options.now))
  if (dryRun.batch.collection.healthStatus !== 'healthy') {
    error(`Telemetry source validation is blocked: ${dryRun.batch.collection.healthWarnings.join(', ')}`)
  }

  // plist·launchd를 먼저 바꾸고 설치 기록을 마지막에 커밋한다. 그 사이에 중단되면 기록이 옛 상태로 남아
  // 다음 실행이 다시 업그레이드를 시도한다. 반대 순서로 하면 no-op으로 판정돼 스스로 복구하지 못한다.
  let scheduleReloaded = false
  if (upgraded.schedule.provider === 'launchd') {
    installLaunchdSchedule(upgraded, runner, options.uid)
    scheduleReloaded = true
  }
  writeAgentTelemetryInstallation(upgraded, options.home)

  jsonOut({
    ok: true,
    upgraded: true,
    agentId: installation.agentId,
    collectorId: installation.collectorId,
    source: installation.source,
    previous,
    cli: upgraded.cli,
    scheduleReloaded,
    intervalSeconds: upgraded.schedule.intervalSeconds,
    checkpointPreserved: true,
    credentialPreserved: true,
  })
}

export async function runAgentTelemetryDoctor(
  options: AgentTelemetryLifecycleOptions & AgentTelemetryCliIdentity
): Promise<void> {
  const installation = readAgentTelemetryInstallation(options.agentId, source(options.source), options.home)
  const runner = options.runner ?? defaultCommandRunner
  const sourceExists = existsSync(installation.sessionsDir)
  const cliExists = existsSync(installation.cli.scriptPath) && existsSync(installation.cli.nodePath)
  // 설치 기록이 지금 실행 중인 CLI와 다르거나 plist가 기록과 어긋나면 예약 수집은 옛 버전으로 돈다.
  // `agent-telemetry upgrade`로 맞춘다.
  const cliUpToDate = cliMatchesInstallation(installation, options)
  const scheduleMatchesRecord = installation.schedule.provider !== 'launchd' || launchdPlistMatches(installation)
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
  const healthy = sourceExists && cliExists && cliUpToDate && scheduleMatchesRecord && credentialAvailable &&
    scheduleLoaded !== false && dryRun?.batch.collection.healthStatus === 'healthy'

  jsonOut({
    ok: healthy,
    agentId: installation.agentId,
    collectorId: installation.collectorId,
    source: installation.source,
    checks: {
      sourceExists,
      cliExists,
      cliUpToDate,
      scheduleMatchesRecord,
      installedCollectorVersion: installation.cli.collectorVersion,
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
