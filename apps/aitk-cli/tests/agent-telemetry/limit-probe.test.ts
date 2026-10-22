/**
 * 봇 수집기의 계정 주간 한도 측정 (EDU-11519)
 *
 * 헤드리스 Claude 출력에서 seven_day 를 꺼내고, 계정은 이메일 해시로만 싣는다.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  accountKey,
  claudeConfigDirFor,
  parseClaudeWeeklyLimit,
  probeAgentLimit,
  readCodexAccountEmail,
} from '../../src/agent-telemetry/limit-probe.js'

// 2026-10-22 실측한 rate_limit_event 의 모양
const STREAM = [
  '{"type":"system","subtype":"init","apiKeySource":"none"}',
  '{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","rateLimitType":"five_hour","unifiedWindows":{"five_hour":{"utilization":0.21,"resetsAt":1792641600},"seven_day":{"utilization":0.65,"resetsAt":1792699200}}}}',
  '{"type":"result"}',
].join('\n')

const NOW = new Date('2026-10-22T03:00:00Z')
const dirs: string[] = []
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'limit-probe-')); dirs.push(dir); return dir }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

const jwt = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`

describe('계정 주간 한도 측정', () => {
  it('stream-json 에서 seven_day 사용률을 백분율로 꺼낸다', () => {
    expect(parseClaudeWeeklyLimit(STREAM)).toEqual({ usedPercent: 65, resetsAt: new Date(1792699200 * 1000).toISOString() })
    expect(parseClaudeWeeklyLimit('{"type":"result"}')).toBeNull()
  })

  it('계정 키는 소문자·trim 한 이메일의 sha256 이다', () => {
    expect(accountKey(' Bot@Example.com ')).toBe(accountKey('bot@example.com'))
    expect(accountKey('bot@example.com')).toMatch(/^[a-f0-9]{64}$/)
  })

  it('claude-code 출처는 projects 의 부모가 설정 디렉터리이고, 기본 ~/.claude 면 넘기지 않는다', () => {
    expect(claudeConfigDirFor('claude-code', '/h/.openclaw/agents/bot/agent/projects', '/h')).toBe('/h/.openclaw/agents/bot/agent')
    expect(claudeConfigDirFor('claude-code', '/h/.claude/projects', '/h')).toBeNull()
    expect(claudeConfigDirFor('openclaw', '/h/.openclaw/agents/bot', '/h')).toBeNull()
  })

  it('Claude: 로그인 계정과 한도를 함께 싣고, 측정은 세션·설정·도구 없이 임시 디렉터리에서 돈다', async () => {
    const calls: Array<{ args: string[]; env: NodeJS.ProcessEnv; cwd: string }> = []
    const result = await probeAgentLimit({
      agentId: 'bbojjak', collectorInstanceId: 'c1', source: 'claude-code',
      sessionsDir: '/h/.openclaw/agents/bot/agent/projects', stateDir: temp(), home: '/h', now: NOW,
      run: async (_command, args, env, cwd) => {
        calls.push({ args, env, cwd })
        return args[0] === 'auth' ? JSON.stringify({ email: 'Bot@Example.com' }) : STREAM
      },
    })
    expect(result).toEqual({
      ok: true,
      snapshot: {
        agentId: 'bbojjak', collectorInstanceId: 'c1', client: 'claude-code', accountKey: accountKey('bot@example.com'),
        usedPercent: 65, resetsAt: new Date(1792699200 * 1000).toISOString(), observedAt: NOW.toISOString(),
      },
    })
    expect(calls[1].args).toEqual(expect.arrayContaining(['--no-session-persistence', '--strict-mcp-config', '--setting-sources', '']))
    expect(calls.every((call) => call.env.CLAUDE_CONFIG_DIR === '/h/.openclaw/agents/bot/agent' && call.env.DISABLE_AUTOUPDATER === '1')).toBe(true)
    expect(calls[1].cwd).toBe(tmpdir())
  })

  it('Claude: 계정을 못 읽으면 한도도 보내지 않는다(귀속을 추측하지 않는다)', async () => {
    const result = await probeAgentLimit({
      agentId: 'bbojjak', collectorInstanceId: 'c1', source: 'openclaw', sessionsDir: '/h/.openclaw/agents/bot', stateDir: temp(), home: '/h', now: NOW,
      run: async (_command, args) => (args[0] === 'auth' ? JSON.stringify({ loggedIn: false }) : STREAM),
    })
    expect(result).toEqual({ ok: false, reason: 'no-account' })
  })

  it('Codex: auth.json 의 email 과 롤아웃의 마지막 주간 한도를 쓴다', async () => {
    const home = temp()
    const codexHome = join(home, '.codex')
    const day = join(codexHome, 'sessions', '2026', '10', '22')
    mkdirSync(day, { recursive: true })
    writeFileSync(join(codexHome, 'auth.json'), JSON.stringify({ tokens: { id_token: jwt({ email: 'team@example.com' }) } }))
    utimesSync(join(codexHome, 'auth.json'), new Date('2026-10-22T00:00:00Z'), new Date('2026-10-22T00:00:00Z'))
    const resets = Math.floor(Date.parse('2026-10-26T00:00:00Z') / 1000)
    const line = (at: string, percent: number) => JSON.stringify({
      timestamp: at, type: 'event_msg',
      payload: { type: 'token_count', rate_limits: { primary: { used_percent: 3, window_minutes: 300, resets_at: resets }, secondary: { used_percent: percent, window_minutes: 10080, resets_at: resets } } },
    })
    writeFileSync(join(day, 'rollout-a.jsonl'), [line('2026-10-22T01:00:00Z', 20), line('2026-10-22T02:00:00Z', 24)].join('\n'))
    const stateDir = temp()
    // 이 계정을 01:30 부터 썼다고 기록돼 있다 — 그 뒤 관측(02:00, 24%)만 쓴다
    writeFileSync(join(stateDir, 'limit-account-bbojjak-codex.json'), JSON.stringify({ accountKey: accountKey('team@example.com'), since: '2026-10-22T01:30:00.000Z' }))

    expect(readCodexAccountEmail(codexHome)).toBe('team@example.com')
    const result = await probeAgentLimit({
      agentId: 'bbojjak', collectorInstanceId: 'c2', source: 'codex', sessionsDir: join(codexHome, 'sessions'), stateDir, home, now: NOW,
    })
    expect(result).toEqual({
      ok: true,
      snapshot: {
        agentId: 'bbojjak', collectorInstanceId: 'c2', client: 'codex', accountKey: accountKey('team@example.com'),
        usedPercent: 24, resetsAt: '2026-10-26T00:00:00.000Z', observedAt: '2026-10-22T02:00:00.000Z',
      },
    })
  })

  it('Codex: 계정이 바뀌면 그 전 롤아웃의 한도를 새 계정에 붙이지 않는다', async () => {
    const home = temp()
    const codexHome = join(home, '.codex')
    const day = join(codexHome, 'sessions', '2026', '10', '22')
    mkdirSync(day, { recursive: true })
    const resets = Math.floor(Date.parse('2026-10-26T00:00:00Z') / 1000)
    // 옛 계정이 90% 를 남겼다
    writeFileSync(join(day, 'rollout-a.jsonl'), JSON.stringify({
      timestamp: '2026-10-22T02:00:00Z', type: 'event_msg',
      payload: { type: 'token_count', rate_limits: { secondary: { used_percent: 90, window_minutes: 10080, resets_at: resets } } },
    }))
    const stateDir = temp()
    writeFileSync(join(stateDir, 'limit-account-bbojjak-codex.json'), JSON.stringify({ accountKey: accountKey('old@example.com'), since: '2026-10-01T00:00:00.000Z' }))
    writeFileSync(join(codexHome, 'auth.json'), JSON.stringify({ tokens: { id_token: jwt({ email: 'new@example.com' }) } }))

    const input = { agentId: 'bbojjak', collectorInstanceId: 'c2', source: 'codex' as const, sessionsDir: join(codexHome, 'sessions'), stateDir, home, now: NOW }
    expect(await probeAgentLimit(input)).toEqual({ ok: false, reason: 'no-limit' })
    // 새 계정의 시작 시각이 기록됐다 — 다음 관측부터 쓴다
    expect(JSON.parse(readFileSync(join(stateDir, 'limit-account-bbojjak-codex.json'), 'utf-8'))).toEqual({ accountKey: accountKey('new@example.com'), since: NOW.toISOString() })
  })

  it('Codex: 같은 계정으로 돌아와도(A→B→A) auth.json 이 다시 쓰인 뒤의 관측만 쓴다', async () => {
    const home = temp()
    const codexHome = join(home, '.codex')
    const day = join(codexHome, 'sessions', '2026', '10', '22')
    mkdirSync(day, { recursive: true })
    const resets = Math.floor(Date.parse('2026-10-26T00:00:00Z') / 1000)
    // 02:00 의 90% 는 잠깐 쓴 B 계정 값이다
    writeFileSync(join(day, 'rollout-b.jsonl'), JSON.stringify({
      timestamp: '2026-10-22T02:00:00Z', type: 'event_msg',
      payload: { type: 'token_count', rate_limits: { secondary: { used_percent: 90, window_minutes: 10080, resets_at: resets } } },
    }))
    const stateDir = temp()
    writeFileSync(join(stateDir, 'limit-account-bbojjak-codex.json'), JSON.stringify({ accountKey: accountKey('a@example.com'), since: '2026-10-01T00:00:00.000Z' }))
    writeFileSync(join(codexHome, 'auth.json'), JSON.stringify({ tokens: { id_token: jwt({ email: 'a@example.com' }) } }))
    // 02:30 에 A 로 다시 로그인했다
    utimesSync(join(codexHome, 'auth.json'), new Date('2026-10-22T02:30:00Z'), new Date('2026-10-22T02:30:00Z'))

    const result = await probeAgentLimit({
      agentId: 'bbojjak', collectorInstanceId: 'c2', source: 'codex', sessionsDir: join(codexHome, 'sessions'), stateDir, home, now: NOW,
    })
    expect(result).toEqual({ ok: false, reason: 'no-limit' })
  })

  it('Codex: 롤아웃을 읽는 도중 계정이 바뀌면 값을 버린다', async () => {
    const home = temp()
    const codexHome = join(home, '.codex')
    const day = join(codexHome, 'sessions', '2026', '10', '22')
    mkdirSync(day, { recursive: true })
    const resets = Math.floor(Date.parse('2026-10-26T00:00:00Z') / 1000)
    writeFileSync(join(day, 'rollout-a.jsonl'), JSON.stringify({
      timestamp: '2026-10-22T02:00:00Z', type: 'event_msg',
      payload: { type: 'token_count', rate_limits: { secondary: { used_percent: 40, window_minutes: 10080, resets_at: resets } } },
    }))
    const authPath = join(codexHome, 'auth.json')
    writeFileSync(authPath, JSON.stringify({ tokens: { id_token: jwt({ email: 'a@example.com' }) } }))
    utimesSync(authPath, new Date('2026-10-22T00:00:00Z'), new Date('2026-10-22T00:00:00Z'))
    const stateDir = temp()
    writeFileSync(join(stateDir, 'limit-account-bbojjak-codex.json'), JSON.stringify({ accountKey: accountKey('a@example.com'), since: '2026-10-01T00:00:00.000Z' }))
    const input = { agentId: 'bbojjak', collectorInstanceId: 'c2', source: 'codex' as const, sessionsDir: join(codexHome, 'sessions'), stateDir, home, now: NOW }

    // 바뀌지 않으면 쓴다
    expect(await probeAgentLimit(input)).toMatchObject({ ok: true, snapshot: { usedPercent: 40 } })

    // 읽기가 시작된 뒤 B 로 바뀌었다 — 롤아웃 파일을 여는 순간 auth.json 을 바꿔 흉내 낸다
    const original = await import('../../src/usage/codex.js')
    const spy = vi.spyOn(original, 'latestCodexLimit').mockImplementationOnce(async () => {
      writeFileSync(authPath, JSON.stringify({ tokens: { id_token: jwt({ email: 'b@example.com' }) } }))
      return { usedPercent: 90, resetsAt: '2026-10-26T00:00:00.000Z', observedAt: '2026-10-22T02:50:00.000Z' }
    })
    expect(await probeAgentLimit(input)).toEqual({ ok: false, reason: 'account-changed' })
    spy.mockRestore()
  })

  it('Claude: 측정 도중 계정이 바뀌면 값을 버린다', async () => {
    let authCalls = 0
    const result = await probeAgentLimit({
      agentId: 'bbojjak', collectorInstanceId: 'c1', source: 'openclaw', sessionsDir: '/h/.openclaw/agents/bot', stateDir: temp(), home: '/h', now: NOW,
      run: async (_command, args) => {
        if (args[0] !== 'auth') return STREAM
        authCalls += 1
        return JSON.stringify({ email: authCalls === 1 ? 'a@example.com' : 'b@example.com' })
      },
    })
    expect(result).toEqual({ ok: false, reason: 'account-changed' })
  })

  it('Claude: 한도에 걸려 비정상 종료해도 출력의 한도는 쓴다', async () => {
    const result = await probeAgentLimit({
      agentId: 'bbojjak', collectorInstanceId: 'c1', source: 'openclaw', sessionsDir: '/h/.openclaw/agents/bot', stateDir: temp(), home: '/h', now: NOW,
      run: async (_command, args) => {
        if (args[0] === 'auth') return JSON.stringify({ email: 'bot@example.com' })
        throw Object.assign(new Error('exit 1'), { stdout: STREAM })
      },
    })
    expect(result).toMatchObject({ ok: true, snapshot: { usedPercent: 65 } })
  })

  it('Hermes 는 아직 재지 않는다', async () => {
    const result = await probeAgentLimit({ agentId: 'b', collectorInstanceId: 'c', source: 'hermes', sessionsDir: '/x', stateDir: temp(), home: '/h', now: NOW })
    expect(result).toEqual({ ok: false, reason: 'unsupported-source' })
  })
})
