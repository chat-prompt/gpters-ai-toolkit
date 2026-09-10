import { constants } from 'node:fs'
import { relative, isAbsolute } from 'node:path'
import { open, realpath } from 'node:fs/promises'
import { histogram } from './histogram.mjs'
import { digest, windowBounds } from './runtime-receipts.mjs'
export const emptyCounters = () => ({ filesExpected: 0, filesRead: 0, recordsRead: 0, parseFailures: 0, unsupportedRecords: 0, missingTimestamps: 0, duplicates: 0, rotatedFiles: 0 })
const integer = value => Number.isSafeInteger(value) && value >= 0
// Same non-metric Claude metadata recognized by the existing agent collector.
const claudeMetadata = new Set(['attachment','file-history-delta','last-prompt','atis-latch','mode','permission-mode','ai-title'])
const textChars = value => typeof value === 'string' ? [...value].length : Array.isArray(value) ? value.reduce((n,b) => n + (b?.type === 'text' && typeof b.text === 'string' ? [...b.text].length : 0),0) : null
function scopeError() { const error = new Error('Observation source scope mismatch'); error.scopeMismatch = true; return error }
function assertCodexFileScope(records, scope) {
  const slugs = new Set(scope.projectSlugs ?? [])
  const allowedCwd = cwd => typeof cwd === 'string' && slugs.has(cwd.replaceAll('\\','/').replace(/\/$/,'').split('/').at(-1))
  let identified = false
  for (const { row } of records) {
    if (row.type === 'session_meta') {
      if ((scope.codexThreadSource && row.payload?.thread_source !== scope.codexThreadSource)
        || (slugs.size ? !allowedCwd(row.payload?.cwd) : !scope.codexThreadSource)) throw scopeError()
      identified = true
    } else if (row.type === 'turn_context' && slugs.size && !allowedCwd(row.payload?.cwd)) throw scopeError()
  }
  // A different file with the same operator-provided sessionKey cannot lend its identity.
  if (!identified) throw scopeError()
}
/** Explicit inventory only: no home discovery, no mtime window filtering, no writes/checkpoint resets. */
export async function readRecords(files, { maxFileBytes = 64 * 1024 * 1024, scope, source } = {}) {
  const counters = emptyCounters(), records = [], seenFiles = new Set(), seenRows = new Set()
  counters.filesExpected = files.length
  for (const file of files) {
    let handle
    try {
      if (typeof file.path !== 'string' || typeof file.sessionKey !== 'string' || !file.sessionKey) throw new Error('Invalid private inventory')
      const path = await realpath(file.path)
      if (file.expectedIdentity && path !== file.path) throw scopeError()
      const checkScope = candidate => {
        if (!scope) return
        const local = relative(scope.sessionsDir, candidate)
        if (!local || local === '..' || local.startsWith('../') || isAbsolute(local)
          || (source === 'claude-code' && !scope.projectSlugs?.includes(local.split('/')[0]))) {
          throw scopeError()
        }
      }
      checkScope(path)
      handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      const before = await handle.stat(), identity = `${before.dev}:${before.ino}`
      if(file.expectedIdentity && Object.entries(file.expectedIdentity).some(([key,value]) => ['dev','ino'].includes(key) ? String(before[key])!==value : before[key]!==value)) throw scopeError()
      if (!before.isFile() || before.size > maxFileBytes) { if (file.expectedIdentity) throw scopeError(); counters.rotatedFiles++; continue }
      if (seenFiles.has(identity)) { counters.duplicates++; counters.filesExpected--; continue }
      seenFiles.add(identity)
      const bytes = Buffer.alloc(before.size)
      let offset = 0
      while (offset < bytes.length) { const read = await handle.read(bytes, offset, bytes.length-offset, offset); if (!read.bytesRead) break; offset += read.bytesRead }
      const after = await handle.stat()
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || offset !== before.size) { if(file.expectedIdentity) throw scopeError(); counters.rotatedFiles++; continue }
      const current = await realpath(file.path)
      checkScope(current)
      const check = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      try {
        const named = await check.stat()
        if (file.expectedIdentity && Object.entries(file.expectedIdentity).some(([key,value]) => ['dev','ino'].includes(key) ? String(named[key])!==value : named[key]!==value)) throw scopeError()
        if (named.ino !== before.ino || named.dev !== before.dev) { if (file.expectedIdentity) throw scopeError(); counters.rotatedFiles++; continue }
      } finally { await check.close() }
      counters.filesRead++
      const lines = bytes.toString('utf8').split('\n'), fileRecords = []
      if (source === 'codex' && scope) {
        let first
        try { first = JSON.parse(lines[0]) } catch { throw scopeError() }
        if (Buffer.byteLength(lines[0]) >= 2 * 1024 * 1024 || first?.type !== 'session_meta') throw scopeError()
      }
      // A tail without newline may be an in-progress writer; never silently count it as complete.
      if (lines.at(-1)) { counters.parseFailures++; lines.pop() }
      for (const line of lines) {
        if (!line.trim()) continue
        counters.recordsRead++
        const key = digest([file.sessionKey,line])
        try {
          const row = JSON.parse(line)
          if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Unknown JSONL shape')
          fileRecords.push({ row, session: file.sessionKey, completeFromStart: file.completeFromStart === true, key })
        } catch { counters.parseFailures++ }
      }
      if (source === 'codex' && scope) assertCodexFileScope(fileRecords, scope)
      for (const item of fileRecords) {
        if (seenRows.has(item.key)) { counters.duplicates++; continue }
        seenRows.add(item.key); records.push(item)
      }
    } catch (error) {
      if (file.expectedIdentity) throw scopeError()
      if (error.scopeMismatch) throw new Error('Observation source scope changed')
      /* Private paths/errors never escape. filesRead mismatch makes missing source explicit. */
    }
    finally { if (handle) await handle.close() }
  }
  return { records, counters }
}
function state(counters, observed) {
  if (!counters.filesRead) return counters.filesExpected ? 'incomplete' : 'uncollected'
  if (counters.filesRead < counters.filesExpected || counters.parseFailures || counters.rotatedFiles || counters.unsupportedRecords || counters.missingTimestamps) return 'incomplete'
  return observed ? 'supported' : 'uncollected'
}
/** First-turn samples are only sessions whose observed first usage is in-window and full history is explicitly attested. */
export async function collectCliMetrics({ source, files = [], window, scope }) {
  const [start,end] = windowBounds(window), supported = ['claude-code','codex'].includes(source)
  const metricCapabilities = { firstTurnTokens: 'unsupported', peakContextTokens: 'unsupported', toolResultChars: 'unsupported', compactionEvents: 'unsupported' }
  const metrics = { firstTurnTokens: null, peakContextTokens: null, toolResultChars: null, compactionEvents: null }
  if (!supported) return { metrics, metricCapabilities, capability: 'unsupported', provenance: { ...emptyCounters(),filesExpected:files.length } }
  const { records,counters } = await readRecords(files, { scope, source }), usages = new Map(), results = new Map(), compactions = new Map(), sessions = new Map()
  let recognized = 0
  function timed(item, type) {
    const value = item.row.timestamp
    const at = Date.parse(value)
    if (!Number.isFinite(at)) { counters.missingTimestamps++; return null }
    return { at, session: item.session, type }
  }
  for (const item of records) {
    const {row,session} = item
    let entry, usage, usageId, resultItems = [], compact = false, complete = true
    if (source === 'claude-code') {
      if (row.type === 'assistant' && row.message?.usage) {
        entry = timed(item,'usage'); usage = row.message.usage; usageId = row.message.id
        complete = row.message.stop_reason != null
        if (!usageId || !integer(usage.input_tokens) || !integer(usage.cache_creation_input_tokens ?? 0) || !integer(usage.cache_read_input_tokens ?? 0)) { counters.unsupportedRecords++; continue }
        usage = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
      } else if (row.type === 'user' && Array.isArray(row.message?.content)) {
        resultItems = row.message.content.filter(b => b.type === 'tool_result')
        if (resultItems.length) entry = timed(item,'result')
      } else if (row.type === 'system' && row.subtype === 'compact_boundary') { compact = true; entry = timed(item,'compact') }
      else if (!claudeMetadata.has(row.type) && !['user','assistant','system','progress','file-history-snapshot','queue-operation','summary'].includes(row.type)) { counters.unsupportedRecords++; continue }
    } else {
      const payload = row.payload
      if (row.type === 'event_msg' && payload?.type === 'token_count') {
        entry = timed(item,'usage'); usage = payload.info?.last_token_usage?.input_tokens
        // Codex input_tokens already includes cached_input_tokens; never add the cache twice.
        usageId = payload.info?.total_token_usage ? digest(['total', payload.info.total_token_usage]) : row.id ?? item.key
        if (!integer(usage)) { counters.unsupportedRecords++; continue }
      } else if (row.type === 'response_item' && ['function_call_output','custom_tool_call_output'].includes(payload?.type)) {
        entry = timed(item,'result'); resultItems = [{tool_use_id:payload.call_id,content:payload.output}]
      } else if (row.type === 'compacted' || (row.type === 'event_msg' && payload?.type === 'context_compacted')) { compact = true; entry = timed(item,'compact') }
      else if (!['session_meta','turn_context','response_item','event_msg'].includes(row.type)) { counters.unsupportedRecords++; continue }
    }
    if (!entry) continue
    recognized++
    if (!sessions.has(session)) sessions.set(session,{ complete: item.completeFromStart, usage: [] })
    else sessions.get(session).complete &&= item.completeFromStart
    if (typeof usage === 'number') {
      const key = digest([source,session,'usage',usageId]), candidate = {...entry,value:usage,complete}
      const previous = usages.get(key)
      if (previous) {
        counters.duplicates++
        previous.at = Math.min(previous.at,candidate.at)
        if ((!candidate.complete && previous.complete) || (candidate.complete === previous.complete && candidate.value <= previous.value)) continue
        // A later streaming snapshot represents the same turn's first timestamp.
        candidate.at = Math.min(previous.at,candidate.at)
      }
      usages.set(key,candidate)
    }
    for (const result of resultItems) {
      const value = textChars(result.content)
      if (typeof result.tool_use_id !== 'string' || value === null) { counters.unsupportedRecords++; continue }
      const key = digest([source,session,'result',result.tool_use_id])
      if (results.has(key)) { counters.duplicates++; if (results.get(key).value !== value) counters.unsupportedRecords++; continue }
      results.set(key,{...entry,value})
    }
    if (compact) compactions.set(digest([source,session,row.uuid ?? row.id ?? item.key]),entry)
  }
  for (const usage of usages.values()) sessions.get(usage.session).usage.push(usage)
  const first = [], peaks = []
  let unknownFirst = false
  for (const session of sessions.values()) {
    session.usage.sort((a,b) => a.at-b.at)
    const observed = session.usage.filter(r => r.at >= start && r.at < end)
    if (!observed.length) continue
    peaks.push(Math.max(...observed.map(r => r.value)))
    if (!session.complete) unknownFirst = true
    else if (session.usage[0].at >= start && session.usage[0].at < end) first.push(session.usage[0].value)
  }
  const capability = state(counters,recognized > 0)
  if (counters.filesRead && recognized) {
    metrics.firstTurnTokens = histogram(first); metrics.peakContextTokens = histogram(peaks)
    metrics.toolResultChars = histogram([...results.values()].filter(r => r.at >= start && r.at < end).map(r => r.value))
    metrics.compactionEvents = [...compactions.values()].filter(r => r.at >= start && r.at < end).length
  }
  for (const key of Object.keys(metricCapabilities)) metricCapabilities[key] = capability
  if (unknownFirst && metrics.firstTurnTokens) metricCapabilities.firstTurnTokens = 'incomplete'
  return { metrics,metricCapabilities,capability,provenance:counters }
}
export async function collectReadGuardMetrics({ files = [], window }) {
  const [start,end] = windowBounds(window), {records,counters} = await readRecords(files)
  let allow = 0, deny = 0, recognized = 0
  for (const {row} of records) {
    if (!['allow','deny'].includes(row.decision)) { counters.unsupportedRecords++; continue }
    // Supported log format is ISO ts. Numeric epochs are deliberately not guessed.
    const at = typeof row.ts === 'string' ? Date.parse(row.ts) : NaN
    if (!Number.isFinite(at)) { counters.missingTimestamps++; continue }
    recognized++
    if (at < start || at >= end) continue
    if (row.decision === 'allow') allow++; else deny++
  }
  const observed = recognized > 0 || (counters.filesRead > 0 && counters.recordsRead === 0)
  const capability = state(counters,observed)
  return { metrics:{readGuardAllow: observed ? allow:null,readGuardDeny:observed ? deny:null},
    metricCapabilities:{readGuardAllow:capability,readGuardDeny:capability},capability,provenance:counters }
}
