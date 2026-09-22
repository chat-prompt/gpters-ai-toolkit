/** Read-only discovery inside an installed collector scope: reads only files modified since shortly before the window. */
import { constants } from 'node:fs'
import { open, readdir, realpath, lstat } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { createHash } from 'node:crypto'
import { digest, windowBounds } from './runtime-receipts.mjs'

const fail = (reason='source-consistency') => { const error=new Error('Dynamic observation inventory could not be verified within its limits'); error.inventoryReason=reason; throw error }
const identity = stat => ({ dev: String(stat.dev), ino: String(stat.ino), size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs })
const same = (a,b) => JSON.stringify(identity(a)) === JSON.stringify(identity(b))
// Timing change: the same regular file (same device and inode) that did not shrink — a live writer appended.
// Replacement, a new inode, a non-file or truncation are integrity failures, never timing.
const grew = (before,after) => String(before.dev)===String(after.dev) && String(before.ino)===String(after.ino) && after.isFile() && after.size>=before.size
const sameInode = (a,b) => String(a.dev)===String(b.dev) && String(a.ino)===String(b.ino)
/**
 * Whether the file now at `path` is still the scanned inode and its first `before.size` bytes still hash to
 * `expected` (the file was only appended to): 'match', 'mismatch' (replaced, shrunk, moved or rewritten) or
 * 'unstable' (it kept changing while hashed, so nothing is proven either way — timing, never integrity).
 * The inode is checked on the opened handle before and after the read and on the path afterwards, so a
 * same-prefix replacement cannot pass.
 */
export async function prefixState(path,before,expected,attempts=3) {
  if(typeof expected!=='string') return 'mismatch'
  for(let attempt=0; attempt<attempts; attempt++) {
    if(await realpath(path)!==path) return 'mismatch'
    const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
    try {
      const first=await handle.stat(); if(!first.isFile() || !sameInode(before,first) || first.size<before.size) return 'mismatch'
      const hash=createHash('sha256'), buffer=Buffer.alloc(1024*1024)
      let offset=0
      while(offset<before.size) { const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,before.size-offset),offset); if(!bytesRead) return 'mismatch'; hash.update(buffer.subarray(0,bytesRead)); offset+=bytesRead }
      const last=await handle.stat(), named=await lstat(path)
      if(!last.isFile() || !sameInode(before,last) || !named.isFile() || !sameInode(before,named) || await realpath(path)!==path) return 'mismatch'
      // The prefix counts only if the file was stable while it was hashed; a change during the read is retried.
      // A file that never holds still is unproven, which only omits an observation, never accepts data.
      if(!same(first,last) || !same(first,named)) continue
      return hash.digest('hex')===expected ? 'match' : 'mismatch'
    } finally { await handle.close() }
  }
  return 'unstable'
}
/** True only when `prefixState` proves the prefix unchanged. */
export async function prefixMatches(path,before,expected,attempts=3) { return await prefixState(path,before,expected,attempts)==='match' }
// A missing final newline is timing only while the file is being written; an old broken tail stays fail closed.
const LIVE_TAIL_MS = 10*60*1000
// Filesystem timestamps can be a moment ahead of Date.now(); anything further in the future is not trusted.
const CLOCK_SKEW_MS = 2000
// A file last modified this long before the window starts cannot hold a record written inside it (appending
// updates the modification time). Such files are identified but never read. Files copied in with an old
// preserved modification time are the accepted blind spot of this rule (see README).
const UNCHANGED_BEFORE_WINDOW_MS = 10*60*1000
function inside(root,path) { const value=relative(root,path); return value && value!=='..' && !value.startsWith('../') && !isAbsolute(value) }
const defaults = { entries: 50000, candidates: 10000, bytes: 4*1024**3, fileBytes: 256*1024**2, lineBytes: 16*1024**2, selectedFiles: 500, selectedBytes: 256*1024**2 }
function allowedHeader(row,scope) {
  const slugs=new Set(scope.projectSlugs??[]), payload=row?.payload
  const cwd=typeof payload?.cwd==='string' ? payload.cwd.replaceAll('\\','/').replace(/\/$/,'').split('/').at(-1) : null
  return row?.type==='session_meta' && (!scope.codexThreadSource || payload?.thread_source===scope.codexThreadSource) && (slugs.size ? slugs.has(cwd) : Boolean(scope.codexThreadSource))
}
async function candidates(root,source,scope,limits) {
  const result=[], queue=source==='claude-code' ? (scope.projectSlugs??[]).map(slug=>join(root,slug)) : [root]
  if (!queue.length) fail()
  let entries=0
  while(queue.length) {
    const directory=queue.pop(), canonical=await realpath(directory)
    if ((canonical!==root && !inside(root,canonical)) || canonical!==directory) fail()
    for(const entry of await readdir(directory,{withFileTypes:true})) {
      if(++entries>limits.entries) fail('entry-limit')
      const path=join(directory,entry.name)
      if(entry.isSymbolicLink()) fail()
      if(entry.isDirectory()) queue.push(path)
      else if(entry.isFile() && entry.name.endsWith('.jsonl')) { result.push(path); if(result.length>limits.candidates) fail('candidate-limit') }
    }
  }
  return result.sort()
}

/**
 * A fresh enumeration per new batch; private output paths never enter the observation payload.
 * `scannedSessions`, when given, receives every Claude session ID found in scope (helper-internal only,
 * used to attribute shared hook logs; never uploaded).
 */
export async function discoverWindowFiles({source,scope,window,scannedSessions}, testLimits={}) {
  if(!['claude-code','codex'].includes(source) || !scope?.sessionsDir) fail()
  const limits={...defaults,...testLimits}, root=await realpath(scope.sessionsDir), [start,end]=windowBounds(window)
  const paths=await candidates(root,source,scope,limits), files=[], snapshots=[]
  let totalBytes=0, selectedBytes=0
  async function headerOf(handle) {
    let header=Buffer.alloc(0), position=0
    while(header.length<2*1024**2) {
      const bytes=Buffer.alloc(Math.min(64*1024,2*1024**2-header.length)), read=await handle.read(bytes,0,bytes.length,position)
      if(!read.bytesRead) break
      position+=read.bytesRead; totalBytes+=read.bytesRead; if(totalBytes>limits.bytes) fail('scan-limit')
      header=Buffer.concat([header,bytes.subarray(0,read.bytesRead)])
      const newline=header.indexOf(10); if(newline>=0) { header=header.subarray(0,newline); break }
    }
    const first=header.toString('utf8')
    let row; try { row=JSON.parse(first) } catch { fail('invalid-header') }
    if(Buffer.byteLength(first)>=2*1024**2) fail('header-limit')
    return {row,key:digest(first)}
  }
  // Timing is decided only after every integrity check has passed, so a live append never masks one.
  let timing=null
  const lineages=[]
  const mark=reason => { timing ??= reason }
  // Prefix re-reads count against the same scan budget as the first pass.
  // 'mismatch' is integrity; 'unstable' (still being written while re-hashed) is timing like the growth itself.
  const reread=async (path,before,expected) => { totalBytes+=before.size; if(totalBytes>limits.bytes) fail('scan-limit'); const state=await prefixState(path,before,expected); if(state==='mismatch') fail(); return state }
  for(const path of paths) {
    if(await realpath(path)!==path || !inside(root,path)) fail()
    const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
    try {
      const before=await handle.stat()
      if(!before.isFile() || before.size>limits.fileBytes) fail('file-limit')
      const snapshot={path,before}; snapshots.push(snapshot)
      if(before.mtimeMs<start-UNCHANGED_BEFORE_WINDOW_MS) { snapshot.unread=true; continue }
      // Codex's shared root is authorized by the first physical header, never by a nearby file.
      if(source==='codex') {
        const header=await headerOf(handle)
        if(!allowedHeader(header.row,scope)) { snapshot.excludedHeader=header.key; continue }
      }
      totalBytes+=before.size; if(totalBytes>limits.bytes) fail('scan-limit')
      let offset=0, carry='', selected=false
      const sessionIds=new Set()
      // Claude first-turn attestation: the first uuid record and every parent link, checked within this file only.
      const lineage={first:null,uuids:new Set(),parents:[]}
      // Amortize filesystem round trips over large histories; all byte, line,
      // scope and identity limits still apply to every record and source.
      const decoder=new StringDecoder('utf8'), buffer=Buffer.alloc(1024*1024), prefix=createHash('sha256')
      const parse=line=>{
        if(!line.trim()) return
        let row; try { row=JSON.parse(line) } catch { fail('invalid-record') }
        if(!row || typeof row!=='object' || Array.isArray(row)) fail('invalid-record')
        const sessionId=source==='codex' && row.type==='session_meta' ? row.payload?.id : source==='claude-code' ? row.sessionId ?? row.session_id : undefined
        if(sessionId!==undefined) { if(typeof sessionId!=='string' || !sessionId || sessionId.length>255) fail('session-identity'); sessionIds.add(sessionId); if(sessionIds.size>1) fail('session-identity') }
        if(source==='claude-code' && typeof row.uuid==='string') {
          lineage.first ??= {parent:row.parentUuid,sidechain:row.isSidechain===true,compact:row.isCompactSummary===true}
          lineage.uuids.add(row.uuid); if(row.parentUuid!=null) lineage.parents.push(row.parentUuid)
        }
        if(source==='codex' && row.type==='session_meta' && !allowedHeader(row,scope)) fail()
        if(source==='codex' && row.type==='turn_context' && scope.projectSlugs?.length && !allowedHeader({type:'session_meta',payload:{...row.payload,thread_source:scope.codexThreadSource}},scope)) fail()
        const timestamp=row.timestamp
        if(timestamp!==undefined) {
          const at=typeof timestamp==='string' ? Date.parse(timestamp) : NaN
          if(!Number.isFinite(at)) fail('invalid-timestamp')
          if(at>=start && at<end) selected=true
        } else if((source==='claude-code' && (row.type==='assistant' && row.message?.usage || row.type==='system' && row.subtype==='compact_boundary' || row.type==='user' && row.message?.content?.some?.(b=>b?.type==='tool_result'))) || (source==='codex' && (row.type==='compacted' || row.type==='event_msg' && ['token_count','context_compacted'].includes(row.payload?.type) || row.type==='response_item' && ['function_call_output','custom_tool_call_output'].includes(row.payload?.type)))) fail()
      }
      while(offset<before.size) {
        const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,before.size-offset),offset)
        if(!bytesRead) fail()
        offset+=bytesRead; prefix.update(buffer.subarray(0,bytesRead)); carry+=decoder.write(buffer.subarray(0,bytesRead))
        let newline
        while((newline=carry.indexOf('\n'))>=0) { const line=carry.slice(0,newline); if(Buffer.byteLength(line)>limits.lineBytes) fail('line-limit'); parse(line); carry=carry.slice(newline+1) }
        if(Buffer.byteLength(carry)>limits.lineBytes) fail('line-limit')
      }
      carry+=decoder.end(); snapshot.prefix=prefix.digest('hex')
      if(await realpath(path)!==path) fail()
      // Growth of the same file with an unchanged prefix is timing; any other change is integrity.
      const after=await handle.stat(), named=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
      let current; try { current=await named.stat() } finally { await named.close() }
      if(!same(before,after) || !same(before,current)) {
        if(!grew(before,after) || !grew(before,current)) fail()
        await reread(path,before,snapshot.prefix)
        mark('source-changed'); continue
      }
      // A partial tail is not a complete scan. It is timing only while the file is actively written;
      // an old tail, or a modification time in the future, stays fail closed. Timing is deferred like above.
      const age=Date.now()-before.mtimeMs
      if(carry.trim()) { if(age>=-CLOCK_SKEW_MS && age<=LIVE_TAIL_MS) { mark('partial-tail'); continue } fail('stale-tail') }
      const sessionKey=digest([source,sessionIds.size ? ['session',...sessionIds] : ['file',relative(root,path)]])
      if(source==='claude-code' && sessionIds.size) {
        for(const id of sessionIds) scannedSessions?.add(id)
        const first=lineage.first
        lineages.push({sessionKey,path,sidechain:first?.sidechain===true,named:sessionIds.size===1 && path.endsWith(`/${[...sessionIds][0]}.jsonl`),
          selfContained:Boolean(first) && first.parent===null && !first.sidechain && !first.compact && lineage.parents.every(parent=>lineage.uuids.has(parent))})
      }
      if(selected) {
        selectedBytes+=before.size
        if(files.length>=limits.selectedFiles || selectedBytes>limits.selectedBytes || before.size>64*1024**2) fail('selection-limit')
        files.push({path,sessionKey,completeFromStart:false,expectedIdentity:identity(before),expectedPrefix:snapshot.prefix})
      }
    } finally { await handle.close() }
  }
  const current=await candidates(root,source,scope,limits)
  if(JSON.stringify(paths)!==JSON.stringify(current)) {
    // Only new files appearing mid-scan is timing; a removed or moved candidate stays fail closed.
    const now=new Set(current); if(!paths.every(path=>now.has(path))) fail()
    mark('source-changed')
  }
  for(const {path,before,excludedHeader,prefix,unread} of snapshots) {
    if(await realpath(path)!==path) fail()
    const named=await lstat(path)
    if(same(before,named)) continue
    // A file skipped as unchanged that was written during the scan may now hold in-window records: timing.
    if(unread) { if(!grew(before,named)) fail(); mark('source-changed'); continue }
    // A selected file appended after it was scanned is timing only when its scanned prefix is unchanged.
    if(!excludedHeader) {
      if(!grew(before,named)) fail()
      await reread(path,before,prefix)
      mark('source-changed'); continue
    }
    // Unrelated Codex sessions may append while an agent is scanned. Recheck
    // their original exclusion header rather than requiring their body to stop.
    // A replaced file or changed header still invalidates the inventory.
    if(!excludedHeader || named.dev!==before.dev || named.ino!==before.ino || !named.isFile()) fail()
    const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
    try {
      const opened=await handle.stat()
      if(opened.dev!==before.dev || opened.ino!==before.ino || !opened.isFile()) fail()
      const header=await headerOf(handle)
      if(header.key!==excludedHeader || allowedHeader(header.row,scope)) fail()
      const current=await lstat(path)
      if(await realpath(path)!==path || current.dev!==before.dev || current.ino!==before.ino || !current.isFile()) fail()
    } finally { await handle.close() }
  }
  if(timing) fail(timing)
  attestFirstTurns(files,lineages)
  return files
}
/**
 * Claude sessions are complete from their start only when, among every scanned file with that session ID,
 * exactly one is a main thread (its first uuid record is not a sidechain), that file is selected and
 * self-contained (first uuid record has no parent and is not a compact summary, every parent resolves inside
 * the file), and every other file starts as a sidechain (subagents). Anything else stays unproven.
 */
function attestFirstTurns(files,lineages) {
  // A file of the session without any uuid record counts as a main thread, which keeps the session unproven.
  const bySession=new Map()
  for(const item of lineages) { if(!bySession.has(item.sessionKey)) bySession.set(item.sessionKey,[]); bySession.get(item.sessionKey).push(item) }
  const selected=new Set(files.map(file=>file.path))
  for(const file of files) {
    const group=bySession.get(file.sessionKey)
    if(!group) continue
    const mains=group.filter(item=>!item.sidechain)
    // Files unchanged before the window are not read, so the main transcript must also carry the session's own
    // file name (`<sessionId>.jsonl`, Claude's layout): any other file of that session then lives under
    // `<sessionId>/subagents/` as a sidechain and cannot be a second, unread main thread.
    file.completeFromStart=mains.length===1 && mains[0].selfContained && mains[0].named && selected.has(mains[0].path)
  }
}
