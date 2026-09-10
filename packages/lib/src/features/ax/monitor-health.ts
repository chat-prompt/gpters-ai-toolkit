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
