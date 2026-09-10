import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, utimes, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverWindowFiles } from './inventory.mjs'
import { collectCliMetrics } from './metrics.mjs'
const window={startUtc:'2026-01-02T00:00:00.000Z',endUtc:'2026-01-03T00:00:00.000Z'}
const row=timestamp=>({type:'assistant',timestamp,message:{id:'m',stop_reason:'end_turn',usage:{input_tokens:42}}})
async function fixture(fn) { const root=await realpath(await mkdtemp(join(tmpdir(),'dynamic-inventory-'))); const project=join(root,'allowed'); await mkdir(project); try { await fn(root,project) } finally { await rm(root,{recursive:true,force:true}) } }
const context=root=>({source:'claude-code',scope:{sessionsDir:root,projectSlugs:['allowed']},window})
const save=(path,rows)=>writeFile(path,rows.map(v=>JSON.stringify(v)).join('\n')+'\n')
test('discovers a new file on the next batch and uses record timestamps despite old mtime',()=>fixture(async(root,project)=>{
  await save(join(project,'old.jsonl'),[row('2026-01-01T12:00:00Z')]); assert.equal((await discoverWindowFiles(context(root))).length,0)
  const fresh=join(project,'new.jsonl'); await save(fresh,[row('2026-01-02T12:00:00Z')]); await utimes(fresh,new Date('2000-01-01'),new Date('2000-01-01'))
  const files=await discoverWindowFiles(context(root)); assert.equal(files.length,1); assert.equal(files[0].path,fresh); assert.equal(files[0].completeFromStart,false)
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
