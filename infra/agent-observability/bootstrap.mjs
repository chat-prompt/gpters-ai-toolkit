/**
 * Boot-file health from an OpenClaw agent session database, read only (numbers only, never names or paths).
 *
 * OpenClaw stores the latest `systemPromptReport` of each session in `session_nodes.entry_json`. A report
 * whose `generatedAt` falls inside the window counts once. A session regenerated later keeps only its newest
 * report, so a window collected late can miss an earlier boot that a later one replaced; counts are the boots
 * still recorded when the window is collected.
 */
import { realpath, lstat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { windowBounds } from './runtime-receipts.mjs'

// OpenClaw names the CLI runtime that booted the session; only the collector's own runtime is attributed.
const PROVIDERS = { 'claude-code': 'claude-cli' }
const integer = value => Number.isSafeInteger(value) && value >= 0
// SQLITE_BUSY and SQLITE_LOCKED (primary result codes).
const BUSY = new Set([5, 6])
// More recent reports than this in one window is not a shape we have seen; report it as incomplete.
const MAX_ROWS = 5000
function integrity() { const error = new Error('Boot report source changed'); error.inventoryReason = 'source-consistency'; return error }
const empty = { sessions: 0, truncatedSessions: 0, nearLimitSessions: 0, warningSessions: 0, largestFileCharsMax: null, largestFileCharsLatest: null, fileCharsLimit: null }

/** One report's numbers, or null when its shape is not the one established for OpenClaw. */
function reportNumbers(report) {
  const truncation = report?.bootstrapTruncation, files = report?.injectedWorkspaceFiles
  if (!integer(report?.generatedAt) || !integer(report.bootstrapMaxChars) || !truncation || typeof truncation !== 'object'
    || !integer(truncation.truncatedFiles) || !integer(truncation.nearLimitFiles) || typeof truncation.warningShown !== 'boolean'
    || !Array.isArray(files) || files.length > 1000) return null
  let largest = 0, truncated = truncation.truncatedFiles > 0
  for (const file of files) {
    if (!file || typeof file !== 'object' || typeof file.truncated !== 'boolean') return null
    if (file.missing === true) continue
    if (!integer(file.rawChars)) return null
    largest = Math.max(largest, file.rawChars)
    truncated ||= file.truncated
  }
  return { at: report.generatedAt, truncated, nearLimit: truncation.nearLimitFiles > 0, warning: truncation.warningShown, largest, limit: report.bootstrapMaxChars }
}

/**
 * Aggregates boot reports generated inside the window.
 *
 * @param options.source - Collector source; only its own OpenClaw provider is counted
 * @param options.window - Collection window
 * @param options.reports - `{ path }` of the agent's session database, or undefined when not configured
 * @param testing.busyTimeoutMs - How long to wait for a busy database before reporting it incomplete
 * @returns `undefined` when not configured, otherwise the metric value and its capability
 */
export async function collectBootstrapMetrics({ source, window, reports }, { busyTimeoutMs = 5000 } = {}) {
  if (reports === undefined) return undefined
  const provider = PROVIDERS[source]
  if (!provider) return { value: null, capability: 'unsupported' }
  const [start,end] = windowBounds(window)
  const path = reports?.path
  // The CLI checked this path before the helper ran; a change since then is an integrity failure, never missing data.
  let safe = false
  try { safe = typeof path === 'string' && isAbsolute(path) && await realpath(path) === path && (await lstat(path)).isFile() } catch { /* unsafe */ }
  if (!safe) throw integrity()
  let rows
  // Loaded only when configured, so the helper still runs on Node builds without node:sqlite.
  const { DatabaseSync } = await import('node:sqlite')
  try {
    const db = new DatabaseSync(path, { readOnly: true, timeout: busyTimeoutMs })
    try {
      // Reports whose time is not an integer are selected too, so they count as malformed instead of vanishing.
      rows = db.prepare(`select json_extract(entry_json,'$.systemPromptReport') as report from session_nodes
        where json_type(entry_json,'$.systemPromptReport') = 'object'
          and (json_type(entry_json,'$.systemPromptReport.generatedAt') is not 'integer'
            or (json_extract(entry_json,'$.systemPromptReport.generatedAt') >= ? and json_extract(entry_json,'$.systemPromptReport.generatedAt') < ?))
        limit ${MAX_ROWS + 1}`).all(start, end)
    } finally { db.close() }
  } catch (error) {
    // Only a busy or locked database is transient missing data; a missing table or any other error fails closed.
    if (BUSY.has(error?.errcode & 0xff)) return { value: null, capability: 'incomplete' }
    throw integrity()
  }
  if (rows.length > MAX_ROWS) return { value: null, capability: 'incomplete' }
  const reportsInWindow = []
  let malformed = 0
  for (const { report } of rows) {
    let parsed = null
    try { parsed = JSON.parse(report) } catch { /* malformed below */ }
    // Another runtime's report is not this collector's; an unreadable or mistimed one of ours is malformed.
    if (parsed && typeof parsed.provider === 'string' && parsed.provider !== provider) continue
    const numbers = parsed?.provider === provider ? reportNumbers(parsed) : null
    if (numbers && numbers.at >= start && numbers.at < end) reportsInWindow.push(numbers); else malformed++
  }
  if (!reportsInWindow.length) return { value: { ...empty }, capability: malformed ? 'incomplete' : 'supported' }
  reportsInWindow.sort((a,b) => a.at-b.at)
  const latest = reportsInWindow.at(-1)
  const value = {
    sessions: reportsInWindow.length,
    truncatedSessions: reportsInWindow.filter(r => r.truncated).length,
    nearLimitSessions: reportsInWindow.filter(r => r.nearLimit).length,
    warningSessions: reportsInWindow.filter(r => r.warning).length,
    largestFileCharsMax: Math.max(...reportsInWindow.map(r => r.largest)),
    largestFileCharsLatest: latest.largest,
    fileCharsLimit: latest.limit,
  }
  return { value, capability: malformed ? 'incomplete' : 'supported' }
}
