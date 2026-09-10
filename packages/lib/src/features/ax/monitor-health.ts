/** Browser-safe health calculation; never imports the server-side event engine. */
export function monitorHeartbeat(lastSuccessAt: string | null, checkedAt: string): 'waiting' | 'healthy' | 'stale' | 'clock-skew' {
  if (!lastSuccessAt) return 'waiting'
  const last = Date.parse(lastSuccessAt)
  const checked = Date.parse(checkedAt)
  if (!Number.isFinite(last) || !Number.isFinite(checked)) return 'clock-skew'
  const age = checked - last
  if (age < 0) return 'clock-skew'
  return age > 15 * 60 * 1000 ? 'stale' : 'healthy'
}

export interface MonitorHealthSnapshot {
  lastSuccessAt?: string | null
  backlog?: number | null
  /** Earliest pending batch's server-created timestamp, never a client event time. */
  oldestUnprocessedAt?: string | null
  deferredBacklog?: number | null
}
/** A live queue may be nonempty between normal cron runs; bound its age instead. */
export function monitorOperationalHealth(data: MonitorHealthSnapshot | null, checkedAt: string): boolean {
  if (!data || monitorHeartbeat(data.lastSuccessAt ?? null, checkedAt) !== 'healthy') return false
  if (!Number.isSafeInteger(data.backlog) || data.backlog! < 0) return false
  if (data.backlog === 0) {
    // Old healthy endpoints did not return queue-age metadata. Keep empty-queue
    // compatibility, but reject contradictory or explicitly unknown new fields.
    return (data.oldestUnprocessedAt === undefined || data.oldestUnprocessedAt === null) &&
      (data.deferredBacklog === undefined || data.deferredBacklog === 0)
  }
  if (data.deferredBacklog !== 0 || typeof data.oldestUnprocessedAt !== 'string') return false
  const age = Date.parse(checkedAt) - Date.parse(data.oldestUnprocessedAt)
  return Number.isFinite(age) && age >= 0 && age <= 15 * 60 * 1000
}
