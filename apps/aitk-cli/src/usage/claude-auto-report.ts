/** 공식 한도를 받은 뒤 새 집계를 보고한다. 변경 시 5분, 동일 한도는 1시간 간격이다. */
import { existsSync, statSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { claudeUsagePaths, readClaudeQuota, readUsageJson, writeUsageJson } from './claude-statusline.js'
import type { UsageRecord } from './types.js'
import type { ClaudeQuotaSnapshot } from './claude-statusline.js'
import { collectUsageRecords, sendUsageRecords } from '../commands/usage-report.js'

const RETRY_MS = 5 * 60_000
const REFRESH_MS = 60 * 60_000

/** 대화나 서버 응답 원문 없이 자동 보고의 결과만 보관한다. */
export interface ClaudeAutoReportState {
  lastAttemptAt?: string
  lastSuccessAt?: string
  lastQuotaKey?: string
  lastError?: 'auth_required' | 'report_failed'
}

/** 손상된 상태 파일이 보고를 영구적으로 막지 않도록 필요한 필드만 읽는다. */
export function readClaudeAutoReportState(home = homedir()): ClaudeAutoReportState {
  const raw = readUsageJson(claudeUsagePaths(home).report)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const value = raw as Record<string, unknown>
  return {
    lastAttemptAt: typeof value.lastAttemptAt === 'string' ? value.lastAttemptAt : undefined,
    lastSuccessAt: typeof value.lastSuccessAt === 'string' ? value.lastSuccessAt : undefined,
    lastQuotaKey: typeof value.lastQuotaKey === 'string' ? value.lastQuotaKey : undefined,
    lastError: value.lastError === 'auth_required' || value.lastError === 'report_failed' ? value.lastError : undefined,
  }
}

/** 실패는 5분 뒤 재시도하고, 한도가 같아도 1시간마다 사용량을 새로 집계한다. */
export function claudeReportDue(state: ClaudeAutoReportState | null, now = Date.now(), key?: string): boolean {
  const success = Date.parse(state?.lastSuccessAt ?? '')
  if (!state?.lastError && success <= now && now - success < REFRESH_MS && (key === undefined || state?.lastQuotaKey === key)) return false
  const attempt = Date.parse(state?.lastAttemptAt ?? '')
  return !Number.isFinite(attempt) || now < attempt || now - attempt >= RETRY_MS
}

/** 살아 있는 작업은 기다리고, 죽은 프로세스의 잠금은 다음 호출에서 회수한다. */
function activeLock(home: string, now: number): boolean {
  const path = claudeUsagePaths(home).lock
  if (!existsSync(path)) return false
  let age: number
  try { age = now - statSync(path).mtimeMs } catch { return false }
  const lock = readUsageJson(path) as { pid?: number } | null
  // 생성 직후 아직 pid를 쓰고 있는 작은 구간도 잠금으로 취급한다.
  if (!Number.isInteger(lock?.pid) || lock!.pid! <= 0) return age < RETRY_MS
  try { process.kill(lock!.pid!, 0); return true } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

/** statusline 프로세스에서는 가벼운 파일 검사만 한다. 집계·네트워크는 자식 작업이 맡는다. */
export function shouldScheduleClaudeReport(home = homedir(), now = Date.now()): boolean {
  if (process.env.AITK_USAGE_REPORT === '0') return false
  const quota = readClaudeQuota(home, now)
  return !!quota && !activeLock(home, now)
    && claudeReportDue(readClaudeAutoReportState(home), now, quotaKey(quota))
}

/** 같은 입력의 반복 보고를 피하기 위한 값 비교 키. 관측 시각은 제외한다. */
function quotaKey(quota: ClaudeQuotaSnapshot): string { return `${quota.usedPercent}|${quota.resetsAt}` }

/** 보고마다 두 클라이언트를 재집계한다. 기존 aggregate.json은 재전송하지 않는다. */
export async function reportCollectedUsage(
  home = homedir(), clock = Date.now,
  collect: () => Promise<UsageRecord[]> = () => collectUsageRecords(7),
  send: (records: UsageRecord[]) => Promise<unknown> = sendUsageRecords,
): Promise<string> {
  const records = await collect()
  if (!records.some(r => r.client === 'claude-code')) throw new Error('No completed Claude usage yet')
  const quota = readClaudeQuota(home, clock())
  if (!quota) throw new Error('No fresh weekly limit yet')
  const refreshed = records.map(record => {
    if (record.client === 'claude-code') return { ...record, limitUsedPercent: quota.usedPercent, limitResetsAt: quota.resetsAt }
    // 당일 집계를 재사용하더라도 이미 리셋된 다른 클라이언트의 한도는 되살리지 않는다.
    if (record.limitResetsAt && Date.parse(record.limitResetsAt) <= clock()) return { ...record, limitUsedPercent: null, limitResetsAt: null }
    return record
  })
  await send(refreshed)
  return quotaKey(quota)
}

/** 단일 작업 잠금 아래 집계한다. 실패해도 다음날까지 보고를 막지 않는다. */
export async function runAutomaticClaudeReport(
  home = homedir(), report: () => Promise<string | void> = () => reportCollectedUsage(home, clock), clock = Date.now,
): Promise<boolean> {
  const now = clock()
  if (!shouldScheduleClaudeReport(home, now)) return false
  const paths = claudeUsagePaths(home)
  mkdirSync(paths.directory, { recursive: true, mode: 0o700 })
  // 죽은 작업만 회수한다. 다른 작업이 먼저 잡았다면 wx가 실패하므로 중복 집계하지 않는다.
  if (existsSync(paths.lock) && !activeLock(home, now)) {
    try { unlinkSync(paths.lock) } catch { /* 이미 회수됨 */ }
  }
  const lockId = randomUUID()
  try { writeFileSync(paths.lock, JSON.stringify({ pid: process.pid, lockId }), { flag: 'wx', mode: 0o600 }) }
  catch (err) { if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false; throw err }
  let state = readClaudeAutoReportState(home)
  try {
    const quota = readClaudeQuota(home, clock())
    if (!quota || !claudeReportDue(state, clock(), quotaKey(quota))) return false
    state = { ...state, lastAttemptAt: new Date(clock()).toISOString() }
    writeUsageJson(paths.report, state)
    const reportedKey = await report()
    writeUsageJson(paths.report, { lastAttemptAt: state.lastAttemptAt, lastSuccessAt: new Date(clock()).toISOString(), lastQuotaKey: reportedKey ?? quotaKey(quota) })
    return true
  } catch (err) {
    const auth = err instanceof Error && err.message.startsWith('Auth required')
    writeUsageJson(paths.report, { ...state, lastError: auth ? 'auth_required' : 'report_failed' })
    return false
  } finally {
    const owner = readUsageJson(paths.lock) as { lockId?: string } | null
    if (owner?.lockId === lockId) {
      try { unlinkSync(paths.lock) } catch { /* cleanup */ }
    }
  }
}
