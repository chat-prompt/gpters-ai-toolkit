// @vitest-environment node
/** Opt-in only: disposable local DB containing migration 0040, no shared data. */
import { afterAll, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
const enabled = process.env.RUN_ISOLATED_INCIDENT_TESTS === 'true'
if (enabled) {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '')
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/ax_incident_test_20260910' || process.env.DATABASE_DRIVER !== 'postgres-js') throw new Error('Disposable local incident DB required')
}
const mocks = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('../../../../packages/lib/src/features/ax/agent-activity', () => ({agentActivityPanel:{load:mocks.load}}))
import { db, closeDatabase } from '@gpters/db'
import { readIncidentReview, saveIncidentReview } from '../../../../packages/lib/src/features/ax/incident-review-store'

describe.skipIf(!enabled)('incident ledger on isolated PostgreSQL', () => {
  afterAll(async () => { await closeDatabase() })
  it('saves only one concurrent decision and keeps state/history after reconnect', async () => {
    const count = await db.execute(sql`SELECT current_database() AS name, (SELECT count(*) FROM ax_incident_reviews)::int AS count`)
    expect(count.rows[0]).toEqual({name:'ax_incident_test_20260910',count:0})
    const at = new Date(Date.now()-3600000).toISOString()
    mocks.load.mockResolvedValue({status:'ok',data:{taskTraceCoverage:{limitPerStream:100,truncatedStreams:[]},taskTraces:[{agentId:'test-example',source:'codex',taskId:'test-task',events:[{eventId:'test-event',taskId:'test-task',attemptId:'test-attempt',phase:'execution',status:'failed',evidence:'process',atUtc:at}]}]}})
    const [candidate] = (await readIncidentReview(7)).cases
    const action = {id:candidate.id,revision:0,days:7 as const,action:'confirmed' as const,reason:'isolated verification',evidenceRef:'private:test'}
    const results = await Promise.allSettled([saveIncidentReview(action,'reviewer-1'),saveIncidentReview(action,'reviewer-2')])
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
    expect(results.filter(r=>r.status==='rejected')).toHaveLength(1)
    await closeDatabase()
    const [saved] = (await readIncidentReview(7)).cases
    expect(saved.state).toBe('confirmed'); expect(saved.revision).toBe(1); expect(saved.history).toHaveLength(1)
    await expect(saveIncidentReview(action,'reviewer-3')).rejects.toThrow('다른 검토자')
    expect((await db.execute(sql`SELECT count(*)::int AS count FROM ax_incident_reviews`)).rows[0]).toEqual({count:1})
  })
})
