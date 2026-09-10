#!/usr/bin/env node
/** Offline review helper only; never sends, commits checkpoints or mutates a pending batch. Node >=24. */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { agentObservabilitySchema } from '../../packages/lib/src/features/ax/agent-observability-contract.ts'
export function enrichBatch(batch, observation) {
  const parsed = agentObservabilitySchema.parse(observation)
  if (!batch || typeof batch !== 'object' || Array.isArray(batch) || !batch.collection || batch.collection.observability !== undefined) throw new Error('Expected an unmodified batch without an observation sidecar')
  if (batch.agentId !== parsed.agentId || batch.collection.source !== parsed.source || batch.window?.startUtc !== parsed.window.startUtc || batch.window?.endUtc !== parsed.window.endUtc) throw new Error('Observation scope/window differs from batch')
  const collectedAt = Date.parse(batch.collectedAtUtc)
  if (!Number.isFinite(collectedAt) || parsed.receipts.some(receipt => Date.parse(receipt.atUtc) > collectedAt)) throw new Error('Receipt follows collection time')
  return {...batch,collection:{...batch.collection,observability:parsed}}
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 6 || process.argv[2] !== '--batch' || process.argv[4] !== '--observation') throw new Error('Expected batch and observation files')
    const [batch,observation] = await Promise.all([readFile(process.argv[3],'utf8'),readFile(process.argv[5],'utf8')])
    process.stdout.write(JSON.stringify(enrichBatch(JSON.parse(batch),JSON.parse(observation)))+'\n')
  } catch { process.stderr.write('Offline batch enrichment failed validation; original files were not changed.\n');process.exitCode=1 }
}
