#!/usr/bin/env node
/** Pinned child helper: no credentials, network, checkpoint or batch mutation. */
import { collectObservability } from './collect-core.mjs'
import { agentObservabilitySchema } from '../../packages/lib/src/features/ax/agent-observability-contract.ts'
import { createReadStream } from 'node:fs'

const chunks = []
let size = 0
try {
  const stream = process.env.AITK_OBSERVATION_INPUT_FD === '3' ? createReadStream('', { fd: 3, autoClose: false }) : process.stdin
  for await (const chunk of stream) {
    chunks.push(chunk)
    size += chunk.length
    if (size > 262144) throw new Error('Input too large')
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  const observation = agentObservabilitySchema.parse(await collectObservability(input))
  if (observation.agentId !== input.agentId || observation.source !== input.source || observation.window.startUtc !== input.window.startUtc || observation.window.endUtc !== input.window.endUtc) throw new Error('Scope changed')
  process.stdout.write(JSON.stringify(observation))
} catch {
  process.stderr.write('Observation bridge failed validation; no batch was sent.\n')
  process.exitCode = 1
}
