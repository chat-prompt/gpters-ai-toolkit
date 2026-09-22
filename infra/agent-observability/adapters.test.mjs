import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectCliMetrics, collectReadGuardMetrics, readRecords } from './metrics.mjs'
import { adaptRuntimeReceipts } from './runtime-receipts.mjs'
import { collectObservability } from './collect.mjs'
import { histogram,mergeHistograms } from './histogram.mjs'
const window={startUtc:'2026-01-02T00:00:00.000Z',endUtc:'2026-01-03T00:00:00.000Z'}
const before='2026-01-01T23:59:59.000Z',inside=window.startUtc,end=window.endUtc
const taskId='00000000-0000-4000-8000-000000000001',attemptId='00000000-0000-4000-8000-000000000002'
const binding={agentId:'example-agent',source:'codex',runtimeRunId:'private-run',taskId,attemptId}
const receipt=(overrides={})=>({agentId:binding.agentId,source:binding.source,runtimeRunId:binding.runtimeRunId,format:'process-v1',receiptId:'private-opaque',atUtc:inside,exitCode:0,...overrides})
const adapt=(records,bindings=[binding])=>adaptRuntimeReceipts({agentId:binding.agentId,source:binding.source,window,bindings,records})
async function fixture(t,groups) {
  const dir=await mkdtemp(join(tmpdir(),'observation-test-')); t.after(()=>rm(dir,{recursive:true,force:true}))
  const files=[]
  for (let i=0;i<groups.length;i++) {const path=join(dir,`${i}.jsonl`); await writeFile(path,groups[i].map(r=>typeof r==='string'?r:JSON.stringify(r)).join('\n')+'\n'); files.push({path,sessionKey:'private-session',completeFromStart:true})}
  return files
}
const claude=(id,tokens,timestamp=inside)=>({type:'assistant',timestamp,message:{id,stop_reason:'end_turn',usage:{input_tokens:tokens,cache_creation_input_tokens:10,cache_read_input_tokens:20}}})
test('exact run binding only; other source/agent and time overlap cannot attribute receipts',()=>{
 const a=adapt([receipt(),receipt({source:'hermes'}),receipt({agentId:'other'}),receipt({runtimeRunId:'other'})]); assert.equal(a.receipts.length,1); assert.equal(a.provenance.unmatchedRecords,3)
 assert.throws(()=>adapt([],[binding,{...binding,taskId:attemptId}]),/Ambiguous/)
})
test('scheduler success, process failure and Slack acceptance remain independent claims',()=>{
 const a=adapt([receipt({format:'scheduler-v1',status:'ok'}),receipt({exitCode:1}),receipt({format:'slack-api-v1',response:{ok:true,channel:'private-channel',ts:'123.456',message:{text:'secret text'}}})])
 assert.deepEqual(a.receipts.map(r=>r.claim).sort(),['api-accepted','process-exited','scheduler-completed']); assert.ok(a.receipts.some(r=>r.status==='failed'))
 const encoded=JSON.stringify(a); for(const secret of ['private-run','private-channel','secret text','123.456'])assert.ok(!encoded.includes(secret))
 assert.ok(a.receipts.every(r=>/^[a-f0-9-]{36}$/.test(r.receiptId)))
})
test('boundaries, missing timestamps, unknown shape, no API read receipt invented',()=>{
 const a=adapt([receipt({atUtc:before}),receipt({atUtc:end}),receipt({atUtc:null}),receipt({format:'mystery-v8'}),receipt({format:'slack-api-v1',response:{ok:true}})])
 assert.equal(a.receipts.length,0); assert.equal(a.provenance.missingTimestamps,1); assert.equal(a.provenance.unsupportedRecords,2)
})
test('replay dedup and conflicting receipt identities fail closed',()=>{
 assert.equal(adapt([receipt(),receipt()]).receipts.length,1)
 const a=adapt([receipt(),receipt({exitCode:1}),receipt()]);assert.equal(a.receipts.length,0);assert.equal(a.capability,'incomplete')
})
test('histograms merge exact sufficient statistics with overflow',()=>{
 const values=[0,3,100,1001,4000000];assert.deepEqual(mergeHistograms([histogram(values.slice(0,2)),histogram(values.slice(2))]),histogram(values))
 assert.throws(()=>mergeHistograms([{...histogram([1]),counts:[1]}]),/Incompatible/)
})
test('Claude full history prevents first in-window turn becoming first session turn',async t=>{
 const files=await fixture(t,[[claude('old',100,before),claude('new',200),claude('excluded',999,end)]])
 const a=await collectCliMetrics({source:'claude-code',files,window});assert.equal(a.metrics.firstTurnTokens.count,0);assert.equal(a.metrics.peakContextTokens.max,230)
})
test('Claude snapshots dedup across rotated files; complete snapshot wins',async t=>{
 const partial={...claude('same',100),message:{...claude('same',100).message,stop_reason:null}}
 const complete=claude('same',200);const files=await fixture(t,[[partial],[partial,complete]])
 const a=await collectCliMetrics({source:'claude-code',files,window}); assert.equal(a.metrics.firstTurnTokens.count,1);assert.equal(a.metrics.firstTurnTokens.sum,230);assert.equal(a.provenance.duplicates,2)
})
test('unknown first history stays incomplete and does not invent a first turn',async t=>{
 const files=await fixture(t,[[claude('a',10)]]);files[0].completeFromStart=false
 const a=await collectCliMetrics({source:'claude-code',files,window});assert.equal(a.metrics.firstTurnTokens.count,0);assert.equal(a.metricCapabilities.firstTurnTokens,'incomplete')
})
test('Codex last usage includes cache, tools count Unicode chars, compactions stay windowed',async t=>{
 const files=await fixture(t,[[{timestamp:inside,type:'event_msg',payload:{type:'token_count',info:{last_token_usage:{input_tokens:400,cached_input_tokens:300}}}},
 {timestamp:inside,type:'response_item',payload:{type:'function_call_output',call_id:'call',output:'안😀'}},
 {timestamp:inside,type:'event_msg',payload:{type:'context_compacted'}},{timestamp:end,type:'compacted'}]])
 const a=await collectCliMetrics({source:'codex',files,window});assert.equal(a.metrics.firstTurnTokens.sum,400);assert.equal(a.metrics.toolResultChars.sum,2);assert.equal(a.metrics.compactionEvents,1)
})
test('Claude tool result image/base64 excluded and repeated IDs dedup',async t=>{
 const r={type:'user',timestamp:inside,message:{content:[{type:'tool_result',tool_use_id:'x',content:[{type:'text',text:'abc'},{type:'image',source:{data:'SECRET'}}]}]}}
 const files=await fixture(t,[[r,{...r,timestamp:'2026-01-02T01:00:00.000Z'}]]);const a=await collectCliMetrics({source:'claude-code',files,window});assert.equal(a.metrics.toolResultChars.sum,3)
})
test('missing/unreadable/unsupported source stays null, observed no in-window results is zero',async t=>{
 const absent=await collectCliMetrics({source:'codex',files:[],window});assert.equal(absent.metrics.compactionEvents,null)
 const unsupported=await collectCliMetrics({source:'hermes',files:[],window});assert.equal(unsupported.capability,'unsupported')
 const files=await fixture(t,[[claude('old',10,before)]]);const a=await collectCliMetrics({source:'claude-code',files,window});assert.equal(a.metrics.compactionEvents,0)
 const missing=await collectCliMetrics({source:'claude-code',files:[{path:files[0].path+'missing',sessionKey:'s'}],window});assert.equal(missing.capability,'incomplete');assert.equal(missing.metrics.firstTurnTokens,null)
})
test('invalid JSON, unknown row, missing relevant timestamp make provenance incomplete',async t=>{
 const files=await fixture(t,[['{oops',claude('a',10),{type:'new-format'},claude('b',2,'bad')]])
 const a=await collectCliMetrics({source:'claude-code',files,window});assert.equal(a.capability,'incomplete');assert.equal(a.provenance.parseFailures,1);assert.equal(a.provenance.unsupportedRecords,1);assert.equal(a.provenance.missingTimestamps,1)
})
test('guard [start,end) counts, replay rotation dedup, missing log differs from zero',async t=>{
 const a={ts:inside,decision:'deny',path:'/private/SECRET',session:'s'}, old={ts:before,decision:'allow'}
 const files=await fixture(t,[[old,a],[a,{ts:end,decision:'deny'}]])
 const result=await collectReadGuardMetrics({files,window});assert.deepEqual(result.metrics,{readGuardAllow:0,readGuardDeny:1});assert.ok(!JSON.stringify(result).includes('SECRET'))
 assert.equal((await collectReadGuardMetrics({files:[],window})).metrics.readGuardAllow,null)
})
test('truncated trailing record and oversize source do not silently pass',async t=>{
 const files=await fixture(t,[[claude('a',10)]]);await writeFile(files[0].path,JSON.stringify(claude('tail',10)))
 assert.equal((await readRecords(files)).counters.parseFailures,1)
 assert.equal((await readRecords(files,{maxFileBytes:1})).counters.rotatedFiles,1)
})
test('realpath alias is read only once',async t=>{
 const files=await fixture(t,[[claude('a',10)]]);const alias=files[0].path+'.alias';await symlink(files[0].path,alias)
 const a=await collectCliMetrics({source:'claude-code',files:[files[0],{...files[0],path:alias}],window});assert.equal(a.metrics.firstTurnTokens.count,1);assert.equal(a.provenance.duplicates,1)
})
test('combined payload excludes private config and no unsupported Hermes CLI metric guessed',async()=>{
 const result=await collectObservability({agentId:'example-agent',source:'hermes',window})
 assert.equal(result.schemaVersion,1);assert.equal(result.metricCapabilities.firstTurnTokens,'unsupported');assert.deepEqual(result.receipts,[])
})
import { collectBootstrapMetrics } from './bootstrap.mjs'
import { appendFile, realpath, rename } from 'node:fs/promises'
test('shared guard log: only scanned sessions count, a missing rotated copy is normal, a missing log is not zero',async t=>{
 const dir=await realpath(await mkdtemp(join(tmpdir(),'shared-guard-'))); t.after(()=>rm(dir,{recursive:true,force:true}))
 const path=join(dir,'guard.jsonl'), row=(session,decision,ts=inside)=>JSON.stringify({ts,decision,session})+'\n', files=[{path,sessionKey:'g',sessionFilter:'installed-scope'}]
 await writeFile(path,row('own','deny')+row('other','allow')+row('other','weird-foreign-format')+row('own','allow',end))
 let result=await collectReadGuardMetrics({files,window,sessions:new Set(['own'])})
 assert.deepEqual(result.metrics,{readGuardAllow:0,readGuardDeny:1}); assert.equal(result.capability,'supported'); assert.equal(result.provenance.filesExpected,1)
 result=await collectReadGuardMetrics({files,window,sessions:new Set(['nobody'])}); assert.deepEqual(result.metrics,{readGuardAllow:0,readGuardDeny:0}); assert.equal(result.capability,'supported')
 await rename(path,path+'.1'); await writeFile(path,row('own','allow'))
 result=await collectReadGuardMetrics({files,window,sessions:new Set(['own'])}); assert.deepEqual(result.metrics,{readGuardAllow:1,readGuardDeny:1}); assert.equal(result.provenance.filesRead,2)
 await rm(path); result=await collectReadGuardMetrics({files,window,sessions:new Set(['own'])}); assert.equal(result.capability,'incomplete')
 // Without the scanned session set (static inventory) a shared log is never attributed.
 await writeFile(path,row('own','deny')); result=await collectReadGuardMetrics({files,window}); assert.equal(result.capability,'incomplete'); assert.equal(result.metrics.readGuardDeny,null)
})
test('shared guard log: a stable file ending mid-line is incomplete, not silently complete',async t=>{
 const dir=await realpath(await mkdtemp(join(tmpdir(),'shared-guard-'))); t.after(()=>rm(dir,{recursive:true,force:true}))
 const path=join(dir,'guard.jsonl'), row=decision=>JSON.stringify({ts:inside,decision,session:'own'})+'\n', files=[{path,sessionKey:'g',sessionFilter:'installed-scope'}]
 await writeFile(path,row('deny')); await appendFile(path,row('allow').slice(0,10))
 const result=await collectReadGuardMetrics({files,window,sessions:new Set(['own'])})
 assert.equal(result.provenance.parseFailures,1); assert.equal(result.capability,'incomplete'); assert.equal(result.metrics.readGuardDeny,1)
})
test('boot reports: absent config adds nothing, other runtimes are unsupported, unreadable sources are missing not zero',async t=>{
 assert.equal(await collectBootstrapMetrics({source:'claude-code',window,reports:undefined}),undefined)
 assert.deepEqual(await collectBootstrapMetrics({source:'codex',window,reports:{path:'/nowhere'}}),{value:null,capability:'unsupported'})
 await assert.rejects(collectBootstrapMetrics({source:'claude-code',window,reports:{path:'/nowhere/agent.sqlite'}}),error=>error.inventoryReason==='source-consistency')
 const dir=await realpath(await mkdtemp(join(tmpdir(),'boot-'))); t.after(()=>rm(dir,{recursive:true,force:true}))
 const { DatabaseSync } = await import('node:sqlite'), path=join(dir,'agent.sqlite'), db=new DatabaseSync(path)
 db.exec('create table session_nodes (session_key text primary key, entry_json text not null)')
 const at=Date.parse('2026-01-02T03:00:00Z'), report=extra=>JSON.stringify({systemPromptReport:{generatedAt:at,provider:'claude-cli',bootstrapMaxChars:32000,bootstrapTruncation:{warningShown:true,truncatedFiles:1,nearLimitFiles:0},injectedWorkspaceFiles:[{rawChars:40000,truncated:true},{missing:true,truncated:false}],...extra}})
 db.prepare('insert into session_nodes values (?,?)').run('ok',report({}))
 let result=await collectBootstrapMetrics({source:'claude-code',window,reports:{path}})
 assert.deepEqual(result,{capability:'supported',value:{sessions:1,truncatedSessions:1,nearLimitSessions:0,warningSessions:1,largestFileCharsMax:40000,largestFileCharsLatest:40000,fileCharsLimit:32000}})
 db.prepare('insert into session_nodes values (?,?)').run('bad',report({bootstrapMaxChars:'32000'})); db.close()
 result=await collectBootstrapMetrics({source:'claude-code',window,reports:{path}}); assert.equal(result.capability,'incomplete'); assert.equal(result.value.sessions,1)
 result=await collectBootstrapMetrics({source:'claude-code',window:{startUtc:'2026-01-05T00:00:00.000Z',endUtc:'2026-01-06T00:00:00.000Z'},reports:{path}})
 assert.deepEqual(result,{capability:'supported',value:{sessions:0,truncatedSessions:0,nearLimitSessions:0,warningSessions:0,largestFileCharsMax:null,largestFileCharsLatest:null,fileCharsLimit:null}})
})
test('boot reports: mistimed or unattributed reports are malformed, other runtimes are skipped, busy is incomplete, a wrong schema fails closed',async t=>{
 const dir=await realpath(await mkdtemp(join(tmpdir(),'boot-'))); t.after(()=>rm(dir,{recursive:true,force:true}))
 const { DatabaseSync } = await import('node:sqlite'), path=join(dir,'agent.sqlite'), db=new DatabaseSync(path)
 db.exec('create table session_nodes (session_key text primary key, entry_json text not null)')
 const insert=(key,report)=>db.prepare('insert into session_nodes values (?,?)').run(key,JSON.stringify({systemPromptReport:report}))
 const good={generatedAt:Date.parse('2026-01-02T03:00:00Z'),provider:'claude-cli',bootstrapMaxChars:32000,bootstrapTruncation:{warningShown:false,truncatedFiles:0,nearLimitFiles:0},injectedWorkspaceFiles:[{rawChars:100,truncated:false}]}
 insert('codex',{...good,provider:'codex'})
 let result=await collectBootstrapMetrics({source:'claude-code',window,reports:{path}}); assert.equal(result.capability,'supported'); assert.equal(result.value.sessions,0)
 insert('string-time',{...good,generatedAt:'2026-01-02T03:00:00Z'})
 result=await collectBootstrapMetrics({source:'claude-code',window,reports:{path}}); assert.equal(result.capability,'incomplete'); assert.equal(result.value.sessions,0)
 db.exec("delete from session_nodes where session_key='string-time'"); insert('no-provider',{...good,provider:undefined})
 result=await collectBootstrapMetrics({source:'claude-code',window,reports:{path}}); assert.equal(result.capability,'incomplete')
 db.exec('begin exclusive')
 result=await collectBootstrapMetrics({source:'claude-code',window,reports:{path}},{busyTimeoutMs:10}); assert.deepEqual(result,{value:null,capability:'incomplete'})
 db.exec('rollback'); db.exec('drop table session_nodes'); db.close()
 await assert.rejects(collectBootstrapMetrics({source:'claude-code',window,reports:{path}}),error=>error.inventoryReason==='source-consistency')
})
test('shared guard log: rotation or append between reads is timing, a rewrite or symlink fails closed, duplicates count once',async t=>{
 const fs=(await import('node:fs')).promises, { syncBuiltinESMExports } = await import('node:module')
 const dir=await realpath(await mkdtemp(join(tmpdir(),'shared-guard-'))); t.after(()=>rm(dir,{recursive:true,force:true}))
 const path=join(dir,'guard.jsonl'), row=(decision,n=0)=>JSON.stringify({ts:inside,decision,session:'own',n})+'\n', files=[{path,sessionKey:'g',sessionFilter:'installed-scope'}]
 const collect=()=>collectReadGuardMetrics({files,window,sessions:new Set(['own'])})
 const realOpen=fs.open
 const once=async (hook,fn)=>{ let fired=false; fs.open=async (...args)=>{ const handle=await realOpen(...args); if(!fired && String(args[0])===path){ fired=true; await hook() } return handle }; syncBuiltinESMExports(); try { return await fn() } finally { fs.open=realOpen; syncBuiltinESMExports() } }
 // Rotation right after the active log was opened: the view would miss rows, so it is timing.
 await writeFile(path,row('deny'))
 await once(async()=>{ await rename(path,path+'.1'); await writeFile(path,'') }, ()=>assert.rejects(collect(),error=>error.inventoryReason==='source-changed'))
 await rm(path+'.1'); await writeFile(path,row('deny'))
 await once(()=>appendFile(path,row('allow')), ()=>assert.rejects(collect(),error=>error.inventoryReason==='source-changed'))
 await writeFile(path,row('deny',1)+row('allow',2))
 await once(()=>fs.truncate(path,5), ()=>assert.rejects(collect(),error=>error.inventoryReason==='source-consistency'))
 await writeFile(path+'.1',row('deny',3)); await writeFile(path,row('deny',3)+row('allow',4))
 let result=await collect(); assert.deepEqual(result.metrics,{readGuardAllow:1,readGuardDeny:1}); assert.equal(result.provenance.duplicates,1)
 await rm(path); await symlink(path+'.1',path); await assert.rejects(collect(),error=>error.inventoryReason==='source-consistency')
})
