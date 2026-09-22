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
// More selected rows than this (this runtime's reports in the window plus unreadable ones) is not a shape we
// have seen; report it as incomplete. The table is small (466 rows, about 1MB, a 3ms scan on 2026-09-22).
const MAX_ROWS = 5000
function integrity() { const error = new Error('Boot report source changed'); error.inventoryReason = 'source-consistency'; return error }
const empty = { sessions: 0, truncatedSessions: 0, nearLimitSessions: 0, warningSessions: 0, largestFileCharsMax: null, largestFileCharsLatest: null, fileCharsLimit: null,
  promptCharsLatest: null, promptCharsMax: null, promptCharsSum: null, projectContextCharsLatest: null, toolSchemaCharsLatest: null }

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
  // Prompt sizes: the whole system prompt, its injected workspace part, and the tool schemas sent with it.
  // An OpenClaw build that does not report them keeps the file metrics; a report with them of the wrong shape is malformed.
  const prompt = report.systemPrompt?.chars, project = report.systemPrompt?.projectContextChars, tools = report.tools?.schemaChars
  const numbers = { at: report.generatedAt, truncated, nearLimit: truncation.nearLimitFiles > 0, warning: truncation.warningShown, largest, limit: report.bootstrapMaxChars }
  if (prompt === undefined || project === undefined || tools === undefined) {
    // Any size present with the wrong type is malformed; missing sizes only drop the prompt part.
    if ([prompt, project, tools].some(v => v !== undefined && !integer(v))) return null
    return { ...numbers, prompt: null }
  }
  if (!integer(prompt) || !integer(project) || !integer(tools) || project > prompt) return null
  return { ...numbers, prompt, project, tools }
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
/**
 * Runs one read-only query on the database file the collector approved (device, inode, owner). The file SQLite
 * reads must be that file before and after the query, on every exit path: a change is an integrity failure, never
 * missing data. Returns `{ busy: true }` only for a busy or locked database (transient missing data).
 */
async function queryApproved(reports, query, busyTimeoutMs) {
  const path = reports?.path
  // Without the collector's approval there is nothing to compare against: never fall back to trusting the path.
  if (typeof reports?.identity !== 'string') throw integrity()
  const approved = reports.identity
  const identify = async () => {
    try {
      if (typeof path !== 'string' || !isAbsolute(path) || await realpath(path) !== path) return null
      const stat = await lstat(path)
      return stat.isFile() ? `${stat.dev}:${stat.ino}:${stat.uid}` : null
    } catch { return null }
  }
  const identity = await identify()
  if (!identity || identity !== approved) throw integrity()
  // Loaded only when configured, so the helper still runs on Node builds without node:sqlite.
  const { DatabaseSync } = await import('node:sqlite')
  let rows
  try {
    const db = new DatabaseSync(path, { readOnly: true, timeout: busyTimeoutMs })
    try { rows = query(db) } finally { db.close() }
  } catch (error) {
    // A missing table or any error other than busy/locked fails closed.
    if (await identify() !== identity) throw integrity()
    if (BUSY.has(error?.errcode & 0xff)) return { busy: true }
    throw integrity()
  }
  if (await identify() !== identity) throw integrity()
  return { rows }
}

export async function collectBootstrapMetrics({ source, window, reports }, { busyTimeoutMs = 5000 } = {}) {
  if (reports === undefined) return undefined
  const provider = PROVIDERS[source]
  if (!provider) return { value: null, capability: 'unsupported' }
  const [start,end] = windowBounds(window)
  // Reports whose time is not an integer are selected too, so they count as malformed instead of vanishing.
  // A row that is not valid JSON is selected as null (malformed) instead of failing the whole query.
  // Reports of another runtime are excluded before the row limit; ours with a non-integer time stay in.
  const result = await queryApproved(reports, db => db.prepare(`select case when json_valid(entry_json) then json_extract(entry_json,'$.systemPromptReport') end as report
        from session_nodes where entry_json is null or not json_valid(entry_json) or (
          json_type(entry_json,'$.systemPromptReport') = 'object'
          and (json_type(entry_json,'$.systemPromptReport.provider') is not 'text' or json_extract(entry_json,'$.systemPromptReport.provider') = ?)
          and (json_type(entry_json,'$.systemPromptReport.generatedAt') is not 'integer'
            or (json_extract(entry_json,'$.systemPromptReport.generatedAt') >= ? and json_extract(entry_json,'$.systemPromptReport.generatedAt') < ?)))
        limit ${MAX_ROWS + 1}`).all(provider, start, end), busyTimeoutMs)
  if (result.busy) return { value: null, capability: 'incomplete' }
  const rows = result.rows
  if (rows.length > MAX_ROWS) return { value: null, capability: 'incomplete' }
  const reportsInWindow = []
  let malformed = 0
  for (const { report } of rows) {
    let parsed = null
    try { parsed = typeof report === 'string' ? JSON.parse(report) : null } catch { /* malformed below */ }
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
  // Prompt sizes are all-or-none per window (the contract's rule): only when every snapshot reported them.
  if (reportsInWindow.every(r => r.prompt !== null)) Object.assign(value, {
    promptCharsLatest: latest.prompt,
    promptCharsMax: Math.max(...reportsInWindow.map(r => r.prompt)),
    promptCharsSum: reportsInWindow.reduce((a, r) => a + r.prompt, 0),
    projectContextCharsLatest: latest.project,
    toolSchemaCharsLatest: latest.tools,
  })
  return { value, capability: malformed ? 'incomplete' : 'supported' }
}
