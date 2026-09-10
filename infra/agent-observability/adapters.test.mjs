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
