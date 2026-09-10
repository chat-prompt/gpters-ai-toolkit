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
import { submitIncidentReport, readOwnIncidentReport, supplementIncidentReport } from '../../../../packages/lib/src/features/ax/incident-report-store'

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
  it('persists taskless reports, rejects cross-agent access and atomically appends alongside human review',async()=>{
    const agent={agentId:'test-reporter',orgId:'test-org'}
    const issue='https://example.slack.com/archives/C0000000001/p1767229200000000'
    const body={title:'Quality report',summary:'Wrong result',expected:'Correct',actual:'Wrong',source:'unknown' as const,category:'quality' as const,occurredAt:'2026-01-01T00:00:00Z',issueUrl:issue,approvalUrl:issue,requestedBy:'U0000000001',initiation:'user-requested' as const}
    const created=await submitIncidentReport(agent,body)
    expect((await submitIncidentReport(agent,body)).replayed).toBe(true)
    await expect(submitIncidentReport(agent,{...body,actual:'Different'})).rejects.toThrow('이미 접수')
    expect(await readOwnIncidentReport({...agent,agentId:'other'},created.record.id)).toBeNull()
    expect(await readOwnIncidentReport({...agent,orgId:'other'},created.record.id)).toBeNull()
    const note={updateId:'00000000-0000-4000-8000-000000000001',kind:'context' as const,summary:'More context',evidenceUrl:issue}
    expect(await supplementIncidentReport({...agent,agentId:'other'},created.record.id,note)).toBeNull()
    // A missing telemetry source must not prevent reviewing a human-requested report.
    mocks.load.mockResolvedValue({status:'not_configured',data:null})
    const action={id:created.record.id,revision:1,days:7 as const,action:'needs-info' as const,reason:'Please add evidence',evidenceRef:issue}
    await Promise.allSettled([saveIncidentReview(action,'reviewer'),supplementIncidentReport(agent,created.record.id,note)])
    const latest=(await readOwnIncidentReport(agent,created.record.id))!
    expect(latest.report?.supplements).toHaveLength(1)
    // If the CAS lost, the human retries only after reloading the current revision.
    const reviewed=latest.state==='needs-info'?latest:await saveIncidentReview({...action,revision:latest.revision},'reviewer')
    expect(reviewed.state).toBe('needs-info')
    expect((await supplementIncidentReport(agent,created.record.id,note))?.replayed).toBe(true)
    const final=await readOwnIncidentReport(agent,created.record.id)
    expect(final?.state).toBe('needs-info');expect(final?.report?.supplements).toHaveLength(1)
    expect((await readIncidentReview(7)).cases.some(c=>c.id===created.record.id)).toBe(true)
  })
})
