import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { appendFileSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { appendTaskEvent, collectTaskEvents, taskJournalPath, traceTaskApi, validTaskEvent, type AgentTaskEvent } from '../../src/agent-telemetry/task-events.js'
let home: string
const event = (): AgentTaskEvent => ({ taskId: randomUUID(), eventId: randomUUID(), attemptId: randomUUID(), phase: 'task', status: 'started', evidence: 'process', atUtc: new Date().toISOString() })
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'aitk-task-test-')) })
afterEach(() => { rmSync(home, { recursive: true, force: true }); vi.unstubAllEnvs() })
it('isolates source/agent journals and advances only the returned checkpoint', () => {
  const e = event(); appendTaskEvent('test-agent','codex',e,home)
  const first = collectTaskEvents('test-agent','codex',undefined,home)
  expect(first.events).toEqual([e])
  expect(collectTaskEvents('test-agent','codex',undefined,home).events).toEqual([e])
  expect(collectTaskEvents('test-agent','codex',first.checkpoint,home).events).toEqual([])
  expect(collectTaskEvents('other-agent','codex',undefined,home).events).toEqual([])
  expect(collectTaskEvents('test-agent','hermes',undefined,home).events).toEqual([])
  expect(statSync(taskJournalPath('test-agent','codex',home)).mode & 0o777).toBe(0o600)
})
it('rejects raw contents, invalid scope and arbitrary metrics', () => {
  expect(validTaskEvent({ ...event(), prompt: 'private' })).toBe(false)
  expect(validTaskEvent({ ...event(), metrics: { secret: 1 } })).toBe(false)
  expect(validTaskEvent({ ...event(), metrics: { contextInputTokens: -1 } })).toBe(false)
  expect(()=>taskJournalPath('../human','codex',home)).toThrow()
})
it('retains incomplete writes and refuses malformed records without resetting', () => {
  const e = event(); appendTaskEvent('test-agent','codex',e,home)
  const path = taskJournalPath('test-agent','codex',home)
  appendFileSync(path, '{')
  const first = collectTaskEvents('test-agent','codex',undefined,home)
  expect(first.events).toHaveLength(1)
  expect(collectTaskEvents('test-agent','codex',first.checkpoint,home).events).toEqual([])
  appendFileSync(path, 'invalid}\n')
  expect(()=>collectTaskEvents('test-agent','codex',first.checkpoint,home)).toThrow()
})
it('bounds batches without dropping the remainder', () => {
  for (let i=0;i<501;i++) appendTaskEvent('test-agent','codex',event(),home)
  const first = collectTaskEvents('test-agent','codex',undefined,home)
  expect(first.events).toHaveLength(500)
  expect(collectTaskEvents('test-agent','codex',first.checkpoint,home).events).toHaveLength(1)
})
it('does not record personal API calls outside an explicit task', async () => {
  vi.stubEnv('AITK_TASK_ID','')
  const action = vi.fn(async()=>({ok:true}))
  expect(await traceTaskApi('search',action)).toEqual({ok:true})
  expect(action).toHaveBeenCalledTimes(1)
})
it('links API failure receipts without storing request or response content', async () => {
  vi.stubEnv('AITK_TASK_ID',randomUUID()); vi.stubEnv('AITK_TASK_AGENT','test-agent'); vi.stubEnv('AITK_TASK_SOURCE','codex')
  await traceTaskApi('search', async()=>({ok:true,data:{isError:true,content:'private-response'}}),home)
  const records=collectTaskEvents('test-agent','codex',undefined,home).events
  expect(records.map(e=>e.status)).toEqual(['started','failed'])
  expect(records[1].parentEventId).toBe(records[0].eventId)
  expect(records[1].attemptId).toBe(records[0].attemptId)
  expect(readFileSync(taskJournalPath('test-agent','codex',home),'utf8')).not.toContain('private-response')
})
it('defers future events without advancing over them',()=>{
 const e=event(); e.atUtc='2030-01-01T00:00:00.000Z'; appendTaskEvent('test-agent','codex',e,home)
 const first=collectTaskEvents('test-agent','codex',undefined,home,new Date('2029-01-01'))
 expect(first.events).toEqual([]); expect(first.checkpoint?.offset).toBe(0)
 expect(collectTaskEvents('test-agent','codex',first.checkpoint,home,new Date('2030-01-02')).events).toEqual([e])
})
