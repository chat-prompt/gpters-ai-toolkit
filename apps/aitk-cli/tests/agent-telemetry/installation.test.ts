import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  agentTelemetryInstallPath,
  createInstallation,
  installLaunchdSchedule,
  readAgentTelemetryInstallation,
  renderLaunchdPlist,
  writeAgentTelemetryInstallation,
  type CommandRunner,
} from '../../src/agent-telemetry/installation.js'

let root = ''
let cliPath = ''
let nodePath = ''
let sessionsDir = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aitk-installation-'))
  cliPath = join(root, 'aitk.js')
  nodePath = join(root, 'node')
  sessionsDir = join(root, 'sessions')
  writeFileSync(cliPath, '#!/usr/bin/env node\n')
  writeFileSync(nodePath, '')
  chmodSync(nodePath, 0o700)
  mkdirSync(sessionsDir)
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

function installation(schedule: 'launchd' | 'none' = 'launchd') {
  return createInstallation({
    agentId: 'test-agent',
    collectorId: 'collector-test',
    source: 'openclaw',
    sessionsDir,
    openclawAgent: 'main',
    serverUrl: 'https://ai-toolkit.gpters.org/',
    backfillDays: 7,
    intervalSeconds: 21_600,
    nodePath,
    scriptPath: cliPath,
    collectorVersion: '0.7.0',
    account: 'tester',
    schedule,
    home: root,
    now: new Date('2026-08-27T00:00:00Z'),
  })
}

describe('agent telemetry installation', () => {
  it('로컬 설정을 0600으로 원자 저장하고 원문 토큰을 포함하지 않는다', () => {
    const value = installation('none')
    const path = writeAgentTelemetryInstallation(value, root)
    const serialized = readFileSync(path, 'utf8')

    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(serialized).not.toContain('collector-secret-token')
    expect(readAgentTelemetryInstallation('test-agent', 'openclaw', root)).toEqual(value)
    expect(value.openclawAgent).toBe('main')
  })

  it('launchd plist에는 built CLI와 범위만 기록하고 credential은 넣지 않는다', () => {
    const value = installation()
    const plist = renderLaunchdPlist(value)

    expect(plist).toContain('<string>agent-telemetry</string>')
    expect(plist).toContain('<string>run</string>')
    expect(plist).toContain('<integer>21600</integer>')
    expect(plist).not.toContain('AX_AGENT_TELEMETRY_TOKEN')
    expect(plist).not.toContain(value.credential.service)
  })

  it('interval을 생략하면 상시 가동 에이전트 기준 1시간으로 예약한다', () => {
    const value = createInstallation({
      agentId: 'test-agent',
      collectorId: 'collector-test',
      source: 'openclaw',
      sessionsDir,
      openclawAgent: 'main',
      serverUrl: 'https://ai-toolkit.gpters.org/',
      backfillDays: 7,
      nodePath,
      scriptPath: cliPath,
      collectorVersion: '0.7.0',
      account: 'tester',
      schedule: 'launchd',
      home: root,
    })

    expect(value.schedule.intervalSeconds).toBe(3600)
    expect(renderLaunchdPlist(value)).toContain('<integer>3600</integer>')
  })

  it('plist 검증 후 현재 사용자 launchd 도메인에 등록한다', () => {
    const value = installation()
    const calls: Array<[string, string[]]> = []
    const runner: CommandRunner = (command, args) => {
      calls.push([command, args])
      return { status: 0, stdout: '', stderr: '' }
    }

    installLaunchdSchedule(value, runner, 501)

    expect(calls.map(([, args]) => args[0])).toEqual(['-lint', 'bootout', 'bootstrap'])
    expect(calls[2][1]).toContain('gui/501')
  })

  it('손상된 설정은 범위를 추정하지 않고 fail-closed한다', () => {
    const value = installation('none')
    const path = writeAgentTelemetryInstallation(value, root)
    writeFileSync(path, JSON.stringify({ ...value, collectorId: '../other' }))

    expect(() => readAgentTelemetryInstallation('test-agent', 'openclaw', root))
      .toThrow('schema is invalid')
  })

  it('설정이 다른 launchd 파일이나 credential을 가리키면 fail-closed한다', () => {
    const value = installation()
    const path = writeAgentTelemetryInstallation(value, root)
    writeFileSync(path, JSON.stringify({
      ...value,
      credential: { ...value.credential, service: 'unrelated-keychain-item' },
      schedule: { ...value.schedule, plistPath: join(root, 'unrelated.plist') },
    }))

    expect(() => readAgentTelemetryInstallation('test-agent', 'openclaw', root))
      .toThrow('paths do not match')
  })

  it('Hermes 프로필별 agentId는 설치·스케줄·credential을 서로 분리한다', () => {
    const common = {
      source: 'hermes' as const,
      sessionsDir,
      serverUrl: 'https://ai-toolkit.gpters.org',
      backfillDays: 7,
      intervalSeconds: 3_600,
      nodePath,
      scriptPath: cliPath,
      collectorVersion: '0.7.0',
      account: 'tester',
      schedule: 'launchd' as const,
      home: root,
      now: new Date('2026-08-27T00:00:00Z'),
    }
    const bbokeoter = createInstallation({
      ...common,
      agentId: 'bbokeoter',
      collectorId: 'collector-bbokeoter',
      hermesProfile: 'default',
    })
    const namedAgent = createInstallation({
      ...common,
      agentId: 'named-agent',
      collectorId: 'collector-named-agent',
      hermesProfile: 'named-profile',
    })

    expect(bbokeoter.hermesProfile).toBe('default')
    expect(namedAgent.hermesProfile).toBe('named-profile')
    expect(agentTelemetryInstallPath('bbokeoter', 'hermes', root))
      .not.toBe(agentTelemetryInstallPath('named-agent', 'hermes', root))
    expect(bbokeoter.schedule.label).not.toBe(namedAgent.schedule.label)
    expect(bbokeoter.credential.service).not.toBe(namedAgent.credential.service)
  })
})
