import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enrichBatch } from './enrich-batch.mjs'
import { collectObservability } from './collect.mjs'
const window={startUtc:'2026-01-02T00:00:00.000Z',endUtc:'2026-01-03T00:00:00.000Z'}
test('offline enrichment copies batch and requires exact window/source without overwriting',async()=>{
 const observation=await collectObservability({agentId:'example-agent',source:'codex',window})
 const batch={agentId:'example-agent',window,collectedAtUtc:window.endUtc,collection:{source:'codex'}}
 const enriched=enrichBatch(batch,observation);assert.equal(batch.collection.observability,undefined);assert.deepEqual(enriched.collection.observability,observation)
 assert.throws(()=>enrichBatch({...batch,collection:{source:'hermes'}},observation),/scope/)
 assert.throws(()=>enrichBatch({...batch,agentId:'another-agent'},observation),/scope/)
 assert.throws(()=>enrichBatch({...batch,window:{...window,startUtc:'2026-01-01T00:00:00.000Z'}},observation),/scope/)
 assert.throws(()=>enrichBatch(enriched,observation),/unmodified/)
})
