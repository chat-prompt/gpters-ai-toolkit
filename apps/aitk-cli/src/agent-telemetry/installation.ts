/** 설치형 agent telemetry collector의 로컬 설정·Keychain·launchd 수명주기. */

import { randomUUID } from 'node:crypto'
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import type { AgentTelemetrySource } from './types.js'

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,99}$/
const SAFE_SOURCE = new Set<AgentTelemetrySource>(['openclaw', 'claude-code', 'codex', 'hermes'])

export interface AgentTelemetryInstallation {
  version: 1
  agentId: string
  collectorId: string
  source: AgentTelemetrySource
  sessionsDir: string
  projectSlugs?: string
  openclawAgent?: string
  hermesProfile?: string
  checkpointDir: string
  category: string
  serverUrl: string
  backfillDays: number
  installedAtUtc: string
  cli: {
    nodePath: string
    scriptPath: string
    collectorVersion: string
  }
  credential: {
    provider: 'macos-keychain'
    service: string
    account: string
  }
  schedule: {
    provider: 'launchd' | 'none'
    intervalSeconds: number
    label: string
    plistPath?: string
    stdoutPath: string
    stderrPath: string
  }
}

export interface CommandResult {
  status: number | null
  stdout: string
  stderr: string
}

export type CommandRunner = (command: string, args: string[]) => CommandResult

export const defaultCommandRunner: CommandRunner = (command, args) => {
  const result: SpawnSyncReturns<string> = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function assertSafeId(value: string, name: string): void {
  if (!SAFE_ID.test(value)) throw new Error(`${name} must match ${SAFE_ID}`)
}

function assertAbsolutePath(value: string, name: string): void {
  if (!value || value.includes('\0') || resolve(value) !== value) {
    throw new Error(`${name} must be an absolute path`)
  }
}

function installationKey(agentId: string, source: AgentTelemetrySource): string {
  assertSafeId(agentId, 'agentId')
  if (!SAFE_SOURCE.has(source)) throw new Error('Unsupported telemetry source')
  return `${agentId}-${source}`
}

export function agentTelemetryInstallDir(home = homedir()): string {
  return join(home, '.config', 'aitk', 'agent-telemetry')
}

export function agentTelemetryInstallPath(
  agentId: string,
  source: AgentTelemetrySource,
  home = homedir()
): string {
  return join(agentTelemetryInstallDir(home), `${installationKey(agentId, source)}.json`)
}

export function agentTelemetryCheckpointDir(home = homedir()): string {
  return join(home, '.cache', 'gpters-aitk', 'agent-telemetry')
}

export function createCollectorId(): string {
  return `collector-${randomUUID()}`
}

function isInstallation(value: unknown): value is AgentTelemetryInstallation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Partial<AgentTelemetryInstallation>
  if (item.version !== 1 || typeof item.agentId !== 'string' || typeof item.collectorId !== 'string') return false
  if (typeof item.source !== 'string' || !SAFE_SOURCE.has(item.source as AgentTelemetrySource)) return false
  if (typeof item.sessionsDir !== 'string' || typeof item.checkpointDir !== 'string') return false
  if (item.projectSlugs !== undefined && typeof item.projectSlugs !== 'string') return false
  if (item.openclawAgent !== undefined && typeof item.openclawAgent !== 'string') return false
  if (item.hermesProfile !== undefined && typeof item.hermesProfile !== 'string') return false
  if (item.openclawAgent !== undefined && item.source !== 'openclaw') return false
  if (typeof item.category !== 'string' || typeof item.serverUrl !== 'string') return false
  if (typeof item.backfillDays !== 'number' || !Number.isInteger(item.backfillDays) ||
    item.backfillDays < 1 || item.backfillDays > 90) return false
  if (!item.cli || typeof item.cli.nodePath !== 'string' || typeof item.cli.scriptPath !== 'string' ||
    typeof item.cli.collectorVersion !== 'string') return false
  if (!item.credential || item.credential.provider !== 'macos-keychain' ||
    typeof item.credential.service !== 'string' || typeof item.credential.account !== 'string') return false
  if (!item.schedule || (item.schedule.provider !== 'launchd' && item.schedule.provider !== 'none') ||
    typeof item.schedule.intervalSeconds !== 'number' || typeof item.schedule.label !== 'string' ||
    typeof item.schedule.stdoutPath !== 'string' || typeof item.schedule.stderrPath !== 'string') return false
  if (!Number.isInteger(item.schedule.intervalSeconds) ||
    item.schedule.intervalSeconds < 600 || item.schedule.intervalSeconds > 604_800) return false
  if (item.schedule.provider === 'launchd' && typeof item.schedule.plistPath !== 'string') return false
  if (item.schedule.provider === 'none' && item.schedule.plistPath !== undefined) return false
  try {
    assertSafeId(item.agentId, 'agentId')
    assertSafeId(item.collectorId, 'collectorId')
    if (item.openclawAgent) assertSafeId(item.openclawAgent, 'openclawAgent')
    assertAbsolutePath(item.sessionsDir, 'sessionsDir')
    assertAbsolutePath(item.checkpointDir, 'checkpointDir')
    assertAbsolutePath(item.cli.nodePath, 'nodePath')
    assertAbsolutePath(item.cli.scriptPath, 'scriptPath')
    if (item.schedule.plistPath) assertAbsolutePath(item.schedule.plistPath, 'plistPath')
    assertAbsolutePath(item.schedule.stdoutPath, 'stdoutPath')
    assertAbsolutePath(item.schedule.stderrPath, 'stderrPath')
    const serverUrl = new URL(item.serverUrl)
    const loopback = ['localhost', '127.0.0.1', '::1'].includes(serverUrl.hostname)
    if (serverUrl.username || serverUrl.password ||
      (serverUrl.protocol !== 'https:' && !(serverUrl.protocol === 'http:' && loopback))) return false
  } catch {
    return false
  }
  return true
}

function installationPathsMatchHome(installation: AgentTelemetryInstallation, home: string): boolean {
  const key = installationKey(installation.agentId, installation.source)
  if (installation.credential.service !== keychainServiceFor(installation.collectorId)) return false
  if (installation.schedule.label !== launchdLabel(installation.agentId, installation.source)) return false
  if (installation.schedule.provider === 'launchd' &&
    installation.schedule.plistPath !== launchdPlistPath(installation.schedule.label, home)) return false
  const logDirectory = agentTelemetryCheckpointDir(home)
  return installation.schedule.stdoutPath === join(logDirectory, `${key}.out.log`) &&
    installation.schedule.stderrPath === join(logDirectory, `${key}.err.log`)
}

export function readAgentTelemetryInstallation(
  agentId: string,
  source: AgentTelemetrySource,
  home = homedir()
): AgentTelemetryInstallation {
  const path = agentTelemetryInstallPath(agentId, source, home)
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (cause) {
    throw new Error('Agent telemetry installation is missing or unreadable', { cause })
  }
  if (!isInstallation(parsed)) throw new Error('Agent telemetry installation schema is invalid')
  if (!installationPathsMatchHome(parsed, home)) {
    throw new Error('Agent telemetry installation paths do not match the current home')
  }
  if (parsed.agentId !== agentId || parsed.source !== source) {
    throw new Error('Agent telemetry installation scope does not match the requested collector')
  }
  return parsed
}

export function writeAgentTelemetryInstallation(
  installation: AgentTelemetryInstallation,
  home = homedir()
): string {
  if (!isInstallation(installation)) throw new Error('Agent telemetry installation schema is invalid')
  if (!installationPathsMatchHome(installation, home)) {
    throw new Error('Agent telemetry installation paths do not match the current home')
  }
  const path = agentTelemetryInstallPath(installation.agentId, installation.source, home)
  const directory = dirname(path)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
  const temporary = join(directory, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
  writeFileSync(temporary, `${JSON.stringify(installation, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  renameSync(temporary, path)
  chmodSync(path, 0o600)
  return path
}

export function deleteAgentTelemetryInstallation(
  agentId: string,
  source: AgentTelemetrySource,
  home = homedir()
): boolean {
  const path = agentTelemetryInstallPath(agentId, source, home)
  if (!existsSync(path)) return false
  unlinkSync(path)
  return true
}

export function keychainServiceFor(collectorId: string): string {
  assertSafeId(collectorId, 'collectorId')
  return `org.gpters.aitk.agent-telemetry.${collectorId}`
}

export function storeMacOSKeychainCredential(
  installation: AgentTelemetryInstallation,
  token: string,
  runner: CommandRunner = defaultCommandRunner
): void {
  if (!token || token.includes('\0')) throw new Error('Collector credential is empty or invalid')
  const result = runner('/usr/bin/security', [
    'add-generic-password',
    '-a', installation.credential.account,
    '-s', installation.credential.service,
    '-w', token,
    '-U',
  ])
  if (result.status !== 0) throw new Error('Failed to store collector credential in macOS Keychain')
}

export function readMacOSKeychainCredential(
  installation: AgentTelemetryInstallation,
  runner: CommandRunner = defaultCommandRunner
): string {
  const result = runner('/usr/bin/security', [
    'find-generic-password',
    '-a', installation.credential.account,
    '-s', installation.credential.service,
    '-w',
  ])
  const token = result.stdout.trim()
  if (result.status !== 0 || !token) throw new Error('Collector credential is unavailable in macOS Keychain')
  return token
}

export function deleteMacOSKeychainCredential(
  installation: AgentTelemetryInstallation,
  runner: CommandRunner = defaultCommandRunner
): boolean {
  const result = runner('/usr/bin/security', [
    'delete-generic-password',
    '-a', installation.credential.account,
    '-s', installation.credential.service,
  ])
  return result.status === 0
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function launchdLabel(agentId: string, source: AgentTelemetrySource): string {
  const key = installationKey(agentId, source).replace(/[^a-zA-Z0-9.-]/g, '-')
  return `org.gpters.aitk.agent-telemetry.${key}`
}

export function launchdPlistPath(label: string, home = homedir()): string {
  if (!/^org\.gpters\.aitk\.agent-telemetry\.[a-zA-Z0-9.-]+$/.test(label)) {
    throw new Error('Invalid launchd label')
  }
  return join(home, 'Library', 'LaunchAgents', `${label}.plist`)
}

export function renderLaunchdPlist(installation: AgentTelemetryInstallation): string {
  if (installation.schedule.provider !== 'launchd') throw new Error('Installation is not configured for launchd')
  const args = [
    installation.cli.nodePath,
    installation.cli.scriptPath,
    'agent-telemetry',
    'run',
    '--agent',
    installation.agentId,
    '--source',
    installation.source,
  ]
  const renderedArgs = args.map((arg) => `    <string>${escapeXml(arg)}</string>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(installation.schedule.label)}</string>
  <key>ProgramArguments</key>
  <array>
${renderedArgs}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>${installation.schedule.intervalSeconds}</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>ThrottleInterval</key>
  <integer>60</integer>
  <key>StandardOutPath</key>
  <string>${escapeXml(installation.schedule.stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(installation.schedule.stderrPath)}</string>
</dict>
</plist>
`
}

/**
 * 이미 설치된 launchd plist가 이 설치 기록과 같은 내용인지.
 *
 * 설치 기록만 보고 "최신"이라고 판단하면, 기록을 쓴 뒤 plist 교체 전에 중단된 상태를 영영 고치지 못한다.
 * 읽을 수 없으면 불일치로 본다 — 다시 쓰는 쪽이 안전하다.
 */
export function launchdPlistMatches(installation: AgentTelemetryInstallation): boolean {
  if (installation.schedule.provider !== 'launchd' || !installation.schedule.plistPath) return false
  try {
    return readFileSync(installation.schedule.plistPath, 'utf8') === renderLaunchdPlist(installation)
  } catch {
    return false
  }
}

/**
 * plist를 원자적으로 교체하고 launchd에 다시 등록한다.
 *
 * lint는 임시 파일에서 먼저 수행해 살아 있는 plist를 건드리기 전에 실패한다. 등록에 실패하면 이전 plist
 * 원문과 job을 되돌려, 기록과 실제 예약이 어긋난 채 남지 않게 한다.
 */
export function installLaunchdSchedule(
  installation: AgentTelemetryInstallation,
  runner: CommandRunner = defaultCommandRunner,
  uid = typeof process.getuid === 'function' ? process.getuid() : -1
): void {
  if (installation.schedule.provider !== 'launchd' || !installation.schedule.plistPath) {
    throw new Error('Installation is not configured for launchd')
  }
  if (uid < 0) throw new Error('Could not determine the current user ID for launchd')
  const plistPath = installation.schedule.plistPath
  mkdirSync(dirname(plistPath), { recursive: true })
  mkdirSync(dirname(installation.schedule.stdoutPath), { recursive: true, mode: 0o700 })

  let previousPlist: string | null = null
  try {
    previousPlist = readFileSync(plistPath, 'utf8')
  } catch {
    previousPlist = null
  }

  const temporary = `${plistPath}.${process.pid}.tmp`
  writeFileSync(temporary, renderLaunchdPlist(installation), { encoding: 'utf8', mode: 0o600 })
  const lint = runner('/usr/bin/plutil', ['-lint', temporary])
  if (lint.status !== 0) {
    try {
      unlinkSync(temporary)
    } catch {
      // 임시 파일이 이미 없으면 그대로 둔다
    }
    throw new Error('Generated launchd plist failed validation')
  }
  renameSync(temporary, plistPath)
  chmodSync(plistPath, 0o600)

  const domain = `gui/${uid}`
  runner('/bin/launchctl', ['bootout', domain, plistPath])
  const bootstrap = runner('/bin/launchctl', ['bootstrap', domain, plistPath])
  if (bootstrap.status !== 0) {
    if (previousPlist === null) {
      try {
        unlinkSync(plistPath)
      } catch {
        // 되돌릴 이전 파일이 없고 삭제도 못 하면 그대로 두고 오류만 올린다
      }
    } else {
      writeFileSync(plistPath, previousPlist, { encoding: 'utf8', mode: 0o600 })
      runner('/bin/launchctl', ['bootstrap', domain, plistPath])
    }
    throw new Error('Failed to register agent telemetry launchd job')
  }
}

export function launchdScheduleLoaded(
  installation: AgentTelemetryInstallation,
  runner: CommandRunner = defaultCommandRunner,
  uid = typeof process.getuid === 'function' ? process.getuid() : -1
): boolean {
  if (installation.schedule.provider !== 'launchd' || uid < 0) return false
  return runner('/bin/launchctl', ['print', `gui/${uid}/${installation.schedule.label}`]).status === 0
}

export function removeLaunchdSchedule(
  installation: AgentTelemetryInstallation,
  runner: CommandRunner = defaultCommandRunner,
  uid = typeof process.getuid === 'function' ? process.getuid() : -1
): boolean {
  if (installation.schedule.provider !== 'launchd' || !installation.schedule.plistPath) return false
  if (uid >= 0) runner('/bin/launchctl', ['bootout', `gui/${uid}`, installation.schedule.plistPath])
  if (!existsSync(installation.schedule.plistPath)) return false
  unlinkSync(installation.schedule.plistPath)
  return true
}

export function createInstallation(input: {
  agentId: string
  collectorId?: string
  source: AgentTelemetrySource
  sessionsDir: string
  projectSlugs?: string
  openclawAgent?: string
  hermesProfile?: string
  checkpointDir?: string
  category?: string
  serverUrl: string
  backfillDays: number
  intervalSeconds?: number
  nodePath: string
  scriptPath: string
  collectorVersion: string
  account: string
  schedule: 'launchd' | 'none'
  home?: string
  now?: Date
}): AgentTelemetryInstallation {
  const home = input.home ?? homedir()
  const collectorId = input.collectorId ?? createCollectorId()
  assertSafeId(input.agentId, 'agentId')
  assertSafeId(collectorId, 'collectorId')
  if (!SAFE_SOURCE.has(input.source)) throw new Error('Unsupported telemetry source')
  const sessionsDir = resolve(input.sessionsDir)
  const checkpointDir = resolve(input.checkpointDir ?? agentTelemetryCheckpointDir(home))
  const nodePath = resolve(input.nodePath)
  const scriptPath = resolve(input.scriptPath)
  // 에이전트 텔레메트리는 상시 가동 에이전트가 기본이라 1시간마다 수집한다. 노트북에서 도는 에이전트는 --interval로 늘린다.
  const intervalSeconds = input.intervalSeconds ?? 3600
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 600 || intervalSeconds > 604_800) {
    throw new Error('Telemetry interval must be between 600 and 604800 seconds')
  }
  const label = launchdLabel(input.agentId, input.source)
  const logDirectory = agentTelemetryCheckpointDir(home)
  const installation: AgentTelemetryInstallation = {
    version: 1,
    agentId: input.agentId,
    collectorId,
    source: input.source,
    sessionsDir,
    ...(input.projectSlugs ? { projectSlugs: input.projectSlugs } : {}),
    ...(input.openclawAgent ? { openclawAgent: input.openclawAgent } : {}),
    ...(input.hermesProfile ? { hermesProfile: input.hermesProfile } : {}),
    checkpointDir,
    category: input.category ?? 'unclassified',
    serverUrl: input.serverUrl.replace(/\/+$/, ''),
    backfillDays: input.backfillDays,
    installedAtUtc: (input.now ?? new Date()).toISOString(),
    cli: { nodePath, scriptPath, collectorVersion: input.collectorVersion },
    credential: {
      provider: 'macos-keychain',
      service: keychainServiceFor(collectorId),
      account: input.account,
    },
    schedule: {
      provider: input.schedule,
      intervalSeconds,
      label,
      ...(input.schedule === 'launchd' ? { plistPath: launchdPlistPath(label, home) } : {}),
      stdoutPath: join(logDirectory, `${installationKey(input.agentId, input.source)}.out.log`),
      stderrPath: join(logDirectory, `${installationKey(input.agentId, input.source)}.err.log`),
    },
  }
  if (!isInstallation(installation)) throw new Error('Could not create a valid telemetry installation')
  return installation
}
