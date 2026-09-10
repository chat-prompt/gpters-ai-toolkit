// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { decodeIncidentHistoryCursor, incidentHistoryPage, incidentHistoryQuerySchema } from '../../../../packages/lib/src/features/ax/incident-history'

const row = (n: number) => ({ id: `case-${String(n).padStart(3, '0')}`, revision: 2, cursorAt: '2026-01-01T00:00:00.123456Z',
  record: { agentId: 'example', source: 'codex', state: 'needs-info', phase: 'execution', report: { title: 'Example', pendingReview: false, inputDigest: 'secret-hash', approvalUrl: 'private:link' }, history: [{ actor: 'private-actor', reason: 'private-note' }] } })
describe('saved incident history pagination', () => {
  it('accepts dotted and namespaced telemetry agent identifiers without allowing path or query characters', () => {
    expect(incidentHistoryQuerySchema.parse({ agent: 'example.agent:worker-1' })).toEqual({ agent: 'example.agent:worker-1' })
    expect(incidentHistoryQuerySchema.parse({ agent: 'Legacy_Agent' }).agent).toBe('Legacy_Agent')
    for (const agent of ['example/agent', 'example?agent', 'example agent', 'x'.repeat(101)]) expect(incidentHistoryQuerySchema.safeParse({ agent }).success).toBe(false)
  })
  it('returns 50 rows, retaining microseconds and the final ID in the next cursor', () => {
    const rows = Array.from({ length: 51 }, (_, n) => row(51 - n))
    const page = incidentHistoryPage(rows, { source: 'codex' })
    expect(page.items).toHaveLength(50)
    expect(decodeIncidentHistoryCursor({ source: 'codex', cursor: page.nextCursor! })).toMatchObject({ at: row(2).cursorAt, id: 'case-002' })
    expect(incidentHistoryPage(rows.slice(0, 50), {}).nextCursor).toBeNull()
    expect(incidentHistoryPage([], {}).items).toEqual([])
  })
  it('returns summaries without report payloads, private evidence or reviewer identities', () => {
    const serialized = JSON.stringify(incidentHistoryPage([row(1)], {}))
    expect(serialized).toContain('Example')
    for (const value of ['secret-hash', 'private:link', 'private-actor', 'private-note']) expect(serialized).not.toContain(value)
  })
  it('binds cursor to filters and rejects unknown fields and malformed cursors', () => {
    const page = incidentHistoryPage(Array.from({ length: 51 }, (_, n) => row(n)), { state: 'needs-info' })
    expect(() => decodeIncidentHistoryCursor({ cursor: page.nextCursor!, state: 'confirmed' })).toThrow('cursor')
    expect(() => decodeIncidentHistoryCursor({ cursor: 'garbage' })).toThrow('cursor')
    for (const query of [{ limit: '10000' }, { state: 'all' }, { agent: 'example OR true' }, { source: 'anything' }, { cursor: 'x'.repeat(4097) }]) expect(incidentHistoryQuerySchema.safeParse(query).success).toBe(false)
  })
})
