import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { accountKeyStatePath, stabilizeAccountKeys } from '../../src/usage/account-stability.js'
import type { UsageRecord } from '../../src/usage/types.js'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const START = new Date('2026-10-22T00:00:00Z')
const NOW = new Date('2026-10-29T09:00:00Z')

const record = (client: UsageRecord['client'], accountKey: string | null): UsageRecord => ({
  client, planRaw: null, plan: null, periodStart: START.toISOString(), periodEnd: NOW.toISOString(),
  inputTokens: 1, outputTokens: 1, cachedTokens: 0, sessions: 1, models: {}, limitUsedPercent: null, limitResetsAt: null, accountKey,
})

describe('stabilizeAccountKeys — 집계 구간 내내 같은 계정일 때만 계정 키를 싣는다 (EDU-11835)', () => {
  let home: string
  const saved = process.env.AITK_USAGE_ACCOUNT_STATE
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'aitk-account-'))
    delete process.env.AITK_USAGE_ACCOUNT_STATE
  })
  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
    if (saved === undefined) delete process.env.AITK_USAGE_ACCOUNT_STATE
    else process.env.AITK_USAGE_ACCOUNT_STATE = saved
  })
  const seed = (state: object) => {
    const path = accountKeyStatePath(home)
    rmSync(path, { force: true })
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, JSON.stringify(state))
  }

  it('처음 보는 계정 키는 그때부터 세므로 이번 구간에는 싣지 않고, 처음 본 시각을 남긴다', () => {
    const [out] = stabilizeAccountKeys([record('codex', A)], START, NOW, true, home)
    expect(out.accountKey).toBeNull()
    // 다음 주 보고에서는 구간 시작이 처음 본 시각보다 뒤라 싣는다
    const nextStart = new Date(NOW.getTime() + 86_400_000)
    const [later] = stabilizeAccountKeys([record('codex', A)], nextStart, new Date(nextStart.getTime() + 7 * 86_400_000), true, home)
    expect(later.accountKey).toBe(A)
  })

  it('구간 시작 전부터 같은 계정이면 싣는다', () => {
    seed({ codex: { key: A, since: '2026-10-01T00:00:00.000Z' } })
    expect(stabilizeAccountKeys([record('codex', A)], START, NOW, true, home)[0].accountKey).toBe(A)
  })

  it('구간 중에 계정을 바꿨으면 싣지 않는다 — 앞선 사용이 새 계정으로 짝지어지지 않게', () => {
    seed({ codex: { key: A, since: '2026-10-01T00:00:00.000Z' } })
    expect(stabilizeAccountKeys([record('codex', B)], START, NOW, true, home)[0].accountKey).toBeNull()
  })

  it('클라이언트마다 따로 세고, 키가 없는 레코드는 그대로 둔다', () => {
    seed({ codex: { key: A, since: '2026-10-01T00:00:00.000Z' } })
    const out = stabilizeAccountKeys([record('codex', A), record('claude-code', A), record('claude-code', null)], START, NOW, true, home)
    expect(out.map((r) => r.accountKey)).toEqual([A, null, null])
  })

  it('계정을 못 읽은 관측이 끼면 처음부터 다시 센다 — A → (모름) → A 에서 가운데 사용이 A 로 짝지어지지 않게', () => {
    seed({ codex: { key: A, since: '2026-10-01T00:00:00.000Z' } })
    stabilizeAccountKeys([record('codex', null)], START, NOW, true, home)
    expect(stabilizeAccountKeys([record('codex', A)], START, NOW, true, home)[0].accountKey).toBeNull()
  })

  it('dry-run(persist=false)은 상태 파일을 만들지 않는다', () => {
    stabilizeAccountKeys([record('codex', A)], START, NOW, false, home)
    expect(existsSync(accountKeyStatePath(home))).toBe(false)
  })
})
