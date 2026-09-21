/** Read-only discovery inside an installed collector scope; never follows mtime as a window. */
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
 * True when the file now at `path` is still the scanned inode and its first `before.size` bytes still hash
 * to `expected` (the file was only appended to). The inode is checked on the opened handle before and after
 * the read and on the path afterwards, so a same-prefix replacement cannot pass.
 */
export async function prefixMatches(path,before,expected,attempts=3) {
  if(typeof expected!=='string') return false
  for(let attempt=0; attempt<attempts; attempt++) {
    if(await realpath(path)!==path) return false
    const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
    try {
      const first=await handle.stat(); if(!first.isFile() || !sameInode(before,first) || first.size<before.size) return false
      const hash=createHash('sha256'), buffer=Buffer.alloc(1024*1024)
      let offset=0
      while(offset<before.size) { const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,before.size-offset),offset); if(!bytesRead) return false; hash.update(buffer.subarray(0,bytesRead)); offset+=bytesRead }
      const last=await handle.stat(), named=await lstat(path)
      if(!last.isFile() || !sameInode(before,last) || !named.isFile() || !sameInode(before,named) || await realpath(path)!==path) return false
      // The prefix counts only if the file was stable while it was hashed; a change during the read is retried,
      // and a file that never holds still is not proven (the caller fails closed). A change after the last check
      // can only lead to an omitted observation, never to accepted data.
      if(!same(first,last) || !same(first,named)) continue
      return hash.digest('hex')===expected
    } finally { await handle.close() }
  }
  return false
}
// A missing final newline is timing only while the file is being written; an old broken tail stays fail closed.
const LIVE_TAIL_MS = 10*60*1000
// Filesystem timestamps can be a moment ahead of Date.now(); anything further in the future is not trusted.
const CLOCK_SKEW_MS = 2000
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

/** A fresh enumeration per new batch; private output paths never enter the observation payload. */
export async function discoverWindowFiles({source,scope,window}, testLimits={}) {
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
  const mark=reason => { timing ??= reason }
  // Prefix re-reads count against the same scan budget as the first pass.
  const reread=async (path,before,expected) => { totalBytes+=before.size; if(totalBytes>limits.bytes) fail('scan-limit'); return prefixMatches(path,before,expected) }
  for(const path of paths) {
    if(await realpath(path)!==path || !inside(root,path)) fail()
    const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
    try {
      const before=await handle.stat()
      if(!before.isFile() || before.size>limits.fileBytes) fail('file-limit')
      const snapshot={path,before}; snapshots.push(snapshot)
      // Codex's shared root is authorized by the first physical header, never by a nearby file.
      if(source==='codex') {
        const header=await headerOf(handle)
        if(!allowedHeader(header.row,scope)) { snapshot.excludedHeader=header.key; continue }
      }
      totalBytes+=before.size; if(totalBytes>limits.bytes) fail('scan-limit')
      let offset=0, carry='', selected=false
      const sessionIds=new Set()
      // Amortize filesystem round trips over large histories; all byte, line,
      // scope and identity limits still apply to every record and source.
      const decoder=new StringDecoder('utf8'), buffer=Buffer.alloc(1024*1024), prefix=createHash('sha256')
      const parse=line=>{
        if(!line.trim()) return
        let row; try { row=JSON.parse(line) } catch { fail('invalid-record') }
        if(!row || typeof row!=='object' || Array.isArray(row)) fail('invalid-record')
        const sessionId=source==='codex' && row.type==='session_meta' ? row.payload?.id : source==='claude-code' ? row.sessionId ?? row.session_id : undefined
        if(sessionId!==undefined) { if(typeof sessionId!=='string' || !sessionId || sessionId.length>255) fail('session-identity'); sessionIds.add(sessionId); if(sessionIds.size>1) fail('session-identity') }
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
        if(!grew(before,after) || !grew(before,current) || !await reread(path,before,snapshot.prefix)) fail()
        mark('source-changed'); continue
      }
      // A partial tail is not a complete scan. It is timing only while the file is actively written;
      // an old tail, or a modification time in the future, stays fail closed. Timing is deferred like above.
      const age=Date.now()-before.mtimeMs
      if(carry.trim()) { if(age>=-CLOCK_SKEW_MS && age<=LIVE_TAIL_MS) { mark('partial-tail'); continue } fail('stale-tail') }
      if(selected) {
        selectedBytes+=before.size
        if(files.length>=limits.selectedFiles || selectedBytes>limits.selectedBytes || before.size>64*1024**2) fail('selection-limit')
        files.push({path,sessionKey:digest([source,sessionIds.size ? ['session',...sessionIds] : ['file',relative(root,path)]]),completeFromStart:false,expectedIdentity:identity(before),expectedPrefix:snapshot.prefix})
      }
    } finally { await handle.close() }
  }
  const current=await candidates(root,source,scope,limits)
  if(JSON.stringify(paths)!==JSON.stringify(current)) {
    // Only new files appearing mid-scan is timing; a removed or moved candidate stays fail closed.
    const now=new Set(current); if(!paths.every(path=>now.has(path))) fail()
    mark('source-changed')
  }
  for(const {path,before,excludedHeader,prefix} of snapshots) {
    if(await realpath(path)!==path) fail()
    const named=await lstat(path)
    if(same(before,named)) continue
    // A selected file appended after it was scanned is timing only when its scanned prefix is unchanged.
    if(!excludedHeader) {
      if(!grew(before,named) || !await reread(path,before,prefix)) fail()
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
  return files
}
