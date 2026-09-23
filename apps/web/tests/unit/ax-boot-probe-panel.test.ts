/**
 * The boot probe registry panel: organization-readable (so MCP readers such as a nightly report can use it), hidden
 * from tabs, and carrying only the compact probe series, while full observations stay admin-only.
 */
import { describe, expect, it, vi } from 'vitest'

const { loadAgentObservations } = vi.hoisted(() => ({ loadAgentObservations: vi.fn() }))
vi.mock('../../../../packages/lib/src/features/ax/observation-trends', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../packages/lib/src/features/ax/observation-trends')>()
  return { ...actual, loadAgentObservations }
})
import { getAxPanel } from '../../../../packages/lib/src/features/ax/registry'

describe('boot probe panel', () => {
  it('is an organization panel hidden from tabs; full observations stay admin-only', () => {
    expect(getAxPanel('boot-probe')?.meta).toMatchObject({ visibility: 'org', hidden: true, usesPeriod: true })
    expect(getAxPanel('agent-observations')?.meta.visibility).toBe('admin')
  })
  it('returns only the probe series for a non-admin reader, and an error without details when loading fails', async () => {
    const stream = { agentId: 'example-agent', source: 'claude-code', adapterVersion: '3', latestAt: '2026-01-02T03:00:00.000Z', pointsTruncated: false, excludedOverlaps: 0, conflictingWindows: 0,
      summary: { metrics: { bootstrap: { sessions: 1, truncatedSessions: 0, largestFileCharsMax: 27482, largestFileCharsLatest: 27482, fileCharsLimit: 32000 } }, metricCapabilities: { probeFirstTurnTokens: 'supported', bootstrap: 'supported' } },
      points: [{ startUtc: '2026-01-02T02:00:00.000Z', endUtc: '2026-01-02T03:00:00.000Z', metrics: { probeFirstTurnTokens: { count: 1, sum: 102068 }, firstTurnTokens: { count: 9, sum: 1 }, bootstrap: { sessions: 1, truncatedSessions: 0, largestFileCharsLatest: 27482, fileCharsLimit: 32000 } }, metricCapabilities: { probeFirstTurnTokens: 'supported' } }] }
    loadAgentObservations.mockResolvedValueOnce({ streams: [stream, { ...stream, agentId: 'no-probe', summary: { metricCapabilities: {} } }], coverage: { truncated: false, rowsTruncated: false } })
    const result = await getAxPanel('boot-probe')!.load({ days: 7, isAdmin: false })
    expect(result).toMatchObject({ status: 'ok', data: { truncated: false, bootProbes: [{ agentId: 'example-agent', points: [{ endUtc: '2026-01-02T03:00:00.000Z', count: 1, sum: 102068 }], measuredWindows: 1, pointsTruncated: false,
      bootFiles: { latestChars: 27482, limitChars: 32000, headroomChars: 4518, truncatedSessions: 0, truncatedWindows: [] } }] } })
    expect(JSON.stringify(result)).not.toContain('firstTurnTokens')
    expect(loadAgentObservations).toHaveBeenCalledWith(expect.objectContaining({ days: '7' }), expect.any(Date), { probeOnly: true })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    loadAgentObservations.mockRejectedValueOnce(new Error('db down'))
    const failed = await getAxPanel('boot-probe')!.load({ days: 7, isAdmin: false })
    expect(failed.status).toBe('error'); expect(JSON.stringify(failed)).not.toContain('db down')
  })
})
