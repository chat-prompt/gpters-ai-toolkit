import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { jsonRpcCall } from '../src/client.js'
import { collectTaskEvents } from '../src/agent-telemetry/task-events.js'
const roots:string[]=[]
afterEach(()=>{roots.forEach(root=>rmSync(root,{recursive:true,force:true}));vi.unstubAllEnvs();vi.unstubAllGlobals()})
it.each([true,false])('traces report-outcome API acknowledgment (%s), never the skill result',async ok=>{
 const home=mkdtempSync(join(tmpdir(),'aitk-outcome-'));roots.push(home)
 vi.stubEnv('HOME',home);vi.stubEnv('AITK_TASK_ID','11111111-1111-4111-8111-111111111111');vi.stubEnv('AITK_TASK_AGENT','fixture');vi.stubEnv('AITK_TASK_SOURCE','codex')
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(ok?{result:{success:true}}:{error:{message:'fixture error'}}),{status:200})))
 await jsonRpcCall('tools/call',{name:'report_skill_outcome',arguments:{summary:'private contents',outcome:'failed'}},'fixture-token')
 const events=collectTaskEvents('fixture','codex',undefined,home).events
 expect(events.map(e=>[e.phase,e.status,e.evidence])).toEqual([['execution-report','started','api'],['execution-report',ok?'succeeded':'failed','api']])
 expect(JSON.stringify(events)).not.toContain('private contents')
 expect(JSON.stringify(events)).not.toContain('fixture-token')
})
