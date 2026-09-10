import { test } from 'node:test'
import assert from 'node:assert/strict'
import contract from './contract.ts'
const { agentObservabilitySchema } = contract
// The local helpers intentionally need only the Node runtime.
// @ts-ignore JavaScript adapter contract is checked below at the public boundary.
import { collectObservability } from './collect.mjs'
// @ts-ignore See above.
import { histogram } from './histogram.mjs'
const config={agentId:'example-agent',source:'codex',window:{startUtc:'2026-01-02T00:00:00.000Z',endUtc:'2026-01-03T00:00:00.000Z'}}
test('helper emits valid canonical optional contract',async()=>{
 const value=await collectObservability(config);assert.equal(agentObservabilitySchema.safeParse(value).success,true)
 assert.equal(agentObservabilitySchema.safeParse({...value,path:'/private'}).success,false)
})
test('histograms and metric capabilities cannot misrepresent missing data',async()=>{
 const value=await collectObservability(config)
 value.metrics.firstTurnTokens=histogram([10]);assert.equal(agentObservabilitySchema.safeParse(value).success,false)
 value.metricCapabilities.firstTurnTokens='supported';assert.equal(agentObservabilitySchema.safeParse(value).success,true)
 value.metrics.firstTurnTokens.counts[0]++;assert.equal(agentObservabilitySchema.safeParse(value).success,false)
})
test('receipt claim/identity/window limits are validated',async()=>{
 const value=await collectObservability(config)
 const receipt={receiptId:'00000000-0000-4000-8000-000000000001',taskId:'00000000-0000-4000-8000-000000000002',attemptId:'00000000-0000-4000-8000-000000000003',atUtc:config.window.startUtc,kind:'scheduler',status:'succeeded',evidence:'scheduler',claim:'scheduler-completed'}
 value.receipts=[receipt];assert.equal(agentObservabilitySchema.safeParse(value).success,true)
 receipt.claim='process-exited';assert.equal(agentObservabilitySchema.safeParse(value).success,false)
 receipt.claim='scheduler-completed';receipt.atUtc=config.window.endUtc;assert.equal(agentObservabilitySchema.safeParse(value).success,false)
 receipt.atUtc=config.window.startUtc;value.receipts=[receipt,receipt];assert.equal(agentObservabilitySchema.safeParse(value).success,false)
})
