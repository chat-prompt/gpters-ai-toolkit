/** Pure collection export shared by offline CLI and the managed bridge bundle. */
import { collectCliMetrics, collectReadGuardMetrics } from './metrics.mjs'
import { adaptRuntimeReceipts } from './runtime-receipts.mjs'
import { discoverWindowFiles } from './inventory.mjs'
import { collectBootstrapMetrics } from './bootstrap.mjs'
export async function collectObservability(config) {
  const { agentId, source, window, cliFiles = [], readGuardFiles = [], runtimeBindings = [], runtimeRecords = [], scope, bootstrapReports } = config
  if(config.cliInventory!==undefined && (config.cliInventory!=='installed-scope' || cliFiles.length)) throw new Error('Invalid dynamic inventory')
  // Session IDs stay inside the helper: they only attribute rows of a shared hook log to this agent.
  const scannedSessions=new Set()
  const selectedCliFiles=config.cliInventory==='installed-scope' ? await discoverWindowFiles({source,scope,window,scannedSessions}) : cliFiles
  const runtime = adaptRuntimeReceipts({agentId,source,window,bindings:runtimeBindings,records:runtimeRecords})
  const [cli,readGuard,bootstrap] = await Promise.all([collectCliMetrics({source,window,files:selectedCliFiles,scope}),
    collectReadGuardMetrics({window,files:readGuardFiles,sessions:config.cliInventory==='installed-scope' ? scannedSessions : undefined}),
    collectBootstrapMetrics({source,window,reports:bootstrapReports})])
  return {schemaVersion:1,agentId,source,window:{startUtc:new Date(window.startUtc).toISOString(),endUtc:new Date(window.endUtc).toISOString()},
    capabilities:{runtimeReceipts:runtime.capability,cliMetrics:cli.capability,readGuard:readGuard.capability},
    receipts:runtime.receipts,
    metrics:{...cli.metrics,...readGuard.metrics,...(bootstrap ? {bootstrap:bootstrap.value} : {})},
    metricCapabilities:{...cli.metricCapabilities,...readGuard.metricCapabilities,...(bootstrap ? {bootstrap:bootstrap.capability} : {})},
    // Version 3: Claude sessions discovered in scope can attest their first turn (see README).
    provenance:{adapterVersion:'3',cli:cli.provenance,readGuard:readGuard.provenance,runtime:runtime.provenance}}
}
