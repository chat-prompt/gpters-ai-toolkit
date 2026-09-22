import { constants } from 'node:fs'
import { relative, isAbsolute } from 'node:path'
import { lstat, open, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { histogram } from './histogram.mjs'
import { prefixState } from './inventory.mjs'
import { digest, windowBounds } from './runtime-receipts.mjs'
export const emptyCounters = () => ({ filesExpected: 0, filesRead: 0, recordsRead: 0, parseFailures: 0, unsupportedRecords: 0, missingTimestamps: 0, duplicates: 0, rotatedFiles: 0 })
const integer = value => Number.isSafeInteger(value) && value >= 0
// Same non-metric Claude metadata recognized by the existing agent collector.
const claudeMetadata = new Set(['attachment','file-history-delta','last-prompt','atis-latch','mode','permission-mode','ai-title','cost-state'])
function codePointLength(value) {
  let count = 0
  // String iteration counts astral characters once and preserves lone surrogates,
  // without allocating an array proportional to a potentially large tool result.
  for (const _ of value) count++
  return count
}
function textChars(value) {
  if (typeof value === 'string') return codePointLength(value)
  if (!Array.isArray(value)) return null
  let count = 0
  for (const block of value) {
    if (block?.type === 'text' || block?.type === 'input_text') {
      if (typeof block.text !== 'string') return null
      count += codePointLength(block.text)
    } else if (!['image','input_image','tool_reference'].includes(block?.type)) {
      // tool_reference (a ToolSearch result naming a tool) carries no text characters.
      // An unknown or malformed block is not evidence of a zero-character result.
      return null
    }
  }
  return count
}
function scopeError() { const error = new Error('Observation source scope mismatch'); error.scopeMismatch = true; return error }
/** A discovered file changed before or while it was read: a timing failure, never accepted as data. */
function sourceChanged() { const error = new Error('Observation source scope changed'); error.inventoryReason = 'source-changed'; return error }
/** Same device/inode regular file that did not shrink since discovery. Timing only if its prefix is also unchanged. */
const sameGrown = (expected, stat) => String(stat.dev) === expected.dev && String(stat.ino) === expected.ino && stat.isFile() && stat.size >= expected.size
const differs = (expected, stat) => Object.entries(expected).some(([key,value]) => ['dev','ino'].includes(key) ? String(stat[key])!==value : stat[key]!==value)
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
  let timing = false
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
      // A discovered file may only differ by growth; every other difference is a scope failure.
      let grown = false
      if (file.expectedIdentity && differs(file.expectedIdentity, before)) { if (!sameGrown(file.expectedIdentity, before)) throw scopeError(); grown = true }
      if (!before.isFile() || before.size > maxFileBytes) { if (file.expectedIdentity) throw scopeError(); counters.rotatedFiles++; continue }
      if (seenFiles.has(identity)) { counters.duplicates++; counters.filesExpected--; continue }
      seenFiles.add(identity)
      const bytes = Buffer.alloc(before.size)
      let offset = 0
      while (offset < bytes.length) { const read = await handle.read(bytes, offset, bytes.length-offset, offset); if (!read.bytesRead) break; offset += read.bytesRead }
      const after = await handle.stat()
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || offset !== before.size) {
        if (!file.expectedIdentity) { counters.rotatedFiles++; continue }
        if (after.dev !== before.dev || after.ino !== before.ino || !after.isFile() || after.size < before.size || offset !== before.size) throw scopeError()
        grown = true
      }
      const current = await realpath(file.path)
      checkScope(current)
      const check = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      try {
        const named = await check.stat()
        if (file.expectedIdentity && differs(file.expectedIdentity, named)) { if (!sameGrown(file.expectedIdentity, named)) throw scopeError(); grown = true }
        if (named.ino !== before.ino || named.dev !== before.dev) { if (file.expectedIdentity) throw scopeError(); counters.rotatedFiles++; continue }
      } finally { await check.close() }
      if (grown) {
        // Growth is timing only when the bytes seen at discovery are still the file's exact prefix;
        // an in-place rewrite that also grew is a scope failure. The file is then skipped, not counted.
        // The prefix is re-read from the file now at the path (inode checked before and after), never from
        // the in-memory buffer, which may predate an in-place rewrite.
        const expected = { dev: file.expectedIdentity.dev, ino: file.expectedIdentity.ino, size: file.expectedIdentity.size }
        if (await prefixState(file.path, expected, file.expectedPrefix) === 'mismatch') throw scopeError()
        timing = true
        continue
      }
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
      // Timing is only raised after the loop, so any error here for a discovered file is a scope failure.
      if (file.expectedIdentity) throw scopeError()
      if (error.scopeMismatch) throw new Error('Observation source scope changed')
      /* Private paths/errors never escape. filesRead mismatch makes missing source explicit. */
    }
    finally { if (handle) await handle.close() }
  }
  // Raised only after every file passed its integrity checks, so a live append cannot mask a scope failure.
  if (timing) throw sourceChanged()
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
    let peak = 0
    for (const usage of observed) peak = Math.max(peak, usage.value)
    peaks.push(peak)
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
/** Integrity failure of an approved shared log: fails the observation closed. */
function logIntegrity() { const error = new Error('Shared log changed unsafely'); error.inventoryReason = 'source-consistency'; return error }
/** The log was appended to or rotated while read: timing, so only this window's observation is omitted. */
function logTiming() { const error = new Error('Shared log changed during read'); error.inventoryReason = 'source-changed'; return error }
async function presence(path) {
  try { const stat = await lstat(path); if (!stat.isFile()) throw logIntegrity(); return { dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs, key: `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}` } }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error.inventoryReason ? error : logIntegrity() }
}
const identify = stat => ({ dev: stat.dev, ino: stat.ino, size: stat.size, key: `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}` })
/**
 * Re-hashes the first `size` bytes through the handle that read them, so the inode is fixed even if the path was
 * rotated away: 'match', 'mismatch' or 'unstable' (kept changing while hashed).
 */
async function handlePrefix(handle, size, expected) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const first = await handle.stat()
    if (first.size < size) return 'mismatch'
    const hash = createHash('sha256'), buffer = Buffer.alloc(1024 * 1024)
    let offset = 0
    while (offset < size) { const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, size - offset), offset); if (!bytesRead) return 'mismatch'; hash.update(buffer.subarray(0, bytesRead)); offset += bytesRead }
    const last = await handle.stat()
    if (identify(first).key !== identify(last).key) continue
    return hash.digest('hex') === expected ? 'match' : 'mismatch'
  }
  return 'unstable'
}
/**
 * One attempt at reading a shared hook log and its rotated predecessor (`<path>.1`) as a consistent snapshot.
 *
 * Handles stay open until both paths are re-identified. Every file read is then re-checked through its own
 * handle: bytes that changed after being read are a rewrite (integrity) even if the path was rotated meanwhile;
 * unchanged bytes with a grown file, or a path now naming another file, are timing. Integrity is decided for
 * every file before timing is reported, so a live append or rotation never masks a rewrite.
 */
async function sharedLogAttempt(path) {
  const paths = [`${path}.1`, path], before = await Promise.all(paths.map(presence)), reads = [null, null], handles = []
  const local = { filesExpected: 0, filesRead: 0, parseFailures: 0 }, lines = []
  let timing = false
  try {
    for (let index = 0; index < paths.length; index++) {
      const candidate = paths[index]
      if (before[index] === null) { if (index === 1) local.filesExpected++; continue }
      local.filesExpected++
      if (await realpath(candidate) !== candidate) throw logIntegrity()
      const handle = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      handles.push(handle)
      const opened = await handle.stat()
      if (!opened.isFile() || opened.size > 64 * 1024 * 1024) throw logIntegrity()
      // The path now names another file than the one identified: a rotation in between, read again next attempt.
      if (opened.dev !== before[index].dev || opened.ino !== before[index].ino) timing = true
      else if (opened.size < before[index].size) throw logIntegrity()
      const bytes = Buffer.alloc(opened.size)
      let offset = 0
      while (offset < bytes.length) { const read = await handle.read(bytes, offset, bytes.length-offset, offset); if (!read.bytesRead) break; offset += read.bytesRead }
      if (offset !== opened.size) throw logIntegrity()
      reads[index] = { handle, ...identify(opened), hash: createHash('sha256').update(bytes).digest('hex') }
      local.filesRead++
      const parts = bytes.toString('utf8').split('\n')
      // A tail without newline in a file that held still is a damaged or unfinished row: never counted as complete.
      if (parts.at(-1)) local.parseFailures++
      lines.push(...parts.slice(0, -1))
    }
    const after = await Promise.all(paths.map(presence))
    for (let index = 0; index < paths.length; index++) {
      const read = reads[index]
      if (read) {
        const now = identify(await read.handle.stat())
        if (now.key !== read.key) {
          // A hook only appends: bytes already read must be the exact prefix, whatever the times say.
          const state = now.size < read.size ? 'mismatch' : await handlePrefix(read.handle, read.size, read.hash)
          if (state === 'mismatch') throw logIntegrity()
          if (state === 'unstable' || now.size > read.size) timing = true
        }
      }
      const identified = read ?? before[index]
      if (!identified !== !after[index] || (after[index] && (after[index].dev !== identified.dev || after[index].ino !== identified.ino))) timing = true
      else if (after[index] && after[index].size !== identified.size) timing = true
    }
  } finally { await Promise.all(handles.map(handle => handle.close())) }
  return { lines, local, timing }
}
/**
 * Reads a shared hook log and its rotated predecessor (`<path>.1`, optional) as one consistent snapshot.
 *
 * An append or a rotation during the read is timing: retried a few times, then this window's observation is
 * omitted rather than accepting a partial or rotated view. A symlink, a non-file, or a file that shrank or was
 * rewritten is an integrity failure (fail closed). A missing rotated copy is normal; a missing active log is
 * missing data (incomplete).
 */
async function readSharedLog(path, counters, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { lines, local, timing } = await sharedLogAttempt(path)
    if (timing) continue
    for (const [key, value] of Object.entries(local)) counters[key] += value
    return lines
  }
  throw logTiming()
}
/**
 * Read-guard allow/deny counts for the window.
 *
 * Files are either attested exclusive to the agent (`agentExclusive`), or a shared hook log read with
 * `sessionFilter:'installed-scope'`, where only rows whose `session` is one of the agent's scanned Claude
 * sessions count. Every line of a shared log is parsed, so a damaged line anywhere marks it incomplete.
 */
export async function collectReadGuardMetrics({ files = [], window, sessions }) {
  const [start,end] = windowBounds(window)
  const exclusive = files.filter(file => file?.sessionFilter === undefined), shared = files.filter(file => file?.sessionFilter !== undefined)
  const {records,counters} = await readRecords(exclusive)
  const rows = records.map(({row}) => ({ row }))
  let sharedRead = false
  const seenLines = new Set()
  let timing = null
  for (const file of shared) {
    if (file.sessionFilter !== 'installed-scope' || !(sessions instanceof Set) || typeof file.path !== 'string') { counters.filesExpected++; continue }
    const readBefore = counters.filesRead
    let lines
    // A timing change is held until every approved log has passed its integrity checks.
    try { lines = await readSharedLog(file.path, counters) } catch (error) { if (error.inventoryReason !== 'source-changed') throw error; timing ??= error; continue }
    for (const line of lines) {
      if (!line.trim()) continue
      counters.recordsRead++
      // A row present in both the rotated copy and the active log is counted once.
      const key = digest(['shared-log', line])
      if (seenLines.has(key)) { counters.duplicates++; continue }
      seenLines.add(key)
      let row
      try { row = JSON.parse(line) } catch { counters.parseFailures++; continue }
      if (!row || typeof row !== 'object' || Array.isArray(row)) { counters.parseFailures++; continue }
      // Other agents' rows are parsed only to read their session; their decisions and times are never interpreted.
      if (typeof row.session === 'string' && sessions.has(row.session)) rows.push({ row })
    }
    if (counters.filesRead > readBefore) sharedRead = true
  }
  if (timing) throw timing
  let allow = 0, deny = 0, recognized = 0
  for (const {row} of rows) {
    if (!['allow','deny'].includes(row.decision)) { counters.unsupportedRecords++; continue }
    // Supported log format is ISO ts. Numeric epochs are deliberately not guessed.
    const at = typeof row.ts === 'string' ? Date.parse(row.ts) : NaN
    if (!Number.isFinite(at)) { counters.missingTimestamps++; continue }
    recognized++
    if (at < start || at >= end) continue
    if (row.decision === 'allow') allow++; else deny++
  }
  // A fully read shared log with no rows for this agent is an observed zero, not missing data.
  const observed = recognized > 0 || sharedRead || (counters.filesRead > 0 && counters.recordsRead === 0)
  const capability = state(counters,observed)
  return { metrics:{readGuardAllow: observed ? allow:null,readGuardDeny:observed ? deny:null},
    metricCapabilities:{readGuardAllow:capability,readGuardDeny:capability},capability,provenance:counters }
}
