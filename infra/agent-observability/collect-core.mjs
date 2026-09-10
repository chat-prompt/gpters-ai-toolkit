/** Pure collection export shared by offline CLI and the managed bridge bundle. */
import { collectCliMetrics, collectReadGuardMetrics } from './metrics.mjs'
import { adaptRuntimeReceipts } from './runtime-receipts.mjs'
export async function collectObservability(config) {
  const { agentId, source, window, cliFiles = [], readGuardFiles = [], runtimeBindings = [], runtimeRecords = [], scope } = config
  const runtime = adaptRuntimeReceipts({agentId,source,window,bindings:runtimeBindings,records:runtimeRecords})
  const [cli,readGuard] = await Promise.all([collectCliMetrics({source,window,files:cliFiles,scope}),collectReadGuardMetrics({window,files:readGuardFiles})])
  return {schemaVersion:1,agentId,source,window:{startUtc:new Date(window.startUtc).toISOString(),endUtc:new Date(window.endUtc).toISOString()},
    capabilities:{runtimeReceipts:runtime.capability,cliMetrics:cli.capability,readGuard:readGuard.capability},
    receipts:runtime.receipts,metrics:{...cli.metrics,...readGuard.metrics},metricCapabilities:{...cli.metricCapabilities,...readGuard.metricCapabilities},
    provenance:{adapterVersion:'1',cli:cli.provenance,readGuard:readGuard.provenance,runtime:runtime.provenance}}
}
