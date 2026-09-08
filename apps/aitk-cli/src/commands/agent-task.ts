import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { appendTaskEvent, type AgentTaskEvent } from '../agent-telemetry/task-events.js'
import { readAgentTelemetryInstallation } from '../agent-telemetry/installation.js'
import type { AgentTelemetrySource } from '../agent-telemetry/types.js'

/** A private runtime wrapper; command text, output, paths and credentials are never journaled. */
export async function runAgentTask(args: string[], home?: string): Promise<void> {
  const action = args.shift()
  const split = args.indexOf('--')
  const cliArgs = split < 0 ? args : args.slice(0, split)
  const command = split < 0 ? [] : args.slice(split + 1)
  const flags: Record<string, string> = {}
  const allowed = new Set(['agent','source','task-id','event-id','attempt-id','parent-event-id','phase','status','context-input-tokens','tool-result-chars','read-guard-denied-count','compaction-count'])
  for (let i = 0; i < cliArgs.length; i += 2) {
    const key = cliArgs[i].slice(2)
    if (!cliArgs[i].startsWith('--') || !allowed.has(key) || flags[key] !== undefined || !cliArgs[i+1]) throw new Error('Invalid agent-task option')
    flags[key] = cliArgs[i+1]
  }
  const agent = flags.agent ?? process.env.AITK_TASK_AGENT ?? ''
  const source = flags.source ?? process.env.AITK_TASK_SOURCE ?? ''
  // Enrollment, not an arbitrary environment variable, authorizes a local stream.
  readAgentTelemetryInstallation(agent, source as AgentTelemetrySource, home)
  const taskId = flags['task-id'] ?? process.env.AITK_TASK_ID ?? (action === 'run' || action === 'start' ? randomUUID() : '')
  const eventId = flags['event-id'] ?? randomUUID()
  const attemptId = flags['attempt-id'] ?? randomUUID()
  const atUtc = new Date().toISOString()
  if (action === 'event') {
    const metrics: NonNullable<AgentTaskEvent['metrics']> = {}
    for (const [flag, key] of [['context-input-tokens','contextInputTokens'],['tool-result-chars','toolResultChars'],['read-guard-denied-count','readGuardDeniedCount'],['compaction-count','compactionCount']] as const) {
      if (flags[flag] !== undefined) metrics[key] = Number(flags[flag])
    }
    appendTaskEvent(agent, source, { taskId, eventId, attemptId, atUtc, phase: flags.phase as AgentTaskEvent['phase'], status: flags.status as AgentTaskEvent['status'], evidence: 'self-reported',
      ...(flags['parent-event-id'] ? { parentEventId: flags['parent-event-id'] } : {}), ...(Object.keys(metrics).length ? { metrics } : {}) }, home)
    console.log(JSON.stringify({ taskId, eventId, attemptId })); return
  }
  if (action !== 'run' && action !== 'start') throw new Error('Usage: aitk agent-task run|start|event --agent <id> --source <source> [-- command ...]')
  if (action === 'run' && command.length === 0) throw new Error('A command after -- is required')
  appendTaskEvent(agent, source, { taskId, eventId, attemptId, phase: 'task', status: 'started', evidence: 'process', atUtc }, home)
  if (action === 'start') { console.log(JSON.stringify({ taskId, eventId, attemptId })); return }
  const executionId = randomUUID()
  appendTaskEvent(agent, source, { taskId, eventId: executionId, attemptId, parentEventId: eventId, phase: 'execution', status: 'started', evidence: 'process', atUtc: new Date().toISOString() }, home)
  const started = Date.now()
  const code = await new Promise<number>(resolve => {
    const child = spawn(command[0], command.slice(1), { stdio: 'inherit', env: { ...process.env, AITK_TASK_ID: taskId, AITK_TASK_AGENT: agent, AITK_TASK_SOURCE: source } })
    const interrupt = () => { child.kill('SIGINT') }
    const terminate = () => { child.kill('SIGTERM') }
    process.once('SIGINT', interrupt); process.once('SIGTERM', terminate)
    const finish = (code: number) => { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); resolve(code) }
    child.once('error', () => finish(1)); child.once('exit', code => finish(code ?? 1))
  })
  appendTaskEvent(agent, source, { taskId, eventId: randomUUID(), attemptId, parentEventId: executionId, phase: 'execution', status: code === 0 ? 'succeeded' : 'failed', evidence: 'process', atUtc: new Date().toISOString(), durationMs: Date.now() - started }, home)
  process.stderr.write(`AITK task ${taskId}\n`)
  process.exitCode = code
}
