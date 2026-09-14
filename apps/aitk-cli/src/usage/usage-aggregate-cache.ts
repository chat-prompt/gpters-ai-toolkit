/** 한도 갱신 때마다 큰 트랜스크립트를 다시 읽지 않도록 당일 집계만 로컬에 보관한다. */
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { UsageRecord } from './types.js'
import { claudeUsagePaths, readUsageJson, writeUsageJson } from './claude-statusline.js'

const FIELDS: Array<keyof UsageRecord> = ['client', 'planRaw', 'plan', 'periodStart', 'periodEnd', 'inputTokens', 'outputTokens', 'cachedTokens', 'sessions', 'models', 'limitUsedPercent', 'limitResetsAt']

/** 저장된 집계도 계약 모양을 검사한다. 알 수 없는 필드는 전송하지 않는다. */
function cachedRecord(value: unknown, now: number): UsageRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (v.client !== 'claude-code' && v.client !== 'codex') return null
  if (![v.planRaw, v.plan].every(x => x === null || typeof x === 'string')) return null
  if (typeof v.periodStart !== 'string' || typeof v.periodEnd !== 'string') return null
  const today = new Date(now).toISOString().slice(0, 10)
  const end = Date.parse(`${today}T00:00:00Z`) + 86400_000
  if (Date.parse(v.periodEnd) !== end || Date.parse(v.periodStart) !== end - 7 * 86400_000) return null
  const count = (x: unknown) => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0
  if (![v.inputTokens, v.outputTokens, v.cachedTokens, v.sessions].every(count)) return null
  if (!v.models || typeof v.models !== 'object' || Array.isArray(v.models)) return null
  if (Object.keys(v.models).length > 50 || !Object.values(v.models).every(count)) return null
  if (v.limitUsedPercent !== null && (typeof v.limitUsedPercent !== 'number' || !Number.isFinite(v.limitUsedPercent) || v.limitUsedPercent < 0 || v.limitUsedPercent > 100)) return null
  if (v.limitResetsAt !== null && (typeof v.limitResetsAt !== 'string' || !Number.isFinite(Date.parse(v.limitResetsAt)))) return null
  return Object.fromEntries(FIELDS.map(key => [key, v[key]])) as unknown as UsageRecord
}

/** 다른 날짜·구간의 집계는 재사용하지 않는다. */
export function readDailyUsageAggregate(home = homedir(), now = Date.now()): UsageRecord[] | null {
  const cache = readUsageJson(join(claudeUsagePaths(home).directory, 'aggregate.json')) as { collectedAt?: unknown; records?: unknown } | null
  if (!cache || typeof cache.collectedAt !== 'string' || !Array.isArray(cache.records) || cache.records.length > 2) return null
  const at = Date.parse(cache.collectedAt)
  if (!Number.isFinite(at) || at > now || cache.collectedAt.slice(0, 10) !== new Date(now).toISOString().slice(0, 10)) return null
  const records = cache.records.map(value => cachedRecord(value, now))
  if (records.some(value => value === null) || !records.some(value => value?.client === 'claude-code')) return null
  if (new Set(records.map(value => value?.client)).size !== records.length) return null
  return records as UsageRecord[]
}

/** 원시 대화 대신 전송 계약의 집계만 저장한다. */
export function writeDailyUsageAggregate(records: UsageRecord[], home = homedir(), now = Date.now()): void {
  writeUsageJson(join(claudeUsagePaths(home).directory, 'aggregate.json'), { collectedAt: new Date(now).toISOString(), records })
}
