// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const guards = vi.hoisted(() => ({ wrongOwner: false }))
vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>()
  return { ...fs, fstatSync: (fd: number) => { const stat = fs.fstatSync(fd); return guards.wrongOwner ? Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { uid: stat.uid + 1 }) : stat } }
})
import { readWatchMonitorConfig, watchMonitor } from '../../../../infra/agent-observability/watch-monitor'
import type { WatchMonitorConfig, WatchMonitorState } from '../../../../infra/agent-observability/watch-monitor'

const now = Date.parse('2026-01-01T02:00:00Z')
let folder: string
let config: WatchMonitorConfig
beforeEach(() => {
  folder = realpathSync(mkdtempSync(join(tmpdir(), 'monitor-watchdog-'))); chmodSync(folder, 0o700)
  config = { origin: 'https://toolkit.example.org', healthSecret: 'example-health-secret'.repeat(2), recipient: 'U000000001', slackToken: 'private-example-token', stateFile: join(folder, 'state.json') }
  guards.wrongOwner = false
})
afterEach(() => { guards.wrongOwner = false; rmSync(folder, { recursive: true, force: true }) })
const state = () => JSON.parse(readFileSync(config.stateFile, 'utf8')) as WatchMonitorState
const heartbeat = (healthy: boolean, at = now, extra: Record<string, unknown> = {}) => vi.fn().mockResolvedValue(Response.json({ healthy, lastSuccessAt: new Date(at).toISOString(), backlog: 0, ...extra }))
const accepted = () => vi.fn().mockResolvedValue({ status: 'accepted', receipt: '1767232900.000001' })
function saveConfig() { const path = join(folder, 'config.json'); writeFileSync(path, JSON.stringify(config), { mode: 0o600 }); return path }

describe('private watchdog configuration and state', () => {
  it('accepts only owned 0600 regular config files and rejects symlinks', () => {
    const path = saveConfig()
    expect(readWatchMonitorConfig(path)).toEqual(config)
    chmodSync(path, 0o400); expect(() => readWatchMonitorConfig(path)).toThrow('0600')
    chmodSync(path, 0o644); expect(() => readWatchMonitorConfig(path)).toThrow('0600')
    chmodSync(path, 0o600); guards.wrongOwner = true; expect(() => readWatchMonitorConfig(path)).toThrow('0600'); guards.wrongOwner = false
    const link = join(folder, 'config-link.json'); symlinkSync(path, link)
    expect(() => readWatchMonitorConfig(link)).toThrow()
  })
  it('requires a private real state directory and refuses unsafe existing state', async () => {
    const fetcher = heartbeat(true)
    chmodSync(folder, 0o755); await expect(watchMonitor(config, fetcher, now)).rejects.toThrow('0700')
    chmodSync(folder, 0o700)
    writeFileSync(config.stateFile, '{}', { mode: 0o644 })
    await expect(watchMonitor(config, fetcher, now)).rejects.toThrow('0600')
    expect(fetcher).not.toHaveBeenCalled()
    expect(existsSync(config.stateFile + '.lock')).toBe(false)
  })
  it('writes private versioned state without persisting credentials', async () => {
    await watchMonitor(config, heartbeat(true), now)
    expect(statSync(config.stateFile).mode & 0o777).toBe(0o600)
    const serialized = readFileSync(config.stateFile, 'utf8')
    expect(serialized).not.toContain(config.healthSecret); expect(serialized).not.toContain(config.slackToken)
    expect(state()).toMatchObject({ version: 1, healthy: true, alertActive: false })
  })
})

describe('read-only health, backlog and clock checks', () => {
  it('uses only the health GET endpoint and health secret, never the cron execution endpoint', async () => {
    const fetcher = heartbeat(true), deliver = accepted()
    expect(await watchMonitor(config, fetcher, now, deliver)).toMatchObject({ healthy: true })
    expect(fetcher).toHaveBeenCalledWith(config.origin + '/api/cron/agent-monitor?heartbeat=1', expect.objectContaining({ method: 'GET', redirect: 'error', headers: { Authorization: `Bearer ${config.healthSecret}` } }))
    expect(deliver).not.toHaveBeenCalled()
  })
  it.each([
    { at: now - 900_001, extra: {} }, { at: now + 1, extra: {} },
    { at: now, extra: { backlog: 1 } }, { at: now, extra: { backlog: null } }, { at: now, extra: { lastSuccessAt: 'invalid' } },
  ])('rejects stale/future/incomplete heartbeat %s', async ({ at, extra }) => {
    const deliver = accepted()
    expect(await watchMonitor(config, heartbeat(true, at, extra), now, deliver)).toMatchObject({ healthy: false })
    expect(deliver).toHaveBeenCalledTimes(1)
  })
  it('does not send outage messages for a continuously replenished recent backlog', async () => {
    const deliver = accepted()
    for (let tick = 0; tick < 5; tick++) {
      const at = now + tick * 300_000
      const result = await watchMonitor(config, heartbeat(true, at - 60_000, {
        backlog: 1, oldestUnprocessedAt: new Date(at - 30_000).toISOString(), deferredBacklog: 0,
      }), at, deliver)
      expect(result.healthy).toBe(true)
    }
    expect(deliver).not.toHaveBeenCalled()
  })
  it.each([
    { oldestUnprocessedAt: new Date(now - 900_001).toISOString(), deferredBacklog: 0 },
    { oldestUnprocessedAt: new Date(now - 1000).toISOString(), deferredBacklog: 1 },
  ])('independently rejects old or poisoned backlog despite server healthy claim %j', async fields => {
    const deliver = accepted()
    const result = await watchMonitor(config, heartbeat(true, now - 1000, { backlog: 1, ...fields }), now, deliver)
    expect(result.healthy).toBe(false)
    expect(deliver).toHaveBeenCalledTimes(1)
  })
  it('accepts the 15-minute boundary but stops on backward local clock rather than suppressing alarms indefinitely', async () => {
    await watchMonitor(config, heartbeat(true, now - 900_000), now)
    const fetcher = heartbeat(true)
    await expect(watchMonitor(config, fetcher, now - 1)).rejects.toThrow('future watchdog state')
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('exclusive execution and uncertainty', () => {
  it('refuses another invocation while the original holds the lock', async () => {
    let resolveFetch!: (response: Response) => void
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { resolveFetch = resolve }))
    const running = watchMonitor(config, fetcher, now)
    await expect(watchMonitor(config, heartbeat(true), now)).rejects.toThrow()
    expect(statSync(config.stateFile + '.lock').mode & 0o777).toBe(0o600)
    resolveFetch(Response.json({ healthy: true, lastSuccessAt: new Date(now).toISOString(), backlog: 0 }))
    await running
    expect(existsSync(config.stateFile + '.lock')).toBe(false)
  })
  it('does not steal stale locks or issue health/Slack calls', async () => {
    writeFileSync(config.stateFile + '.lock', JSON.stringify({ pid: 999999, createdAt: 0 }), { mode: 0o600 })
    const fetcher = heartbeat(true), deliver = accepted()
    await expect(watchMonitor(config, fetcher, now, deliver)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled(); expect(deliver).not.toHaveBeenCalled()
  })
  it('persists sending before delivery and never resends an uncertain post even after health recovers', async () => {
    const deliver = vi.fn(async () => {
      expect(state().pending?.status).toBe('sending')
      return { status: 'uncertain' as const, reason: 'timeout' }
    })
    expect(await watchMonitor(config, heartbeat(false), now, deliver)).toMatchObject({ deliveryUncertain: true })
    const noticeId = state().pending!.id
    expect(await watchMonitor(config, heartbeat(true, now + 300_000), now + 300_000, deliver)).toMatchObject({ healthy: true, deliveryUncertain: true })
    expect(state().pending?.id).toBe(noticeId); expect(deliver).toHaveBeenCalledTimes(1)
  })
  it('treats a persisted sending state as uncertain after a process restart', async () => {
    writeFileSync(config.stateFile, JSON.stringify({ version: 1, checkedAt: now, healthy: false, alertActive: false, outageSince: now,
      pending: { id: 'heartbeat:' + 'a'.repeat(64), kind: 'outage', status: 'sending' } }), { mode: 0o600 })
    const deliver = accepted()
    expect(await watchMonitor(config, heartbeat(false), now + 300_000, deliver)).toMatchObject({ deliveryUncertain: true })
    expect(deliver).not.toHaveBeenCalled()
  })
})

describe('bounded outage and recovery notifications', () => {
  it('notifies once per day, recovers once, and uses a new identity for a new outage', async () => {
    const deliver = accepted()
    await watchMonitor(config, heartbeat(false), now, deliver)
    await watchMonitor(config, heartbeat(false), now + 300_000, deliver)
    expect(deliver).toHaveBeenCalledTimes(1)
    await watchMonitor(config, heartbeat(false), now + 86_400_000, deliver)
    await watchMonitor(config, heartbeat(true, now + 86_700_000), now + 86_700_000, deliver)
    await watchMonitor(config, heartbeat(true, now + 87_000_000), now + 87_000_000, deliver)
    expect(deliver).toHaveBeenCalledTimes(3)
    await watchMonitor(config, heartbeat(false), now + 87_300_000, deliver)
    expect(deliver).toHaveBeenCalledTimes(4)
    expect(new Set(deliver.mock.calls.map(call => call[0])).size).toBe(4)
  })
  it('retains a rate-limited recovery notice and retries its stable ID instead of losing it', async () => {
    const deliver = accepted()
    await watchMonitor(config, heartbeat(false), now, deliver)
    deliver.mockResolvedValueOnce({ status: 'retry', reason: 'rate-limited', retryAfterSeconds: 600 })
    await watchMonitor(config, heartbeat(true, now + 300_000), now + 300_000, deliver)
    const recoveryId = state().pending!.id
    expect(state().alertActive).toBe(true)
    await watchMonitor(config, heartbeat(true, now + 600_000), now + 600_000, deliver)
    expect(deliver).toHaveBeenCalledTimes(2)
    await watchMonitor(config, heartbeat(true, now + 900_000), now + 900_000, deliver)
    expect(deliver.mock.calls[2][0]).toBe(recoveryId)
    expect(state().alertActive).toBe(false)
  })
})
