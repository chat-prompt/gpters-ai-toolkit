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
  hermesAuthHomes,
  parseClaudeWeeklyLimit,
  parseCodexUsage,
  pickHermesCodexToken,
  parseCswapAccounts,
  probeAgentLimit,
  probeCswapAccounts,
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

  // cswap 0.26 `list --json` 모양 (값은 합성)
  const CSWAP = JSON.stringify({ schemaVersion: 1, activeAccountNumber: 2, accounts: [
    { number: 1, email: 'A@x.com', usage: { sevenDay: { pct: 30, resetsAt: '2026-10-24T11:00:00+00:00' } }, lastGoodFetchedAt: '2026-10-20T00:00:00Z' },
    // 키체인이 잠겨 지금 조회 실패 — 2시간 전 성공값은 쓴다
    { number: 2, email: 'b@x.com', usage: 'keychain_unavailable', lastGoodUsage: { sevenDay: { pct: 41, resetsAt: '2026-10-25T00:00:00+00:00' } }, lastGoodFetchedAt: '2026-10-22T01:00:00Z' },
    // 4시간 전 성공값은 버린다
    { number: 3, email: 'c@x.com', usage: null, lastGoodUsage: { sevenDay: { pct: 8, resetsAt: '2026-10-25T00:00:00+00:00' } }, lastGoodFetchedAt: '2026-10-21T23:00:00Z' },
    // 이미 지난 회차는 버린다
    { number: 4, email: 'd@x.com', usage: { sevenDay: { pct: 50, resetsAt: '2026-10-21T00:00:00+00:00' } } },
  ] })

  it('cswap: 계정마다 지금 조회값, 없으면 3시간 안의 마지막 성공값을 쓰고 지난 회차는 뺀다', () => {
    expect(parseCswapAccounts(CSWAP, NOW)).toEqual([
      { email: 'A@x.com', usedPercent: 30, resetsAt: '2026-10-24T11:00:00.000Z', observedAt: NOW.toISOString() },
      { email: 'b@x.com', usedPercent: 41, resetsAt: '2026-10-25T00:00:00.000Z', observedAt: '2026-10-22T01:00:00.000Z' },
    ])
  })

  it('cswap: 미래 관측·8일 넘는 초기화·null 항목은 그 계정만 빼고 나머지는 쓴다', () => {
    const output = JSON.stringify({ accounts: [
      null,
      { email: 'f@x.com', usage: null, lastGoodUsage: { sevenDay: { pct: 5, resetsAt: '2026-10-25T00:00:00Z' } }, lastGoodFetchedAt: '2026-10-23T00:00:00Z' },
      { email: 'g@x.com', usage: { sevenDay: { pct: 5, resetsAt: '2026-11-01T00:00:00Z' } } },
      { email: 'h@x.com', usage: { sevenDay: { pct: 9, resetsAt: '2026-10-25T00:00:00Z' } } },
    ] })
    expect(parseCswapAccounts(output, NOW).map((a) => a.email)).toEqual(['h@x.com'])
    expect(parseCswapAccounts(JSON.stringify({ accounts: 'x' }), NOW)).toEqual([])
  })

  it('cswap: list --json 만 부르고(계정을 바꾸지 않는다) 이메일은 계정 키로만 싣는다', async () => {
    const run = vi.fn(async () => CSWAP)
    const result = await probeCswapAccounts({ agentId: 'b', collectorInstanceId: 'c', source: 'openclaw', sessionsDir: '/x', stateDir: temp(), home: '/h', now: NOW, run })
    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0].slice(0, 2)).toEqual(['cswap', ['list', '--json']])
    expect(result).toMatchObject({ ok: true, snapshots: [{ accountKey: accountKey('a@x.com'), usedPercent: 30 }, { accountKey: accountKey('b@x.com') }] })
    expect(JSON.stringify(result)).not.toContain('@')
  })

  it('cswap: 없으면 cswap-not-found, Codex·Hermes 는 재지 않는다', async () => {
    const missing = vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'ENOENT' }) })
    expect(await probeCswapAccounts({ agentId: 'b', collectorInstanceId: 'c', source: 'claude-code', sessionsDir: '/h/.claude/projects', stateDir: temp(), home: '/h', now: NOW, run: missing }))
      .toEqual({ ok: false, reason: 'cswap-not-found' })
    expect(await probeCswapAccounts({ agentId: 'b', collectorInstanceId: 'c', source: 'codex', sessionsDir: '/x', stateDir: temp(), home: '/h', now: NOW }))
      .toEqual({ ok: false, reason: 'unsupported-source' })
  })

  it('Hermes 에 Codex 로그인이 없으면 API 를 부르지 않고 no-account', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const result = await probeAgentLimit({ agentId: 'b', collectorInstanceId: 'c', source: 'hermes', sessionsDir: join(temp(), 'state.db'), stateDir: temp(), home: temp(), now: NOW, fetchImpl })
    expect(result).toEqual({ ok: false, reason: 'no-account' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('Hermes(openai-codex) 주간 한도', () => {
  const FUTURE_EXP = Math.floor(NOW.getTime() / 1000) + 3600
  const RESET = Math.floor(NOW.getTime() / 1000) + 5 * 86_400
  // 2026-10-27 실측한 /wham/usage 의 모양 (prolite: 주간 창이 primary 에 온다)
  const usage = (email: string | undefined, usedPercent = 39) => ({
    email, plan_type: 'prolite',
    rate_limit: { primary_window: { used_percent: usedPercent, limit_window_seconds: 604_800, reset_after_seconds: 1, reset_at: RESET }, secondary_window: null },
  })
  const hermesHome = (auth: object) => {
    const root = temp()
    writeFileSync(join(root, 'auth.json'), JSON.stringify(auth))
    return root
  }
  const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

  it('주간 창은 이름이 아니라 7일 길이로 고르고, 지난 회차는 버린다', () => {
    expect(parseCodexUsage(usage('a@example.com'), NOW)).toEqual({ email: 'a@example.com', limit: { usedPercent: 39, resetsAt: new Date(RESET * 1000).toISOString() } })
    const fiveHourOnly = { email: 'a@example.com', rate_limit: { primary_window: { used_percent: 10, limit_window_seconds: 18_000, reset_at: RESET } } }
    expect(parseCodexUsage(fiveHourOnly, NOW).limit).toBeNull()
    const weeklySecondary = { rate_limit: { primary_window: { used_percent: 10, limit_window_seconds: 18_000, reset_at: RESET }, secondary_window: { used_percent: 70, limit_window_seconds: 604_800, reset_at: RESET } } }
    expect(parseCodexUsage(weeklySecondary, NOW).limit?.usedPercent).toBe(70)
    const past = { rate_limit: { primary_window: { used_percent: 10, limit_window_seconds: 604_800, reset_at: 1 } } }
    expect(parseCodexUsage(past, NOW).limit).toBeNull()
  })

  const tok = (n: string, exp = FUTURE_EXP) => jwt({ exp, n })
  const pickedName = (picked: ReturnType<typeof pickHermesCodexToken>) =>
    picked.ok ? JSON.parse(Buffer.from(picked.accessToken.split('.')[1], 'base64url').toString()).n : picked.reason
  const writeAuth = (dir: string, auth: object) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'auth.json'), JSON.stringify(auth)) }

  it('인증 홈: profiles/<이름>/state.db 면 그 폴더가 프로필, 루트 state.db 면 이름 있는 프로필만 하위 폴더', () => {
    expect(hermesAuthHomes('/srv/hermes/profiles/bot/state.db', 'bot')).toEqual({ profile: '/srv/hermes/profiles/bot', root: '/srv/hermes' })
    expect(hermesAuthHomes('/srv/hermes/state.db', 'bot')).toEqual({ profile: '/srv/hermes/profiles/bot', root: '/srv/hermes' })
    expect(hermesAuthHomes('/srv/hermes/state.db', 'default')).toEqual({ root: '/srv/hermes' })
  })

  it('단일 로그인은 프로필 → 루트 순이고, 있으면 풀보다 먼저 쓴다', () => {
    const root = temp()
    writeAuth(root, { providers: { 'openai-codex': { tokens: { refresh_token: 'r', access_token: tok('root-single') } } } })
    writeAuth(join(root, 'profiles', 'bot'), { credential_pool: { 'openai-codex': [{ access_token: tok('profile-pool') }] } })
    // 프로필에 단일 로그인이 없으면 루트 단일 로그인이 프로필 풀보다 앞선다 (Hermes resolve 순서)
    expect(pickedName(pickHermesCodexToken(hermesAuthHomes(join(root, 'state.db'), 'bot'), NOW))).toBe('root-single')
    writeAuth(join(root, 'profiles', 'bot'), { providers: { 'openai-codex': { tokens: { refresh_token: 'r', access_token: tok('profile-single') } } } })
    expect(pickedName(pickHermesCodexToken(hermesAuthHomes(join(root, 'state.db'), 'bot'), NOW))).toBe('profile-single')
  })

  it('단일 로그인이 만료됐으면 다른 계정으로 넘어가지 않고 token-expired', () => {
    const root = temp()
    writeAuth(root, { providers: { 'openai-codex': { tokens: { refresh_token: 'r', access_token: tok('valid-root') } } } })
    writeAuth(join(root, 'profiles', 'bot'), {
      providers: { 'openai-codex': { tokens: { refresh_token: 'r', access_token: tok('expired', 1) } } },
      credential_pool: { 'openai-codex': [{ access_token: tok('pool') }] },
    })
    expect(pickHermesCodexToken(hermesAuthHomes(join(root, 'state.db'), 'bot'), NOW)).toEqual({ ok: false, reason: 'token-expired' })
  })

  it('풀은 프로필에 항목이 있으면 프로필 것만, 목록 순서대로, 한도 대기 중인 계정은 건너뛴다', () => {
    const root = temp()
    writeAuth(root, { credential_pool: { 'openai-codex': [{ access_token: tok('root-pool') }] } })
    const cooling = Math.floor(NOW.getTime() / 1000) + 600
    writeAuth(join(root, 'profiles', 'bot'), { credential_pool: { 'openai-codex': [
      { access_token: tok('cooling'), last_error_reset_at: cooling }, null, { access_token: tok('usable') },
    ] } })
    expect(pickedName(pickHermesCodexToken(hermesAuthHomes(join(root, 'state.db'), 'bot'), NOW))).toBe('usable')
    expect(pickedName(pickHermesCodexToken(hermesAuthHomes(join(root, 'state.db'), 'default'), NOW))).toBe('root-pool')
  })

  it('토큰이 없으면 no-account, 풀의 첫 후보가 만료면 다음 계정으로 넘어가지 않고 token-expired', () => {
    expect(pickHermesCodexToken({ root: temp() }, NOW)).toEqual({ ok: false, reason: 'no-account' })
    const root = temp()
    writeAuth(root, { credential_pool: { 'openai-codex': [{ access_token: tok('old', 1) }, { access_token: tok('other') }] } })
    expect(pickHermesCodexToken({ root }, NOW)).toEqual({ ok: false, reason: 'token-expired' })
  })

  it('refresh token 이 없는 단일 로그인은 Hermes 처럼 없는 것으로 보고 풀을 쓴다', () => {
    const root = temp()
    writeAuth(root, {
      providers: { 'openai-codex': { tokens: { access_token: tok('no-refresh') } } },
      credential_pool: { 'openai-codex': [{ access_token: tok('pool') }] },
    })
    expect(pickedName(pickHermesCodexToken({ root }, NOW))).toBe('pool')
  })

  it('사용량 API 응답의 이메일로 계정 키를 만들어 codex 한도로 싣는다', async () => {
    const root = hermesHome({ providers: { 'openai-codex': { tokens: { refresh_token: 'r', access_token: jwt({ exp: FUTURE_EXP }), account_id: 'acct-1' } } } })
    const fetchImpl = reply(usage('Team@Example.com'))
    const result = await probeAgentLimit({
      agentId: 'bbochongmu', collectorInstanceId: 'c3', source: 'hermes', sessionsDir: join(root, 'state.db'), hermesProfile: 'default',
      stateDir: temp(), home: temp(), now: NOW, fetchImpl,
    })
    expect(result).toEqual({
      ok: true,
      snapshot: {
        agentId: 'bbochongmu', collectorInstanceId: 'c3', client: 'codex', accountKey: accountKey('team@example.com'),
        usedPercent: 39, resetsAt: new Date(RESET * 1000).toISOString(), observedAt: NOW.toISOString(),
      },
    })
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://chatgpt.com/backend-api/wham/usage')
    expect(init.headers).toMatchObject({ 'ChatGPT-Account-Id': 'acct-1', 'User-Agent': 'codex-cli' })
  })

  it('API 가 거절하면 probe-failed, 이메일이 없으면 no-account 로 귀속을 추측하지 않는다', async () => {
    const root = hermesHome({ providers: { 'openai-codex': { tokens: { refresh_token: 'r', access_token: jwt({ exp: FUTURE_EXP }) } } } })
    const input = { agentId: 'b', collectorInstanceId: 'c', source: 'hermes' as const, sessionsDir: join(root, 'state.db'), stateDir: temp(), home: temp(), now: NOW }
    expect(await probeAgentLimit({ ...input, fetchImpl: reply({}, 401) })).toEqual({ ok: false, reason: 'probe-failed' })
    expect(await probeAgentLimit({ ...input, fetchImpl: reply(usage(undefined)) })).toEqual({ ok: false, reason: 'no-account' })
  })
})
