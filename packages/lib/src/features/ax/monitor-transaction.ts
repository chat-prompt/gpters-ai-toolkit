import { reduceMonitor } from './monitor-engine'
import type { MonitorInput, MonitorPolicy, MonitorResult } from './monitor-types'

/** The adapter's revision covers operator reviews as well as monitor writes. */
export interface MonitorSnapshot<Claim = unknown> {
  revision: string
  input: Omit<MonitorInput, 'now' | 'policy'>
  /** Exact unprocessed batch identities to acknowledge with this commit. */
  claim: Claim
}
export interface MonitorPersistence<Claim = unknown> {
  load(): Promise<MonitorSnapshot<Claim>>
  /**
   * CAS must atomically persist projection, event dedup, cursor, claimed batch
   * receipts and outbox unique IDs. Return false without writes on conflict.
   * Sending notifications is a separate outbox dispatcher, never part of CAS.
   */
  commit(snapshot: MonitorSnapshot<Claim>, result: MonitorResult): Promise<boolean>
}
/** Retries re-read the human decisions, cursor and batch claim; never reuse stale state. */
export async function runMonitorTransaction<Claim>(
  persistence: MonitorPersistence<Claim>, options: { now: string; policy: MonitorPolicy; maxAttempts?: number },
): Promise<MonitorResult> {
  const maxAttempts = options.maxAttempts ?? 3
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('Invalid monitor retry limit')
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const snapshot = await persistence.load()
    const result = reduceMonitor({ ...snapshot.input, now: options.now, policy: options.policy })
    if (await persistence.commit(snapshot, result)) return result
  }
  throw new Error('Monitor transaction contention; no stale projection committed')
}
