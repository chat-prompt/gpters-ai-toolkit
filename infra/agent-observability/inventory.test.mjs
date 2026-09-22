import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, utimes, symlink, realpath, rename, open, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverWindowFiles, prefixMatches } from './inventory.mjs'
import { createHash } from 'node:crypto'
import { stat, readFile } from 'node:fs/promises'
import { collectCliMetrics } from './metrics.mjs'
const window={startUtc:'2026-01-02T00:00:00.000Z',endUtc:'2026-01-03T00:00:00.000Z'}
const row=timestamp=>({type:'assistant',timestamp,message:{id:'m',stop_reason:'end_turn',usage:{input_tokens:42}}})
async function fixture(fn) { const root=await realpath(await mkdtemp(join(tmpdir(),'dynamic-inventory-'))); const project=join(root,'allowed'); await mkdir(project); try { await fn(root,project) } finally { await rm(root,{recursive:true,force:true}) } }
const context=root=>({source:'claude-code',scope:{sessionsDir:root,projectSlugs:['allowed']},window})
const save=(path,rows)=>writeFile(path,rows.map(v=>JSON.stringify(v)).join('\n')+'\n')
test('discovers a new file on the next batch by its record timestamps',()=>fixture(async(root,project)=>{
  await save(join(project,'old.jsonl'),[row('2026-01-01T12:00:00Z')]); assert.equal((await discoverWindowFiles(context(root))).length,0)
  const fresh=join(project,'new.jsonl'); await save(fresh,[row('2026-01-02T12:00:00Z')])
  const files=await discoverWindowFiles(context(root)); assert.equal(files.length,1); assert.equal(files[0].path,fresh); assert.equal(files[0].completeFromStart,false)
}))
test('a file unchanged since before the window is identified but never read; if it is written during the scan, that is timing',()=>fixture(async(root,project)=>{
  // Records inside the window in a file whose modification time says it was last written before: the accepted blind spot.
  const old=join(project,'old.jsonl'); await save(old,[row('2026-01-02T12:00:00Z')]); await utimes(old,new Date('2026-01-01'),new Date('2026-01-01'))
  await writeFile(join(project,'broken-but-old.jsonl'),'not JSON'); await utimes(join(project,'broken-but-old.jsonl'),new Date('2026-01-01'),new Date('2026-01-01'))
  assert.deepEqual(await discoverWindowFiles(context(root)),[])
  const fs=(await import('node:fs')).promises, { syncBuiltinESMExports } = await import('node:module'), realLstat=fs.lstat
  let fired=false
  fs.lstat=async (...args)=>{ if(!fired && String(args[0])===old){ fired=true; await appendFile(old,JSON.stringify(row('2026-01-02T13:00:00Z'))+'\n') } return realLstat(...args) }; syncBuiltinESMExports()
  try { await assert.rejects(discoverWindowFiles(context(root)),error=>error.inventoryReason==='source-changed') } finally { fs.lstat=realLstat; syncBuiltinESMExports() }
}))
test('a main transcript attests its first turn only under its own session file name',()=>fixture(async(root,project)=>{
  await save(join(project,'renamed.jsonl'),[turn('s','u1',null,'2026-01-02T01:00:00Z')])
  const {files,result}=await firstTurn(root); assert.equal(files[0].completeFromStart,false); assert.equal(result.metricCapabilities.firstTurnTokens,'incomplete')
}))
test('enforces the half-open window and never reads other Claude projects',()=>fixture(async(root,project)=>{
  await save(join(project,'start.jsonl'),[row(window.startUtc)]); await save(join(project,'end.jsonl'),[row(window.endUtc)])
  await mkdir(join(root,'other')); await writeFile(join(root,'other','invalid.jsonl'),'not JSON')
  assert.deepEqual((await discoverWindowFiles(context(root))).map(f=>f.path),[join(project,'start.jsonl')])
}))
test('rejects malformed, partial, oversized and unsupported timestamp sources honestly',()=>fixture(async(root,project)=>{
  const file=join(project,'input.jsonl')
  for(const content of ['bad\n',JSON.stringify(row(window.startUtc)),JSON.stringify({...row(window.startUtc),timestamp:'bad'})+'\n',JSON.stringify({...row(window.startUtc),timestamp:undefined})+'\n']) {
    await writeFile(file,content); await assert.rejects(discoverWindowFiles(context(root)))
  }
  await save(file,[row(window.startUtc)]); await assert.rejects(discoverWindowFiles(context(root),{fileBytes:1}))
}))
test('selected count/bytes, candidate and scan bounds fail closed rather than truncate',()=>fixture(async(root,project)=>{
  await save(join(project,'a.jsonl'),[row(window.startUtc)]); await save(join(project,'b.jsonl'),[row(window.startUtc)])
  for(const limits of [{selectedFiles:1},{selectedBytes:1},{candidates:1},{entries:1},{bytes:1},{lineBytes:1}]) await assert.rejects(discoverWindowFiles(context(root),limits))
}))
test('rejects symlink sources and rotation after discovery before metrics',()=>fixture(async(root,project)=>{
  const path=join(project,'source.jsonl'); await save(path,[row(window.startUtc)]); await symlink(path,join(project,'alias.jsonl')); await assert.rejects(discoverWindowFiles(context(root)))
  await rm(join(project,'alias.jsonl')); const files=await discoverWindowFiles(context(root)); await save(path,[row(window.startUtc),row(window.startUtc)])
  await assert.rejects(collectCliMetrics({...context(root),files}))
}))
for (const change of ['delete','rename','replace','directory','symlink']) test(`dynamic ${change} between discovery and metrics fails closed; static missing stays incomplete`,()=>fixture(async(root,project)=>{
  const path=join(project,'source.jsonl'); await save(path,[row(window.startUtc)])
  const files=await discoverWindowFiles(context(root))
  if (change==='delete') await rm(path)
  else {
    const moved=join(project,'moved.jsonl'); await rename(path,moved)
    if (change==='replace') await save(path,[row(window.startUtc)])
    if (change==='directory') await mkdir(path)
    if (change==='symlink') await symlink(moved,path)
  }
  await assert.rejects(collectCliMetrics({...context(root),files}), /Observation source scope/)
  const missing=await collectCliMetrics({...context(root),files:[{path:join(project,'missing.jsonl'),sessionKey:'static'}]})
  assert.equal(missing.capability,'incomplete'); assert.equal(missing.provenance.filesRead,0)
}))
test('Codex selects only a matching first physical header and rejects later scope changes',()=>fixture(async(root)=>{
  const config={source:'codex',scope:{sessionsDir:root,codexThreadSource:'aitk-agent:example'},window}
  const header=tag=>({type:'session_meta',timestamp:window.startUtc,payload:{thread_source:tag,cwd:'/private/tmp'}})
  await save(join(root,'human.jsonl'),[header('human'),{arbitrary:'out-of-scope'}]); await save(join(root,'agent.jsonl'),[header('aitk-agent:example')])
  assert.equal((await discoverWindowFiles(config)).length,1)
  await save(join(root,'agent.jsonl'),[header('aitk-agent:example'),header('human')]); await assert.rejects(discoverWindowFiles(config))
}))
test('copied source session IDs deduplicate and mixed physical-file IDs fail closed',()=>fixture(async(root,project)=>{
  const record={...row(window.startUtc),sessionId:'same-source-session'}
  await save(join(project,'a.jsonl'),[record]); await save(join(project,'b.jsonl'),[record])
  const files=await discoverWindowFiles(context(root)), result=await collectCliMetrics({...context(root),files})
  assert.equal(result.metrics.peakContextTokens.count,1); assert.equal(result.metrics.peakContextTokens.sum,42)
  await save(join(project,'b.jsonl'),[record,{...record,sessionId:'other-session'}]); await assert.rejects(discoverWindowFiles(context(root)))
}))
test('known Claude metadata does not poison measured capabilities; unknown formats remain incomplete',()=>fixture(async(root,project)=>{
  const file=join(project,'a.jsonl'), records=[row(window.startUtc),...['attachment','file-history-delta','last-prompt','atis-latch','mode','permission-mode','ai-title'].map(type=>({type}))]
  await save(file,records); const files=await discoverWindowFiles(context(root)); let result=await collectCliMetrics({...context(root),files})
  assert.equal(result.metricCapabilities.peakContextTokens,'supported'); assert.equal(result.metricCapabilities.firstTurnTokens,'incomplete')
  await save(file,[...records,{type:'future-unknown'}]); result=await collectCliMetrics({...context(root),files:await discoverWindowFiles(context(root))})
  assert.equal(result.metricCapabilities.peakContextTokens,'incomplete'); assert.equal(result.provenance.unsupportedRecords,1)
}))
for(const change of ['foreign-append','foreign-header','foreign-replace','owned-append']) test(`Codex concurrent ${change} preserves scope isolation`,()=>fixture(async(root)=>{
  const config={source:'codex',scope:{sessionsDir:root,codexThreadSource:'aitk-agent:example'},window}
  const header=tag=>({type:'session_meta',timestamp:window.startUtc,payload:{thread_source:tag,cwd:'/private/tmp'}})
  const foreign=join(root,'a-human.jsonl'),owned=join(root,'b-agent.jsonl')
  await save(foreign,[header('human')]);await save(owned,[header('aitk-agent:example')])
  const target=change==='owned-append'?owned:foreign,tag=change==='owned-append'?'aitk-agent:example':'human'
  const handle=await open(target,'r'),prototype=Object.getPrototypeOf(handle),originalRead=prototype.read;await handle.close()
  let changed=false
  const patched=mock.method(prototype,'read',async function(...args){
    const result=await originalRead.apply(this,args)
    if(!changed&&args[3]===0&&args[0].subarray(0,result.bytesRead).toString().includes(`"thread_source":"${tag}"`)) {
      changed=true
      if(change==='foreign-replace'){await rename(target,target+'.bak');await save(target,[header('human')])}
      else if(change==='foreign-header')await save(target,[header('aitk-agent:example')])
      else await appendFile(target,JSON.stringify({type:'event_msg',timestamp:window.startUtc,payload:{type:'task_started'}})+'\n')
    }
    return result
  })
  try {
    if(change==='foreign-append')assert.deepEqual((await discoverWindowFiles(config)).map(file=>file.path),[owned])
    else await assert.rejects(discoverWindowFiles(config))
    assert.equal(changed,true)
  } finally {patched.mock.restore()}
}))
test('streaming discovery preserves long Unicode records across read chunks',()=>fixture(async(root,project)=>{
  const path=join(project,'unicode.jsonl')
  await save(path,[{type:'progress',padding:'a'.repeat(1024*1024-32)+'😀한글'.repeat(40)},row(window.startUtc)])
  assert.deepEqual((await discoverWindowFiles(context(root))).map(file=>file.path),[path])
}))
test('a discovered file that grows before metrics reports the timing reason source-changed (observation omitted, never accepted)',()=>fixture(async(root,project)=>{
  const path=join(project,'live.jsonl'); await save(path,[row(window.startUtc)])
  const files=await discoverWindowFiles(context(root)); await appendFile(path,JSON.stringify(row(window.startUtc))+'\n')
  await assert.rejects(collectCliMetrics({...context(root),files}), error => error.inventoryReason==='source-changed' && /Observation source scope/.test(error.message))
}))
test('out-of-scope and symlink sources keep the integrity reason, not the timing reason',()=>fixture(async(root,project)=>{
  const path=join(project,'source.jsonl'); await save(path,[row(window.startUtc)]); await symlink(path,join(project,'alias.jsonl'))
  await assert.rejects(discoverWindowFiles(context(root)), error => error.inventoryReason==='source-consistency')
  await rm(join(project,'alias.jsonl')); const files=await discoverWindowFiles(context(root)); await rm(path)
  await assert.rejects(collectCliMetrics({...context(root),files}), error => error.inventoryReason===undefined && error.scopeMismatch===true)
}))
test('a partial tail during discovery is the timing reason partial-tail',()=>fixture(async(root,project)=>{
  await writeFile(join(project,'live.jsonl'),JSON.stringify(row(window.startUtc))+'\n'+'{"type":"assistant"')
  await assert.rejects(discoverWindowFiles(context(root)), error => error.inventoryReason==='partial-tail')
}))
test('cost-state metadata and tool_reference result blocks do not poison measured capabilities',()=>fixture(async(root,project)=>{
  const result={type:'user',timestamp:window.startUtc,message:{content:[{type:'tool_result',tool_use_id:'t1',content:[{type:'tool_reference',tool_name:'example'},{type:'text',text:'abc'}]}]}}
  await save(join(project,'a.jsonl'),[row(window.startUtc),{type:'cost-state'},result])
  const out=await collectCliMetrics({...context(root),files:await discoverWindowFiles(context(root))})
  assert.equal(out.provenance.unsupportedRecords,0); assert.equal(out.metricCapabilities.peakContextTokens,'supported'); assert.equal(out.metrics.toolResultChars.sum,3)
}))
for (const change of ['replace','directory','symlink','truncate']) test(`dynamic ${change} after discovery is an integrity failure, never the timing reason`,()=>fixture(async(root,project)=>{
  const path=join(project,'source.jsonl'); await save(path,[row(window.startUtc),row(window.startUtc)])
  const files=await discoverWindowFiles(context(root))
  if (change==='truncate') await writeFile(path,JSON.stringify(row(window.startUtc))+'\n')
  else { const moved=join(project,'moved.jsonl'); await rename(path,moved)
    if (change==='replace') await save(path,[row(window.startUtc),row(window.startUtc),row(window.startUtc)])
    if (change==='directory') await mkdir(path)
    if (change==='symlink') await symlink(moved,path) }
  await assert.rejects(collectCliMetrics({...context(root),files}), error => error.inventoryReason===undefined && error.scopeMismatch===true)
}))
function duringRead(marker, action) {
  return async fn => { const probe=await open(import.meta.filename,'r'),prototype=Object.getPrototypeOf(probe),originalRead=prototype.read; await probe.close()
    let done=false
    const patched=mock.method(prototype,'read',async function(...args){ const result=await originalRead.apply(this,args)
      if(!done&&args[0].subarray(0,result.bytesRead).toString().includes(marker)){ done=true; await action() } return result })
    try { await fn(); assert.equal(done,true) } finally { patched.mock.restore() } }
}
test('an earlier selected file appended while a later file is scanned is the timing reason source-changed',()=>fixture(async(root,project)=>{
  const a=join(project,'a.jsonl'), b=join(project,'b.jsonl'); await save(a,[row(window.startUtc)]); await save(b,[{...row(window.startUtc),marker:'second-file'}])
  await duringRead('second-file',()=>appendFile(a,JSON.stringify(row(window.startUtc))+'\n'))(async()=>{
    await assert.rejects(discoverWindowFiles(context(root)), error => error.inventoryReason==='source-changed') })
}))
test('a new file appearing mid-scan is timing; a candidate removed mid-scan stays integrity',()=>fixture(async(root,project)=>{
  const a=join(project,'a.jsonl'), b=join(project,'b.jsonl'); await save(a,[{...row(window.startUtc),marker:'first-file'}]); await save(b,[row(window.startUtc)])
  await duringRead('first-file',()=>save(join(project,'c.jsonl'),[row(window.startUtc)]))(async()=>{
    await assert.rejects(discoverWindowFiles(context(root)), error => error.inventoryReason==='source-changed') })
  await rm(join(project,'c.jsonl'))
  await duringRead('first-file',()=>rm(b))(async()=>{
    await assert.rejects(discoverWindowFiles(context(root)), error => !['source-changed','partial-tail'].includes(error.inventoryReason)) })
}))
test('an old partial tail is stale-tail (fail closed), not the timing reason',()=>fixture(async(root,project)=>{
  const path=join(project,'old.jsonl'); await writeFile(path,JSON.stringify(row(window.startUtc))+'\n'+'{"type":"assistant"')
  const old=new Date(Date.now()-60*60*1000); await utimes(path,old,old)
  await assert.rejects(discoverWindowFiles(context(root)), error => error.inventoryReason==='stale-tail')
}))
test('an in-place rewrite that also grows is an integrity failure, not timing (metrics and final recheck)',()=>fixture(async(root,project)=>{
  const path=join(project,'source.jsonl'); await save(path,[row(window.startUtc)])
  const files=await discoverWindowFiles(context(root))
  const handle=await open(path,'r+'); await handle.write(Buffer.from(JSON.stringify({...row(window.startUtc),message:{id:'z',stop_reason:'end_turn',usage:{input_tokens:9999}}})+'\n'),0); await handle.close()
  await assert.rejects(collectCliMetrics({...context(root),files}), error => error.inventoryReason===undefined && error.scopeMismatch===true)
  const a=join(project,'a.jsonl'), b=join(project,'b.jsonl'); await rm(path); await save(a,[row(window.startUtc)]); await save(b,[{...row(window.startUtc),marker:'second-file'}])
  await duringRead('second-file',async()=>{ const h=await open(a,'r+'); await h.write(Buffer.from(JSON.stringify({...row(window.startUtc),x:'rewritten-longer-record'})+'\n'),0); await h.close() })(async()=>{
    await assert.rejects(discoverWindowFiles(context(root)), error => error.inventoryReason==='source-consistency') })
}))
test('append followed by inode replacement during the scan stays integrity',()=>fixture(async(root,project)=>{
  const a=join(project,'a.jsonl'), b=join(project,'b.jsonl'); await save(a,[row(window.startUtc)]); await save(b,[{...row(window.startUtc),marker:'second-file'}])
  await duringRead('second-file',async()=>{ await appendFile(a,JSON.stringify(row(window.startUtc))+'\n'); await rename(a,a+'.old'); await save(a,[row(window.startUtc),row(window.startUtc)]) })(async()=>{
    await assert.rejects(discoverWindowFiles(context(root)), error => error.inventoryReason==='source-consistency') })
}))
for (const change of ['directory','replace']) test(`final recheck: earlier file ${change} during a later scan stays integrity`,()=>fixture(async(root,project)=>{
  const a=join(project,'a.jsonl'), b=join(project,'b.jsonl'); await save(a,[row(window.startUtc)]); await save(b,[{...row(window.startUtc),marker:'second-file'}])
  await duringRead('second-file',async()=>{ await rename(a,a+'.old'); if(change==='directory') await mkdir(a); else await save(a,[row(window.startUtc),row(window.startUtc)]) })(async()=>{
    await assert.rejects(discoverWindowFiles(context(root)), error => !['source-changed','partial-tail'].includes(error.inventoryReason)) })
}))
test('a partial tail with a modification time in the future is stale-tail, not timing',()=>fixture(async(root,project)=>{
  const path=join(project,'future.jsonl'); await writeFile(path,JSON.stringify(row(window.startUtc))+'\n'+'{"type":"assistant"')
  const future=new Date('2099-01-01T00:00:00Z'); await utimes(path,future,future)
  await assert.rejects(discoverWindowFiles(context(root)), error => error.inventoryReason==='stale-tail')
}))

test('timing on one file never masks an integrity failure on another (final recheck and metrics)',()=>fixture(async(root,project)=>{
  const a=join(project,'a.jsonl'), b=join(project,'b.jsonl'), c=join(project,'c.jsonl')
  await save(a,[row(window.startUtc)]); await save(b,[row(window.startUtc)]); await save(c,[{...row(window.startUtc),marker:'third-file'}])
  await duringRead('third-file',async()=>{ await appendFile(a,JSON.stringify(row(window.startUtc))+'\n'); await rename(b,b+'.old'); await save(b,[row(window.startUtc),row(window.startUtc)]) })(async()=>{
    await assert.rejects(discoverWindowFiles(context(root)), error => error.inventoryReason==='source-consistency') })
  await rm(b+'.old'); await rm(a); await save(a,[row(window.startUtc)]); await save(b,[row(window.startUtc)])
  const files=await discoverWindowFiles(context(root))
  await appendFile(a,JSON.stringify(row(window.startUtc))+'\n'); await rename(b,b+'.old'); await save(b,[row(window.startUtc),row(window.startUtc)])
  await assert.rejects(collectCliMetrics({...context(root),files}), error => error.inventoryReason===undefined && error.scopeMismatch===true)
}))
test('the file being scanned growing during its own read is the timing reason source-changed',()=>fixture(async(root,project)=>{
  const a=join(project,'a.jsonl'); await save(a,[{...row(window.startUtc),marker:'self-file'}])
  await duringRead('self-file',()=>appendFile(a,JSON.stringify(row(window.startUtc))+'\n'))(async()=>{
    await assert.rejects(discoverWindowFiles(context(root)), error => error.inventoryReason==='source-changed') })
}))
test('a live partial tail never masks an invalid record in a later file',()=>fixture(async(root,project)=>{
  await writeFile(join(project,'a.jsonl'),JSON.stringify(row(window.startUtc))+'\n'+'{"type":"assistant"')
  await writeFile(join(project,'b.jsonl'),'not json\n')
  await assert.rejects(discoverWindowFiles(context(root)), error => error.inventoryReason==='invalid-record')
}))
test('metrics re-reads the prefix from the current file: a rewrite-and-grow right after its read is integrity',()=>fixture(async(root,project)=>{
  const a=join(project,'a.jsonl'); await save(a,[{...row(window.startUtc),marker:'metrics-read'}])
  const files=await discoverWindowFiles(context(root))
  await duringRead('metrics-read',async()=>{ const h=await open(a,'r+'); await h.write(Buffer.from(JSON.stringify({...row(window.startUtc),marker:'rewritten',x:'longer-record'})+'\n'),0); await h.close() })(async()=>{
    await assert.rejects(collectCliMetrics({...context(root),files}), error => error.inventoryReason===undefined && error.scopeMismatch===true) })
}))
test('prefixMatches rejects a same-prefix replacement with a new inode',()=>fixture(async(root,project)=>{
  const a=join(project,'a.jsonl'); await save(a,[row(window.startUtc)])
  const before=await stat(a), expected=createHash('sha256').update(await readFile(a)).digest('hex')
  assert.equal(await prefixMatches(a,before,expected),true)
  const content=await readFile(a); await rename(a,a+'.old'); await writeFile(a,Buffer.concat([content,Buffer.from(JSON.stringify(row(window.startUtc))+'\n')]))
  assert.equal(await prefixMatches(a,before,expected),false)
}))

test('prefixMatches does not trust a prefix read while the file keeps changing',()=>fixture(async(root,project)=>{
  const a=join(project,'a.jsonl'); await save(a,[{...row(window.startUtc),marker:'unstable'}])
  const before=await stat(a), expected=createHash('sha256').update(await readFile(a)).digest('hex')
  const probe=await open(a,'r'),prototype=Object.getPrototypeOf(probe),originalRead=prototype.read; await probe.close()
  const patched=mock.method(prototype,'read',async function(...args){ const result=await originalRead.apply(this,args); await appendFile(a,'{}\n'); return result })
  try { assert.equal(await prefixMatches(a,before,expected),false) } finally { patched.mock.restore() }
  assert.equal(await prefixMatches(a,before,expected),true)
}))
// Version 3 first-turn attestation for Claude sessions found in the installed scope.
const turn=(sessionId,uuid,parentUuid,timestamp,extra={})=>({type:'assistant',sessionId,uuid,parentUuid,timestamp,message:{id:`m-${uuid}`,stop_reason:'end_turn',usage:{input_tokens:uuid.length*10}},...extra})
const meta=sessionId=>({type:'attachment',sessionId})
const firstTurn=async root=>{const files=await discoverWindowFiles(context(root));return {files,result:await collectCliMetrics({...context(root),files})}}
test('a self-contained main transcript attests its first turn; its subagent files keep it complete',()=>fixture(async(root,project)=>{
  await save(join(project,'s.jsonl'),[meta('s'),turn('s','u1',null,'2026-01-02T01:00:00Z'),turn('s','u22',"u1",'2026-01-02T02:00:00Z')])
  await mkdir(join(project,'s','subagents'),{recursive:true})
  await save(join(project,'s','subagents','agent-a.jsonl'),[turn('s','sub1',null,'2026-01-02T01:30:00Z',{isSidechain:true}),turn('s','sub22','dangling-parent','2026-01-02T01:31:00Z',{isSidechain:true})])
  const {files,result}=await firstTurn(root)
  assert.deepEqual(files.map(f=>f.completeFromStart),[true,true])
  assert.equal(result.metricCapabilities.firstTurnTokens,'supported'); assert.equal(result.metrics.firstTurnTokens.count,1); assert.equal(result.metrics.firstTurnTokens.sum,20)
}))
test('first turns stay unproven for a dangling parent, a parented or compact-summary start, or two main files',async()=>{
  const cases={
    dangling:[[turn('s','u1',null,'2026-01-02T01:00:00Z'),turn('s','u2','missing','2026-01-02T02:00:00Z')]],
    parented:[[turn('s','u1','earlier','2026-01-02T01:00:00Z')]],
    compact:[[turn('s','u1',null,'2026-01-02T01:00:00Z',{isCompactSummary:true})]],
    'sidechain only':[[turn('s','u1',null,'2026-01-02T01:00:00Z',{isSidechain:true})]],
    'two mains':[[turn('s','u1',null,'2026-01-02T01:00:00Z')],[turn('s','u9',null,'2026-01-02T03:00:00Z')]],
    'no uuid':[[{...turn('s','u1',null,'2026-01-02T01:00:00Z'),uuid:undefined}]],
  }
  for(const [label,parts] of Object.entries(cases)) await fixture(async(root,project)=>{
    for(let i=0;i<parts.length;i++) await save(join(project,`${i}.jsonl`),parts[i])
    const {files,result}=await firstTurn(root)
    assert.ok(files.every(f=>f.completeFromStart===false),label); assert.equal(result.metricCapabilities.firstTurnTokens,'incomplete',label)
  })
})
test('a main transcript outside the window leaves its in-window subagent unproven',()=>fixture(async(root,project)=>{
  await save(join(project,'s.jsonl'),[turn('s','u1',null,'2026-01-01T01:00:00Z')])
  await mkdir(join(project,'s','subagents'),{recursive:true})
  await save(join(project,'s','subagents','agent-a.jsonl'),[turn('s','sub1',null,'2026-01-02T01:30:00Z',{isSidechain:true})])
  const {files,result}=await firstTurn(root)
  assert.equal(files.length,1); assert.equal(files[0].completeFromStart,false); assert.equal(result.metrics.firstTurnTokens.count,0)
}))
test('scanned Claude session IDs are collected for shared-log attribution only when requested',()=>fixture(async(root,project)=>{
  await save(join(project,'a.jsonl'),[turn('in-window','u1',null,'2026-01-02T01:00:00Z')]); await save(join(project,'b.jsonl'),[turn('older','u1',null,'2026-01-01T01:00:00Z')])
  const scannedSessions=new Set(); await discoverWindowFiles({...context(root),scannedSessions})
  assert.deepEqual([...scannedSessions].sort(),['in-window','older'])
}))
test('a same-session file without any uuid record keeps an otherwise proven main transcript unproven',()=>fixture(async(root,project)=>{
  await save(join(project,'main.jsonl'),[turn('s','u1',null,'2026-01-02T01:00:00Z')])
  await save(join(project,'fragment.jsonl'),[{...turn('s','x',null,'2026-01-02T02:00:00Z'),uuid:undefined}])
  const {files,result}=await firstTurn(root)
  assert.ok(files.every(f=>f.completeFromStart===false)); assert.equal(result.metricCapabilities.firstTurnTokens,'incomplete')
}))
test('prefixState tells a changed prefix from a file that never held still',()=>fixture(async(root,project)=>{
  const { prefixState } = await import('./inventory.mjs')
  const path=join(project,'a.jsonl'); await writeFile(path,'abc\n'); const before=await stat(path), expected=createHash('sha256').update('abc\n').digest('hex')
  assert.equal(await prefixState(path,before,expected),'match')
  assert.equal(await prefixState(path,before,createHash('sha256').update('xyz\n').digest('hex')),'mismatch')
  const timer=setInterval(()=>appendFile(path,'more\n').catch(()=>{}),0)
  try { const states=new Set(); for(let i=0;i<20;i++) states.add(await prefixState(path,before,expected,1)); assert.ok(!states.has('mismatch')) } finally { clearInterval(timer) }
}))
test('unread files: a same-size rewrite during the scan fails closed; their session names still attribute and block attestation',()=>fixture(async(root,project)=>{
  const fs=(await import('node:fs')).promises, { syncBuiltinESMExports } = await import('node:module'), realLstat=fs.lstat
  const old=join(project,'old.jsonl'); await save(old,[row('2026-01-01T12:00:00Z')]); await utimes(old,new Date('2026-01-01'),new Date('2026-01-01'))
  let fired=false
  fs.lstat=async (...args)=>{ if(!fired && String(args[0])===old){ fired=true; const h=await fs.open(old,'r+'); await h.write(Buffer.from('X'),0,1,0); await h.close() } return realLstat(...args) }; syncBuiltinESMExports()
  try { await assert.rejects(discoverWindowFiles(context(root)),error=>error.inventoryReason==='source-consistency') } finally { fs.lstat=realLstat; syncBuiltinESMExports() }
  await rm(old)
  // An old transcript of session "quiet": its name attributes guard rows even though it was not read.
  const quiet=join(project,'quiet-session.jsonl'); await save(quiet,[turn('quiet-session','q1',null,'2026-01-01T01:00:00Z')]); await utimes(quiet,new Date('2026-01-01'),new Date('2026-01-01'))
  const scannedSessions=new Set(); await discoverWindowFiles({...context(root),scannedSessions}); assert.ok(scannedSessions.has('quiet-session'))
}))
test('a session named in two approved projects is never attested from the recent copy alone',()=>fixture(async(root,project)=>{
  await mkdir(join(root,'second'))
  const scope={source:'claude-code',scope:{sessionsDir:root,projectSlugs:['allowed','second']},window}
  const earlier=join(root,'second','s.jsonl'); await save(earlier,[turn('s','e1',null,'2026-01-01T01:00:00Z')]); await utimes(earlier,new Date('2026-01-01'),new Date('2026-01-01'))
  await save(join(project,'s.jsonl'),[turn('s','u1',null,'2026-01-02T01:00:00Z')])
  const files=await discoverWindowFiles(scope); assert.equal(files.length,1); assert.equal(files[0].completeFromStart,false)
  await rm(earlier); assert.equal((await discoverWindowFiles(scope))[0].completeFromStart,true)
}))
test('Codex: another project\'s old session resuming during the scan keeps its exclusion path (not timing)',()=>fixture(async(root)=>{
  const fs=(await import('node:fs')).promises, { syncBuiltinESMExports } = await import('node:module'), realLstat=fs.lstat
  const config={source:'codex',scope:{sessionsDir:root,codexThreadSource:'aitk-agent:example'},window}
  const header=tag=>({type:'session_meta',payload:{thread_source:tag,cwd:'/work/x'}})
  const own=join(root,'agent.jsonl'), foreign=join(root,'human.jsonl')
  await save(own,[header('aitk-agent:example'),{type:'event_msg',timestamp:'2026-01-02T01:00:00Z',payload:{type:'token_count',info:{last_token_usage:{input_tokens:5}}}}])
  await save(foreign,[header('human')]); await utimes(foreign,new Date('2026-01-01'),new Date('2026-01-01'))
  let fired=false
  fs.lstat=async (...args)=>{ if(!fired && String(args[0])===foreign){ fired=true; await appendFile(foreign,JSON.stringify({type:'event_msg',timestamp:'2026-01-02T02:00:00Z'})+'\n') } return realLstat(...args) }; syncBuiltinESMExports()
  try { assert.deepEqual((await discoverWindowFiles(config)).map(f=>f.path),[own]) } finally { fs.lstat=realLstat; syncBuiltinESMExports() }
}))
