/** Pure collection export shared by offline CLI and the managed bridge bundle. */
import { collectCliMetrics, collectReadGuardMetrics } from './metrics.mjs'
import { adaptRuntimeReceipts } from './runtime-receipts.mjs'
import { discoverWindowFiles } from './inventory.mjs'
import { collectBootstrapMetrics } from './bootstrap.mjs'
/** The helper re-checks the probe settings it was given: a Claude collector, a Slack channel ID, a bracketed marker. */
function validProbe(probe,source) {
  if(source!=='claude-code' || !probe || typeof probe!=='object' || Object.keys(probe).some(key=>!['channel','marker'].includes(key))
    || typeof probe.channel!=='string' || !/^[A-Z0-9]{9,12}$/.test(probe.channel) || typeof probe.marker!=='string' || !/^\[[A-Z0-9-]{3,32}\]$/.test(probe.marker)) {
    const error=new Error('Invalid boot probe'); error.inventoryReason='source-consistency'; throw error
  }
  return {channel:probe.channel,marker:probe.marker}
}
export async function collectObservability(config) {
  const { agentId, source, window, cliFiles = [], readGuardFiles = [], runtimeBindings = [], runtimeRecords = [], scope, bootstrapReports, bootProbe } = config
  if(config.cliInventory!==undefined && (config.cliInventory!=='installed-scope' || cliFiles.length)) throw new Error('Invalid dynamic inventory')
  // Session IDs stay inside the helper: they only attribute rows of a shared hook log to this agent.
  const scannedSessions=new Set()
  // Every source is checked before a timing result is reported, so a live append in one source never masks an
  // integrity failure in another: the first non-timing failure wins, otherwise the first timing failure.
  const TIMING=['source-changed','partial-tail'], failures=[]
  const settle=async work=>{ try { return await work() } catch(error) { failures.push(error); return undefined } }
  const selectedCliFiles=config.cliInventory==='installed-scope' ? await settle(()=>discoverWindowFiles({source,scope,window,scannedSessions})) : cliFiles
  // An integrity failure found by discovery is final: report it before other sources can outlast the time limit.
  if(failures.some(error=>!TIMING.includes(error?.inventoryReason))) throw failures[0]
  const runtime = adaptRuntimeReceipts({agentId,source,window,bindings:runtimeBindings,records:runtimeRecords})
  // The daily boot probe is recognized from each transcript's own first message (channel and marker, never uploaded).
  const probe=bootProbe===undefined ? undefined : validProbe(bootProbe,source)
  const [cli,readGuard,bootstrap] = await Promise.all([settle(()=>collectCliMetrics({source,window,files:selectedCliFiles ?? [],scope,probe})),
    settle(()=>collectReadGuardMetrics({window,files:readGuardFiles,sessions:config.cliInventory==='installed-scope' ? scannedSessions : undefined})),
    settle(()=>collectBootstrapMetrics({source,window,reports:bootstrapReports}))])
  if(failures.length) throw failures.find(error=>!TIMING.includes(error?.inventoryReason)) ?? failures[0]
  return {schemaVersion:1,agentId,source,window:{startUtc:new Date(window.startUtc).toISOString(),endUtc:new Date(window.endUtc).toISOString()},
    capabilities:{runtimeReceipts:runtime.capability,cliMetrics:cli.capability,readGuard:readGuard.capability},
    receipts:runtime.receipts,
    metrics:{...cli.metrics,...readGuard.metrics,...(bootstrap ? {bootstrap:bootstrap.value} : {})},
    metricCapabilities:{...cli.metricCapabilities,...readGuard.metricCapabilities,...(bootstrap ? {bootstrap:bootstrap.capability} : {})},
    // Version 3: Claude sessions discovered in scope can attest their first turn (see README).
    provenance:{adapterVersion:'3',cli:cli.provenance,readGuard:readGuard.provenance,runtime:runtime.provenance}}
}
