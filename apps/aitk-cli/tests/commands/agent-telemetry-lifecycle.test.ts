import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandRunner } from '../../src/agent-telemetry/installation.js'

vi.mock('../../src/auth.js', () => ({ resolveToken: vi.fn(() => 'user-oauth-token') }))
vi.mock('../../src/output.js', () => ({
  jsonOut: vi.fn(),
  error: vi.fn((message: string) => { throw new Error(message) }),
}))

import {
  runAgentTelemetryDoctor,
  runAgentTelemetryInstall,
  runAgentTelemetryRun,
  runAgentTelemetryUninstall,
  runAgentTelemetryUpgrade,
} from '../../src/commands/agent-telemetry-lifecycle.js'
import { agentTelemetryInstallPath, readAgentTelemetryInstallation } from '../../src/agent-telemetry/installation.js'
import { writeAgentTelemetryCheckpoint } from '../../src/agent-telemetry/checkpoint.js'
import { jsonOut } from '../../src/output.js'

let root = ''
let sessionsDir = ''
let checkpointDir = ''
let cliPath = ''
let nodePath = ''
let storedCollectorToken = ''
const COLLECTOR_TOKEN = `agt_${'a'.repeat(64)}`

function setupTranscript(): void {
  mkdirSync(sessionsDir, { recursive: true })
  writeFileSync(join(sessionsDir, 'session.jsonl'), [
    JSON.stringify({ type: 'session', id: 'session-private', timestamp: '2026-08-26T00:00:00Z' }),
    JSON.stringify({
      type: 'message', id: 'message-private', timestamp: '2026-08-26T10:00:00Z',
      message: {
        role: 'assistant', model: 'test-model', content: [{ type: 'text', text: 'private' }],
        usage: { input: 3, output: 5 },
      },
    }),
  ].join('\n') + '\n')
}

const runner: CommandRunner = (command, args) => {
  if (command === '/usr/bin/security' && args[0] === 'add-generic-password') {
    storedCollectorToken = args[args.indexOf('-w') + 1]
    return { status: 0, stdout: '', stderr: '' }
  }
  if (command === '/usr/bin/security' && args[0] === 'find-generic-password') {
    return { status: storedCollectorToken ? 0 : 44, stdout: storedCollectorToken, stderr: '' }
  }
  if (command === '/usr/bin/security' && args[0] === 'delete-generic-password') {
    storedCollectorToken = ''
    return { status: 0, stdout: '', stderr: '' }
  }
  return { status: 0, stdout: '', stderr: '' }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.exitCode = undefined
  storedCollectorToken = ''
  root = mkdtempSync(join(tmpdir(), 'aitk-lifecycle-'))
  sessionsDir = join(root, 'sessions')
  checkpointDir = join(root, 'checkpoint')
  cliPath = join(root, 'aitk.js')
  nodePath = join(root, 'node')
  writeFileSync(cliPath, '')
  writeFileSync(nodePath, '')
  setupTranscript()

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/enroll') && init?.method === 'POST') {
      return new Response(JSON.stringify({ ok: true, collectorToken: COLLECTOR_TOKEN }), { status: 200 })
    }
    if (url.endsWith('/enroll') && init?.method === 'DELETE') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    if (url.endsWith('/agent-telemetry') && init?.method === 'POST') {
      return new Response(JSON.stringify({ ok: true, inserted: true }), { status: 200 })
    }
    return new Response(JSON.stringify({ error: 'unexpected request' }), { status: 404 })
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  process.exitCode = undefined
  rmSync(root, { recursive: true, force: true })
})

function lifecycle() {
  return { agentId: 'test-agent', source: 'openclaw', home: root, runner, now: new Date('2026-08-27T00:00:00Z') }
}

describe('agent telemetry lifecycle commands', () => {
  it('dry-run 검증 후 enrollment·Keychain·설정을 만들고 토큰은 파일에 쓰지 않는다', async () => {
    await runAgentTelemetryInstall({
      ...lifecycle(),
      sessionsDir,
      checkpointDir,
      days: 7,
      collectorVersion: '0.7.0',
      collectorId: 'collector-test',
      cliScriptPath: cliPath,
      nodePath,
      noSchedule: true,
      platform: 'darwin',
      keychainAccount: 'tester',
    })

    const path = agentTelemetryInstallPath('test-agent', 'openclaw', root)
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, 'utf8')).not.toContain(COLLECTOR_TOKEN)
    expect(storedCollectorToken).toBe(COLLECTOR_TOKEN)
    expect(existsSync(checkpointDir)).toBe(false)
    expect(vi.mocked(jsonOut).mock.calls.at(-1)?.[0]).toMatchObject({
      ok: true, installed: true, dryRun: { healthStatus: 'healthy', sessions: 1, turns: 1 },
    })
  })

  it('doctor는 전송·checkpoint 변경 없이 source·CLI·credential 건강도를 확인한다', async () => {
    await runAgentTelemetryInstall({
      ...lifecycle(), sessionsDir, checkpointDir, days: 7, collectorVersion: '0.7.0',
      collectorId: 'collector-test', cliScriptPath: cliPath, nodePath, noSchedule: true,
      platform: 'darwin', keychainAccount: 'tester',
    })
    vi.mocked(fetch).mockClear()

    await runAgentTelemetryDoctor({ ...lifecycle(), collectorVersion: '0.7.0', cliScriptPath: cliPath, nodePath })

    expect(fetch).not.toHaveBeenCalled()
    expect(existsSync(checkpointDir)).toBe(false)
    expect(vi.mocked(jsonOut).mock.calls.at(-1)?.[0]).toMatchObject({
      ok: true,
      checks: {
        sourceExists: true, cliExists: true, cliUpToDate: true, installedCollectorVersion: '0.7.0',
        credentialAvailable: true, collectionHealth: 'healthy',
      },
    })
  })

  it('기존 pilot checkpoint가 있으면 collector ID를 자동 승계한다', async () => {
    await writeAgentTelemetryCheckpoint(join(checkpointDir, 'test-agent-openclaw.json'), {
      version: 1,
      agentId: 'test-agent',
      collectorInstanceId: 'collector-existing-pilot',
      committed: { lastWindowEndUtc: null, files: {}, seenMessages: [] },
    })

    await runAgentTelemetryInstall({
      ...lifecycle(), sessionsDir, checkpointDir, days: 7, collectorVersion: '0.7.0',
      cliScriptPath: cliPath, nodePath, noSchedule: true,
      platform: 'darwin', keychainAccount: 'tester',
    })

    const config = JSON.parse(readFileSync(
      agentTelemetryInstallPath('test-agent', 'openclaw', root),
      'utf8',
    )) as { collectorId: string }
    expect(config.collectorId).toBe('collector-existing-pilot')
    const enrollment = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/enroll'))
    expect(JSON.parse(String((enrollment?.[1] as RequestInit).body))).toMatchObject({
      collectorId: 'collector-existing-pilot',
    })
  })

  it('run은 Keychain credential로 1회 전송하고 uninstall은 서버 폐기 후 로컬 설정을 제거한다', async () => {
    await runAgentTelemetryInstall({
      ...lifecycle(), sessionsDir, checkpointDir, days: 7, collectorVersion: '0.7.0',
      collectorId: 'collector-test', cliScriptPath: cliPath, nodePath, noSchedule: true,
      platform: 'darwin', keychainAccount: 'tester',
    })

    await runAgentTelemetryRun(lifecycle())
    expect(existsSync(checkpointDir)).toBe(true)
    const upload = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/agent-telemetry'))
    expect((upload?.[1] as RequestInit).headers).toMatchObject({ Authorization: `Bearer ${COLLECTOR_TOKEN}` })

    await runAgentTelemetryUninstall(lifecycle())
    expect(existsSync(agentTelemetryInstallPath('test-agent', 'openclaw', root))).toBe(false)
    expect(storedCollectorToken).toBe('')
    expect(existsSync(checkpointDir)).toBe(true)
  })

  it('upgrade는 설치 기록의 CLI 경로·버전을 실행 중인 CLI로 바꾸고 credential·checkpoint·collector ID를 보존한다', async () => {
    await runAgentTelemetryInstall({
      ...lifecycle(), sessionsDir, checkpointDir, days: 7, collectorVersion: '0.7.1',
      collectorId: 'collector-test', cliScriptPath: cliPath, nodePath, noSchedule: true,
      platform: 'darwin', keychainAccount: 'tester',
    })
    await runAgentTelemetryRun(lifecycle())

    const later = { ...lifecycle(), now: new Date('2026-08-27T02:00:00Z') }
    // 옛 CLI 기준 doctor는 최신이 아니라고 알린다
    await runAgentTelemetryDoctor({ ...later, collectorVersion: '0.7.6', cliScriptPath: join(root, 'aitk-new.js') })
    const staleDoctor = vi.mocked(jsonOut).mock.calls.at(-1)?.[0] as { ok: boolean; checks: Record<string, unknown> }
    expect(staleDoctor.ok).toBe(false)
    expect(staleDoctor.checks).toMatchObject({ cliUpToDate: false, installedCollectorVersion: '0.7.1' })

    const newCliPath = join(root, 'aitk-new.js')
    writeFileSync(newCliPath, '')
    await runAgentTelemetryUpgrade({
      ...later, collectorVersion: '0.7.6', cliScriptPath: newCliPath, nodePath, platform: 'darwin',
    })
    const upgrade = vi.mocked(jsonOut).mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(upgrade).toMatchObject({
      ok: true, upgraded: true, collectorId: 'collector-test', scheduleReloaded: false,
      previous: expect.objectContaining({ collectorVersion: '0.7.1', scriptPath: cliPath }),
      cli: expect.objectContaining({ collectorVersion: '0.7.6', scriptPath: newCliPath }),
    })
    const installation = readAgentTelemetryInstallation('test-agent', 'openclaw', root)
    expect(installation.cli).toEqual({ nodePath, scriptPath: newCliPath, collectorVersion: '0.7.6' })
    expect(installation.collectorId).toBe('collector-test')
    expect(storedCollectorToken).toBe(COLLECTOR_TOKEN)
    expect(existsSync(checkpointDir)).toBe(true)

    // 같은 CLI로 다시 실행하면 바꿀 것이 없다
    await runAgentTelemetryUpgrade({
      ...later, collectorVersion: '0.7.6', cliScriptPath: newCliPath, nodePath, platform: 'darwin',
    })
    expect(vi.mocked(jsonOut).mock.calls.at(-1)?.[0]).toMatchObject({ ok: true, upgraded: false })

    await runAgentTelemetryDoctor({ ...later, collectorVersion: '0.7.6', cliScriptPath: newCliPath, nodePath })
    const freshDoctor = vi.mocked(jsonOut).mock.calls.at(-1)?.[0] as { checks: Record<string, unknown> }
    expect(freshDoctor.checks).toMatchObject({ cliUpToDate: true, installedCollectorVersion: '0.7.6' })
  })

  it('서버 revoke가 실패해도 timer는 먼저 멈추고 재시도용 credential·config는 보존한다', async () => {
    await runAgentTelemetryInstall({
      ...lifecycle(), sessionsDir, checkpointDir, days: 7, collectorVersion: '0.7.0',
      collectorId: 'collector-test', cliScriptPath: cliPath, nodePath,
      platform: 'darwin', keychainAccount: 'tester', uid: 501,
    })
    const configPath = agentTelemetryInstallPath('test-agent', 'openclaw', root)
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as { schedule: { plistPath: string } }
    expect(existsSync(config.schedule.plistPath)).toBe(true)
    vi.mocked(fetch).mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/enroll') && init?.method === 'DELETE') {
        return new Response(JSON.stringify({ error: 'temporarily unavailable' }), { status: 503 })
      }
      return new Response(JSON.stringify({ error: 'unexpected request' }), { status: 404 })
    })

    await expect(runAgentTelemetryUninstall({ ...lifecycle(), uid: 501 }))
      .rejects.toThrow('temporarily unavailable')
    expect(existsSync(config.schedule.plistPath)).toBe(false)
    expect(existsSync(configPath)).toBe(true)
    expect(storedCollectorToken).toBe(COLLECTOR_TOKEN)
  })
})
