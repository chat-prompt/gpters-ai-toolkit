#!/usr/bin/env node
/** Read-only repo helper. Config contains private exact source paths; output contains only bounded aggregates. */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { collectCliMetrics, collectReadGuardMetrics } from './metrics.mjs'
import { adaptRuntimeReceipts } from './runtime-receipts.mjs'
export async function collectObservability(config) {
  const { agentId, source, window, cliFiles = [], readGuardFiles = [], runtimeBindings = [], runtimeRecords = [] } = config
  const runtime = adaptRuntimeReceipts({agentId,source,window,bindings:runtimeBindings,records:runtimeRecords})
  const [cli,readGuard] = await Promise.all([collectCliMetrics({source,window,files:cliFiles}),collectReadGuardMetrics({window,files:readGuardFiles})])
  return {schemaVersion:1,agentId,source,window:{startUtc:new Date(window.startUtc).toISOString(),endUtc:new Date(window.endUtc).toISOString()},
    capabilities:{runtimeReceipts:runtime.capability,cliMetrics:cli.capability,readGuard:readGuard.capability},
    receipts:runtime.receipts,metrics:{...cli.metrics,...readGuard.metrics},metricCapabilities:{...cli.metricCapabilities,...readGuard.metricCapabilities},
    provenance:{adapterVersion:'1',cli:cli.provenance,readGuard:readGuard.provenance,runtime:runtime.provenance}}
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--config') throw new Error('Expected --config')
    const config = JSON.parse(await readFile(process.argv[3],'utf8'))
    process.stdout.write(JSON.stringify(await collectObservability(config))+'\n')
  } catch { process.stderr.write('Observation collection failed; check the private config and source format.\n'); process.exitCode=1 }
}
