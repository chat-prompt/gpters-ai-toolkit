import { createHash } from 'node:crypto'
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const SOURCES = new Set(['claude-code', 'codex', 'openclaw', 'hermes'])
export function digest(parts) { return createHash('sha256').update(JSON.stringify(parts)).digest('hex') }
function opaqueUuid(parts) { const h = digest(parts); return `${h.slice(0,8)}-${h.slice(8,12)}-8${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}` }
export function windowBounds(window) {
  const start = Date.parse(window?.startUtc), end = Date.parse(window?.endUtc)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('Invalid observation window')
  return [start, end]
}
/** Private adapters must bind an exact runtime run ID when launching work, never by time overlap. */
export function adaptRuntimeReceipts({ agentId, source, window, bindings = [], records = [] }) {
  if (!/^[a-z0-9][a-z0-9._:-]{0,99}$/.test(agentId) || !SOURCES.has(source)) throw new Error('Invalid source scope')
  const [start,end] = windowBounds(window), byRun = new Map(), seen = new Map(), receipts = []
  const provenance = { recordsRead: records.length, unmatchedRecords: 0, unsupportedRecords: 0, missingTimestamps: 0, duplicates: 0, conflicts: 0 }
  for (const binding of bindings) {
    if (binding.agentId !== agentId || binding.source !== source || !UUID.test(binding.taskId) || !UUID.test(binding.attemptId) ||
      typeof binding.runtimeRunId !== 'string' || !binding.runtimeRunId) throw new Error('Invalid exact task binding')
    if (byRun.has(binding.runtimeRunId) && JSON.stringify(byRun.get(binding.runtimeRunId)) !== JSON.stringify(binding)) throw new Error('Ambiguous task binding')
    byRun.set(binding.runtimeRunId, binding)
  }
  for (const record of records) {
    const binding = byRun.get(record.runtimeRunId)
    if (!binding || record.agentId !== agentId || record.source !== source) { provenance.unmatchedRecords++; continue }
    const at = Date.parse(record.atUtc)
    if (!Number.isFinite(at)) { provenance.missingTimestamps++; continue }
    if (at < start || at >= end) continue
    let status, evidence, claim, receiptKey
    if (record.format === 'scheduler-v1' && ['ok','error','unknown'].includes(record.status)) {
      status = record.status === 'ok' ? 'succeeded' : record.status === 'error' ? 'failed' : 'unknown'
      evidence = 'scheduler'; claim = 'scheduler-completed'; receiptKey = record.receiptId
    } else if (record.format === 'process-v1' && (Number.isSafeInteger(record.exitCode) || typeof record.signal === 'string')) {
      status = record.exitCode === 0 && !record.signal ? 'succeeded' : 'failed'
      evidence = 'process'; claim = 'process-exited'; receiptKey = record.receiptId
    } else if (record.format === 'slack-api-v1' && typeof record.response?.ok === 'boolean') {
      const response = record.response
      // ok alone is insufficient; acceptance must include the exact message returned by this invocation.
      if (response.ok && (typeof response.channel !== 'string' || !/^\d+\.\d+$/.test(response.ts ?? ''))) { provenance.unsupportedRecords++; continue }
      status = response.ok ? 'succeeded' : 'failed'; evidence = 'api'; claim = 'api-accepted'
      receiptKey = record.receiptId
    } else { provenance.unsupportedRecords++; continue }
    if (typeof receiptKey !== 'string' || !receiptKey) { provenance.unsupportedRecords++; continue }
    const receipt = { receiptId: opaqueUuid([agentId,source,record.runtimeRunId,record.format,receiptKey]), taskId: binding.taskId,
      attemptId: binding.attemptId, atUtc: new Date(at).toISOString(), kind: record.format.replace('-v1',''), status, evidence, claim }
    if (typeof binding.expectedDeadlineUtc === 'string' && Number.isFinite(Date.parse(binding.expectedDeadlineUtc))) receipt.expectedDeadlineUtc = new Date(binding.expectedDeadlineUtc).toISOString()
    if (Number.isSafeInteger(record.durationMs) && record.durationMs >= 0) receipt.durationMs = record.durationMs
    if (seen.has(receipt.receiptId)) {
      if (JSON.stringify(seen.get(receipt.receiptId)) === JSON.stringify(receipt)) provenance.duplicates++
      else { provenance.conflicts++; seen.set(receipt.receiptId, null) }
    } else seen.set(receipt.receiptId,receipt)
  }
  for (const receipt of seen.values()) if (receipt) receipts.push(receipt)
  if (receipts.length > 500) throw new Error('Too many runtime receipts; split the window without dropping records')
  receipts.sort((a,b) => a.atUtc.localeCompare(b.atUtc) || a.receiptId.localeCompare(b.receiptId))
  const incomplete = provenance.unsupportedRecords + provenance.missingTimestamps + provenance.conflicts + provenance.unmatchedRecords > 0
  return { receipts, capability: incomplete ? 'incomplete' : records.length ? 'supported' : 'uncollected', provenance }
}
