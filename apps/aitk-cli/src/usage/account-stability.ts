/**
 * 개인 사용 보고의 계정 키를 집계 구간 내내 같은 계정이었을 때만 싣는다 (EDU-11835)
 *
 * 보고는 최근 며칠을 한 레코드로 묶는데 계정 키는 보고하는 순간의 로그인 계정이다. 구간 중에 계정을 바꿨으면
 * 앞선 사용까지 새 계정의 것으로 짝지어진다. 그래서 키마다 처음 본 시각을 남기고, 그 시각이 구간 시작보다
 * 앞일 때만 키를 싣는다. 아니면 null 로 보내 서버가 옛 보고처럼 다룬다. 봇 수집기의 Codex 측정이
 * 계정 첫 관측 시각 이후만 믿는 것과 같은 규칙이다. 처음 보는 키는 그때부터 센다 — 그 전 계정은 모른다.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { UsageClient, UsageRecord } from './types.js'

/** 클라이언트별 마지막으로 본 계정 키와 처음 본 시각 */
type AccountKeyState = Partial<Record<UsageClient, { key: string; since: string }>>

/** 상태 파일 위치. `AITK_USAGE_ACCOUNT_STATE` 로 바꿀 수 있다(테스트가 실제 홈을 건드리지 않게) */
export function accountKeyStatePath(home = homedir()): string {
  return process.env.AITK_USAGE_ACCOUNT_STATE ?? join(home, '.cache', 'gpters-aitk', 'usage-account-keys.json')
}

function readState(path: string): AccountKeyState {
  try {
    const value = JSON.parse(readFileSync(path, 'utf-8')) as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? value as AccountKeyState : {}
  } catch {
    return {}
  }
}

/**
 * @param records - 수집기가 만든 레코드(계정 키는 보고 순간의 로그인 계정)
 * @param windowStart - 집계 구간 시작
 * @param now - 지금
 * @param persist - 처음 본 시각을 기록할지. dry-run 은 상태 파일을 바꾸지 않는다
 * @param home - 홈 디렉터리
 * @returns 구간 내내 같은 계정이 아니었던 레코드는 계정 키를 null 로 바꾼 사본
 */
export function stabilizeAccountKeys(
  records: UsageRecord[],
  windowStart: Date,
  now: Date,
  persist: boolean,
  home = homedir()
): UsageRecord[] {
  const path = accountKeyStatePath(home)
  const state = readState(path)
  let changed = false
  const stable = records.map((record) => {
    // 계정을 못 읽은 관측도 계정이 바뀐 것으로 본다 — A → (모름) → A 에서 가운데 사용이 A 로 짝지어지지 않게
    if (!record.accountKey) {
      if (state[record.client]) { delete state[record.client]; changed = true }
      return record
    }
    const seen = state[record.client]
    if (!seen || seen.key !== record.accountKey || Number.isNaN(Date.parse(seen.since))) {
      state[record.client] = { key: record.accountKey, since: now.toISOString() }
      changed = true
    }
    return Date.parse(state[record.client]!.since) <= windowStart.getTime() ? record : { ...record, accountKey: null }
  })
  if (persist && changed) {
    // 기록 실패는 보고를 막지 않는다 — 다음 보고에서 다시 처음 본 것으로 센다(키를 싣지 않는 쪽으로 틀린다)
    try {
      mkdirSync(dirname(path), { recursive: true })
      const temp = `${path}.${process.pid}.tmp`
      writeFileSync(temp, JSON.stringify(state))
      renameSync(temp, path)
    } catch { /* 캐시 폴더 쓰기 실패 */ }
  }
  return stable
}
