import { db } from '@gpters/db'
import { sql } from 'drizzle-orm'
import { emptyMonitorState } from './monitor-engine'
import { changeTaskExpectation, createTaskExpectation, expectationId, registrationMatches, ExpectationConflict } from './task-expectations'
import type { ExpectationMutation, ExpectationPrincipal, ExpectationRegistration, TaskExpectation } from './task-expectations'
const json = (value: unknown) => JSON.stringify(value)
export async function readOwnTaskExpectation(principal: ExpectationPrincipal, id: string): Promise<TaskExpectation | null> {
  const rows = await db.execute(sql`SELECT record FROM ax_task_expectations WHERE id=${id} AND org_id=${principal.orgId} AND agent_id=${principal.agentId}`)
  return (rows.rows[0]?.record as TaskExpectation | undefined) ?? null
}
export async function readRegisteredTaskExpectations(orgId: string, agents: string[], retainedIds: string[] = []): Promise<TaskExpectation[]> {
  const result = await db.execute(sql`SELECT record FROM ax_task_expectations WHERE org_id=${orgId} AND agent_id IN (SELECT jsonb_array_elements_text(${json(agents)}::jsonb)) AND (record->>'state'='active' OR record ? 'overdueBeforeChange' OR (record->'receipt'->>'at') > (record->>'deadlineAt') OR id IN (SELECT jsonb_array_elements_text(${json(retainedIds)}::jsonb))) ORDER BY id LIMIT 10001`)
  if (result.rows.length > 10000) throw new Error('Expectation projection capacity exceeded; refusing partial absence inference')
  return result.rows.map(row => row.record as TaskExpectation)
}
/** The monitor revision and registration mutate atomically, invalidating any older monitor snapshot. */
export async function saveTaskExpectation(principal: ExpectationPrincipal, input: ExpectationRegistration | ExpectationMutation, now = new Date().toISOString()) {
  const id = input.action === 'register' ? expectationId(principal, input) : input.id
  await db.execute(sql`INSERT INTO ax_monitor_state(id,record) VALUES(${principal.orgId},${json(emptyMonitorState())}::jsonb) ON CONFLICT DO NOTHING`)
  for (let retry = 0; retry < 3; retry++) {
    const monitor = await db.execute(sql`SELECT revision FROM ax_monitor_state WHERE id=${principal.orgId}`)
    const revision = Number(monitor.rows[0].revision)
    const current = await readOwnTaskExpectation(principal, id)
    let record: TaskExpectation
    if (input.action === 'register') {
      if (current) {
        if (!registrationMatches(current, input)) throw new ExpectationConflict('This task attempt phase is already registered with different content')
        return { record: current, replayed: true }
      }
      record = createTaskExpectation(principal, input, now)
    } else {
      if (!current) return null
      const change = changeTaskExpectation(current, input, now)
      if (change.replayed) return change
      record = change.record
    }
    const changed = current
      ? await db.execute(sql`WITH gate AS (UPDATE ax_monitor_state SET revision=revision+1,updated_at=now() WHERE id=${principal.orgId} AND revision=${revision} RETURNING id)
          UPDATE ax_task_expectations SET revision=${record.revision},record=${json(record)}::jsonb,updated_at=now()
          WHERE id=${id} AND org_id=${principal.orgId} AND agent_id=${principal.agentId} AND revision=${current.revision} AND EXISTS(SELECT 1 FROM gate) RETURNING id`)
      : await db.execute(sql`WITH gate AS (UPDATE ax_monitor_state SET revision=revision+1,updated_at=now() WHERE id=${principal.orgId} AND revision=${revision} RETURNING id)
          INSERT INTO ax_task_expectations(id,org_id,agent_id,revision,record) SELECT ${id},${principal.orgId},${principal.agentId},${record.revision},${json(record)}::jsonb FROM gate ON CONFLICT DO NOTHING RETURNING id`)
    if (changed.rows.length) return { record, replayed: false }
  }
  throw new ExpectationConflict('Concurrent expectation update; retry the same operation ID')
}
