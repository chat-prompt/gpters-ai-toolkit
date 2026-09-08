import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createInstallation, writeAgentTelemetryInstallation } from '../../src/agent-telemetry/installation.js'
import { collectTaskEvents } from '../../src/agent-telemetry/task-events.js'
import { runAgentTask } from '../../src/commands/agent-task.js'
const roots: string[]=[]
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});process.exitCode=0;vi.restoreAllMocks()})
it('runs a real child with task context and preserves failed exit without logging command text',async()=>{
 const root=mkdtempSync(join(tmpdir(),'aitk-task-run-'));roots.push(root)
 const script=join(root,'aitk.js');writeFileSync(script,'// fixture')
 const installation=createInstallation({agentId:'test-agent',collectorId:'collector-test',source:'openclaw',sessionsDir:root,serverUrl:'https://example.invalid',backfillDays:7,intervalSeconds:3600,nodePath:process.execPath,scriptPath:script,collectorVersion:'0.7.14',account:'tester',schedule:'none',home:root})
 writeAgentTelemetryInstallation(installation,root)
 const taskId=randomUUID()
 await runAgentTask(['run','--agent','test-agent','--source','openclaw','--task-id',taskId,'--',process.execPath,'-e',`if(process.env.AITK_TASK_ID === '${taskId}') process.exit(7); else process.exit(9)`],root)
 expect(process.exitCode).toBe(7)
 const records=collectTaskEvents('test-agent','openclaw',undefined,root).events
 expect(records.map(e=>[e.phase,e.status])).toEqual([['task','started'],['execution','started'],['execution','failed']])
 expect(records[2].parentEventId).toBe(records[1].eventId)
 expect(JSON.stringify(records)).not.toContain('process.exit')
 expect(records.every(e=>e.taskId===taskId)).toBe(true)
})
it('requires an installed stream before running a command',async()=>{
 const root=mkdtempSync(join(tmpdir(),'aitk-task-absent-'));roots.push(root)
 await expect(runAgentTask(['run','--agent','test-agent','--source','codex','--',process.execPath,'-e','process.exit(0)'],root)).rejects.toThrow()
})
