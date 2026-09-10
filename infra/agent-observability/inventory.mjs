/** Read-only discovery inside an installed collector scope; never follows mtime as a window. */
import { constants } from 'node:fs'
import { open, readdir, realpath, lstat } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { digest, windowBounds } from './runtime-receipts.mjs'

const fail = (reason='source-consistency') => { const error=new Error('Dynamic observation inventory could not be verified within its limits'); error.inventoryReason=reason; throw error }
const identity = stat => ({ dev: String(stat.dev), ino: String(stat.ino), size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs })
const same = (a,b) => JSON.stringify(identity(a)) === JSON.stringify(identity(b))
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
      const decoder=new StringDecoder('utf8'), buffer=Buffer.alloc(1024*1024)
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
        offset+=bytesRead; carry+=decoder.write(buffer.subarray(0,bytesRead))
        let newline
        while((newline=carry.indexOf('\n'))>=0) { const line=carry.slice(0,newline); if(Buffer.byteLength(line)>limits.lineBytes) fail('line-limit'); parse(line); carry=carry.slice(newline+1) }
        if(Buffer.byteLength(carry)>limits.lineBytes) fail('line-limit')
      }
      carry+=decoder.end(); if(carry.trim()) fail('partial-tail') // A partial tail is not a complete scan.
      const after=await handle.stat(); if(!same(before,after) || await realpath(path)!==path) fail()
      const named=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
      try { if(!same(before,await named.stat())) fail() } finally { await named.close() }
      if(selected) {
        selectedBytes+=before.size
        if(files.length>=limits.selectedFiles || selectedBytes>limits.selectedBytes || before.size>64*1024**2) fail('selection-limit')
        files.push({path,sessionKey:digest([source,sessionIds.size ? ['session',...sessionIds] : ['file',relative(root,path)]]),completeFromStart:false,expectedIdentity:identity(before)})
      }
    } finally { await handle.close() }
  }
  if(JSON.stringify(paths)!==JSON.stringify(await candidates(root,source,scope,limits))) fail()
  for(const {path,before,excludedHeader} of snapshots) {
    if(await realpath(path)!==path) fail()
    const named=await lstat(path)
    if(same(before,named)) continue
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
  return files
}
